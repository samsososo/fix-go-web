import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  createSession: vi.fn(),
  findUserById: vi.fn(),
  getSmsVerificationConfig: vi.fn(),
  verifyUserCredentials: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: mocks.cookieSet,
    delete: vi.fn(),
  })),
}));

vi.mock("@/lib/mock/db", () => ({
  createSession: mocks.createSession,
  findUserById: mocks.findUserById,
  getSessionUser: vi.fn(),
  getSmsVerificationConfig: mocks.getSmsVerificationConfig,
  invalidateSession: vi.fn(),
  verifyUserCredentials: mocks.verifyUserCredentials,
}));

import { signInAs, signInWithCredentials } from "@/lib/auth";
import { defaultSmsVerificationConfig } from "@/lib/sms-verification-config";
import type { User } from "@/types/domain";

const pendingUser: User = {
  id: "pending_customer",
  role: "customer",
  fullName: "Pending Customer",
  phone: "91234567",
  locale: "zh-HK",
  createdAt: "2026-08-30T10:00:00.000Z",
  lastLoginAt: "2026-08-30T10:00:00.000Z",
  phoneVerificationRequiredAt: "2026-08-30T10:00:00.000Z",
};

describe("SMS verification login gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSmsVerificationConfig.mockResolvedValue({
      ...defaultSmsVerificationConfig,
      enabled: true,
      effectiveEnabled: true,
    });
    mocks.verifyUserCredentials.mockResolvedValue({
      ok: true,
      user: pendingUser,
      isDemo: false,
    });
    mocks.findUserById.mockResolvedValue(pendingUser);
  });

  it("does not create a normal session for a pending new account", async () => {
    await expect(
      signInWithCredentials(pendingUser.phone, "ValidPass123!"),
    ).resolves.toMatchObject({
      ok: true,
      verificationRequired: true,
      user: pendingUser,
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("grandfathers an existing account that was never marked as required", async () => {
    const existingUser = {
      ...pendingUser,
      id: "existing_customer",
      phoneVerificationRequiredAt: undefined,
    };
    mocks.verifyUserCredentials.mockResolvedValue({
      ok: true,
      user: existingUser,
      isDemo: false,
    });
    mocks.createSession.mockResolvedValue({ sessionId: "session_1" });

    await expect(
      signInWithCredentials(existingUser.phone, "ValidPass123!"),
    ).resolves.toMatchObject({ ok: true, user: existingUser });
    expect(mocks.createSession).toHaveBeenCalledWith(existingUser.id);
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
  });

  it("blocks direct server-side session creation for a pending account", async () => {
    await expect(signInAs(pendingUser.id)).rejects.toThrow(
      "Phone verification is required.",
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
