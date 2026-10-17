import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { MongoClient, type Collection, type Db } from "mongodb";
import Stripe from "stripe";
import { z } from "zod";

type PricingVersion = "v1" | "v2";

type ProSubscriptionDocument = {
  _id: string;
  proId: string;
  planCode: string;
  amountMinor: number;
  currency: string;
  interval: string;
  intervalCount?: number;
  accessStatus: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeStatus?: string;
  stripeLivemode?: boolean;
  stripeSubscriptionHasTrial?: boolean;
  stripeLifecycleRevision?: number;
  cardBoundAt?: string;
  trialConsumedAt?: string;
  trialGrantedAt?: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  checkoutSessionId?: string;
  checkoutReservationId?: string;
  reactivationCheckoutSessionId?: string;
  reactivationCheckoutReservationId?: string;
  cancelAtPeriodEnd?: boolean;
  pastDueInvoiceId?: string;
  currentPeriodStartedAt?: string;
  currentPeriodEndsAt?: string;
  pricingMigrationId?: string;
  pricingMigrationFromVersion?: PricingVersion;
  pricingMigratedAt?: string;
  updatedAt: string;
};

type MigrationLease = {
  assertOwned: () => Promise<void>;
};

type MutationLockDocument = {
  _id: string;
  leaseId: string;
  leaseExpiresAt: Date;
};

const MUTATION_LOCK_ID = "lock:marketplace-subscription-write";
const MUTATION_LOCK_LEASE_MS = 30_000;
const MUTATION_LOCK_WAIT_MS = 25;
const MUTATION_LOCK_MAX_WAIT_MS = 10_000;
export const PRICING_MIGRATION_ID = "pro-pricing-v2-2026-10-17";

const priceIdSchema = z.string().regex(/^price_[A-Za-z0-9]+$/);
const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(?:test|live)_[A-Za-z0-9]+$/),
  STRIPE_PRO_MONTHLY_PRICE_ID: priceIdSchema,
  STRIPE_PRO_3_MONTHS_PRICE_ID: priceIdSchema,
  STRIPE_PRO_6_MONTHS_PRICE_ID: priceIdSchema,
  STRIPE_PRO_12_MONTHS_PRICE_ID: priceIdSchema,
  STRIPE_PRO_MONTHLY_V2_PRICE_ID: priceIdSchema,
  STRIPE_PRO_3_MONTHS_V2_PRICE_ID: priceIdSchema,
  STRIPE_PRO_6_MONTHS_V2_PRICE_ID: priceIdSchema,
  STRIPE_PRO_12_MONTHS_V2_PRICE_ID: priceIdSchema,
  ENABLE_DATABASE_SEEDING: z.enum(["true", "false"]).optional(),
  ENABLE_DEMO_LOGIN: z.enum(["true", "false"]).optional(),
  SUBSCRIPTION_PRICING_TARGET_VERSION: z.literal("v2").default("v2"),
  SUBSCRIPTION_PRICING_APPLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const planPairs = [
  {
    intervalCount: 1,
    v1: {
      code: "pro_monthly_v1",
      amountMinor: 10_000,
      envKey: "STRIPE_PRO_MONTHLY_PRICE_ID",
    },
    v2: {
      code: "pro_monthly_v2",
      amountMinor: 20_000,
      envKey: "STRIPE_PRO_MONTHLY_V2_PRICE_ID",
    },
  },
  {
    intervalCount: 3,
    v1: {
      code: "pro_3_months_v1",
      amountMinor: 24_900,
      envKey: "STRIPE_PRO_3_MONTHS_PRICE_ID",
    },
    v2: {
      code: "pro_3_months_v2",
      amountMinor: 49_800,
      envKey: "STRIPE_PRO_3_MONTHS_V2_PRICE_ID",
    },
  },
  {
    intervalCount: 6,
    v1: {
      code: "pro_6_months_v1",
      amountMinor: 44_900,
      envKey: "STRIPE_PRO_6_MONTHS_PRICE_ID",
    },
    v2: {
      code: "pro_6_months_v2",
      amountMinor: 89_800,
      envKey: "STRIPE_PRO_6_MONTHS_V2_PRICE_ID",
    },
  },
  {
    intervalCount: 12,
    v1: {
      code: "pro_12_months_v1",
      amountMinor: 69_900,
      envKey: "STRIPE_PRO_12_MONTHS_PRICE_ID",
    },
    v2: {
      code: "pro_12_months_v2",
      amountMinor: 139_800,
      envKey: "STRIPE_PRO_12_MONTHS_V2_PRICE_ID",
    },
  },
] as const;

