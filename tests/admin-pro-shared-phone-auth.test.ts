import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import {
  createCredential,
  createSession,
  findCredentialByIdentifier,
  findPasswordRecoveryByUserId,
  getSessionUser,
  readDb,
  resetPasswordWithRecovery,
  verifyUserCredentials,
  withDb,
} from "@/lib/mock/db";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

const sharedPhone = "98760012";
const adminEmail = `admin-${sharedPhone}@example.test`;
const proEmail = "shared-phone-pro@example.test";
const adminPassword = "AdminFixture123!";
const proPassword = "ProFixture123!";
const adminRecovery = {
  dateOfBirth: "1980-01-02",
  securityQuestionId: "first_school" as const,
  securityAnswer: "Admin School",
};
const proRecovery = {
  dateOfBirth: "1990-03-04",
  securityQuestionId: "childhood_nickname" as const,
  securityAnswer: "Pro Nickname",
};

describe("separate admin and pro authentication with a shared phone", () => {
  let adminId: string;
  let proId: string;

  beforeEach(async () => {
    if (
      env.NODE_ENV !== "test" ||
      !/^hotfix_test(?:_|$)/.test(env.MONGODB_DATABASE)
    ) {
      throw new Error("Shared-phone auth tests require an isolated test DB.");
    }
    await resetMockDb();
    const state = await readDb();
    adminId = state.users.find((user) => user.role === "admin")!.id;
    proId = state.users.find((user) => user.role === "pro")!.id;
    await withDb((db) => {
      for (const user of db.users) {
        if (user.id === adminId) {
          user.phone = sharedPhone;
          user.email = adminEmail;
        }
        if (user.id === proId) {
          user.phone = sharedPhone;
          user.email = proEmail;
        }
      }
    });
    await createCredential(adminId, adminPassword, false, adminRecovery);
    await createCredential(proId, proPassword, false, proRecovery);
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("uses the pro account for phone login and the admin account for email login", async () => {
    await expect(
      verifyUserCredentials("9876 0012", proPassword),
    ).resolves.toMatchObject({ ok: true, user: { id: proId, role: "pro" } });
    await expect(
      verifyUserCredentials(` ${adminEmail.toUpperCase()} `, adminPassword),
    ).resolves.toMatchObject({
      ok: true,
      user: { id: adminId, role: "admin" },
    });
    await expect(
      verifyUserCredentials(sharedPhone, adminPassword),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      verifyUserCredentials(proEmail, proPassword),
    ).resolves.toMatchObject({ ok: true, user: { id: proId, role: "pro" } });
  });

  it("never treats digits inside an email or malformed identifier as a phone", async () => {
    await expect(
      findCredentialByIdentifier(`unknown-${sharedPhone}@example.test`),
    ).resolves.toBeNull();
    await expect(
      verifyUserCredentials(adminEmail, proPassword),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      findCredentialByIdentifier(`account-${sharedPhone}`),
    ).resolves.toBeNull();
  });

  it("resets only the pro password and pro sessions when recovering the shared phone", async () => {
    const adminSession = await createSession(adminId);
    const proSession = await createSession(proId);
    const adminBefore = await getSessionUser(adminSession.sessionId);
    const adminRecoveryBefore = await findPasswordRecoveryByUserId(adminId);

    await expect(
      resetPasswordWithRecovery({
        phone: sharedPhone,
        ...adminRecovery,
        newPassword: "UnexpectedReset123!",
      }),
    ).resolves.toEqual({ ok: false, reason: "mismatch" });
    await expect(
      resetPasswordWithRecovery({
        phone: sharedPhone,
        ...proRecovery,
        newPassword: "NewProFixture123!",
      }),
    ).resolves.toEqual({ ok: true });

    expect(await getSessionUser(proSession.sessionId)).toBeNull();
    expect(await getSessionUser(adminSession.sessionId)).toEqual(adminBefore);
    expect(await findPasswordRecoveryByUserId(adminId)).toEqual(
      adminRecoveryBefore,
    );
    expect(await findCredentialByIdentifier(adminEmail)).toMatchObject({
      user: { id: adminId, role: "admin" },
      password: adminPassword,
    });
    await expect(
      verifyUserCredentials(sharedPhone, proPassword),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      verifyUserCredentials(sharedPhone, "NewProFixture123!"),
    ).resolves.toMatchObject({ ok: true, user: { id: proId, role: "pro" } });
  });
});
