"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  clearSession,
  localizedRoleHomePath,
  requireRole,
  signInAs,
  signInWithCredentials,
} from "@/lib/auth";
import { enableDemoLogin, env } from "@/lib/env";
import {
  clearProSubscriptionCheckoutSession,
  clearProSubscriptionReactivationCheckoutSession,
  completeProSubscriptionCheckoutReservation,
  completeProSubscriptionReactivationCheckoutReservation,
  createCredential,
  ensureProSubscription,
  findProSubscription,
  getSmsVerificationConfig,
  releaseProSubscriptionCheckout,
  releaseProSubscriptionReactivationCheckout,
  reserveProSubscriptionCheckout,
  reserveProSubscriptionReactivationCheckout,
  resetPasswordWithRecovery,
  setSmsVerificationEnabled,
  setProStripeCustomer,
} from "@/lib/mock/db";
import {
  acceptCustomerQuote,
  createCustomerRequest,
  createUserAccount,
  findUserByIdentifier,
  saveProProfile,
  submitProQuote,
  toggleProVerification,
  updateAdminRequestStatus,
  updateProBookingStatus,
} from "@/lib/mock/repositories";
import { BookingStatus, RequestStatus } from "@/types/domain";
import {
  ProProfileInput,
  PasswordResetInput,
  QuoteFormInput,
  RequestFormInput,
  SignupInput,
  loginSchema,
  passwordResetSchema,
  proProfileSchema,
  quoteFormSchema,
  requestFormSchema,
  signupSchema,
} from "@/lib/validation";
import {
  createCardSetupCheckoutSession,
  createPaidProSubscriptionCheckoutSession,
  createProPaymentMethodPortalSession,
  getOwnedProSubscriptionInvoicePaymentUrl,
  getOrCreateStripeCustomerForPro,
  inspectOwnedCardSetupCheckoutSession,
  inspectOwnedPaidProSubscriptionCheckoutSession,
  setProSubscriptionAutoRenewal,
} from "@/lib/stripe-billing";
import {
  evaluateProSubscriptionEntitlement,
  isProNewWorkRestrictedError,
} from "@/lib/pro-subscription-entitlement";
import { hasConsumedLifetimeTrial } from "@/lib/subscription-policy";
import {
  consumePendingSignupPhoneVerification,
  getVerifiedPendingSignupPhone,
  isSmsVerificationProviderReady,
  resendPendingSmsCode,
  startSignupSmsPhoneVerification,
  startSmsPhoneVerification,
  verifyPendingSignupSmsCode,
  verifyPendingSmsCode,
} from "@/lib/sms-verification";

const CHECKOUT_RESERVATION_MS = 5 * 60 * 1000;

function billingPath(locale: string) {
  void locale;
  return "/pro/billing";
}

function localizedBillingError(locale: string) {
  return locale === "en"
    ? "Unable to open the secure card setup. Please try again."
    : "暫時未能開啟安全綁卡頁面，請再試一次。";
}

function pendingCheckoutError(locale: string) {
  return locale === "en"
    ? "Stripe is confirming your completed billing checkout. Please wait a moment."
    : "Stripe 正在確認已完成嘅付款設定，請稍等片刻。";
}

async function reusableCheckout(input: {
  proId: string;
  stripeCustomerId?: string;
  checkoutSessionId?: string;
  checkoutSessionExpiresAt?: string;
}) {
  if (!input.stripeCustomerId || !input.checkoutSessionId) {
    return { status: "none" as const };
  }

  const persistedExpiry = input.checkoutSessionExpiresAt
    ? Date.parse(input.checkoutSessionExpiresAt)
    : Number.NaN;
  if (Number.isFinite(persistedExpiry) && persistedExpiry <= Date.now()) {
    await clearProSubscriptionCheckoutSession(input.checkoutSessionId);
    return { status: "none" as const };
  }

  const state = await inspectOwnedCardSetupCheckoutSession({
    proId: input.proId,
    customerId: input.stripeCustomerId,
    checkoutSessionId: input.checkoutSessionId,
  });
  if (state.status === "expired") {
    await clearProSubscriptionCheckoutSession(input.checkoutSessionId);
    return { status: "none" as const };
  }
  if (state.status === "complete") {
    return { status: "pending" as const };
  }

  return { status: "open" as const, url: state.url };
}

