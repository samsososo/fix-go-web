import { describe, expect, it } from "vitest";

import {
  ALL_PRO_SUBSCRIPTION_PLANS,
  HISTORICAL_PRO_SUBSCRIPTION_PLANS,
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_CURRENCY,
  PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS,
  PRO_SUBSCRIPTION_INTERVAL,
  PRO_SUBSCRIPTION_PLAN,
  PRO_SUBSCRIPTION_PLANS,
  PRO_SUBSCRIPTION_TRIAL_DAYS,
  calculateProTrialEndsAt,
  calculateGracePeriodEndsAt,
  canGrantLifetimeTrial,
  createLifetimeTrialWindow,
  deriveProSubscriptionEntitlement,
  deriveSubscriptionAccessStatus,
  getCurrentProSubscriptionPlanCode,
  getProSubscriptionPlan,
  getSaleableProSubscriptionPlan,
  hasConsumedLifetimeTrial,
  isProSubscriptionPlanCode,
  isSaleableProSubscriptionPlanCode,
  type ProSubscription,
  type SubscriptionAccessStatus,
} from "@/lib/subscription-policy";

const NOW = "2026-08-09T12:00:00.000Z";

function subscription(
  accessStatus: SubscriptionAccessStatus,
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return {
    proId: "user_pro_test",
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

describe("pro subscription plan", () => {
  it("locks the default saleable plan to HKD 200 per month", () => {
    expect(PRO_SUBSCRIPTION_AMOUNT_MINOR).toBe(20_000);
    expect(PRO_SUBSCRIPTION_CURRENCY).toBe("hkd");
    expect(PRO_SUBSCRIPTION_INTERVAL).toBe("month");
    expect(PRO_SUBSCRIPTION_TRIAL_DAYS).toBe(14);
    expect(PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS).toBe(14);
    expect(PRO_SUBSCRIPTION_PLAN).toEqual({
      code: "pro_monthly_v2",
      amountMinor: 20_000,
      currency: "hkd",
      interval: "month",
      trialDays: 14,
      gracePeriodDays: 14,
    });
  });

  it("doubles every saleable package exactly while keeping its interval", () => {
    expect(PRO_SUBSCRIPTION_PLANS).toEqual([
      expect.objectContaining({
        code: "pro_monthly_v2",
        amountMinor: 20_000,
        intervalCount: 1,
      }),
      expect.objectContaining({
        code: "pro_3_months_v2",
        amountMinor: 49_800,
        intervalCount: 3,
      }),
      expect.objectContaining({
        code: "pro_6_months_v2",
        amountMinor: 89_800,
        intervalCount: 6,
      }),
      expect.objectContaining({
        code: "pro_12_months_v2",
        amountMinor: 139_800,
        intervalCount: 12,
      }),
    ]);
  });

  it("keeps v1 packages readable for historical subscription lifecycle only", () => {
    expect(HISTORICAL_PRO_SUBSCRIPTION_PLANS).toEqual([
      expect.objectContaining({
        code: "pro_monthly_v1",
        amountMinor: 10_000,
        intervalCount: 1,
      }),
      expect.objectContaining({
        code: "pro_3_months_v1",
        amountMinor: 24_900,
        intervalCount: 3,
      }),
      expect.objectContaining({
        code: "pro_6_months_v1",
        amountMinor: 44_900,
        intervalCount: 6,
      }),
      expect.objectContaining({
        code: "pro_12_months_v1",
        amountMinor: 69_900,
        intervalCount: 12,
      }),
    ]);
    expect(ALL_PRO_SUBSCRIPTION_PLANS).toHaveLength(8);
    expect(isProSubscriptionPlanCode("pro_monthly_v1")).toBe(true);
    expect(getProSubscriptionPlan("pro_monthly_v1")).toMatchObject({
      amountMinor: 10_000,
    });
  });

  it("rejects historical v1 packages from new sales", () => {
    expect(isSaleableProSubscriptionPlanCode("pro_monthly_v2")).toBe(true);
    expect(isSaleableProSubscriptionPlanCode("pro_monthly_v1")).toBe(false);
    expect(getSaleableProSubscriptionPlan("pro_monthly_v2")).toMatchObject({
      amountMinor: 20_000,
    });
    expect(() => getSaleableProSubscriptionPlan("pro_monthly_v1")).toThrow(
      "Invalid saleable professional subscription plan",
    );
  });

  it.each([
    ["pro_monthly_v1", "pro_monthly_v2"],
    ["pro_3_months_v1", "pro_3_months_v2"],
    ["pro_6_months_v1", "pro_6_months_v2"],
    ["pro_12_months_v1", "pro_12_months_v2"],
    ["pro_monthly_v2", "pro_monthly_v2"],
    ["pro_3_months_v2", "pro_3_months_v2"],
    ["pro_6_months_v2", "pro_6_months_v2"],
    ["pro_12_months_v2", "pro_12_months_v2"],
  ] as const)("maps %s to the current same-term plan %s", (from, to) => {
    expect(getCurrentProSubscriptionPlanCode(from)).toBe(to);
  });
});

describe("one-time 14-day trial", () => {
  it("adds exactly 336 hours while preserving the time", () => {
    expect(calculateProTrialEndsAt("2026-02-10T01:15:30.250Z")).toBe(
      "2026-02-24T01:15:30.250Z",
    );
  });

  it("uses the Hong Kong date when the UTC date is still the previous day", () => {
    // 31 December 18:00 UTC is 1 January 02:00 in Hong Kong.
    expect(calculateProTrialEndsAt("2026-12-31T18:00:00.000Z")).toBe(
      "2027-01-14T18:00:00.000Z",
    );
  });

  it("crosses month boundaries without extending the trial", () => {
    // 02:30 UTC is 10:30 in Hong Kong.
    expect(calculateProTrialEndsAt("2026-01-31T02:30:00.000Z")).toBe(
      "2026-02-14T02:30:00.000Z",
    );
  });

  it("uses the same duration in leap and non-leap years", () => {
    expect(calculateProTrialEndsAt("2027-01-31T04:00:00.000Z")).toBe(
      "2027-02-14T04:00:00.000Z",
    );
    expect(calculateProTrialEndsAt("2028-01-31T04:00:00.000Z")).toBe(
      "2028-02-14T04:00:00.000Z",
    );
  });

  it("rejects an invalid date instead of silently producing bad policy data", () => {
    expect(() => calculateProTrialEndsAt("not-a-date")).toThrow(
      "value must be a valid ISO date-time",
    );
  });
});

describe("one lifetime trial", () => {
  it("creates the only trial when the first card is successfully bound", () => {
    const window = createLifetimeTrialWindow(null, "2026-01-31T02:30:00Z");

    expect(window).toEqual({
      cardBoundAt: "2026-01-31T02:30:00.000Z",
      trialConsumedAt: "2026-01-31T02:30:00.000Z",
      trialGrantedAt: "2026-01-31T02:30:00.000Z",
      trialStartedAt: "2026-01-31T02:30:00.000Z",
      trialEndsAt: "2026-02-14T02:30:00.000Z",
    });
  });

  it("does not treat account creation without a card as trial consumption", () => {
    const emptyHistory = {
      cardBoundAt: undefined,
      trialConsumedAt: undefined,
      trialGrantedAt: undefined,
      trialStartedAt: undefined,
      trialEndsAt: undefined,
    };

    expect(hasConsumedLifetimeTrial(emptyHistory)).toBe(false);
    expect(canGrantLifetimeTrial(emptyHistory)).toBe(true);
  });

  it.each([
    ["card binding", { cardBoundAt: NOW }],
    ["trial consumption", { trialConsumedAt: NOW }],
    ["trial grant", { trialGrantedAt: NOW }],
    ["trial start", { trialStartedAt: NOW }],
    ["trial end", { trialEndsAt: NOW }],
  ])("treats recorded %s as lifetime trial consumption", (_label, history) => {
    expect(hasConsumedLifetimeTrial(history)).toBe(true);
    expect(canGrantLifetimeTrial(history)).toBe(false);
    expect(createLifetimeTrialWindow(history, "2027-01-01T00:00:00Z")).toBe(
      null,
    );
  });
});

describe("14-day payment grace period", () => {
  it("ends exactly fourteen days after the first payment failure", () => {
    expect(calculateGracePeriodEndsAt("2026-08-09T12:00:00.000Z")).toBe(
      "2026-08-23T12:00:00.000Z",
    );
  });

  it("keeps new-work access immediately before the boundary", () => {
    const value = subscription("grace_period", {
      firstPaymentFailedAt: "2026-08-09T12:00:00.000Z",
      gracePeriodEndsAt: "2026-08-23T12:00:00.000Z",
    });
    const entitlement = deriveProSubscriptionEntitlement(
      value,
      "2026-08-23T11:59:59.999Z",
    );

    expect(entitlement.status).toBe("grace_period");
    expect(entitlement.canCreateQuotes).toBe(true);
    expect(entitlement.canAcceptNewWork).toBe(true);
    expect(entitlement.effectiveUntil).toBe("2026-08-23T12:00:00.000Z");
  });

  it("suspends new-work access at the exact day-14 boundary", () => {
    const value = subscription("grace_period", {
      firstPaymentFailedAt: "2026-08-09T12:00:00.000Z",
      gracePeriodEndsAt: "2026-08-23T12:00:00.000Z",
    });
    const entitlement = deriveProSubscriptionEntitlement(
      value,
      "2026-08-23T12:00:00.000Z",
    );

    expect(entitlement.status).toBe("suspended");
    expect(entitlement.canCreateQuotes).toBe(false);
    expect(entitlement.canAcceptNewWork).toBe(false);
    expect(entitlement.canManageExistingWork).toBe(true);
    expect(entitlement.canManageBilling).toBe(true);
  });

  it("fails closed when a grace-period record has no deadline", () => {
    expect(
      deriveSubscriptionAccessStatus(subscription("grace_period"), NOW),
    ).toBe("suspended");
  });
});

describe("subscription entitlement", () => {
  it.each(["trialing", "active"] as const)(
    "allows new work while %s",
    (accessStatus) => {
      const value = subscription(accessStatus, {
        trialEndsAt:
          accessStatus === "trialing" ? "2026-09-01T00:00:00.000Z" : undefined,
        currentPeriodEndsAt:
          accessStatus === "active" ? "2026-09-01T00:00:00.000Z" : undefined,
      });
      const entitlement = deriveProSubscriptionEntitlement(value, NOW);

      expect(entitlement.status).toBe(accessStatus);
      expect(entitlement.canCreateQuotes).toBe(true);
      expect(entitlement.canAcceptNewWork).toBe(true);
    },
  );

  it.each(["setup_required", "suspended", "terminated"] as const)(
    "blocks new work while %s but preserves billing and existing-work access",
    (accessStatus) => {
      const entitlement = deriveProSubscriptionEntitlement(
        subscription(accessStatus),
        NOW,
      );

      expect(entitlement.status).toBe(accessStatus);
      expect(entitlement.canCreateQuotes).toBe(false);
      expect(entitlement.canAcceptNewWork).toBe(false);
      expect(entitlement.canManageExistingWork).toBe(true);
      expect(entitlement.canManageBilling).toBe(true);
    },
  );

  it("requires setup when no subscription record exists", () => {
    expect(deriveProSubscriptionEntitlement(null, NOW)).toEqual({
      status: "setup_required",
      canCreateQuotes: false,
      canAcceptNewWork: false,
      canManageExistingWork: true,
      canManageBilling: true,
      effectiveUntil: undefined,
    });
  });

  it("fails closed when a stale trial reaches its end before Stripe sync", () => {
    const value = subscription("trialing", {
      trialEndsAt: NOW,
      stripeStatus: "trialing",
    });

    expect(deriveSubscriptionAccessStatus(value, NOW)).toBe("suspended");
  });

  it("fails closed when an active paid period expires before Stripe sync", () => {
    const value = subscription("active", {
      stripeStatus: "active",
      currentPeriodEndsAt: NOW,
    });

    expect(deriveSubscriptionAccessStatus(value, NOW)).toBe("suspended");
    expect(
      deriveSubscriptionAccessStatus(
        subscription("active", { stripeStatus: "active" }),
        NOW,
      ),
    ).toBe("suspended");
  });

  it("keeps a cancelled trial active only until the trial end", () => {
    const value = subscription("cancel_at_period_end", {
      stripeStatus: "trialing",
      cancelAtPeriodEnd: true,
      trialEndsAt: "2026-08-10T12:00:00.000Z",
    });

    expect(deriveProSubscriptionEntitlement(value, NOW)).toMatchObject({
      status: "cancel_at_period_end",
      canCreateQuotes: true,
      effectiveUntil: "2026-08-10T12:00:00.000Z",
    });
    expect(
      deriveSubscriptionAccessStatus(value, "2026-08-10T12:00:00.000Z"),
    ).toBe("terminated");
  });

  it("keeps a cancelled paid subscription active until the next billing date", () => {
    const value = subscription("active", {
      stripeStatus: "active",
      cancelAtPeriodEnd: true,
      trialEndsAt: "2026-07-01T00:00:00.000Z",
      currentPeriodEndsAt: "2026-08-20T00:00:00.000Z",
    });

    expect(deriveProSubscriptionEntitlement(value, NOW)).toMatchObject({
      status: "cancel_at_period_end",
      canAcceptNewWork: true,
      effectiveUntil: "2026-08-20T00:00:00.000Z",
    });
    expect(
      deriveSubscriptionAccessStatus(value, "2026-08-20T00:00:00.000Z"),
    ).toBe("terminated");
  });

  it("does not let cancellation override an unpaid grace-period deadline", () => {
    const value = subscription("grace_period", {
      stripeStatus: "past_due",
      cancelAtPeriodEnd: true,
      currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-12T00:00:00.000Z",
    });

    expect(deriveSubscriptionAccessStatus(value, NOW)).toBe("grace_period");
    expect(
      deriveSubscriptionAccessStatus(value, "2026-08-12T00:00:00.000Z"),
    ).toBe("suspended");
  });

  it("fails closed for cancellation without a known access end", () => {
    const value = subscription("cancel_at_period_end", {
      cancelAtPeriodEnd: true,
    });

    expect(deriveSubscriptionAccessStatus(value, NOW)).toBe("terminated");
  });
});
