import { describe, expect, it, vi } from "vitest";

import {
  assertSafeEnvironment,
  hasOpenCheckout,
  hasTrialHistory,
  migrateLiveSubscription,
  pairForPlanCode,
  parsePricingMigrationConfig,
  planForVersion,
  PRICING_MIGRATION_ID,
} from "../scripts/migrate-pro-subscription-pricing";

type MigrationConfig = Parameters<typeof assertSafeEnvironment>[0];
type SubscriptionDocument = Parameters<typeof hasTrialHistory>[0];

const priceConfig = {
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_monthlyv1",
  STRIPE_PRO_3_MONTHS_PRICE_ID: "price_3monthsv1",
  STRIPE_PRO_6_MONTHS_PRICE_ID: "price_6monthsv1",
  STRIPE_PRO_12_MONTHS_PRICE_ID: "price_12monthsv1",
  STRIPE_PRO_MONTHLY_V2_PRICE_ID: "price_monthlyv2",
  STRIPE_PRO_3_MONTHS_V2_PRICE_ID: "price_3monthsv2",
  STRIPE_PRO_6_MONTHS_V2_PRICE_ID: "price_6monthsv2",
  STRIPE_PRO_12_MONTHS_V2_PRICE_ID: "price_12monthsv2",
} as const;

function developmentConfig(
  overrides: Partial<MigrationConfig> = {},
): MigrationConfig {
  return {
    NODE_ENV: "development",
    MONGODB_URI: "mongodb://localhost:27018/hotfix_dev",
    MONGODB_DATABASE: "hotfix_dev",
    STRIPE_SECRET_KEY: "sk_test_pricingmigration",
    ENABLE_DATABASE_SEEDING: "true",
    ENABLE_DEMO_LOGIN: "true",
    SUBSCRIPTION_PRICING_TARGET_VERSION: "v2",
    SUBSCRIPTION_PRICING_APPLY: false,
    ...priceConfig,
    ...overrides,
  };
}

function productionConfig(
  overrides: Partial<MigrationConfig> = {},
): MigrationConfig {
  return {
    ...developmentConfig(),
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://localhost:27017/hotfix_production",
    MONGODB_DATABASE: "hotfix_production",
    STRIPE_SECRET_KEY: "sk_live_pricingmigration",
    ENABLE_DATABASE_SEEDING: "false",
    ENABLE_DEMO_LOGIN: "false",
    ...overrides,
  };
}