async function reusablePaidReactivationCheckout(input: {
  proId: string;
  stripeCustomerId?: string;
  previousStripeSubscriptionId?: string;
  checkoutSessionId?: string;
}) {
  if (
    !input.stripeCustomerId ||
    !input.previousStripeSubscriptionId ||
    !input.checkoutSessionId
  ) {
    return { status: "none" as const };
  }
  const state = await inspectOwnedPaidProSubscriptionCheckoutSession({
    proId: input.proId,
    customerId: input.stripeCustomerId,
    previousSubscriptionId: input.previousStripeSubscriptionId,
    checkoutSessionId: input.checkoutSessionId,
  });
  if (state.status === "expired") {
    await clearProSubscriptionReactivationCheckoutSession(
      input.checkoutSessionId,
    );
    return { status: "none" as const };
  }
  if (state.status === "complete") {
    return { status: "pending" as const };
  }
  return { status: "open" as const, url: state.url };
}

async function startPaidReactivationCheckout(input: {
  locale: "en" | "zh-HK";
  proId: string;
  subscription: Awaited<ReturnType<typeof ensureProSubscription>>;
}) {
  const { locale, proId, subscription } = input;
  if (
    !subscription.stripeCustomerId ||
    !subscription.stripeSubscriptionId ||
    subscription.stripeStatus !== "canceled" ||
    subscription.pastDueInvoiceId
  ) {
    throw new Error("The previous subscription is not ready for reactivation.");
  }
  const existingCheckout = await reusablePaidReactivationCheckout({
    proId,
    stripeCustomerId: subscription.stripeCustomerId,
    previousStripeSubscriptionId: subscription.stripeSubscriptionId,
    checkoutSessionId: subscription.reactivationCheckoutSessionId,
  });
  if (existingCheckout.status === "open") {
    return { ok: true as const, url: existingCheckout.url };
  }
  if (existingCheckout.status === "pending") {
    return { ok: false as const, error: pendingCheckoutError(locale) };
  }

  const reservationId = randomUUID();
  try {
    const reserved = await reserveProSubscriptionReactivationCheckout({
      proId,
      reservationId,
      reservationExpiresAt: new Date(
        Date.now() + CHECKOUT_RESERVATION_MS,
      ).toISOString(),
    });
    if (!reserved) {
      const latest = await findProSubscription(proId);
      const concurrentCheckout = latest
        ? await reusablePaidReactivationCheckout({
            proId,
            stripeCustomerId: latest.stripeCustomerId,
            previousStripeSubscriptionId: latest.stripeSubscriptionId,
            checkoutSessionId: latest.reactivationCheckoutSessionId,
          })
        : { status: "none" as const };
      if (concurrentCheckout.status === "open") {
        return { ok: true as const, url: concurrentCheckout.url };
      }
      if (concurrentCheckout.status === "pending") {
        return { ok: false as const, error: pendingCheckoutError(locale) };
      }
      throw new Error("A reactivation Checkout is already being created.");
    }

    const successUrl = new URL(billingPath(locale), env.APP_URL);
    successUrl.searchParams.set("checkout", "reactivated");
    const cancelUrl = new URL(billingPath(locale), env.APP_URL);
    cancelUrl.searchParams.set("checkout", "cancelled");
    const checkout = await createPaidProSubscriptionCheckoutSession({
      proId,
      customerId: subscription.stripeCustomerId,
      previousSubscriptionId: subscription.stripeSubscriptionId,
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      idempotencyKey: `pro-paid-reactivation:${proId}:${subscription.stripeSubscriptionId}:${reservationId}`,
    });
    if (!checkout.url || !checkout.expires_at) {
      throw new Error("Stripe Checkout did not return a usable session.");
    }
    const saved = await completeProSubscriptionReactivationCheckoutReservation({
      proId,
      reservationId,
      checkoutSessionId: checkout.id,
      checkoutSessionExpiresAt: new Date(
        checkout.expires_at * 1_000,
      ).toISOString(),
      stripeCustomerId: subscription.stripeCustomerId,
      previousStripeSubscriptionId: subscription.stripeSubscriptionId,
    });
    if (!saved) {
      throw new Error("Reactivation Checkout persistence failed.");
    }
    revalidatePath(billingPath(locale));
    return { ok: true as const, url: checkout.url };
  } catch (error) {
    await releaseProSubscriptionReactivationCheckout(
      proId,
      reservationId,
    ).catch(() => undefined);
    throw error;
  }
}

