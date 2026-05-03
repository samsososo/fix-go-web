import { beforeEach, describe, expect, it } from "vitest";

import {
  createCredential,
  createSession,
  getSessionUser,
  verifyUserCredentials,
} from "@/lib/mock/db";
import {
  createCustomerRequest,
  createUserAccount,
} from "@/lib/mock/repositories";
import { resetMockDb } from "./helpers/mock-db";

describe("auth hardening", () => {
  beforeEach(async () => {
    await resetMockDb();
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

  it("stores hashed credentials for newly created accounts", async () => {
    const user = await createUserAccount({
      fullName: "Tester",
      phone: "96781234",
      email: "tester@hotfix.hk",
      role: "customer",
      locale: "en",
      password: "NewPass123!",
      confirmPassword: "NewPass123!",
    });
    await createCredential(user.id, "NewPass123!");

    const login = await verifyUserCredentials(
      "tester@hotfix.hk",
      "NewPass123!",
    );
    expect(login.ok).toBe(true);
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

    await createCustomerRequest(login.user.id, {
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
    });

    const user = await getSessionUser(session.sessionId);
    expect(user?.id).toBe(login.user.id);
  });
});
