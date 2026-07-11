import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createCredential,
  createSession,
  findCredentialByIdentifier,
  findPasswordRecoveryByUserId,
  getSessionUser,
  readDb,
  resetPasswordWithRecovery,
  verifyUserCredentials,
} from "@/lib/mock/db";
import {
  createCustomerRequest,
  createUserAccount,
} from "@/lib/mock/repositories";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

describe("auth hardening", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("verifies seeded credentials and resolves a session user", async () => {
    const login = await verifyUserCredentials(
      "amy@hotfix.hk",
      "HotfixDemo123!",
    );
    expect(login.ok).toBe(true);
    if (!login.ok) {
      return;
    }

    const session = await createSession(login.user.id);
    const user = await getSessionUser(session.sessionId);
    expect(user?.id).toBe(login.user.id);
    expect(user?.role).toBe("customer");
  });

  it("stores plaintext credentials for newly created accounts", async () => {
    const user = await createUserAccount({
      fullName: "Tester",
      phone: "96781234",
      email: "tester@hotfix.hk",
      role: "customer",
      serviceCategoryIds: [],
      locale: "zh-HK",
      dateOfBirth: "1990-05-20",
      securityQuestionId: "childhood_nickname",
      securityAnswer: "小明",
      password: "NewPass123!",
      confirmPassword: "NewPass123!",
    });
    await createCredential(user.id, "NewPass123!", false, {
      dateOfBirth: "1990-05-20",
      securityQuestionId: "childhood_nickname",
      securityAnswer: "小明",
    });

    const storedCredential = await findCredentialByIdentifier(
      "tester@hotfix.hk",
    );
    const storedRecovery = await findPasswordRecoveryByUserId(user.id);
    expect(storedCredential?.password).toBe("NewPass123!");
    expect(storedRecovery?.securityAnswer).toBe("小明");

    const login = await verifyUserCredentials(
      "tester@hotfix.hk",
      "NewPass123!",
    );
    expect(login.ok).toBe(true);
  });

  it("requires every recovery detail and invalidates old sessions", async () => {
    const user = await createUserAccount({
      fullName: "Recovery Tester",
      phone: "96782345",
      email: "recovery@hotfix.hk",
      role: "customer",
      serviceCategoryIds: [],
      locale: "zh-HK",
      dateOfBirth: "1988-03-14",
      securityQuestionId: "first_school",
      securityAnswer: "  Happy School  ",
      password: "OldPass123!",
      confirmPassword: "OldPass123!",
    });
    await createCredential(user.id, "OldPass123!", false, {
      dateOfBirth: "1988-03-14",
      securityQuestionId: "first_school",
      securityAnswer: "  Happy School  ",
    });

    const login = await verifyUserCredentials(
      "recovery@hotfix.hk",
      "OldPass123!",
    );
    expect(login.ok).toBe(true);
    if (!login.ok) {
      return;
    }
    const session = await createSession(login.user.id);

    const wrongBirthDate = await resetPasswordWithRecovery({
      phone: "96782345",
      dateOfBirth: "1988-03-15",
      securityQuestionId: "first_school",
      securityAnswer: "Happy School",
      newPassword: "NewPass456!",
    });
    expect(wrongBirthDate).toEqual({ ok: false, reason: "mismatch" });

    const wrongQuestion = await resetPasswordWithRecovery({
      phone: "96782345",
      dateOfBirth: "1988-03-14",
      securityQuestionId: "childhood_nickname",
      securityAnswer: "Happy School",
      newPassword: "NewPass456!",
    });
    expect(wrongQuestion).toEqual({ ok: false, reason: "mismatch" });

    const wrongAnswer = await resetPasswordWithRecovery({
      phone: "96782345",
      dateOfBirth: "1988-03-14",
      securityQuestionId: "first_school",
      securityAnswer: "Wrong School",
      newPassword: "NewPass456!",
    });
    expect(wrongAnswer).toEqual({ ok: false, reason: "mismatch" });

    const wrongPhone = await resetPasswordWithRecovery({
      phone: "96789999",
      dateOfBirth: "1988-03-14",
      securityQuestionId: "first_school",
      securityAnswer: "Happy School",
      newPassword: "NewPass456!",
    });
    expect(wrongPhone).toEqual({ ok: false, reason: "mismatch" });

    const reset = await resetPasswordWithRecovery({
      phone: "96782345",
      dateOfBirth: "1988-03-14",
      securityQuestionId: "first_school",
      securityAnswer: "happy school",
      newPassword: "NewPass456!",
    });
    expect(reset).toEqual({ ok: true });

    expect(await getSessionUser(session.sessionId)).toBeNull();
    expect(
      await verifyUserCredentials("recovery@hotfix.hk", "OldPass123!"),
    ).toMatchObject({ ok: false });
    expect(
      await verifyUserCredentials("recovery@hotfix.hk", "NewPass456!"),
    ).toMatchObject({ ok: true });
  });

  it("rate limits repeated recovery failures", async () => {
    const attempt = {
      phone: "96783456",
      dateOfBirth: "1991-07-12",
      securityQuestionId: "first_school" as const,
      securityAnswer: "Unknown School",
      newPassword: "NewPass789!",
    };

    for (let index = 0; index < 5; index += 1) {
      await expect(resetPasswordWithRecovery(attempt)).resolves.toEqual({
        ok: false,
        reason: "mismatch",
      });
    }

    await expect(resetPasswordWithRecovery(attempt)).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("stores specialties for newly created pro accounts", async () => {
    const user = await createUserAccount({
      fullName: "冷氣師傅",
      phone: "96785678",
      email: "aircon-pro@hotfix.hk",
      role: "pro",
      serviceCategoryIds: ["aircon", "plumbing"],
      locale: "zh-HK",
      dateOfBirth: "1985-08-09",
      securityQuestionId: "childhood_character",
      securityAnswer: "叮噹",
      password: "NewPass123!",
      confirmPassword: "NewPass123!",
    });

    const db = await readDb();
    const profile = db.proProfiles.find((entry) => entry.userId === user.id);
    expect(profile?.serviceCategoryIds).toEqual(["aircon", "plumbing"]);
  });

  it("rejects invalid passwords", async () => {
    const login = await verifyUserCredentials(
      "amy@hotfix.hk",
      "wrong-password",
    );
    expect(login.ok).toBe(false);
  });

  it("keeps active sessions valid after marketplace writes", async () => {
    const login = await verifyUserCredentials(
      "amy@hotfix.hk",
      "HotfixDemo123!",
    );
    expect(login.ok).toBe(true);
    if (!login.ok) {
      return;
    }

    const session = await createSession(login.user.id);

    await createCustomerRequest(
      login.user.id,
      {
        title: "客廳冷氣滴水，需要安排檢查",
        description: "室內機滴水，想安排明天下午上門檢查及報價。",
        categoryId: "aircon",
        subcategoryId: "water_leak",
        urgency: "tomorrow",
        scheduledDate: "",
        budgetMin: 500,
        budgetMax: 1500,
        accessNotes: "到達前請先致電。",
        attachmentNames: ["ac-leak.jpg"],
        address: {
          district: "Yau Tsim Mong",
          area: "Tsim Sha Tsui",
          buildingEstate: "The Austin",
          block: "Tower 3A",
          floor: "18/F",
          flatRoom: "D",
          landmarkNotes: "Near Austin Station exit B5",
        },
      },
      "zh-HK",
    );

    const user = await getSessionUser(session.sessionId);
    expect(user?.id).toBe(login.user.id);
  });
});
