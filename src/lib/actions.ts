"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
  completeProSubscriptionCheckoutReservation,
  createCredential,
  ensureProSubscription,
  findProSubscription,
  releaseProSubscriptionCheckout,
  reserveProSubscriptionCheckout,
  resetPasswordWithRecovery,
  reserveSmsVerificationAttempt,
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
import {
  checkSmsVerificationCode,
  sendSmsVerificationCode,
  SmsVerificationError,
} from "@/lib/sms-verification";
import { BookingStatus, RequestStatus } from "@/types/domain";
import {
  ProProfileInput,
  PasswordResetInput,
  QuoteFormInput,
  RequestFormInput,
  SignupWithVerificationInput,
  loginSchema,
  passwordResetSchema,
  proProfileSchema,
  quoteFormSchema,
  requestFormSchema,
  signupSmsRequestSchema,
  signupWithVerificationSchema,
} from "@/lib/validation";
import {
  createCardSetupCheckoutSession,
  getOrCreateStripeCustomerForPro,
  inspectOwnedCardSetupCheckoutSession,
} from "@/lib/stripe-billing";
import { hasConsumedLifetimeTrial } from "@/lib/subscription-policy";

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
    ? "Stripe is confirming your completed card setup. Please wait a moment."
    : "Stripe 正在確認已完成嘅綁卡，請稍等片刻。";
}

async function reusableCheckout(input: {
  proId: string;
  stripeCustomerId?: string;
  checkoutSessionId?: string;
}) {
  if (!input.stripeCustomerId || !input.checkoutSessionId) {
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

export async function startProSubscriptionCheckoutAction(input: {
  locale: string;
}) {
  const locale = input.locale === "en" ? "en" : "zh-HK";
  const user = await requireRole("pro", locale);
  let reservationId: string | undefined;

  try {
    let subscription = await ensureProSubscription(user.id);
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

export async function requestSignupSmsCodeAction(input: {
  phone: string;
  locale: string;
}) {
  const parsed = signupSmsRequestSchema.safeParse(input);
  const isEnglish = input.locale === "en";

  if (!parsed.success) {
    return {
      ok: false as const,
      error: isEnglish
        ? "Enter a valid Hong Kong mobile number."
        : "請輸入有效香港手提電話。",
    };
  }

  if (await findUserByIdentifier(parsed.data.phone)) {
    return {
      ok: false as const,
      error: isEnglish
        ? "This phone number already has an account. Please log in instead."
        : "呢個電話號碼已經有帳戶，請直接登入。",
    };
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    undefined;
  const reservation = await reserveSmsVerificationAttempt({
    phone: parsed.data.phone,
    ipAddress,
  });

  if (!reservation.ok) {
    return {
      ok: false as const,
      retryAfterSeconds: reservation.retryAfterSeconds,
      error:
        reservation.reason === "cooldown"
          ? isEnglish
            ? `Please wait ${reservation.retryAfterSeconds} seconds before resending.`
            : `請等 ${reservation.retryAfterSeconds} 秒先重新發送。`
          : isEnglish
            ? "Too many SMS requests. Please try again later."
            : "SMS 請求次數太多，請稍後再試。",
    };
  }

  try {
    await sendSmsVerificationCode(parsed.data.phone, parsed.data.locale);
  } catch (error) {
    const notConfigured =
      error instanceof SmsVerificationError &&
      error.reason === "not_configured";
    return {
      ok: false as const,
      retryAfterSeconds: reservation.retryAfterSeconds,
      error: notConfigured
        ? isEnglish
          ? "SMS verification has not been configured yet."
          : "SMS 驗證尚未完成系統設定。"
        : isEnglish
          ? "The SMS could not be sent. Please try again later."
          : "暫時未能發送 SMS，請稍後再試。",
    };
  }

  return {
    ok: true as const,
    retryAfterSeconds: reservation.retryAfterSeconds,
  };
}

export async function signUpAction(
  input: SignupWithVerificationInput & { interfaceLocale?: string },
) {
  const parsed = signupWithVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form fields." };
  }

  const { verificationCode, ...signupData } = parsed.data;
  const isEnglish = input.interfaceLocale === "en";
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

  let phoneApproved = false;
  try {
    phoneApproved = await checkSmsVerificationCode(
      signupData.phone,
      verificationCode,
    );
  } catch {
    return {
      ok: false as const,
      error: isEnglish
        ? "The SMS verification service is temporarily unavailable."
        : "SMS 驗證服務暫時未能使用，請稍後再試。",
    };
  }

  if (!phoneApproved) {
    return {
      ok: false as const,
      error: isEnglish
        ? "The verification code is incorrect or has expired."
        : "驗證碼錯誤或已過期，請重新輸入或發送。",
    };
  }

  let user;
  try {
    user = await createUserAccount(signupData, {
      phoneVerifiedAt: new Date().toISOString(),
    });
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
  customerId: string;
  locale: string;
  values: RequestFormInput;
}) {
  const parsed = requestFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please review the request details." };
  }

  const request = await createCustomerRequest(
    input.customerId,
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
  customerId: string;
  locale: string;
  requestId: string;
  quoteId: string;
}) {
  try {
    const quote = await acceptCustomerQuote(
      input.customerId,
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to accept quote.",
    };
  }
}

export async function saveProProfileAction(input: {
  userId: string;
  locale: string;
  values: ProProfileInput;
}) {
  const parsed = proProfileSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please complete the required profile fields." };
  }

  await saveProProfile(input.userId, parsed.data);
  revalidatePath("/pro");
  revalidatePath("/pro/profile");
  return { ok: true };
}

export async function submitQuoteAction(input: {
  proId: string;
  locale: string;
  requestId: string;
  values: QuoteFormInput;
}) {
  const parsed = quoteFormSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, error: "Please review the quote details." };
  }

  await submitProQuote(input.proId, input.requestId, parsed.data, input.locale);
  revalidatePath("/pro/leads");
  revalidatePath(`/pro/leads/${input.requestId}`);
  revalidatePath("/pro/calendar");
  revalidatePath(`/customer/requests/${input.requestId}`);
  return { ok: true };
}

export async function updateBookingStatusAction(input: {
  proId: string;
  locale: string;
  bookingId: string;
  status: BookingStatus;
}) {
  try {
    const booking = await updateProBookingStatus(
      input.proId,
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
  adminId: string;
  note?: string;
}) {
  try {
    const request = await updateAdminRequestStatus(
      input.requestId,
      input.status,
      input.adminId,
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
  await toggleProVerification(input.userId, input.verified);
  revalidatePath("/admin/pros");
  revalidatePath(`/admin/pros/${input.userId}`);
  return { ok: true };
}