type ParsedConfig = z.infer<typeof configSchema>;
type PlanPair = (typeof planPairs)[number];

export function parsePricingMigrationConfig(input: NodeJS.ProcessEnv) {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid subscription pricing migration configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function assertSafeEnvironment(config: ParsedConfig) {
  const uriDatabase = decodeURIComponent(
    new URL(config.MONGODB_URI).pathname.slice(1),
  );
  if (uriDatabase && uriDatabase !== config.MONGODB_DATABASE) {
    throw new Error(
      "MONGODB_URI database does not match MONGODB_DATABASE; migration stopped.",
    );
  }

  const productionDatabase = /(^|[_-])prod(?:uction)?($|[_-])/i.test(
    config.MONGODB_DATABASE,
  );
  const liveStripeKey = config.STRIPE_SECRET_KEY.startsWith("sk_live_");
  if (config.NODE_ENV === "production") {
    if (
      !productionDatabase ||
      !liveStripeKey ||
      config.ENABLE_DATABASE_SEEDING !== "false" ||
      config.ENABLE_DEMO_LOGIN !== "false"
    ) {
      throw new Error(
        "Production pricing migration requires a production database, live Stripe key, and demo/seeding disabled.",
      );
    }
    return;
  }

  if (productionDatabase || liveStripeKey) {
    throw new Error(
      "A non-production pricing migration cannot target production MongoDB or live Stripe.",
    );
  }
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000,
  );
}