function subscription(
  overrides: Partial<SubscriptionDocument> = {},
): SubscriptionDocument {
  return {
    _id: "user_pro_migration",
    proId: "user_pro_migration",
    planCode: "pro_monthly_v1",
    amountMinor: 10_000,
    currency: "hkd",
    interval: "month",
    accessStatus: "setup_required",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("subscription pricing migration plan mapping", () => {
  it.each([
    ["pro_monthly_v1", "pro_monthly_v2", 10_000, 20_000, 1],
    ["pro_3_months_v1", "pro_3_months_v2", 24_900, 49_800, 3],
    ["pro_6_months_v1", "pro_6_months_v2", 44_900, 89_800, 6],
    ["pro_12_months_v1", "pro_12_months_v2", 69_900, 139_800, 12],
  ] as const)(
    "maps %s to %s with an exact doubled amount",
    (v1Code, v2Code, v1Amount, v2Amount, intervalCount) => {
      const pair = pairForPlanCode(v1Code);
      expect(pair).toBeDefined();
      expect(pairForPlanCode(v2Code)).toBe(pair);
      if (!pair) throw new Error("Expected a pricing migration plan pair.");

      expect(pair.intervalCount).toBe(intervalCount);
      expect(planForVersion(pair, "v1")).toMatchObject({
        code: v1Code,
        amountMinor: v1Amount,
      });
      expect(planForVersion(pair, "v2")).toMatchObject({
        code: v2Code,
        amountMinor: v2Amount,
      });
      expect(v2Amount).toBe(v1Amount * 2);
    },
  );

  it("fails closed when a persisted plan code has no migration mapping", () => {
    expect(pairForPlanCode("pro_unknown_v1")).toBeUndefined();
  });
});

describe("subscription pricing migration environment safety", () => {
  it("rejects a generic v2-to-v1 rollback target during config parsing", () => {
    const validEnvironment = {
      ...developmentConfig(),
      SUBSCRIPTION_PRICING_TARGET_VERSION: "v2",
      SUBSCRIPTION_PRICING_APPLY: "false",
    } as const;
    expect(parsePricingMigrationConfig(validEnvironment)).toMatchObject({
      SUBSCRIPTION_PRICING_TARGET_VERSION: "v2",
      SUBSCRIPTION_PRICING_APPLY: false,
    });

    expect(() =>
      parsePricingMigrationConfig({
        ...validEnvironment,
        SUBSCRIPTION_PRICING_TARGET_VERSION: "v1",
      }),
    ).toThrow(/SUBSCRIPTION_PRICING_TARGET_VERSION/);
  });

  it("accepts production only with a production database, live key and safety flags", () => {
    expect(() => assertSafeEnvironment(productionConfig())).not.toThrow();
  });

  it.each([
    ["test Stripe key", { STRIPE_SECRET_KEY: "sk_test_wrongmode" }],
    ["database seeding", { ENABLE_DATABASE_SEEDING: "true" }],
    ["demo login", { ENABLE_DEMO_LOGIN: "true" }],
  ] as const)("rejects production with %s enabled", (_label, overrides) => {
    expect(() => assertSafeEnvironment(productionConfig(overrides))).toThrow(
      "Production pricing migration requires",
    );
  });

  it("rejects production when the database is not explicitly production", () => {
    expect(() =>
      assertSafeEnvironment(
        productionConfig({
          MONGODB_URI: "mongodb://localhost:27017/hotfix_dev",
          MONGODB_DATABASE: "hotfix_dev",
        }),
      ),
    ).toThrow("Production pricing migration requires");
  });

  it.each(["development", "test"] as const)(
    "accepts %s only with a non-production database and test Stripe key",
    (nodeEnv) => {
      expect(() =>
        assertSafeEnvironment(developmentConfig({ NODE_ENV: nodeEnv })),
      ).not.toThrow();
    },
  );

  it.each([
    [
      "a production database",
      {
        MONGODB_URI: "mongodb://localhost:27017/hotfix_production",
        MONGODB_DATABASE: "hotfix_production",
      },
    ],
    ["a live Stripe key", { STRIPE_SECRET_KEY: "sk_live_wrongmode" }],
  ] as const)("rejects development with %s", (_label, overrides) => {
    expect(() => assertSafeEnvironment(developmentConfig(overrides))).toThrow(
      "cannot target production MongoDB or live Stripe",
    );
  });

  it("rejects a Mongo URI and configured database mismatch", () => {
    expect(() =>
      assertSafeEnvironment(
        developmentConfig({ MONGODB_DATABASE: "hotfix_other" }),
      ),
    ).toThrow("MONGODB_URI database does not match");
  });
});

describe("subscription pricing migration state classification", () => {
  it.each([
    "cardBoundAt",
    "trialConsumedAt",
    "trialGrantedAt",
    "trialStartedAt",
    "trialEndsAt",
  ] as const)("recognizes %s as lifetime trial history", (field) => {
    expect(
      hasTrialHistory(subscription({ [field]: "2026-10-17T00:00:00.000Z" })),
    ).toBe(true);
  });

  it("does not invent trial history for a clean setup-required record", () => {
    expect(hasTrialHistory(subscription())).toBe(false);
  });

  it.each([
    "checkoutSessionId",
    "checkoutReservationId",
    "reactivationCheckoutSessionId",
    "reactivationCheckoutReservationId",
  ] as const)("recognizes %s as an open checkout", (field) => {
    expect(hasOpenCheckout(subscription({ [field]: `${field}_test` }))).toBe(
      true,
    );
  });

  it("does not invent an open checkout for a clean record", () => {
    expect(hasOpenCheckout(subscription())).toBe(false);
  });
});

describe("subscription pricing migration mutation", () => {
  const currentPeriodStartedAt = "2026-10-07T00:00:00.000Z";
  const trialEndsAt = "2026-10-21T00:00:00.000Z";
  const currentPeriodStartUnix = Date.parse(currentPeriodStartedAt) / 1_000;
  const trialEndUnix = Date.parse(trialEndsAt) / 1_000;

  function liveMigrationHarness(options?: {
    changeTrialEnd?: boolean;
    stripeAlreadyTarget?: boolean;
  }) {
    const pair = pairForPlanCode("pro_monthly_v1");
    if (!pair) throw new Error("Expected a monthly migration pair.");
    const config = developmentConfig();
    const local = subscription({
      intervalCount: 1,
      accessStatus: "trialing",
      stripeCustomerId: "cus_pricingmigration",
      stripeSubscriptionId: "sub_pricingmigration",
      stripePriceId: config.STRIPE_PRO_MONTHLY_PRICE_ID,
      stripeStatus: "trialing",
      stripeLivemode: false,
      stripeSubscriptionHasTrial: true,
      trialConsumedAt: currentPeriodStartedAt,
      trialEndsAt,
      currentPeriodStartedAt,
      currentPeriodEndsAt: trialEndsAt,
      cancelAtPeriodEnd: false,
      stripeLifecycleRevision: 7,
    });
    const item = {
      id: "si_pricingmigration",
      quantity: 1,
      price: { id: config.STRIPE_PRO_MONTHLY_PRICE_ID },
      current_period_start: currentPeriodStartUnix,
      current_period_end: trialEndUnix,
    };
    const sourceBefore = {
      id: local.stripeSubscriptionId,
      customer: local.stripeCustomerId,
      status: "trialing",
      collection_method: "charge_automatically",
      currency: "hkd",
      livemode: false,
      cancel_at_period_end: false,
      cancel_at: null,
      schedule: null,
      pending_update: null,
      pause_collection: null,
      metadata: { proId: local.proId, planCode: local.planCode },
      items: { data: [item] },
      trial_start: currentPeriodStartUnix,
      trial_end: trialEndUnix,
      billing_cycle_anchor: trialEndUnix,
    };
    const before = options?.stripeAlreadyTarget
      ? {
          ...sourceBefore,
          metadata: {
            ...sourceBefore.metadata,
            planCode: "pro_monthly_v2",
            pricingMigrationId: PRICING_MIGRATION_ID,
            pricingMigrationFromVersion: "v1",
          },
          items: {
            data: [
              {
                ...item,
                price: { id: config.STRIPE_PRO_MONTHLY_V2_PRICE_ID },
              },
            ],
          },
        }
      : sourceBefore;
    const canonical = {
      ...before,
      metadata: {
        ...before.metadata,
        planCode: "pro_monthly_v2",
        pricingMigrationId: PRICING_MIGRATION_ID,
        pricingMigrationFromVersion: "v1",
      },
      items: {
        data: [
          {
            ...item,
            price: { id: config.STRIPE_PRO_MONTHLY_V2_PRICE_ID },
          },
        ],
      },
      trial_end: options?.changeTrialEnd ? trialEndUnix + 1 : trialEndUnix,
    };
    const retrieve = vi.fn().mockResolvedValue(before);
    const update = vi.fn().mockResolvedValue(canonical);
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const assertOwned = vi.fn().mockResolvedValue(undefined);

    return {
      input: {
        apply: true,
        collection: { updateOne } as never,
        config,
        lease: { assertOwned },
        pair,
        sourceVersion: "v1" as const,
        stripe: { subscriptions: { retrieve, update } } as never,
        subscription: local,
        targetVersion: "v2" as const,
      },
      update,
      updateOne,
      assertOwned,
    };
  }

  it("updates Stripe without proration or anchor drift, then uses a revision CAS", async () => {
    const harness = liveMigrationHarness();

    await migrateLiveSubscription(harness.input);

    expect(harness.update).toHaveBeenCalledWith(
      "sub_pricingmigration",
      expect.objectContaining({
        items: [
          {
            id: "si_pricingmigration",
            price: priceConfig.STRIPE_PRO_MONTHLY_V2_PRICE_ID,
            quantity: 1,
          },
        ],
        metadata: expect.objectContaining({
          planCode: "pro_monthly_v2",
          pricingMigrationId: PRICING_MIGRATION_ID,
          pricingMigrationFromVersion: "v1",
        }),
        proration_behavior: "none",
        billing_cycle_anchor: "unchanged",
      }),
      {
        idempotencyKey: "hotfix24-pricing-v2-7-sub_pricingmigration",
      },
    );
    expect(harness.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = harness.updateOne.mock.calls[0];
    expect(filter).toMatchObject({
      _id: "user_pro_migration",
      planCode: "pro_monthly_v1",
      amountMinor: 10_000,
      stripePriceId: priceConfig.STRIPE_PRO_MONTHLY_PRICE_ID,
      stripeLifecycleRevision: 7,
      updatedAt: "2026-10-17T00:00:00.000Z",
    });
    expect(update).toMatchObject({
      $set: {
        planCode: "pro_monthly_v2",
        amountMinor: 20_000,
        intervalCount: 1,
        stripePriceId: priceConfig.STRIPE_PRO_MONTHLY_V2_PRICE_ID,
        pricingMigrationId: PRICING_MIGRATION_ID,
        pricingMigrationFromVersion: "v1",
      },
      $inc: { stripeLifecycleRevision: 1 },
    });
    expect(harness.assertOwned).toHaveBeenCalledTimes(2);
  });

  it("refuses the local CAS if Stripe changes the trial boundary", async () => {
    const harness = liveMigrationHarness({ changeTrialEnd: true });

    await expect(migrateLiveSubscription(harness.input)).rejects.toThrow(
      "Stripe changed the trial or billing period",
    );
    expect(harness.updateOne).not.toHaveBeenCalled();
  });

  it("recovers a stable Stripe-target and Mongo-source partial migration", async () => {
    const harness = liveMigrationHarness({ stripeAlreadyTarget: true });

    await migrateLiveSubscription(harness.input);

    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.updateOne).toHaveBeenCalledTimes(1);
    expect(harness.updateOne.mock.calls[0][1]).toMatchObject({
      $set: {
        planCode: "pro_monthly_v2",
        stripePriceId: priceConfig.STRIPE_PRO_MONTHLY_V2_PRICE_ID,
        pricingMigrationId: PRICING_MIGRATION_ID,
      },
    });
  });
});
