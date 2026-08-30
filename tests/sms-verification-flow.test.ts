import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  consumeVerifiedSignupPhone,
  getSignupSmsVerificationChallenge,
  getVerifiedSignupPhone,
  getSmsVerificationChallenge,
  issueSignupSmsVerificationChallenge,
  issueSmsVerificationChallenge,
  verifySignupSmsVerificationChallenge,
  verifySmsVerificationChallenge,
} from "@/lib/mock/db";
import {
  createUserAccount,
  findUserByIdentifier,
} from "@/lib/mock/repositories";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

const signupInput = {
  fullName: "SMS Tester",
  phone: "96785678",
  email: "sms-flow@hotfix.test",
  role: "customer" as const,
  serviceCategoryIds: [],
  locale: "zh-HK" as const,
  dateOfBirth: "1990-05-20",
  securityQuestionId: "childhood_nickname" as const,
  securityAnswer: "小明",
  password: "NewPass123!",
  confirmPassword: "NewPass123!",
};

describe("SMS verification challenge persistence", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  async function createPendingUser() {
    return createUserAccount(signupInput, {
      phoneVerificationRequiredAt: new Date().toISOString(),
    });
  }

  it("verifies the POC code once and records the phone timestamp", async () => {
    const user = await createPendingUser();
    const issued = await issueSmsVerificationChallenge({
      userId: user.id,
      phone: user.phone,
      code: "123456",
      otpTtlSeconds: 300,
      resendCooldownSeconds: 60,
      maxSendsPerHour: 5,
    });
    expect(issued.status).toBe("sent");
    if (issued.status !== "sent") {
      return;
    }

    const challenge = await getSmsVerificationChallenge(issued.challengeId);
    expect(challenge).toMatchObject({ userId: user.id, phone: user.phone });

    const verified = await verifySmsVerificationChallenge({
      challengeId: issued.challengeId,
      code: "123456",
      maxAttempts: 5,
    });
    expect(verified.status).toBe("verified");
    expect(
      (await findUserByIdentifier(user.phone))?.phoneVerifiedAt,
    ).toBeTruthy();
    await expect(
      verifySmsVerificationChallenge({
        challengeId: issued.challengeId,
        code: "123456",
        maxAttempts: 5,
      }),
    ).resolves.toEqual({ status: "missing" });
  });

  it("locks the challenge after the configured number of wrong codes", async () => {
    const user = await createPendingUser();
    const issued = await issueSmsVerificationChallenge({
      userId: user.id,
      phone: user.phone,
      code: "123456",
      otpTtlSeconds: 300,
      resendCooldownSeconds: 60,
      maxSendsPerHour: 5,
    });
    if (issued.status !== "sent") {
      throw new Error("Challenge was not created");
    }

    await expect(
      verifySmsVerificationChallenge({
        challengeId: issued.challengeId,
        code: "000000",
        maxAttempts: 2,
      }),
    ).resolves.toEqual({ status: "invalid", attemptsRemaining: 1 });
    await expect(
      verifySmsVerificationChallenge({
        challengeId: issued.challengeId,
        code: "111111",
        maxAttempts: 2,
      }),
    ).resolves.toEqual({ status: "locked" });
    await expect(
      verifySmsVerificationChallenge({
        challengeId: issued.challengeId,
        code: "123456",
        maxAttempts: 2,
      }),
    ).resolves.toEqual({ status: "locked" });
  });

  it("enforces the resend cooldown", async () => {
    const user = await createPendingUser();
    const first = await issueSmsVerificationChallenge({
      userId: user.id,
      phone: user.phone,
      code: "123456",
      otpTtlSeconds: 300,
      resendCooldownSeconds: 60,
      maxSendsPerHour: 5,
    });
    expect(first.status).toBe("sent");

    await expect(
      issueSmsVerificationChallenge({
        userId: user.id,
        phone: user.phone,
        code: "123456",
        otpTtlSeconds: 300,
        resendCooldownSeconds: 60,
        maxSendsPerHour: 5,
      }),
    ).resolves.toMatchObject({ status: "cooldown" });
  });

  it("enforces the hourly send limit", async () => {
    const user = await createPendingUser();
    const first = await issueSmsVerificationChallenge({
      userId: user.id,
      phone: user.phone,
      code: "123456",
      otpTtlSeconds: 300,
      resendCooldownSeconds: 0,
      maxSendsPerHour: 2,
    });
    expect(first.status).toBe("sent");
    await expect(
      issueSmsVerificationChallenge({
        userId: user.id,
        phone: user.phone,
        code: "123456",
        otpTtlSeconds: 300,
        resendCooldownSeconds: 0,
        maxSendsPerHour: 2,
      }),
    ).resolves.toMatchObject({ status: "sent" });
    await expect(
      issueSmsVerificationChallenge({
        userId: user.id,
        phone: user.phone,
        code: "123456",
        otpTtlSeconds: 300,
        resendCooldownSeconds: 0,
        maxSendsPerHour: 2,
      }),
    ).resolves.toMatchObject({ status: "rate_limited" });
  });

  it("rejects an expired code", async () => {
    const user = await createPendingUser();
    const issued = await issueSmsVerificationChallenge({
      userId: user.id,
      phone: user.phone,
      code: "123456",
      otpTtlSeconds: 0,
      resendCooldownSeconds: 0,
      maxSendsPerHour: 5,
    });
    if (issued.status !== "sent") {
      throw new Error("Challenge was not created");
    }

    await expect(
      verifySmsVerificationChallenge({
        challengeId: issued.challengeId,
        code: "123456",
        maxAttempts: 5,
      }),
    ).resolves.toEqual({ status: "expired" });
  });

  it("verifies a signup phone before any account exists and consumes it once", async () => {
    const issued = await issueSignupSmsVerificationChallenge({
      phone: signupInput.phone,
      code: "123456",
      otpTtlSeconds: 300,
      resendCooldownSeconds: 60,
      maxSendsPerHour: 5,
    });
    expect(issued.status).toBe("sent");
    if (issued.status !== "sent") {
      throw new Error("Signup challenge was not created");
    }

    expect(
      await getSignupSmsVerificationChallenge(issued.challengeId),
    ).toMatchObject({
      phone: signupInput.phone,
      verifiedAt: undefined,
    });
    await expect(
      verifySignupSmsVerificationChallenge({
        challengeId: issued.challengeId,
        phone: "91234567",
        code: "123456",
        maxAttempts: 5,
      }),
    ).resolves.toEqual({ status: "missing" });

    const verified = await verifySignupSmsVerificationChallenge({
      challengeId: issued.challengeId,
      phone: signupInput.phone,
      code: "123456",
      maxAttempts: 5,
    });
    expect(verified).toMatchObject({
      status: "verified",
      phone: signupInput.phone,
    });
    await expect(
      getVerifiedSignupPhone({
        challengeId: issued.challengeId,
        phone: signupInput.phone,
      }),
    ).resolves.toMatchObject({ phone: signupInput.phone });
    await expect(
      consumeVerifiedSignupPhone({
        challengeId: issued.challengeId,
        phone: signupInput.phone,
      }),
    ).resolves.toBe(true);
    await expect(
      getVerifiedSignupPhone({
        challengeId: issued.challengeId,
        phone: signupInput.phone,
      }),
    ).resolves.toBeNull();
  });
});