async function withSubscriptionMutationLock<T>(
  db: Db,
  operation: (lease: MigrationLease) => Promise<T>,
) {
  const leaseId = randomUUID();
  const deadline = Date.now() + MUTATION_LOCK_MAX_WAIT_MS;
  const collection = db.collection<MutationLockDocument>("systemMetadata");

  while (true) {
    const now = new Date();
    try {
      const lock = await collection.findOneAndUpdate(
        {
          _id: MUTATION_LOCK_ID,
          $or: [
            { leaseExpiresAt: { $lte: now } },
            { leaseId },
            { leaseExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            leaseId,
            leaseExpiresAt: new Date(now.getTime() + MUTATION_LOCK_LEASE_MS),
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (lock?.leaseId === leaseId) break;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the database mutation lock.");
    }
    await new Promise((resolve) => setTimeout(resolve, MUTATION_LOCK_WAIT_MS));
  }

  let heartbeatFailure: Error | undefined;
  let heartbeatRunning = false;
  const renewLease = async () => {
    const now = new Date();
    const renewed = await collection.updateOne(
      {
        _id: MUTATION_LOCK_ID,
        leaseId,
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          leaseExpiresAt: new Date(now.getTime() + MUTATION_LOCK_LEASE_MS),
        },
      },
    );
    if (renewed.matchedCount !== 1) {
      throw new Error("The database mutation lock lease was lost.");
    }
  };
  const heartbeat = setInterval(() => {
    if (heartbeatRunning || heartbeatFailure) return;
    heartbeatRunning = true;
    void renewLease()
      .catch((error: unknown) => {
        heartbeatFailure =
          error instanceof Error
            ? error
            : new Error("The database mutation lock heartbeat failed.");
      })
      .finally(() => {
        heartbeatRunning = false;
      });
  }, MUTATION_LOCK_LEASE_MS / 3);
  heartbeat.unref();

  const lease: MigrationLease = {
    assertOwned: async () => {
      if (heartbeatFailure) throw heartbeatFailure;
      await renewLease();
    },
  };

  try {
    return await operation(lease);
  } finally {
    clearInterval(heartbeat);
    await collection.deleteOne({ _id: MUTATION_LOCK_ID, leaseId });
  }
}

export function pairForPlanCode(planCode: string) {
  return planPairs.find(
    (pair) => pair.v1.code === planCode || pair.v2.code === planCode,
  );
}

export function planForVersion(pair: PlanPair, version: PricingVersion) {
  return pair[version];
}

function priceIdFor(
  config: ParsedConfig,
  pair: PlanPair,
  version: PricingVersion,
) {
  return config[planForVersion(pair, version).envKey];
}

function expandableId(
  value: string | { id: string } | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

function assertPrice(
  price: Stripe.Price,
  pair: PlanPair,
  version: PricingVersion,
  expectedLivemode: boolean,
) {
  const plan = planForVersion(pair, version);
  if (
    price.id.length === 0 ||
    price.type !== "recurring" ||
    price.billing_scheme !== "per_unit" ||
    price.currency !== "hkd" ||
    price.unit_amount !== plan.amountMinor ||
    price.transform_quantity !== null ||
    price.tiers_mode !== null ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== pair.intervalCount ||
    price.recurring.usage_type !== "licensed" ||
    price.recurring.trial_period_days !== null ||
    price.livemode !== expectedLivemode ||
    !price.active
  ) {
    throw new Error(`Stripe Price does not match ${plan.code}.`);
  }
}

export function hasOpenCheckout(subscription: ProSubscriptionDocument) {
  return Boolean(
    subscription.checkoutSessionId ||
    subscription.checkoutReservationId ||
    subscription.reactivationCheckoutSessionId ||
    subscription.reactivationCheckoutReservationId,
  );
}

export function hasTrialHistory(subscription: ProSubscriptionDocument) {
  return Boolean(
    subscription.cardBoundAt ||
    subscription.trialConsumedAt ||
    subscription.trialGrantedAt ||
    subscription.trialStartedAt ||
    subscription.trialEndsAt,
  );
}

async function validatePriceCatalog(
  stripe: Stripe,
  config: ParsedConfig,
  expectedLivemode: boolean,
) {
  const prices = new Map<string, Stripe.Price>();
  for (const pair of planPairs) {
    const [v1Price, v2Price] = await Promise.all([
      stripe.prices.retrieve(priceIdFor(config, pair, "v1")),
      stripe.prices.retrieve(priceIdFor(config, pair, "v2")),
    ]);
    assertPrice(v1Price, pair, "v1", expectedLivemode);
    assertPrice(v2Price, pair, "v2", expectedLivemode);
    if (expandableId(v1Price.product) !== expandableId(v2Price.product)) {
      throw new Error(
        `Stripe Price versions do not share a Product for ${pair.intervalCount} month(s).`,
      );
    }
    prices.set(v1Price.id, v1Price);
    prices.set(v2Price.id, v2Price);
  }
  return prices;
}

async function migrateSetupRequiredSubscription(input: {
  apply: boolean;
  collection: Collection<ProSubscriptionDocument>;
  lease: MigrationLease;
  pair: PlanPair;
  sourceVersion: PricingVersion;
  subscription: ProSubscriptionDocument;
  targetVersion: PricingVersion;
}) {
  const { subscription, pair, sourceVersion, targetVersion } = input;
  if (
    subscription.accessStatus !== "setup_required" ||
    subscription.stripeSubscriptionId ||
    subscription.stripePriceId ||
    subscription.stripeStatus ||
    subscription.currentPeriodStartedAt ||
    subscription.currentPeriodEndsAt ||
    subscription.cancelAtPeriodEnd !== false ||
    hasTrialHistory(subscription) ||
    hasOpenCheckout(subscription) ||
    subscription.pastDueInvoiceId ||
    (subscription.intervalCount !== undefined &&
      subscription.intervalCount !== pair.intervalCount)
  ) {
    throw new Error(
      "A non-billing subscription is not safe for automatic pricing migration.",
    );
  }
  if (!input.apply) return;

  const source = planForVersion(pair, sourceVersion);
  const target = planForVersion(pair, targetVersion);
  const now = new Date().toISOString();
  await input.lease.assertOwned();
  const result = await input.collection.updateOne(
    {
      _id: subscription._id,
      planCode: source.code,
      amountMinor: source.amountMinor,
      updatedAt: subscription.updatedAt,
      accessStatus: "setup_required",
      stripeSubscriptionId: { $exists: false },
      cardBoundAt: { $exists: false },
      trialConsumedAt: { $exists: false },
      trialGrantedAt: { $exists: false },
      trialStartedAt: { $exists: false },
      trialEndsAt: { $exists: false },
      checkoutSessionId: { $exists: false },
      checkoutReservationId: { $exists: false },
      reactivationCheckoutSessionId: { $exists: false },
      reactivationCheckoutReservationId: { $exists: false },
      pastDueInvoiceId: { $exists: false },
    },
    {
      $set: {
        planCode: target.code,
        amountMinor: target.amountMinor,
        intervalCount: pair.intervalCount,
        pricingMigrationId: PRICING_MIGRATION_ID,
        pricingMigrationFromVersion: sourceVersion,
        pricingMigratedAt: now,
        updatedAt: now,
      },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new Error(
      "Setup-required pricing migration lost its compare-and-set.",
    );
  }
}

export async function migrateLiveSubscription(input: {
  apply: boolean;
  collection: Collection<ProSubscriptionDocument>;
  config: ParsedConfig;
  lease: MigrationLease;
  pair: PlanPair;
  sourceVersion: PricingVersion;
  stripe: Stripe;
  subscription: ProSubscriptionDocument;
  targetVersion: PricingVersion;
}) {
  const { subscription, pair, sourceVersion, targetVersion, stripe, config } =
    input;
  if (
    !subscription.stripeSubscriptionId ||
    !subscription.stripeCustomerId ||
    !subscription.stripePriceId ||
    !subscription.trialConsumedAt ||
    subscription.pastDueInvoiceId ||
    subscription.cancelAtPeriodEnd ||
    !["trialing", "active"].includes(subscription.stripeStatus ?? "") ||
    !["trialing", "active"].includes(subscription.accessStatus) ||
    (subscription.intervalCount !== undefined &&
      subscription.intervalCount !== pair.intervalCount)
  ) {
    throw new Error(
      "A billed subscription is not in a safe trialing/active state for pricing migration.",
    );
  }

  const source = planForVersion(pair, sourceVersion);
  const target = planForVersion(pair, targetVersion);
  const sourcePriceId = priceIdFor(config, pair, sourceVersion);
  const targetPriceId = priceIdFor(config, pair, targetVersion);
  if (
    subscription.stripePriceId !== sourcePriceId &&
    subscription.stripePriceId !== targetPriceId
  ) {
    throw new Error("Local Stripe Price does not match a migration version.");
  }
  const before = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );
  const beforeItem = before.items.data[0];
  const stripeAlreadyTargetsMigration =
    before.metadata.planCode === target.code ||
    beforeItem?.price.id === targetPriceId;
  if (
    before.items.data.length !== 1 ||
    !beforeItem ||
    subscription._id !== subscription.proId ||
    before.id !== subscription.stripeSubscriptionId ||
    expandableId(before.customer) !== subscription.stripeCustomerId ||
    before.metadata.proId !== subscription.proId ||
    beforeItem.quantity !== 1 ||
    before.status !== subscription.stripeStatus ||
    before.collection_method !== "charge_automatically" ||
    before.currency !== "hkd" ||
    before.livemode !== subscription.stripeLivemode ||
    before.cancel_at_period_end ||
    before.cancel_at !== null ||
    before.schedule !== null ||
    before.pending_update !== null ||
    before.pause_collection !== null ||
    (before.metadata.planCode !== source.code &&
      before.metadata.planCode !== target.code) ||
    (beforeItem.price.id !== sourcePriceId &&
      beforeItem.price.id !== targetPriceId) ||
    (stripeAlreadyTargetsMigration &&
      (before.metadata.planCode !== target.code ||
        beforeItem.price.id !== targetPriceId ||
        before.metadata.pricingMigrationId !== PRICING_MIGRATION_ID ||
        before.metadata.pricingMigrationFromVersion !== sourceVersion)) ||
    unixSecondsToIso(beforeItem.current_period_start) !==
      subscription.currentPeriodStartedAt ||
    unixSecondsToIso(beforeItem.current_period_end) !==
      subscription.currentPeriodEndsAt ||
    !stripeTrialStateMatches(subscription, before)
  ) {
    throw new Error(
      "Stripe subscription does not match the expected migration source or recovery state.",
    );
  }

  const trialEndBefore = before.trial_end;
  const trialStartBefore = before.trial_start;
  const billingCycleAnchorBefore = before.billing_cycle_anchor;
  const periodStartBefore = beforeItem.current_period_start;
  const periodEndBefore = beforeItem.current_period_end;
  let canonical = before;
  if (
    beforeItem.price.id !== targetPriceId ||
    before.metadata.planCode !== target.code
  ) {
    if (!input.apply) return;
    await input.lease.assertOwned();
    canonical = await stripe.subscriptions.update(
      before.id,
      {
        items: [{ id: beforeItem.id, price: targetPriceId, quantity: 1 }],
        metadata: {
          ...before.metadata,
          planCode: target.code,
          pricingMigrationId: PRICING_MIGRATION_ID,
          pricingMigrationFromVersion: sourceVersion,
        },
        proration_behavior: "none",
        billing_cycle_anchor: "unchanged",
      },
      {
        idempotencyKey: `hotfix24-pricing-${targetVersion}-${subscription.stripeLifecycleRevision ?? 0}-${before.id}`,
      },
    );
  }

  const canonicalItem = canonical.items.data[0];
  if (
    canonical.items.data.length !== 1 ||
    !canonicalItem ||
    canonical.id !== before.id ||
    expandableId(canonical.customer) !== subscription.stripeCustomerId ||
    canonical.metadata.proId !== subscription.proId ||
    canonicalItem.quantity !== 1 ||
    canonical.status !== before.status ||
    canonical.collection_method !== before.collection_method ||
    canonical.currency !== before.currency ||
    canonical.livemode !== before.livemode ||
    canonical.cancel_at_period_end !== before.cancel_at_period_end ||
    canonical.cancel_at !== null ||
    canonical.schedule !== null ||
    canonical.pending_update !== null ||
    canonical.pause_collection !== null ||
    canonicalItem.price.id !== targetPriceId ||
    canonical.metadata.planCode !== target.code ||
    canonical.metadata.pricingMigrationId !== PRICING_MIGRATION_ID ||
    canonical.metadata.pricingMigrationFromVersion !== sourceVersion ||
    canonical.trial_start !== trialStartBefore ||
    canonical.trial_end !== trialEndBefore ||
    canonical.billing_cycle_anchor !== billingCycleAnchorBefore ||
    canonicalItem.current_period_start !== periodStartBefore ||
    canonicalItem.current_period_end !== periodEndBefore
  ) {
    throw new Error(
      "Stripe changed the trial or billing period during pricing migration.",
    );
  }
  if (!input.apply) return;

  const now = new Date().toISOString();
  await input.lease.assertOwned();
  const result = await input.collection.updateOne(
    {
      _id: subscription._id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      planCode: source.code,
      amountMinor: source.amountMinor,
      stripePriceId: subscription.stripePriceId,
      stripeStatus: subscription.stripeStatus,
      accessStatus: subscription.accessStatus,
      updatedAt: subscription.updatedAt,
      ...(subscription.stripeLifecycleRevision === undefined
        ? { stripeLifecycleRevision: { $exists: false } }
        : { stripeLifecycleRevision: subscription.stripeLifecycleRevision }),
    },
    {
      $set: {
        planCode: target.code,
        amountMinor: target.amountMinor,
        intervalCount: pair.intervalCount,
        stripePriceId: targetPriceId,
        stripeStatus: canonical.status,
        stripeLivemode: canonical.livemode,
        pricingMigrationId: PRICING_MIGRATION_ID,
        pricingMigrationFromVersion: sourceVersion,
        pricingMigratedAt: now,
        lastStripeSyncedAt: now,
        updatedAt: now,
      },
      $inc: { stripeLifecycleRevision: 1 },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new Error(
      "Local pricing migration lost its compare-and-set; rerun to recover.",
    );
  }
}

function unixSecondsToIso(value: number | null) {
  return value === null ? undefined : new Date(value * 1_000).toISOString();
}

function stripeTrialStateMatches(
  subscription: ProSubscriptionDocument,
  stripeSubscription: Stripe.Subscription,
) {
  if (subscription.stripeSubscriptionHasTrial === false) {
    return (
      stripeSubscription.status !== "trialing" &&
      stripeSubscription.trial_start === null &&
      stripeSubscription.trial_end === null
    );
  }
  return (
    subscription.stripeSubscriptionHasTrial === true &&
    subscription.trialEndsAt !== undefined &&
    unixSecondsToIso(stripeSubscription.trial_end) === subscription.trialEndsAt
  );
}

async function verifyTargetSubscription(input: {
  config: ParsedConfig;
  pair: PlanPair;
  stripe: Stripe;
  subscription: ProSubscriptionDocument;
  targetVersion: PricingVersion;
}) {
  const { config, pair, stripe, subscription, targetVersion } = input;
  const target = planForVersion(pair, targetVersion);
  const hasMigrationMarker = Boolean(
    subscription.pricingMigrationId ||
    subscription.pricingMigrationFromVersion ||
    subscription.pricingMigratedAt,
  );
  if (
    subscription._id !== subscription.proId ||
    subscription.planCode !== target.code ||
    subscription.amountMinor !== target.amountMinor ||
    subscription.intervalCount !== pair.intervalCount ||
    (hasMigrationMarker &&
      (subscription.pricingMigrationId !== PRICING_MIGRATION_ID ||
        subscription.pricingMigrationFromVersion !== "v1" ||
        !subscription.pricingMigratedAt ||
        !Number.isFinite(Date.parse(subscription.pricingMigratedAt))))
  ) {
    throw new Error("Target-version subscription has invalid plan data.");
  }

  if (!subscription.stripeSubscriptionId) {
    if (
      subscription.accessStatus !== "setup_required" ||
      hasTrialHistory(subscription) ||
      hasOpenCheckout(subscription) ||
      subscription.stripePriceId ||
      subscription.stripeStatus ||
      subscription.currentPeriodStartedAt ||
      subscription.currentPeriodEndsAt ||
      subscription.cancelAtPeriodEnd !== false ||
      subscription.pastDueInvoiceId
    ) {
      throw new Error("Target setup-required subscription is inconsistent.");
    }
    return;
  }

  if (subscription.stripeStatus === "canceled") {
    if (
      subscription.accessStatus !== "terminated" ||
      subscription.pastDueInvoiceId ||
      hasOpenCheckout(subscription)
    ) {
      throw new Error("Target canceled subscription is inconsistent.");
    }
    return;
  }

  if (
    !subscription.stripeCustomerId ||
    !subscription.stripePriceId ||
    !subscription.trialConsumedAt ||
    subscription.cancelAtPeriodEnd ||
    subscription.pastDueInvoiceId ||
    !["trialing", "active"].includes(subscription.stripeStatus ?? "") ||
    !["trialing", "active"].includes(subscription.accessStatus)
  ) {
    throw new Error("Target billed subscription is not safely verifiable.");
  }

  const targetPriceId = priceIdFor(config, pair, targetVersion);
  const canonical = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
  );
  const item = canonical.items.data[0];
  if (
    canonical.items.data.length !== 1 ||
    !item ||
    canonical.id !== subscription.stripeSubscriptionId ||
    expandableId(canonical.customer) !== subscription.stripeCustomerId ||
    canonical.metadata.proId !== subscription.proId ||
    item.quantity !== 1 ||
    canonical.status !== subscription.stripeStatus ||
    canonical.collection_method !== "charge_automatically" ||
    canonical.currency !== "hkd" ||
    canonical.livemode !== subscription.stripeLivemode ||
    canonical.cancel_at_period_end ||
    canonical.cancel_at !== null ||
    canonical.schedule !== null ||
    canonical.pending_update !== null ||
    canonical.pause_collection !== null ||
    canonical.metadata.planCode !== target.code ||
    (hasMigrationMarker &&
      (canonical.metadata.pricingMigrationId !== PRICING_MIGRATION_ID ||
        canonical.metadata.pricingMigrationFromVersion !== "v1")) ||
    item.price.id !== targetPriceId ||
    subscription.stripePriceId !== targetPriceId ||
    unixSecondsToIso(item.current_period_start) !==
      subscription.currentPeriodStartedAt ||
    unixSecondsToIso(item.current_period_end) !==
      subscription.currentPeriodEndsAt ||
    !stripeTrialStateMatches(subscription, canonical)
  ) {
    throw new Error(
      "Target-version MongoDB and Stripe subscription state do not match.",
    );
  }
}

export async function main() {
  const config = parsePricingMigrationConfig(process.env);
  assertSafeEnvironment(config);

  const targetVersion = config.SUBSCRIPTION_PRICING_TARGET_VERSION;
  const sourceVersion: PricingVersion = "v1";
  const expectedLivemode = config.NODE_ENV === "production";
  const stripe = new Stripe(config.STRIPE_SECRET_KEY);
  await validatePriceCatalog(stripe, config, expectedLivemode);

  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();
  try {
    const db = client.db(config.MONGODB_DATABASE);
    const collection =
      db.collection<ProSubscriptionDocument>("proSubscriptions");
    const knownPlanCodes = planPairs.flatMap((pair) => [
      pair.v1.code,
      pair.v2.code,
    ]);
    const runMigration = async (lease: MigrationLease) => {
      await lease.assertOwned();
      const subscriptions = await collection
        .find({ planCode: { $in: knownPlanCodes } })
        .sort({ createdAt: 1, _id: 1 })
        .toArray();
      const unknownPlanCount = await collection.countDocuments({
        planCode: { $nin: knownPlanCodes },
      });
      if (unknownPlanCount !== 0) {
        throw new Error(
          "Unknown subscription plan codes exist; migration stopped.",
        );
      }

      const processSubscriptions = async (apply: boolean) => {
        const summary = {
          database: config.MONGODB_DATABASE,
          targetVersion,
          apply: config.SUBSCRIPTION_PRICING_APPLY,
          total: subscriptions.length,
          alreadyTarget: 0,
          setupRequired: 0,
          liveBilling: 0,
          historicalNoCharge: 0,
        };

        for (const subscription of subscriptions) {
          if (subscription._id !== subscription.proId) {
            throw new Error(
              "Subscription document ownership is inconsistent; migration stopped.",
            );
          }
          if (
            subscription.currency !== "hkd" ||
            subscription.interval !== "month"
          ) {
            throw new Error(
              "Subscription currency or interval is inconsistent; migration stopped.",
            );
          }
          const pair = pairForPlanCode(subscription.planCode);
          if (!pair) throw new Error("Subscription plan mapping is missing.");
          const target = planForVersion(pair, targetVersion);
          const source = planForVersion(pair, sourceVersion);

          if (subscription.planCode === target.code) {
            await verifyTargetSubscription({
              config,
              pair,
              stripe,
              subscription,
              targetVersion,
            });
            summary.alreadyTarget += 1;
            continue;
          }
          if (
            subscription.planCode !== source.code ||
            subscription.amountMinor !== source.amountMinor
          ) {
            throw new Error(
              "Source-version subscription has an invalid amount.",
            );
          }

          if (!subscription.stripeSubscriptionId) {
            await migrateSetupRequiredSubscription({
              apply,
              collection,
              lease,
              pair,
              sourceVersion,
              subscription,
              targetVersion,
            });
            summary.setupRequired += 1;
            continue;
          }

          if (subscription.stripeStatus === "canceled") {
            if (
              subscription.accessStatus !== "terminated" ||
              subscription.pastDueInvoiceId ||
              hasOpenCheckout(subscription)
            ) {
              throw new Error(
                "Canceled subscription has unresolved billing state; migration stopped.",
              );
            }
            summary.historicalNoCharge += 1;
            continue;
          }

          await migrateLiveSubscription({
            apply,
            collection,
            config,
            lease,
            pair,
            sourceVersion,
            stripe,
            subscription,
            targetVersion,
          });
          summary.liveBilling += 1;
        }
        return summary;
      };

      if (config.SUBSCRIPTION_PRICING_APPLY) {
        // Validate the full locked snapshot before the first external or local
        // mutation so an invalid later record cannot leave a partial rollout.
        await processSubscriptions(false);
      }
      const summary = await processSubscriptions(
        config.SUBSCRIPTION_PRICING_APPLY,
      );

      if (config.SUBSCRIPTION_PRICING_APPLY) {
        await lease.assertOwned();
        const targetSubscriptions = await collection
          .find({
            planCode: {
              $in: planPairs.map((pair) => pair[targetVersion].code),
            },
          })
          .sort({ createdAt: 1, _id: 1 })
          .toArray();
        for (const subscription of targetSubscriptions) {
          const pair = pairForPlanCode(subscription.planCode);
          if (!pair) throw new Error("Subscription plan mapping is missing.");
          await verifyTargetSubscription({
            config,
            pair,
            stripe,
            subscription,
            targetVersion,
          });
        }
        const remainingMigratableCount = await collection.countDocuments({
          planCode: {
            $in: planPairs.map((pair) => pair[sourceVersion].code),
          },
          $nor: [
            {
              stripeStatus: "canceled",
              accessStatus: "terminated",
              pastDueInvoiceId: { $exists: false },
            },
          ],
        });
        if (remainingMigratableCount !== 0) {
          throw new Error(
            "Migratable source-version subscriptions remain after apply.",
          );
        }
      }

      return summary;
    };

    const summary = config.SUBSCRIPTION_PRICING_APPLY
      ? await withSubscriptionMutationLock(db, runMigration)
      : await runMigration({ assertOwned: async () => undefined });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Subscription pricing migration failed: ${message}`);
    process.exitCode = 1;
  });
}