export async function startProSubscriptionCheckoutAction(input: {
  locale: string;
}) {
  const locale = input.locale === "en" ? "en" : "zh-HK";
  const user = await requireRole("pro", locale);
  let reservationId: string | undefined;

  try {
    let subscription = await ensureProSubscription(user.id);
    const currentStatus = evaluateProSubscriptionEntitlement(
      subscription,
      new Date().toISOString(),
    ).entitlement.status;
    if (
      currentStatus === "terminated" &&
      hasConsumedLifetimeTrial(subscription) &&
      subscription.stripeStatus === "canceled" &&
      !subscription.pastDueInvoiceId
    ) {
      return await startPaidReactivationCheckout({
        locale,
        proId: user.id,
        subscription,
      });
    }
    if (
      hasConsumedLifetimeTrial(subscription) &&
      !subscription.stripeSubscriptionId
    ) {
      return {
        ok: false as const,
        error: pendingCheckoutError(locale),
      };
    }
    if (subscription.stripeSubscriptionId) {
      return {
        ok: false as const,
        error:
          locale === "en"
            ? "Your card setup has already been completed."
            : "你已經完成綁卡設定。",
      };
    }

    const existingCheckout = await reusableCheckout({
      proId: user.id,
      stripeCustomerId: subscription.stripeCustomerId,
      checkoutSessionId: subscription.checkoutSessionId,
      checkoutSessionExpiresAt: subscription.checkoutSessionExpiresAt,
    });
    if (existingCheckout.status === "open") {
      return { ok: true as const, url: existingCheckout.url };
    }
    if (existingCheckout.status === "pending") {
      return {
        ok: false as const,
        error: pendingCheckoutError(locale),
      };
    }

    const customer = await getOrCreateStripeCustomerForPro({
      proId: user.id,
      existingCustomerId: subscription.stripeCustomerId,
      email: user.email,
      name: user.fullName,
      idempotencyKey: `pro-customer:${user.id}`,
    });
    subscription = await setProStripeCustomer(user.id, customer.id);
    const customerId = subscription.stripeCustomerId;
    if (!customerId) {
      throw new Error("Stripe Customer persistence failed.");
    }

    reservationId = randomUUID();
    const reserved = await reserveProSubscriptionCheckout({
      proId: user.id,
      reservationId,
      reservationExpiresAt: new Date(
        Date.now() + CHECKOUT_RESERVATION_MS,
      ).toISOString(),
    });

    if (!reserved) {
      const latest = await findProSubscription(user.id);
      const concurrentCheckout = latest
        ? await reusableCheckout({
            proId: user.id,
            stripeCustomerId: latest.stripeCustomerId,
            checkoutSessionId: latest.checkoutSessionId,
            checkoutSessionExpiresAt: latest.checkoutSessionExpiresAt,
          })
        : { status: "none" as const };
      if (concurrentCheckout.status === "open") {
        return { ok: true as const, url: concurrentCheckout.url };
      }
      if (concurrentCheckout.status === "pending") {
        return {
          ok: false as const,
          error: pendingCheckoutError(locale),
        };
      }
      throw new Error("A checkout setup is already being created.");
    }

    const returnUrl = new URL(billingPath(locale), env.APP_URL);
    returnUrl.searchParams.set("checkout", "success");
    const cancelUrl = new URL(billingPath(locale), env.APP_URL);
    cancelUrl.searchParams.set("checkout", "cancelled");
    const checkout = await createCardSetupCheckoutSession({
      proId: user.id,
      customerId,
      successUrl: returnUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      idempotencyKey: `pro-card-setup:${user.id}:${reservationId}`,
    });
    if (!checkout.url || !checkout.expires_at) {
      throw new Error("Stripe Checkout did not return a usable session.");
    }

    const saved = await completeProSubscriptionCheckoutReservation({
      proId: user.id,
      reservationId,
      checkoutSessionId: checkout.id,
      checkoutSessionExpiresAt: new Date(
        checkout.expires_at * 1000,
      ).toISOString(),
      stripeCustomerId: customerId,
    });
    if (!saved) {
      throw new Error("Stripe Checkout persistence failed.");
    }

    revalidatePath(billingPath(locale));
    return { ok: true as const, url: checkout.url };
  } catch {
    if (reservationId) {
      await releaseProSubscriptionCheckout(user.id, reservationId).catch(
        () => undefined,
      );
    }
    return {
      ok: false as const,
      error: localizedBillingError(locale),
    };
  }
}

