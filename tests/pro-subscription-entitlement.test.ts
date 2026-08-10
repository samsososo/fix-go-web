import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mock/db", () => ({
  findProSubscription: vi.fn(),
  listProSubscriptions: vi.fn(),
}));

import { findProSubscription, listProSubscriptions } from "@/lib/mock/db";
import {
  assertProCanCreateQuotes,
  evaluateProSubscriptionEntitlement,
  getProIdsEligibleForNewWork,
  getProSubscriptionEntitlement,
  ProNewWorkRestrictedError,
} from "@/lib/pro-subscription-entitlement";
import type {
  ProSubscription,
  SubscriptionAccessStatus,
} from "@/lib/subscription-policy";

const NOW = "2026-08-10T12:00:00.000Z";

function subscription(
  proId: string,
  accessStatus: SubscriptionAccessStatus,
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return {
    proId,
    planCode: "pro_monthly_v1",
    amountMinor: 10_000,
    currency: "hkd",
    interval: "month",
    accessStatus,
    cancelAtPeriodEnd: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("central pro subscription entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a missing subscription as setup-required without creating one", async () => {
    vi.mocked(findProSubscription).mockResolvedValue(null);

    await expect(
      getProSubscriptionEntitlement("user_pro_missing", NOW),
    ).resolves.toEqual({
      subscription: null,
      entitlement: {
        status: "setup_required",
        canCreateQuotes: false,
        canAcceptNewWork: false,
        canManageExistingWork: true,
        canManageBilling: true,
        effectiveUntil: undefined,
      },
      policyDataValid: true,
    });
  });

  it("fails closed when corrupted lifecycle data cannot be evaluated", () => {
    const corrupted = subscription("user_pro_corrupt", "trialing", {
      trialEndsAt: "not-a-date",
    });

    expect(evaluateProSubscriptionEntitlement(corrupted, NOW)).toEqual({
      subscription: corrupted,
      entitlement: {
        status: "suspended",
        canCreateQuotes: false,
        canAcceptNewWork: false,
        canManageExistingWork: true,
        canManageBilling: true,
        effectiveUntil: undefined,
      },
      policyDataValid: false,
    });
  });

  it("blocks at the exact grace deadline when read through the central helper", async () => {
    vi.mocked(findProSubscription).mockResolvedValue(
      subscription("user_pro_grace", "grace_period", {
        gracePeriodEndsAt: NOW,
      }),
    );

    const snapshot = await getProSubscriptionEntitlement("user_pro_grace", NOW);
    expect(snapshot.entitlement).toMatchObject({
      status: "suspended",
      canCreateQuotes: false,
      canAcceptNewWork: false,
    });
  });

  it("returns only subscriptions that can accept new work", async () => {
    vi.mocked(listProSubscriptions).mockResolvedValue([
      subscription("pro_active", "active", {
        currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
      }),
      subscription("pro_grace", "grace_period", {
        gracePeriodEndsAt: "2026-08-10T12:00:00.001Z",
      }),
      subscription("pro_cancel", "cancel_at_period_end", {
        stripeStatus: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
      }),
      subscription("pro_setup", "setup_required"),
      subscription("pro_suspended", "suspended"),
      subscription("pro_corrupt", "trialing", {
        trialEndsAt: "invalid",
      }),
    ]);

    await expect(getProIdsEligibleForNewWork(NOW)).resolves.toEqual(
      new Set(["pro_active", "pro_grace", "pro_cancel"]),
    );
  });

  it("throws a stable restricted-work error for blocked quote mutations", async () => {
    vi.mocked(findProSubscription).mockResolvedValue(
      subscription("pro_suspended", "suspended"),
    );

    await expect(
      assertProCanCreateQuotes("pro_suspended", NOW),
    ).rejects.toBeInstanceOf(ProNewWorkRestrictedError);
  });
});
