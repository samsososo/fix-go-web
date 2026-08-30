import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieDelete: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  approveSignup: vi.fn(),
  approveAccount: vi.fn(),
  checkTwilio: vi.fn(),
  consumeVerifiedSignupPhone: vi.fn(),
  discardChallenge: vi.fn(),
  findUserById: vi.fn(),
  getAccountChallenge: vi.fn(),
  getConfig: vi.fn(),
  getSignupChallenge: vi.fn(),
  getVerifiedSignupPhone: vi.fn(),
  issueAccountChallenge: vi.fn(),
  issueSignupChallenge: vi.fn(),
  rejectSignup: vi.fn(),
  rejectAccount: vi.fn(),
  sendTwilio: vi.fn(),
  verifyAccountChallenge: vi.fn(),
  verifySignupChallenge: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  })),
}));

vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
    MONGODB_DATABASE: "hotfix_prod",
    SESSION_COOKIE_NAME: "hotfix_session",
  },
  shouldUseSecureCookies: () => true,
}));

vi.mock("@/lib/mock/db", () => ({
  approveSignupSmsVerificationChallenge: mocks.approveSignup,
  approveSmsVerificationChallenge: mocks.approveAccount,
  consumeVerifiedSignupPhone: mocks.consumeVerifiedSignupPhone,
  discardSmsVerificationChallenge: mocks.discardChallenge,
  findUserById: mocks.findUserById,
  getSmsVerificationChallenge: mocks.getAccountChallenge,
  getSmsVerificationConfig: mocks.getConfig,
  getSignupSmsVerificationChallenge: mocks.getSignupChallenge,
  getVerifiedSignupPhone: mocks.getVerifiedSignupPhone,
  issueSmsVerificationChallenge: mocks.issueAccountChallenge,
  issueSignupSmsVerificationChallenge: mocks.issueSignupChallenge,
  rejectSignupSmsVerificationChallengeAttempt: mocks.rejectSignup,
  rejectSmsVerificationChallengeAttempt: mocks.rejectAccount,
  verifySmsVerificationChallenge: mocks.verifyAccountChallenge,
  verifySignupSmsVerificationChallenge: mocks.verifySignupChallenge,
}));

vi.mock("@/lib/twilio-verify", () => ({
  checkTwilioSmsVerification: mocks.checkTwilio,
  isTwilioVerifyConfigured: () => true,
  sendTwilioSmsVerification: mocks.sendTwilio,
}));

import {
  getVerifiedPendingSignupPhone,
  startSignupSmsPhoneVerification,
  verifyPendingSignupSmsCode,
} from "@/lib/sms-verification";

const twilioConfig = {
  enabled: true,
  provider: "twilio_verify" as const,
  otpTtlSeconds: 300,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  maxSendsPerHour: 5,
  effectiveEnabled: true,
};

describe("SMS verification Twilio provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(twilioConfig);
    mocks.cookieGet.mockReturnValue({ value: "signup_challenge_1" });
  });

  it("sends a real provider code without exposing the console POC code", async () => {
    mocks.issueSignupChallenge.mockResolvedValue({
      status: "sent",
      challengeId: "signup_challenge_1",
      retryAfterSeconds: 60,
      codeExpiresInSeconds: 300,
    });
    mocks.sendTwilio.mockResolvedValue({ status: "sent" });

    await expect(
      startSignupSmsPhoneVerification("91234567", "zh-HK"),
    ).resolves.toMatchObject({
      status: "sent",
      maskedPhone: "9*** 4567",
      consolePocCode: undefined,
    });

    expect(mocks.sendTwilio).toHaveBeenCalledWith({
      phone: "91234567",
      locale: "zh-HK",
    });
    expect(mocks.cookieSet).toHaveBeenCalled();
  });

  it("removes the local reservation when Twilio cannot send", async () => {
    mocks.issueSignupChallenge.mockResolvedValue({
      status: "sent",
      challengeId: "signup_challenge_1",
      retryAfterSeconds: 60,
      codeExpiresInSeconds: 300,
    });
    mocks.sendTwilio.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      startSignupSmsPhoneVerification("91234567", "zh-HK"),
    ).resolves.toEqual({ status: "provider_unavailable" });
    expect(mocks.discardChallenge).toHaveBeenCalledWith({
      challengeId: "signup_challenge_1",
      purpose: "signup",
    });
    expect(mocks.cookieDelete).toHaveBeenCalled();
  });

  it("records verification only after Twilio approves the submitted code", async () => {
    mocks.getSignupChallenge.mockResolvedValue({
      id: "signup_challenge_1",
      phone: "91234567",
      provider: "twilio_verify",
      attempts: 0,
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      codeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    mocks.checkTwilio.mockResolvedValue({ status: "approved" });
    mocks.approveSignup.mockResolvedValue({
      status: "verified",
      phone: "91234567",
      verifiedAt: new Date().toISOString(),
    });

    await expect(
      verifyPendingSignupSmsCode("91234567", "654321"),
    ).resolves.toMatchObject({ status: "verified", phone: "91234567" });

    expect(mocks.checkTwilio).toHaveBeenCalledWith({
      phone: "91234567",
      code: "654321",
    });
    expect(mocks.approveSignup).toHaveBeenCalledWith({
      challengeId: "signup_challenge_1",
      phone: "91234567",
      maxAttempts: 5,
    });
    expect(mocks.verifySignupChallenge).not.toHaveBeenCalled();
  });

  it("records a local failed attempt when Twilio rejects the code", async () => {
    mocks.getSignupChallenge.mockResolvedValue({
      id: "signup_challenge_1",
      phone: "91234567",
      provider: "twilio_verify",
      attempts: 0,
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      codeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    mocks.checkTwilio.mockResolvedValue({ status: "invalid" });
    mocks.rejectSignup.mockResolvedValue({
      status: "invalid",
      attemptsRemaining: 4,
    });

    await expect(
      verifyPendingSignupSmsCode("91234567", "000000"),
    ).resolves.toEqual({ status: "invalid", attemptsRemaining: 4 });
    expect(mocks.rejectSignup).toHaveBeenCalledWith({
      challengeId: "signup_challenge_1",
      phone: "91234567",
      maxAttempts: 5,
    });
  });

  it("does not reuse a verified console challenge after switching to Twilio", async () => {
    mocks.getSignupChallenge.mockResolvedValue({
      id: "signup_challenge_1",
      phone: "91234567",
      provider: "console",
      attempts: 0,
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
      codeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      verifiedAt: new Date().toISOString(),
      verifiedExpiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

    await expect(getVerifiedPendingSignupPhone("91234567")).resolves.toBeNull();
    expect(mocks.getVerifiedSignupPhone).not.toHaveBeenCalled();
  });
});