function lifecycleBillingError(
  locale: string,
  action: "portal" | "retry" | "cancel",
) {
  const isEnglish = locale === "en";
  if (action === "portal") {
    return isEnglish
      ? "Unable to open Stripe's secure card update. Please try again."
      : "暫時未能開啟 Stripe 安全更新付款卡，請再試一次。";
  }
  if (action === "retry") {
    return isEnglish
      ? "Unable to retry the outstanding payment. Update your card first, then try again."
      : "暫時未能重新嘗試欠款，請先更新付款卡後再試。";
  }
  return isEnglish
    ? "Unable to update automatic renewal. Please try again."
    : "暫時未能更新自動續訂設定，請再試一次。";
}

function requireStripeLifecycleIdentity(
  subscription: Awaited<ReturnType<typeof ensureProSubscription>>,
) {
  if (
    !subscription.stripeCustomerId ||
    !subscription.stripeSubscriptionId ||
    !subscription.stripePriceId
  ) {
    throw new Error("The Stripe subscription is not ready.");
  }
  return {
    customerId: subscription.stripeCustomerId,
    subscriptionId: subscription.stripeSubscriptionId,
    priceId: subscription.stripePriceId,
  };
}

/** Opens only Stripe's hosted payment-method update flow. */
export async function startProPaymentMethodUpdateAction(input: {
  locale: string;
}) {
  const locale = input.locale === "en" ? "en" : "zh-HK";
  const user = await requireRole("pro", locale);
  try {
    const subscription = await ensureProSubscription(user.id);
    const identity = requireStripeLifecycleIdentity(subscription);
    const returnUrl = new URL(billingPath(locale), env.APP_URL);
    returnUrl.searchParams.set("billing", "updated");
    const portal = await createProPaymentMethodPortalSession({
      proId: user.id,
      customerId: identity.customerId,
      returnUrl: returnUrl.toString(),
      locale,
    });
    return { ok: true as const, url: portal.url };
  } catch {
    return {
      ok: false as const,
      error: lifecycleBillingError(locale, "portal"),
    };
  }
}

/** Opens the owned Stripe-hosted invoice page, including any required 3DS. */
export async function startProOutstandingInvoicePaymentAction(input: {
  locale: string;
}) {
  const locale = input.locale === "en" ? "en" : "zh-HK";
  const user = await requireRole("pro", locale);
  try {
    const subscription = await ensureProSubscription(user.id);
    const identity = requireStripeLifecycleIdentity(subscription);
    if (!subscription.pastDueInvoiceId) {
      throw new Error("There is no outstanding invoice to pay.");
    }
    const paymentPage = await getOwnedProSubscriptionInvoicePaymentUrl({
      proId: user.id,
      customerId: identity.customerId,
      subscriptionId: identity.subscriptionId,
      invoiceId: subscription.pastDueInvoiceId,
      expectedLivemode: subscription.stripeLivemode,
    });
    return { ok: true as const, url: paymentPage.url };
  } catch {
    return {
      ok: false as const,
      error: lifecycleBillingError(locale, "retry"),
    };
  }
}

/**
 * Changes renewal only at period end. Stripe is authoritative; the signed
 * subscription.updated webhook performs the local lifecycle write.
 */
export async function setProSubscriptionAutoRenewalAction(input: {
  locale: string;
  cancelAtPeriodEnd: boolean;
}) {
  const locale = input.locale === "en" ? "en" : "zh-HK";
  const user = await requireRole("pro", locale);
  try {
    const subscription = await ensureProSubscription(user.id);
    const identity = requireStripeLifecycleIdentity(subscription);
    await setProSubscriptionAutoRenewal({
      proId: user.id,
      customerId: identity.customerId,
      subscriptionId: identity.subscriptionId,
      expectedPriceId: identity.priceId,
      ...(subscription.stripeSubscriptionHasTrial === false
        ? { expectedNoTrial: true }
        : { expectedTrialEndsAt: subscription.trialEndsAt }),
      expectedLivemode: subscription.stripeLivemode,
      allowHistoricalPriceId: true,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      idempotencyKey: `pro-renewal:${user.id}:${input.cancelAtPeriodEnd ? "cancel" : "resume"}:${randomUUID()}`,
    });
    revalidatePath(billingPath(locale));
    return {
      ok: true as const,
      message: input.cancelAtPeriodEnd
        ? locale === "en"
          ? "Cancellation requested. Access continues until the current period ends."
          : "已要求取消；你仍可使用至目前週期完結。"
        : locale === "en"
          ? "Automatic renewal restored."
          : "已恢復自動續訂。",
    };
  } catch {
    return {
      ok: false as const,
      error: lifecycleBillingError(locale, "cancel"),
    };
  }
}

