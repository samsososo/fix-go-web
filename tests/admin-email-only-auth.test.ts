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

const formerPhones = ["9876" + "0012", "9876" + "0013"];
const adminEmails = ["first-admin@example.test", "second-admin@example.test"];
const adminPasswords = ["FirstAdminFixture123!", "SecondAdminFixture123!"];
const adminRecovery = {
  dateOfBirth: "1980-01-02",
  securityQuestionId: "first_school" as const,
  securityAnswer: "Admin School",
};
const proEmail = "email-only-admin-pro@example.test";
const proPassword = "ProFixture123!";
const proRecovery = {
  dateOfBirth: "1990-03-04",
  securityQuestionId: "childhood_nickname" as const,
  securityAnswer: "Pro Nickname",
};

describe("email-only administrator authentication", () => {
  let adminIds: string[];
  let proId: string;

  beforeEach(async () => {
    if (
      env.NODE_ENV !== "test" ||
      !/^hotfix_test(?:_|$)/.test(env.MONGODB_DATABASE)
    ) {
      throw new Error("Email-only admin tests require an isolated test DB.");
    }
    await resetMockDb();
    const state = await readDb();
    const seededAdmin = state.users.find((user) => user.role === "admin")!;
    proId = state.users.find((user) => user.role === "pro")!.id;
    adminIds = [seededAdmin.id, "admin_email_only_second"];

    await withDb((db) => {
      const firstAdmin = db.users.find((user) => user.id === adminIds[0])!;
      firstAdmin.email = adminEmails[0];
      Reflect.deleteProperty(firstAdmin, "phone");
      db.users.push({
        ...firstAdmin,
        id: adminIds[1],
        fullName: "Second administrator",
        email: adminEmails[1],
      });
      const pro = db.users.find((user) => user.id === proId)!;
      pro.phone = formerPhones[0];
      pro.email = proEmail;
    });

    for (const [index, adminId] of adminIds.entries()) {
      await createCredential(
        adminId,
        adminPasswords[index],
        false,
        adminRecovery,
      );
    }
    await createCredential(proId, proPassword, false, proRecovery);
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("preserves two phone-free admin accounts and authenticates each by email", async () => {
    const admins = (await readDb()).users.filter(
      (user) => user.role === "admin",
    );
    expect(admins).toHaveLength(2);
    expect(admins.every((user) => !("phone" in user))).toBe(true);

    for (const [index, adminId] of adminIds.entries()) {
      await expect(
        verifyUserCredentials(
          ` ${adminEmails[index].toUpperCase()} `,
          adminPasswords[index],
        ),
      ).resolves.toMatchObject({
        ok: true,
        user: { id: adminId, role: "admin", email: adminEmails[index] },
      });
    }
  });

  it("resolves former admin phones only to an existing pro or no account", async () => {
    await expect(
      findCredentialByIdentifier(formerPhones[0]),
    ).resolves.toMatchObject({ user: { id: proId, role: "pro" } });
    await expect(
      verifyUserCredentials(formerPhones[0], proPassword),
    ).resolves.toMatchObject({ ok: true, user: { id: proId, role: "pro" } });
    await expect(
      findCredentialByIdentifier(formerPhones[1]),
    ).resolves.toBeNull();

    for (const [index, phone] of formerPhones.entries()) {
      await expect(
        verifyUserCredentials(phone, adminPasswords[index]),
      ).resolves.toMatchObject({ ok: false });
    }
  });

  it("cannot reset an admin through its former phone and retains admin sessions", async () => {
    const sessions = await Promise.all(adminIds.map((id) => createSession(id)));
    const adminsBefore = await Promise.all(
      sessions.map((session) => getSessionUser(session.sessionId)),
    );
    const recoveriesBefore = await Promise.all(
      adminIds.map(findPasswordRecoveryByUserId),
    );

    for (const phone of formerPhones) {
      await expect(
        resetPasswordWithRecovery({
          phone,
          ...adminRecovery,
          newPassword: "UnexpectedReset123!",
        }),
      ).resolves.toEqual({ ok: false, reason: "mismatch" });
    }

    for (const [index, adminId] of adminIds.entries()) {
      expect(await getSessionUser(sessions[index].sessionId)).toEqual(
        adminsBefore[index],
      );
      expect(await findPasswordRecoveryByUserId(adminId)).toEqual(
        recoveriesBefore[index],
      );
      expect(
        await findCredentialByIdentifier(adminEmails[index]),
      ).toMatchObject({
        user: { id: adminId, role: "admin" },
        password: adminPasswords[index],
      });
    }
  });

  it("continues recovering the pro on the shared former phone without changing admins", async () => {
    const adminSession = await createSession(adminIds[0]);
    const proSession = await createSession(proId);
    const adminBefore = await getSessionUser(adminSession.sessionId);

    await expect(
      resetPasswordWithRecovery({
        phone: formerPhones[0],
        ...proRecovery,
        newPassword: "UpdatedProFixture123!",
      }),
    ).resolves.toEqual({ ok: true });
    expect(await getSessionUser(proSession.sessionId)).toBeNull();
    expect(await getSessionUser(adminSession.sessionId)).toEqual(adminBefore);
    await expect(
      verifyUserCredentials(formerPhones[0], "UpdatedProFixture123!"),
    ).resolves.toMatchObject({ ok: true, user: { id: proId, role: "pro" } });
    expect(await findCredentialByIdentifier(adminEmails[0])).toMatchObject({
      user: { id: adminIds[0], role: "admin" },
      password: adminPasswords[0],
    });
  });

  it("rejects phone login and recovery even if an admin still has a legacy phone", async () => {
    await withDb((db) => {
      db.users.find((user) => user.id === adminIds[1])!.phone = formerPhones[1];
    });

    await expect(
      findCredentialByIdentifier(formerPhones[1]),
    ).resolves.toBeNull();
    await expect(
      verifyUserCredentials(formerPhones[1], adminPasswords[1]),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      resetPasswordWithRecovery({
        phone: formerPhones[1],
        ...adminRecovery,
        newPassword: "UnexpectedReset123!",
      }),
    ).resolves.toEqual({ ok: false, reason: "mismatch" });
    await expect(
      verifyUserCredentials(adminEmails[1], adminPasswords[1]),
    ).resolves.toMatchObject({
      ok: true,
      user: { id: adminIds[1], role: "admin" },
    });
  });
});
