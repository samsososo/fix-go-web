"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  clearSession,
  localizedRoleHomePath,
  signInAs,
  signInWithCredentials,
} from "@/lib/auth";
import { enableDemoLogin } from "@/lib/env";
import {
  createCredential,
  resetPasswordWithRecovery,
  reserveSmsVerificationAttempt,
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

  return {
    ok: true,
    target: localizedRoleHomePath(result.user.role, input.locale),
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
    target: localizedRoleHomePath(user.role, signupData.locale),
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
  return { ok: true, target: localizedRoleHomePath(user.role, input.locale) };
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