export async function startLoginAction(input: {
  identifier: string;
  password: string;
  locale: string;
}) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid login details." };
  }

  const result = await signInWithCredentials(
    parsed.data.identifier,
    parsed.data.password,
  );
  if (!result.ok) {
    return result;
  }

  if ("verificationRequired" in result && result.verificationRequired) {
    const verification = await startSmsPhoneVerification(result.user);
    if (
      verification.status === "sent" ||
      verification.status === "cooldown" ||
      verification.status === "rate_limited"
    ) {
      return { ok: true as const, target: "/auth/verify" };
    }
    if (verification.status !== "disabled") {
      return {
        ok: false as const,
        error:
          input.locale === "en"
            ? "SMS verification is temporarily unavailable."
            : "SMS 驗證暫時未能使用，請稍後再試。",
      };
    }
    await signInAs(result.user.id);
  }

  const subscription =
    result.user.role === "pro"
      ? await ensureProSubscription(result.user.id)
      : null;

  return {
    ok: true,
    target:
      subscription?.accessStatus === "setup_required"
        ? billingPath(input.locale)
        : localizedRoleHomePath(result.user.role, input.locale),
  };
}

export async function signUpAction(
  input: SignupInput & { interfaceLocale?: string },
) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form fields." };
  }

  const signupData = parsed.data;
  const isEnglish = input.interfaceLocale === "en";
  const smsConfig = await getSmsVerificationConfig();
  let verifiedPhone: { phone: string; verifiedAt: string } | null = null;
  if (
    smsConfig.effectiveEnabled &&
    !isSmsVerificationProviderReady(smsConfig)
  ) {
    return {
      ok: false as const,
      error: isEnglish
        ? "SMS verification is temporarily unavailable."
        : "SMS 驗證暫時未能使用，請稍後再試。",
    };
  }
  if (smsConfig.effectiveEnabled) {
    verifiedPhone = await getVerifiedPendingSignupPhone(signupData.phone);
    if (!verifiedPhone) {
      return {
        ok: false as const,
        error: isEnglish
          ? "Verify this phone number before creating your account."
          : "請先驗證呢個電話號碼，再建立帳戶。",
      };
    }
  }
  const [phoneAccount, emailAccount] = await Promise.all([
    findUserByIdentifier(signupData.phone),
    signupData.email ? findUserByIdentifier(signupData.email) : null,
  ]);
  if (phoneAccount || emailAccount) {
    return {
      ok: false as const,
      error: isEnglish
        ? "An account with this email or phone already exists."
        : "呢個電郵或電話已經有帳戶。",
    };
  }

  let user;
  try {
    user = verifiedPhone
      ? await createUserAccount(signupData, {
          phoneVerifiedAt: verifiedPhone.verifiedAt,
        })
      : await createUserAccount(signupData);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to create account at this time.",
    };
  }
  await createCredential(user.id, signupData.password, false, {
    dateOfBirth: signupData.dateOfBirth,
    securityQuestionId: signupData.securityQuestionId,
    securityAnswer: signupData.securityAnswer,
  });
  if (verifiedPhone) {
    await consumePendingSignupPhoneVerification(verifiedPhone.phone);
  }
  await signInAs(user.id);

  revalidatePath("/");
  return {
    ok: true,
    target:
      user.role === "pro"
        ? billingPath(signupData.locale)
        : localizedRoleHomePath(user.role, signupData.locale),
  };
}

function normalizeSignupPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function isHongKongMobilePhone(phone: string) {
  return /^(5|6|8|9)\d{7}$/.test(phone);
}

