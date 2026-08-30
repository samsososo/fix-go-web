import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  clearSession: vi.fn(),
  localizedRoleHomePath: vi.fn(
    (role: string, locale: string) => `/${locale}/${role}`,
  ),
  requireRole: vi.fn(),
  signInAs: vi.fn(),
  signInWithCredentials: vi.fn(),
}));

vi.mock("@/lib/mock/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mock/db")>();
  return {
    ...actual,
    createCredential: vi.fn(),
    getSmsVerificationConfig: vi.fn(),
  };
});

vi.mock("@/lib/sms-verification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/sms-verification")>();
  return {
    ...actual,
    isSmsVerificationProviderReady: vi.fn(),
    startSmsPhoneVerification: vi.fn(),
  };
});

vi.mock("@/lib/mock/repositories", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/mock/repositories")>();
  return {
    ...actual,
    createUserAccount: vi.fn(),
    findUserByIdentifier: vi.fn(),
  };
});

import { signInAs } from "@/lib/auth";
import { createCredential, getSmsVerificationConfig } from "@/lib/mock/db";
import {
  createUserAccount,
  findUserByIdentifier,
} from "@/lib/mock/repositories";
import { signUpAction } from "@/lib/actions";
import {
  isSmsVerificationProviderReady,
  startSmsPhoneVerification,
} from "@/lib/sms-verification";
import { defaultSmsVerificationConfig } from "@/lib/sms-verification-config";
import type { SignupInput } from "@/lib/validation";
import type { User } from "@/types/domain";

const signupInput: SignupInput = {
  fullName: "測試師傅",
  phone: "91234567",
  email: "new-pro@hotfix.test",
  role: "pro",
  serviceCategoryIds: ["aircon"],
  locale: "zh-HK",
  dateOfBirth: "1990-05-20",
  securityQuestionId: "childhood_nickname",
  securityAnswer: "小明",
  password: "NewPass123!",
  confirmPassword: "NewPass123!",
};

const createdPro: User = {
  id: "user_pro_new",
  role: "pro",
  fullName: signupInput.fullName,
  email: signupInput.email || undefined,
  phone: signupInput.phone,
  locale: signupInput.locale,
  createdAt: "2026-08-15T10:00:00.000Z",
  lastLoginAt: "2026-08-15T10:00:00.000Z",
};

const disabledSmsConfig = {
  ...defaultSmsVerificationConfig,
  effectiveEnabled: false,
  forceOff: false,
};

describe("signup SMS verification routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSmsVerificationConfig).mockResolvedValue(disabledSmsConfig);
    vi.mocked(isSmsVerificationProviderReady).mockReturnValue(true);
    vi.mocked(findUserByIdentifier).mockResolvedValue(null);
    vi.mocked(createUserAccount).mockResolvedValue(createdPro);
  });

  it("creates and signs in a pro without an OTP or verified-phone timestamp", async () => {
    await expect(
      signUpAction({ ...signupInput, interfaceLocale: "zh-HK" }),
    ).resolves.toEqual({ ok: true, target: "/pro/billing" });

    expect(createUserAccount).toHaveBeenCalledWith(signupInput);
    expect(vi.mocked(createUserAccount).mock.calls[0]).toHaveLength(1);
    expect(createCredential).toHaveBeenCalledWith(
      createdPro.id,
      signupInput.password,
      false,
      {
        dateOfBirth: signupInput.dateOfBirth,
        securityQuestionId: signupInput.securityQuestionId,
        securityAnswer: signupInput.securityAnswer,
      },
    );
    expect(signInAs).toHaveBeenCalledWith(createdPro.id);
    expect(createdPro.phoneVerifiedAt).toBeUndefined();
  });

  it("routes a new account to OTP verification when the DB config is on", async () => {
    vi.mocked(getSmsVerificationConfig).mockResolvedValue({
      ...disabledSmsConfig,
      enabled: true,
      effectiveEnabled: true,
    });
    vi.mocked(startSmsPhoneVerification).mockResolvedValue({
      status: "sent",
      challengeId: "challenge_1",
      retryAfterSeconds: 60,
      codeExpiresInSeconds: 300,
    });

    await expect(
      signUpAction({ ...signupInput, interfaceLocale: "zh-HK" }),
    ).resolves.toEqual({ ok: true, target: "/auth/verify" });

    expect(createUserAccount).toHaveBeenCalledWith(
      signupInput,
      expect.objectContaining({
        phoneVerificationRequiredAt: expect.any(String),
      }),
    );
    expect(startSmsPhoneVerification).toHaveBeenCalledWith(createdPro);
    expect(signInAs).not.toHaveBeenCalled();
  });

  it("still rejects an invalid Hong Kong mobile number", async () => {
    await expect(
      signUpAction({
        ...signupInput,
        phone: "21234567",
        interfaceLocale: "en",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Please check the form fields.",
    });

    expect(findUserByIdentifier).not.toHaveBeenCalled();
    expect(createUserAccount).not.toHaveBeenCalled();
  });
});
