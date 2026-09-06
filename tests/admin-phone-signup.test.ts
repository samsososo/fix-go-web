import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MockDb, User } from "@/types/domain";
import type { SignupInput } from "@/lib/validation";

const { readDb, withDb, findProSubscription } = vi.hoisted(() => ({
  readDb: vi.fn(),
  withDb: vi.fn(),
  findProSubscription: vi.fn(),
}));

vi.mock("@/lib/mock/db", () => ({
  readDb,
  withDb,
  findProSubscription,
  listProSubscriptions: vi.fn(),
  listCredentialedDemoUsers: vi.fn(),
}));

import {
  createUserAccount,
  findUserByIdentifier,
} from "@/lib/mock/repositories";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

const phone = ["9123", "4567"].join("");
const adminEmail = "admin@example.test";
const admin: User = {
  id: "existing_admin",
  role: "admin",
  fullName: "Existing administrator",
  email: adminEmail,
  phone,
  locale: "zh-HK",
  createdAt: "2026-08-01T00:00:00.000Z",
  lastLoginAt: "2026-08-02T00:00:00.000Z",
};

const signup: SignupInput = {
  role: "pro",
  fullName: "New tradesperson",
  phone,
  email: "pro@example.test",
  locale: "zh-HK",
  serviceCategoryIds: ["aircon"],
  dateOfBirth: "1990-01-01",
  securityQuestionId: "childhood_nickname",
  securityAnswer: "Synthetic answer",
  password: "SyntheticPass123!",
  confirmPassword: "SyntheticPass123!",
};

let db: MockDb;

beforeEach(() => {
  vi.clearAllMocks();
  db = {
    users: [structuredClone(admin)],
    customerProfiles: [],
    proProfiles: [],
    categories: [],
    districts: [],
    addresses: [],
    attachments: [],
    requests: [],
    quotes: [],
    bookings: [],
    bookingStatusEvents: [],
    notifications: [],
    adminNotes: [],
  };
  readDb.mockImplementation(async () => db);
  withDb.mockImplementation(async (update: (value: MockDb) => unknown) =>
    update(db),
  );
  findProSubscription.mockResolvedValue(null);
});

describe("admin phone reuse for pro signup", () => {
  it("creates a separate ordinary pro and leaves the administrator unchanged", async () => {
    const created = await createUserAccount(signup);

    expect(created.id).not.toBe(admin.id);
    expect(created).toMatchObject({
      role: "pro",
      phone,
      email: signup.email,
      fullName: signup.fullName,
    });
    expect(db.users).toHaveLength(2);
    expect(db.users[0]).toEqual(admin);
    expect(db.customerProfiles).toEqual([]);
    expect(db.proProfiles).toEqual([
      expect.objectContaining({
        userId: created.id,
        verificationStatus: "unverified",
        verificationLevel: "none",
        serviceCategoryIds: ["aircon"],
      }),
    ]);
    expect(
      await getProSubscriptionEntitlement(
        created.id,
        "2026-09-06T00:00:00.000Z",
      ),
    ).toMatchObject({
      subscription: null,
      entitlement: {
        status: "setup_required",
        canCreateQuotes: false,
        canAcceptNewWork: false,
      },
    });
  });

  it("does not allow customer signup with an administrator's phone", async () => {
    await expect(
      createUserAccount({ ...signup, role: "customer" }),
    ).rejects.toThrow("already exists");
    expect(db.users).toEqual([admin]);
    expect(db.customerProfiles).toEqual([]);
    expect(db.proProfiles).toEqual([]);
  });

  it.each(["customer", "pro"] as const)(
    "rejects a phone also used by a %s even when the admin is first",
    async (role) => {
      db.users.push({
        ...admin,
        id: `existing_${role}`,
        role,
        email: `${role}@example.test`,
      });
      const before = structuredClone(db);

      await expect(
        createUserAccount({ ...signup, email: "new@example.test" }),
      ).rejects.toThrow("already exists");
      expect(db).toEqual(before);
    },
  );

  it("keeps admin email globally unique when its phone may be shared", async () => {
    await expect(
      createUserAccount({ ...signup, email: "  ADMIN@EXAMPLE.TEST  " }),
    ).rejects.toThrow("already exists");
    expect(db.users).toEqual([admin]);
    expect(db.proProfiles).toEqual([]);
  });

  it("rejects another account's email even if the admin phone is reusable", async () => {
    db.users.push({
      ...admin,
      id: "existing_customer",
      role: "customer",
      phone: ["9876", "5432"].join(""),
      email: signup.email,
    });

    await expect(createUserAccount(signup)).rejects.toThrow("already exists");
    expect(db.users).toHaveLength(2);
    expect(db.proProfiles).toEqual([]);
  });

  it("allows signup without email while still blocking a second pro", async () => {
    await createUserAccount({ ...signup, email: "" });

    await expect(createUserAccount({ ...signup, email: "" })).rejects.toThrow(
      "already exists",
    );
    expect(db.users).toHaveLength(2);
    expect(db.proProfiles).toHaveLength(1);
  });
});

describe("lookup when an admin shares a phone", () => {
  it.each(["admin-first", "pro-first"])(
    "returns the pro for phone lookup with %s ordering",
    async (order) => {
      const pro: User = {
        ...admin,
        id: "existing_pro",
        role: "pro",
        email: signup.email,
      };
      db.users = order === "admin-first" ? [admin, pro] : [pro, admin];

      await expect(findUserByIdentifier("9123 4567")).resolves.toEqual(pro);
      await expect(findUserByIdentifier(adminEmail)).resolves.toEqual(admin);
    },
  );

  it("returns an admin for an otherwise unused phone", async () => {
    await expect(findUserByIdentifier(phone)).resolves.toEqual(admin);
  });

  it("does not treat digits in an email address as a phone match", async () => {
    await expect(
      findUserByIdentifier(`${phone}@example.test`),
    ).resolves.toBeNull();
    await expect(
      findUserByIdentifier("  ADMIN@EXAMPLE.TEST  "),
    ).resolves.toEqual(admin);
  });
});
