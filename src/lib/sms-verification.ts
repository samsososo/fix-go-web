import { cookies } from "next/headers";

import { env, shouldUseSecureCookies } from "@/lib/env";
import {
  approveSignupSmsVerificationChallenge,
  approveSmsVerificationChallenge,
  consumeVerifiedSignupPhone,
  discardSmsVerificationChallenge,
  findUserById,
  getSmsVerificationChallenge,
  getSmsVerificationConfig,
  getSignupSmsVerificationChallenge,
  getVerifiedSignupPhone,
  issueSmsVerificationChallenge,
  issueSignupSmsVerificationChallenge,
  rejectSignupSmsVerificationChallengeAttempt,
  rejectSmsVerificationChallengeAttempt,
  verifySmsVerificationChallenge,
  verifySignupSmsVerificationChallenge,
} from "@/lib/mock/db";
import type { SmsVerificationConfigState } from "@/lib/sms-verification-config";
import {
  checkTwilioSmsVerification,
  isTwilioVerifyConfigured,
  sendTwilioSmsVerification,
} from "@/lib/twilio-verify";
import type { User } from "@/types/domain";

export const CONSOLE_SMS_POC_CODE = "123456";
const PENDING_SMS_COOKIE_NAME = `${env.SESSION_COOKIE_NAME}_sms_pending`;
const SIGNUP_SMS_COOKIE_NAME = `${env.SESSION_COOKIE_NAME}_sms_signup`;
const PENDING_SMS_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

function pendingCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: PENDING_SMS_COOKIE_MAX_AGE_SECONDS,
  };
}

export function isSmsVerificationProviderReady(
  config: SmsVerificationConfigState,
) {
  if (config.provider === "console") {
    return env.NODE_ENV === "test" || env.MONGODB_DATABASE === "hotfix_dev";
  }
  return config.provider === "twilio_verify" && isTwilioVerifyConfigured();
}

function consolePocCode(config: SmsVerificationConfigState) {
  return config.provider === "console" && isSmsVerificationProviderReady(config)
    ? CONSOLE_SMS_POC_CODE
    : undefined;
}

async function deliverVerificationCode(input: {
  config: SmsVerificationConfigState;
  phone: string;
  code: string;
  locale: "zh-HK" | "en";
}) {
  if (input.config.provider === "twilio_verify") {
    await sendTwilioSmsVerification({
      phone: input.phone,
      locale: input.locale,
    });
    return;
  }
  if (!isSmsVerificationProviderReady(input.config)) {
    throw new Error("SMS verification provider is not configured.");
  }

  const maskedPhone = `${input.phone.slice(0, 1)}***${input.phone.slice(-4)}`;
  console.info(`[sms-poc] ${maskedPhone} verification code: ${input.code}`);
}

async function storePendingChallenge(challengeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_SMS_COOKIE_NAME, challengeId, pendingCookieOptions());
}

async function getSignupChallengeId() {
  const cookieStore = await cookies();
  return cookieStore.get(SIGNUP_SMS_COOKIE_NAME)?.value;
}

async function storeSignupChallenge(challengeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SIGNUP_SMS_COOKIE_NAME, challengeId, pendingCookieOptions());
}

export async function clearPendingSmsVerification() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_SMS_COOKIE_NAME);
}

export async function clearPendingSignupSmsVerification() {
  const cookieStore = await cookies();
  cookieStore.delete(SIGNUP_SMS_COOKIE_NAME);
}

export async function startSmsPhoneVerification(user: User) {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return { status: "disabled" as const };
  }
  if (!isSmsVerificationProviderReady(config)) {
    return { status: "provider_unavailable" as const };
  }

  const result = await issueSmsVerificationChallenge({
    userId: user.id,
    phone: user.phone,
    provider: config.provider,
    code: CONSOLE_SMS_POC_CODE,
    otpTtlSeconds: config.otpTtlSeconds,
    resendCooldownSeconds: config.resendCooldownSeconds,
    maxSendsPerHour: config.maxSendsPerHour,
  });

  if (
    (result.status === "sent" ||
      result.status === "cooldown" ||
      result.status === "rate_limited") &&
    result.challengeId
  ) {
    await storePendingChallenge(result.challengeId);
  }
  if (result.status === "sent") {
    try {
      await deliverVerificationCode({
        config,
        phone: user.phone,
        code: CONSOLE_SMS_POC_CODE,
        locale: user.locale,
      });
    } catch {
      await discardSmsVerificationChallenge({
        challengeId: result.challengeId,
        purpose: "account",
      });
      await clearPendingSmsVerification();
      return { status: "provider_unavailable" as const };
    }
    return {
      ...result,
      codeExpiresInSeconds: config.otpTtlSeconds,
    };
  }

  return result;
}