export async function requestSignupPhoneOtpAction(input: {
  phone: string;
  locale: string;
}) {
  const isEnglish = input.locale === "en";
  const phone = normalizeSignupPhone(input.phone);
  if (!isHongKongMobilePhone(phone)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Enter a valid Hong Kong mobile number."
        : "請輸入有效香港手提電話。",
    };
  }

  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Phone verification is not currently required."
        : "目前毋須電話驗證。",
    };
  }
  if (!isSmsVerificationProviderReady(config)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "SMS verification is temporarily unavailable."
        : "SMS 驗證暫時未能使用，請稍後再試。",
    };
  }
  if (await findUserByIdentifier(phone)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "An account with this phone already exists."
        : "呢個電話已經有帳戶。",
    };
  }

  const result = await startSignupSmsPhoneVerification(
    phone,
    isEnglish ? "en" : "zh-HK",
  );
  if (result.status === "sent" || result.status === "cooldown") {
    return {
      ok: true as const,
      phone,
      maskedPhone: result.maskedPhone,
      retryAfterSeconds: result.retryAfterSeconds,
      codeExpiresInSeconds: result.codeExpiresInSeconds,
      consolePocCode: result.consolePocCode,
      alreadySent: result.status === "cooldown",
    };
  }
  if (result.status === "rate_limited") {
    return {
      ok: false as const,
      retryAfterSeconds: result.retryAfterSeconds,
      error: isEnglish
        ? "Too many codes have been sent. Please try again later."
        : "已發送太多驗證碼，請稍後再試。",
    };
  }

  return {
    ok: false as const,
    error: isEnglish
      ? "SMS verification is temporarily unavailable."
      : "SMS 驗證暫時未能使用，請稍後再試。",
  };
}

export async function verifySignupPhoneOtpAction(input: {
  phone: string;
  code: string;
  locale: string;
}) {
  const isEnglish = input.locale === "en";
  const phone = normalizeSignupPhone(input.phone);
  const code = input.code.replace(/\D/g, "");
  if (!isHongKongMobilePhone(phone)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Enter a valid Hong Kong mobile number."
        : "請輸入有效香港手提電話。",
    };
  }
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Enter the 6-digit verification code."
        : "請輸入 6 位數字驗證碼。",
    };
  }

  const result = await verifyPendingSignupSmsCode(phone, code);
  if (result.status === "verified") {
    return {
      ok: true as const,
      phone: result.phone,
      verifiedAt: result.verifiedAt,
    };
  }

  const errors = {
    invalid: isEnglish
      ? `Incorrect code. ${result.status === "invalid" ? result.attemptsRemaining : 0} attempts remaining.`
      : `驗證碼不正確，仲有 ${result.status === "invalid" ? result.attemptsRemaining : 0} 次機會。`,
    expired: isEnglish
      ? "This code has expired. Request a new code."
      : "驗證碼已過期，請重新發送。",
    locked: isEnglish
      ? "Too many incorrect attempts. Request a new code."
      : "錯誤次數太多，請重新發送驗證碼。",
    missing: isEnglish
      ? "This verification session is no longer available. Request a new code."
      : "驗證程序已失效，請重新發送驗證碼。",
    disabled: isEnglish
      ? "Phone verification has been turned off."
      : "電話驗證已關閉。",
    provider_unavailable: isEnglish
      ? "SMS verification is temporarily unavailable."
      : "SMS 驗證暫時未能使用，請稍後再試。",
  } as const;

  return { ok: false as const, error: errors[result.status] };
}

export async function verifyPhoneOtpAction(input: {
  code: string;
  locale: string;
}) {
  const isEnglish = input.locale === "en";
  const code = input.code.replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Enter the 6-digit verification code."
        : "請輸入 6 位數字驗證碼。",
    };
  }

  const result = await verifyPendingSmsCode(code);
  if (result.status === "verified") {
    await signInAs(result.user.id);
    revalidatePath("/");
    return {
      ok: true as const,
      target:
        result.user.role === "pro"
          ? billingPath(input.locale)
          : localizedRoleHomePath(result.user.role, input.locale),
    };
  }

  const errors = {
    invalid: isEnglish
      ? `Incorrect code. ${result.status === "invalid" ? result.attemptsRemaining : 0} attempts remaining.`
      : `驗證碼不正確，仲有 ${result.status === "invalid" ? result.attemptsRemaining : 0} 次機會。`,
    expired: isEnglish
      ? "This code has expired. Request a new code."
      : "驗證碼已過期，請重新發送。",
    locked: isEnglish
      ? "Too many incorrect attempts. Request a new code."
      : "錯誤次數太多，請重新發送驗證碼。",
    missing: isEnglish
      ? "This verification session is no longer available. Log in to restart it."
      : "驗證程序已失效，請重新登入再開始。",
    disabled: isEnglish
      ? "SMS verification has been turned off. Please log in again."
      : "SMS 驗證已關閉，請重新登入。",
    provider_unavailable: isEnglish
      ? "SMS verification is temporarily unavailable. Please try again."
      : "SMS 驗證暫時未能使用，請稍後再試。",
  } as const;

  return { ok: false as const, error: errors[result.status] };
}

