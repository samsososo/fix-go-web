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
    consumePendingSignupPhoneVerification: vi.fn(),
    getVerifiedPendingSignupPhone: vi.fn(),
    isSmsVerificationProviderReady: vi.fn(),
    startSignupSmsPhoneVerification: vi.fn(),
    verifyPendingSignupSmsCode: vi.fn(),
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
import {
  requestSignupPhoneOtpAction,
  signUpAction,
  verifySignupPhoneOtpAction,
} from "@/lib/actions";
import {
  consumePendingSignupPhoneVerification,
  getVerifiedPendingSignupPhone,
  isSmsVerificationProviderReady,
  startSignupSmsPhoneVerification,
  verifyPendingSignupSmsCode,
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
};

describe("signup SMS verification routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSmsVerificationConfig).mockResolvedValue(disabledSmsConfig);
    vi.mocked(isSmsVerificationProviderReady).mockReturnValue(true);
    vi.mocked(getVerifiedPendingSignupPhone).mockResolvedValue(null);
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

  it("does not create an account before the phone is verified", async () => {
    vi.mocked(getSmsVerificationConfig).mockResolvedValue({
      ...disabledSmsConfig,
      enabled: true,
      effectiveEnabled: true,
    });

    await expect(
      signUpAction({ ...signupInput, interfaceLocale: "zh-HK" }),
    ).resolves.toEqual({
      ok: false,
      error: "請先驗證呢個電話號碼，再建立帳戶。",
    });

    expect(getVerifiedPendingSignupPhone).toHaveBeenCalledWith(
      signupInput.phone,
    );
    expect(createUserAccount).not.toHaveBeenCalled();
    expect(createCredential).not.toHaveBeenCalled();
    expect(signInAs).not.toHaveBeenCalled();
  });

  it("creates and signs in only after a matching phone verification", async () => {
    const verifiedAt = "2026-08-30T11:00:00.000Z";
    vi.mocked(getSmsVerificationConfig).mockResolvedValue({
      ...disabledSmsConfig,
      enabled: true,
      effectiveEnabled: true,
    });
    vi.mocked(getVerifiedPendingSignupPhone).mockResolvedValue({
      phone: signupInput.phone,
      verifiedAt,
    });

    await expect(
      signUpAction({ ...signupInput, interfaceLocale: "zh-HK" }),
    ).resolves.toEqual({ ok: true, target: "/pro/billing" });

    expect(createUserAccount).toHaveBeenCalledWith(signupInput, {
      phoneVerifiedAt: verifiedAt,
    });
    expect(consumePendingSignupPhoneVerification).toHaveBeenCalledWith(
      signupInput.phone,
    );
    expect(signInAs).toHaveBeenCalledWith(createdPro.id);
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

  it("requests a pre-signup code without creating an account", async () => {
    vi.mocked(getSmsVerificationConfig).mockResolvedValue({
      ...disabledSmsConfig,
      enabled: true,
      effectiveEnabled: true,
    });
    vi.mocked(startSignupSmsPhoneVerification).mockResolvedValue({
      status: "sent",
      challengeId: "signup_challenge_1",
      retryAfterSeconds: 60,
      codeExpiresInSeconds: 300,
      maskedPhone: "9*** 4567",
      consolePocCode: "123456",
    });

    await expect(
      requestSignupPhoneOtpAction({ phone: "91234567", locale: "zh-HK" }),
    ).resolves.toMatchObject({
      ok: true,
      phone: "91234567",
      maskedPhone: "9*** 4567",
      consolePocCode: "123456",
    });

    expect(startSignupSmsPhoneVerification).toHaveBeenCalledWith(
      "91234567",
      "zh-HK",
    );
    expect(createUserAccount).not.toHaveBeenCalled();
    expect(createCredential).not.toHaveBeenCalled();
  });

  it("binds OTP verification to the submitted phone", async () => {
    vi.mocked(verifyPendingSignupSmsCode).mockResolvedValue({
      status: "verified",
      phone: "91234567",
      verifiedAt: "2026-08-30T11:00:00.000Z",
    });

    await expect(
      verifySignupPhoneOtpAction({
        phone: "91234567",
        code: "123456",
        locale: "zh-HK",
      }),
    ).resolves.toMatchObject({ ok: true, phone: "91234567" });

    expect(verifyPendingSignupSmsCode).toHaveBeenCalledWith(
      "91234567",
      "123456",
    );
  });
});