export async function getPendingSmsVerification() {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return null;
  }

  const cookieStore = await cookies();
  const challengeId = cookieStore.get(PENDING_SMS_COOKIE_NAME)?.value;
  if (!challengeId) {
    return null;
  }
  const challenge = await getSmsVerificationChallenge(challengeId);
  if (!challenge || challenge.provider !== config.provider) {
    return null;
  }
  return {
    ...challenge,
    maskedPhone: `${challenge.phone.slice(0, 1)}*** ${challenge.phone.slice(-4)}`,
    consolePocCode: consolePocCode(config),
  };
}

export async function verifyPendingSmsCode(code: string) {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return { status: "disabled" as const };
  }
  if (!isSmsVerificationProviderReady(config)) {
    return { status: "provider_unavailable" as const };
  }

  const cookieStore = await cookies();
  const challengeId = cookieStore.get(PENDING_SMS_COOKIE_NAME)?.value;
  if (!challengeId) {
    return { status: "missing" as const };
  }

  const challenge = await getSmsVerificationChallenge(challengeId);
  if (!challenge || challenge.provider !== config.provider) {
    return { status: "missing" as const };
  }

  if (config.provider === "twilio_verify") {
    if (challenge.attempts >= config.maxAttempts) {
      return { status: "locked" as const };
    }
    if (Date.parse(challenge.codeExpiresAt) <= Date.now()) {
      return { status: "expired" as const };
    }
    try {
      const result = await checkTwilioSmsVerification({
        phone: challenge.phone,
        code,
      });
      if (result.status === "approved") {
        const approved = await approveSmsVerificationChallenge({
          challengeId,
          maxAttempts: config.maxAttempts,
        });
        if (approved.status === "verified") {
          await clearPendingSmsVerification();
        }
        return approved;
      }
      if (result.status === "invalid") {
        return rejectSmsVerificationChallengeAttempt({
          challengeId,
          maxAttempts: config.maxAttempts,
        });
      }
      return result;
    } catch {
      return { status: "provider_unavailable" as const };
    }
  }

  const result = await verifySmsVerificationChallenge({
    challengeId,
    code,
    maxAttempts: config.maxAttempts,
  });
  if (result.status === "verified") {
    await clearPendingSmsVerification();
  }
  return result;
}

export async function resendPendingSmsCode() {
  const cookieStore = await cookies();
  const challengeId = cookieStore.get(PENDING_SMS_COOKIE_NAME)?.value;
  if (!challengeId) {
    return { status: "missing" as const };
  }
  const challenge = await getSmsVerificationChallenge(challengeId);
  if (!challenge) {
    return { status: "missing" as const };
  }
  const user = await findUserById(challenge.userId);
  if (!user) {
    return { status: "missing" as const };
  }

  return startSmsPhoneVerification(user);
}

export async function startSignupSmsPhoneVerification(
  phone: string,
  locale: "zh-HK" | "en" = "zh-HK",
) {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return { status: "disabled" as const };
  }
  if (!isSmsVerificationProviderReady(config)) {
    return { status: "provider_unavailable" as const };
  }

  const result = await issueSignupSmsVerificationChallenge({
    challengeId: await getSignupChallengeId(),
    phone,
    provider: config.provider,
    code: CONSOLE_SMS_POC_CODE,
    otpTtlSeconds: config.otpTtlSeconds,
    resendCooldownSeconds: config.resendCooldownSeconds,
    maxSendsPerHour: config.maxSendsPerHour,
  });

  if (result.challengeId) {
    await storeSignupChallenge(result.challengeId);
  }
  if (result.status === "sent") {
    try {
      await deliverVerificationCode({
        config,
        phone,
        code: CONSOLE_SMS_POC_CODE,
        locale,
      });
    } catch {
      await discardSmsVerificationChallenge({
        challengeId: result.challengeId,
        purpose: "signup",
      });
      await clearPendingSignupSmsVerification();
      return { status: "provider_unavailable" as const };
    }
  }

  return {
    ...result,
    maskedPhone: `${phone.slice(0, 1)}*** ${phone.slice(-4)}`,
    consolePocCode: consolePocCode(config),
  };
}