export async function resendPhoneOtpAction(input: { locale: string }) {
  const isEnglish = input.locale === "en";
  const result = await resendPendingSmsCode();
  if (result.status === "sent") {
    return {
      ok: true as const,
      retryAfterSeconds: result.retryAfterSeconds,
      codeExpiresInSeconds: result.codeExpiresInSeconds,
    };
  }
  if (result.status === "cooldown") {
    return {
      ok: false as const,
      retryAfterSeconds: result.retryAfterSeconds,
      error: isEnglish
        ? `Please wait ${result.retryAfterSeconds} seconds before resending.`
        : `請等 ${result.retryAfterSeconds} 秒先再發送。`,
    };
  }
  if (result.status === "rate_limited") {
    return {
      ok: false as const,
      retryAfterSeconds: result.retryAfterSeconds,
      error: isEnglish
        ? "Too many codes have been sent. Please try again later."
        : "已發送太多驗證碼，請稍後再試。",
    };
  }

  return {
    ok: false as const,
    error: isEnglish
      ? "Unable to resend the code. Log in to restart verification."
      : "暫時未能重新發送，請登入後再開始驗證。",
  };
}

export async function resetPasswordAction(
  input: PasswordResetInput & { locale: string },
) {
  const parsed = passwordResetSchema.safeParse(input);
  const isEnglish = input.locale === "en";

  if (!parsed.success) {
    return {
      ok: false as const,
      error: isEnglish ? "Please check every field." : "請檢查所有欄位。",
    };
  }

  const result = await resetPasswordWithRecovery({
    phone: parsed.data.phone,
    dateOfBirth: parsed.data.dateOfBirth,
    securityQuestionId: parsed.data.securityQuestionId,
    securityAnswer: parsed.data.securityAnswer,
    newPassword: parsed.data.newPassword,
  });

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return {
        ok: false as const,
        error: isEnglish
          ? "Too many attempts. Please try again in 15 minutes."
          : "嘗試次數太多，請 15 分鐘後再試。",
      };
    }

    return {
      ok: false as const,
      error: isEnglish
        ? "The recovery details do not match. Please check and try again."
        : "資料不正確，請核對電話、出生日期、保安問題及答案。",
    };
  }

  return { ok: true as const };
}

export async function signInDemoAction(input: {
  userId: string;
  locale: string;
}) {
  if (!enableDemoLogin) {
    return { ok: false, error: "Demo login is disabled." };
  }

  const user = await signInAs(input.userId);
  const subscription =
    user.role === "pro" ? await ensureProSubscription(user.id) : null;
  return {
    ok: true,
    target:
      subscription?.accessStatus === "setup_required"
        ? billingPath(input.locale)
        : localizedRoleHomePath(user.role, input.locale),
  };
}

export async function logoutAction(input: { locale: string }) {
  void input;
  await clearSession();
  return { ok: true, target: "/" };
}

export async function createRequestAction(input: {
  locale: string;
  values: RequestFormInput;
}) {
  const customer = await requireRole("customer", input.locale);
  const parsed = requestFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        input.locale === "en"
          ? "Please review the request details."
          : "請檢查服務請求資料後再試。",
    };
  }

  const request = await createCustomerRequest(
    customer.id,
    parsed.data,
    input.locale,
  );
  revalidatePath("/customer");
  revalidatePath("/pro/leads");
  return {
    ok: true,
    target: `/customer/requests/${request.id}`,
  };
}

export async function acceptQuoteAction(input: {
  locale: string;
  requestId: string;
  quoteId: string;
}) {
  const customer = await requireRole("customer", input.locale);
  try {
    const quote = await acceptCustomerQuote(
      customer.id,
      input.requestId,
      input.quoteId,
      input.locale,
    );
    revalidatePath(`/customer/requests/${input.requestId}`);
    revalidatePath("/customer/orders");
    revalidatePath("/pro/calendar");
    revalidatePath("/pro/jobs");
    if (quote) {
      revalidatePath(`/pro/leads/${input.requestId}`);
    }
    return { ok: true };
  } catch (error) {
    if (isProNewWorkRestrictedError(error)) {
      return {
        ok: false as const,
        code: error.code,
        error:
          input.locale === "en"
            ? "This pro is temporarily unavailable for new work. Please choose another quote or try again later."
            : "呢位師傅暫時未能接受新工作，請選擇其他報價或者稍後再試。",
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to accept quote.",
    };
  }
}

export async function saveProProfileAction(input: {
  locale: string;
  values: ProProfileInput;
}) {
  const pro = await requireRole("pro", input.locale);
  const parsed = proProfileSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please complete the required profile fields." };
  }

  await saveProProfile(pro.id, parsed.data);
  revalidatePath("/pro");
  revalidatePath("/pro/profile");
  return { ok: true };
}