export async function getPendingSignupSmsVerification() {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return null;
  }

  const challengeId = await getSignupChallengeId();
  if (!challengeId) {
    return null;
  }
  const challenge = await getSignupSmsVerificationChallenge(challengeId);
  if (!challenge || challenge.provider !== config.provider) {
    return null;
  }
  const now = Date.now();

  return {
    ...challenge,
    maskedPhone: `${challenge.phone.slice(0, 1)}*** ${challenge.phone.slice(-4)}`,
    verified: Boolean(
      challenge.verifiedAt &&
      challenge.verifiedExpiresAt &&
      Date.parse(challenge.verifiedExpiresAt) > now,
    ),
    resendSeconds: Math.max(
      0,
      Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1000),
    ),
    expirySeconds: Math.max(
      0,
      Math.ceil((Date.parse(challenge.codeExpiresAt) - now) / 1000),
    ),
    consolePocCode: consolePocCode(config),
  };
}

export async function verifyPendingSignupSmsCode(phone: string, code: string) {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled) {
    return { status: "disabled" as const };
  }
  if (!isSmsVerificationProviderReady(config)) {
    return { status: "provider_unavailable" as const };
  }

  const challengeId = await getSignupChallengeId();
  if (!challengeId) {
    return { status: "missing" as const };
  }

  const challenge = await getSignupSmsVerificationChallenge(challengeId);
  if (
    !challenge ||
    challenge.phone !== phone ||
    challenge.provider !== config.provider
  ) {
    return { status: "missing" as const };
  }

  if (config.provider === "twilio_verify") {
    const now = Date.now();
    if (
      challenge.verifiedAt &&
      challenge.verifiedExpiresAt &&
      Date.parse(challenge.verifiedExpiresAt) > now
    ) {
      return {
        status: "verified" as const,
        phone,
        verifiedAt: challenge.verifiedAt,
      };
    }
    if (challenge.attempts >= config.maxAttempts) {
      return { status: "locked" as const };
    }
    if (Date.parse(challenge.codeExpiresAt) <= now) {
      return { status: "expired" as const };
    }
    try {
      const result = await checkTwilioSmsVerification({ phone, code });
      if (result.status === "approved") {
        return approveSignupSmsVerificationChallenge({
          challengeId,
          phone,
          maxAttempts: config.maxAttempts,
        });
      }
      if (result.status === "invalid") {
        return rejectSignupSmsVerificationChallengeAttempt({
          challengeId,
          phone,
          maxAttempts: config.maxAttempts,
        });
      }
      return result;
    } catch {
      return { status: "provider_unavailable" as const };
    }
  }

  return verifySignupSmsVerificationChallenge({
    challengeId,
    phone,
    code,
    maxAttempts: config.maxAttempts,
  });
}

export async function getVerifiedPendingSignupPhone(phone: string) {
  const config = await getSmsVerificationConfig();
  if (!config.effectiveEnabled || !isSmsVerificationProviderReady(config)) {
    return null;
  }
  const challengeId = await getSignupChallengeId();
  if (!challengeId) {
    return null;
  }

  const challenge = await getSignupSmsVerificationChallenge(challengeId);
  if (
    !challenge ||
    challenge.phone !== phone ||
    challenge.provider !== config.provider
  ) {
    return null;
  }

  return getVerifiedSignupPhone({
    challengeId,
    phone,
    provider: config.provider,
  });
}

export async function consumePendingSignupPhoneVerification(phone: string) {
  const challengeId = await getSignupChallengeId();
  if (!challengeId) {
    return false;
  }

  const consumed = await consumeVerifiedSignupPhone({ challengeId, phone });
  if (consumed) {
    await clearPendingSignupSmsVerification();
  }
  return consumed;
}