export async function submitQuoteAction(input: {
  locale: string;
  requestId: string;
  values: QuoteFormInput;
}) {
  const pro = await requireRole("pro", input.locale);
  const parsed = quoteFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please review the quote details." };
  }

  try {
    await submitProQuote(pro.id, input.requestId, parsed.data, input.locale);
    revalidatePath("/pro/leads");
    revalidatePath(`/pro/leads/${input.requestId}`);
    revalidatePath("/pro/calendar");
    revalidatePath(`/customer/requests/${input.requestId}`);
    return { ok: true as const };
  } catch (error) {
    if (isProNewWorkRestrictedError(error)) {
      return {
        ok: false as const,
        code: error.code,
        error:
          input.locale === "en"
            ? "New quotes are paused. Manage billing to restore new-work access."
            : "新報價功能已暫停；請到月費頁處理並恢復新工作功能。",
      };
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unable to submit quote.",
    };
  }
}

export async function updateBookingStatusAction(input: {
  locale: string;
  bookingId: string;
  status: BookingStatus;
}) {
  const pro = await requireRole("pro", input.locale);
  try {
    const booking = await updateProBookingStatus(
      pro.id,
      input.bookingId,
      input.status,
      input.locale,
    );
    revalidatePath("/pro/jobs");
    revalidatePath("/pro/calendar");
    revalidatePath(`/pro/jobs/${input.bookingId}`);
    revalidatePath("/customer/orders");
    revalidatePath(`/customer/orders/${input.bookingId}`);
    if (booking) {
      revalidatePath(`/customer/requests/${booking.requestId}`);
      revalidatePath(`/admin/requests/${booking.requestId}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to update booking.",
    };
  }
}

export async function updateAdminRequestStatusAction(input: {
  locale: string;
  requestId: string;
  status: RequestStatus;
  note?: string;
}) {
  const admin = await requireRole("admin", input.locale);
  try {
    const request = await updateAdminRequestStatus(
      input.requestId,
      input.status,
      admin.id,
      input.note,
      input.locale,
    );
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath(`/admin/requests/${input.requestId}`);
    revalidatePath("/customer");
    revalidatePath("/customer/orders");
    revalidatePath("/pro/jobs");
    if (request) {
      revalidatePath(`/customer/requests/${request.id}`);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to update request.",
    };
  }
}

export async function toggleProVerificationAction(input: {
  locale: string;
  userId: string;
  verified: boolean;
}) {
  await requireRole("admin", input.locale);
  await toggleProVerification(input.userId, input.verified);
  revalidatePath("/admin/pros");
  revalidatePath(`/admin/pros/${input.userId}`);
  return { ok: true };
}

export async function updateSmsVerificationConfigAction(input: {
  locale: string;
  enabled: boolean;
}) {
  const admin = await requireRole("admin", input.locale);
  if (typeof input.enabled !== "boolean") {
    return {
      ok: false as const,
      error:
        input.locale === "en"
          ? "Invalid SMS verification setting."
          : "SMS 驗證設定無效。",
    };
  }

  try {
    if (input.enabled) {
      const current = await getSmsVerificationConfig();
      if (!isSmsVerificationProviderReady(current)) {
        return {
          ok: false as const,
          error:
            input.locale === "en"
              ? "The configured SMS provider is not ready."
              : "目前設定嘅 SMS 供應商尚未準備好。",
        };
      }
    }
    const config = await setSmsVerificationEnabled({
      enabled: input.enabled,
      updatedBy: admin.id,
    });
    revalidatePath("/admin/settings");
    return { ok: true as const, config };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : input.locale === "en"
            ? "Unable to update SMS verification settings."
            : "暫時未能更新 SMS 驗證設定。",
    };
  }
}
