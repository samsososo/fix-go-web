export const PRO_SUBSCRIPTION_PLAN_CODE = "pro_monthly_v2" as const;
export const PRO_SUBSCRIPTION_AMOUNT_MINOR = 20_000 as const;
export const PRO_SUBSCRIPTION_CURRENCY = "hkd" as const;
export const PRO_SUBSCRIPTION_INTERVAL = "month" as const;
export const PRO_SUBSCRIPTION_TRIAL_DAYS = 14 as const;
export const PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS = 14 as const;

const PRO_SUBSCRIPTION_PLAN_BASE = {
  currency: PRO_SUBSCRIPTION_CURRENCY,
  interval: PRO_SUBSCRIPTION_INTERVAL,
  trialDays: PRO_SUBSCRIPTION_TRIAL_DAYS,
  gracePeriodDays: PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS,
} as const;

export const PRO_SUBSCRIPTION_PLAN = {
  ...PRO_SUBSCRIPTION_PLAN_BASE,
  code: PRO_SUBSCRIPTION_PLAN_CODE,
  amountMinor: PRO_SUBSCRIPTION_AMOUNT_MINOR,
} as const;

/**
 * Packages offered to new checkouts. Historical packages deliberately stay
 * out of this list so UI callers cannot accidentally sell a retired price.
 */
export const PRO_SUBSCRIPTION_PLANS = [
  { ...PRO_SUBSCRIPTION_PLAN, intervalCount: 1 },
  {
    ...PRO_SUBSCRIPTION_PLAN,
    code: "pro_3_months_v2",
    amountMinor: 49_800,
    intervalCount: 3,
  },
  {
    ...PRO_SUBSCRIPTION_PLAN,
    code: "pro_6_months_v2",
    amountMinor: 89_800,
    intervalCount: 6,
  },
  {
    ...PRO_SUBSCRIPTION_PLAN,
    code: "pro_12_months_v2",
    amountMinor: 139_800,
    intervalCount: 12,
  },
] as const;

/** Retired packages retained for existing subscription lifecycle handling. */
export const HISTORICAL_PRO_SUBSCRIPTION_PLANS = [
  {
    ...PRO_SUBSCRIPTION_PLAN_BASE,
    code: "pro_monthly_v1",
    amountMinor: 10_000,
    intervalCount: 1,
  },
  {
    ...PRO_SUBSCRIPTION_PLAN_BASE,
    code: "pro_3_months_v1",
    amountMinor: 24_900,
    intervalCount: 3,
  },
  {
    ...PRO_SUBSCRIPTION_PLAN_BASE,
    code: "pro_6_months_v1",
    amountMinor: 44_900,
    intervalCount: 6,
  },
  {
    ...PRO_SUBSCRIPTION_PLAN_BASE,
    code: "pro_12_months_v1",
    amountMinor: 69_900,
    intervalCount: 12,
  },
] as const;

/** All packages that may legitimately appear in persisted data or Stripe. */
export const ALL_PRO_SUBSCRIPTION_PLANS = [
  ...HISTORICAL_PRO_SUBSCRIPTION_PLANS,
  ...PRO_SUBSCRIPTION_PLANS,
] as const;

export type ProSubscriptionPlanCode =
  (typeof ALL_PRO_SUBSCRIPTION_PLANS)[number]["code"];
export type SaleableProSubscriptionPlanCode =
  (typeof PRO_SUBSCRIPTION_PLANS)[number]["code"];

export function isProSubscriptionPlanCode(
  value: unknown,
): value is ProSubscriptionPlanCode {
  return ALL_PRO_SUBSCRIPTION_PLANS.some((plan) => plan.code === value);
}

export function isSaleableProSubscriptionPlanCode(
  value: unknown,
): value is SaleableProSubscriptionPlanCode {
  return PRO_SUBSCRIPTION_PLANS.some((plan) => plan.code === value);
}

export function getProSubscriptionPlan(
  code: unknown = PRO_SUBSCRIPTION_PLAN_CODE,
) {
  const plan = ALL_PRO_SUBSCRIPTION_PLANS.find((plan) => plan.code === code);
  if (!plan) throw new TypeError("Invalid professional subscription plan.");
  return plan;
}

export function getSaleableProSubscriptionPlan(
  code: unknown = PRO_SUBSCRIPTION_PLAN_CODE,
) {
  const plan = PRO_SUBSCRIPTION_PLANS.find((plan) => plan.code === code);
  if (!plan) {
    throw new TypeError("Invalid saleable professional subscription plan.");
  }
  return plan;
}

/** Maps a persisted package version to the currently saleable same-term plan. */
export function getCurrentProSubscriptionPlanCode(
  code: unknown = PRO_SUBSCRIPTION_PLAN_CODE,
): SaleableProSubscriptionPlanCode {
  const historicalOrCurrentPlan = getProSubscriptionPlan(code);
  const currentPlan = PRO_SUBSCRIPTION_PLANS.find(
    (plan) => plan.intervalCount === historicalOrCurrentPlan.intervalCount,
  );
  if (!currentPlan) {
    throw new TypeError(
      "No current professional subscription plan has the same billing interval.",
    );
  }
  return currentPlan.code;
}

export function formatProSubscriptionPlan(
  code: ProSubscriptionPlanCode,
  locale = "zh-HK",
) {
  const plan = getProSubscriptionPlan(code);
  return locale === "en"
    ? `HK$${plan.amountMinor / 100} every ${plan.intervalCount} month(s)`
    : `每 ${plan.intervalCount} 個月 HK$${plan.amountMinor / 100}`;
}

export const subscriptionAccessStatuses = [
  "setup_required",
  "trialing",
  "active",
  "grace_period",
  "cancel_at_period_end",
  "suspended",
  "terminated",
] as const;

export type SubscriptionAccessStatus =
  (typeof subscriptionAccessStatuses)[number];

export type StripeSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type IsoDateTime = string;

/**
 * The application-facing subscription shape. Dates remain ISO strings so the
 * value can safely cross a Server Component or action boundary.
 */
export interface ProSubscription {
  proId: string;
  planCode: ProSubscriptionPlanCode;
  intervalCount?: number;
  reactivationPlanCode?: ProSubscriptionPlanCode;
  amountMinor: number;
  currency: typeof PRO_SUBSCRIPTION_CURRENCY;
  interval: typeof PRO_SUBSCRIPTION_INTERVAL;
  accessStatus: SubscriptionAccessStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeStatus?: StripeSubscriptionStatus;
  stripeLivemode?: boolean;
  stripeSubscriptionHasTrial?: boolean;
  stripeSetupIntentId?: string;
  stripePaymentMethodId?: string;
  checkoutSessionId?: string;
  checkoutSessionExpiresAt?: IsoDateTime;
  checkoutReservationId?: string;
  checkoutReservationExpiresAt?: IsoDateTime;
  reactivationCheckoutSessionId?: string;
  reactivationCheckoutSessionExpiresAt?: IsoDateTime;
  reactivationCheckoutReservationId?: string;
  reactivationCheckoutReservationExpiresAt?: IsoDateTime;
  cardBoundAt?: IsoDateTime;
  trialConsumedAt?: IsoDateTime;
  trialGrantedAt?: IsoDateTime;
  trialStartedAt?: IsoDateTime;
  trialEndsAt?: IsoDateTime;
  currentPeriodStartedAt?: IsoDateTime;
  currentPeriodEndsAt?: IsoDateTime;
  cancelAtPeriodEnd: boolean;
  cancellationRequestedAt?: IsoDateTime;
  pastDueInvoiceId?: string;
  firstPaymentFailedAt?: IsoDateTime;
  paymentFailureConfirmed?: boolean;
  gracePeriodEndsAt?: IsoDateTime;
  latestInvoiceId?: string;
  lastPaymentSucceededAt?: IsoDateTime;
  terminatedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  lastStripeEventId?: string;
  lastStripeEventCreatedAt?: IsoDateTime;
  lastStripeSyncedAt?: IsoDateTime;
  stripeLifecycleRevision?: number;
}

export interface ProSubscriptionEntitlement {
  status: SubscriptionAccessStatus;
  canCreateQuotes: boolean;
  canAcceptNewWork: boolean;
  canManageExistingWork: true;
  canManageBilling: true;
  effectiveUntil?: IsoDateTime;
}

export interface LifetimeTrialWindow {
  cardBoundAt: IsoDateTime;
  trialConsumedAt: IsoDateTime;
  trialGrantedAt: IsoDateTime;
  trialStartedAt: IsoDateTime;
  trialEndsAt: IsoDateTime;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDateTime(value: IsoDateTime, fieldName: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${fieldName} must be a valid ISO date-time.`);
  }

  return timestamp;
}

function toIsoDateTime(timestamp: number) {
  return new Date(timestamp).toISOString();
}

/** New trials last exactly 336 hours; persisted trial dates are never recalculated. */
export function calculateProTrialEndsAt(value: IsoDateTime): IsoDateTime {
  return toIsoDateTime(
    parseIsoDateTime(value, "value") + PRO_SUBSCRIPTION_TRIAL_DAYS * DAY_MS,
  );
}

export function calculateGracePeriodEndsAt(
  firstPaymentFailedAt: IsoDateTime,
): IsoDateTime {
  return toIsoDateTime(
    parseIsoDateTime(firstPaymentFailedAt, "firstPaymentFailedAt") +
      PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS * DAY_MS,
  );
}

type TrialHistory = Pick<
  ProSubscription,
  | "cardBoundAt"
  | "trialConsumedAt"
  | "trialGrantedAt"
  | "trialStartedAt"
  | "trialEndsAt"
>;

/**
 * Any evidence that the first card binding or trial was recorded consumes the
 * one lifetime trial. This deliberately fails closed after a partial write so
 * updating a card or re-subscribing cannot silently grant another trial.
 */
export function hasConsumedLifetimeTrial(
  subscription: TrialHistory | null | undefined,
) {
  return Boolean(
    subscription?.cardBoundAt ||
    subscription?.trialConsumedAt ||
    subscription?.trialGrantedAt ||
    subscription?.trialStartedAt ||
    subscription?.trialEndsAt,
  );
}

export function canGrantLifetimeTrial(
  subscription: TrialHistory | null | undefined,
) {
  return !hasConsumedLifetimeTrial(subscription);
}

export function createLifetimeTrialWindow(
  existingSubscription: TrialHistory | null | undefined,
  cardBoundAt: IsoDateTime,
): LifetimeTrialWindow | null {
  if (!canGrantLifetimeTrial(existingSubscription)) {
    return null;
  }

  const normalizedCardBoundAt = toIsoDateTime(
    parseIsoDateTime(cardBoundAt, "cardBoundAt"),
  );

  return {
    cardBoundAt: normalizedCardBoundAt,
    trialConsumedAt: normalizedCardBoundAt,
    trialGrantedAt: normalizedCardBoundAt,
    trialStartedAt: normalizedCardBoundAt,
    trialEndsAt: calculateProTrialEndsAt(normalizedCardBoundAt),
  };
}

function isAtOrAfter(now: IsoDateTime, boundary: IsoDateTime) {
  return (
    parseIsoDateTime(now, "now") >=
    parseIsoDateTime(boundary, "subscription boundary")
  );
}

function cancellationAccessEndsAt(subscription: ProSubscription) {
  if (subscription.stripeStatus === "trialing") {
    return subscription.trialEndsAt;
  }

  return subscription.currentPeriodEndsAt ?? subscription.trialEndsAt;
}

export function deriveSubscriptionAccessStatus(
  subscription: ProSubscription | null | undefined,
  now: IsoDateTime,
): SubscriptionAccessStatus {
  parseIsoDateTime(now, "now");

  if (!subscription) {
    return "setup_required";
  }

  if (subscription.accessStatus === "grace_period") {
    if (
      !subscription.gracePeriodEndsAt ||
      isAtOrAfter(now, subscription.gracePeriodEndsAt)
    ) {
      return "suspended";
    }

    return "grace_period";
  }

  const isCancellationPending =
    subscription.accessStatus === "cancel_at_period_end" ||
    (subscription.cancelAtPeriodEnd &&
      ["trialing", "active"].includes(subscription.accessStatus));

  if (isCancellationPending) {
    const accessEndsAt = cancellationAccessEndsAt(subscription);
    if (!accessEndsAt || isAtOrAfter(now, accessEndsAt)) {
      return "terminated";
    }

    return "cancel_at_period_end";
  }

  if (subscription.accessStatus === "trialing") {
    if (
      !subscription.trialEndsAt ||
      isAtOrAfter(now, subscription.trialEndsAt)
    ) {
      return "suspended";
    }

    return "trialing";
  }

  if (subscription.accessStatus === "active") {
    if (
      !subscription.currentPeriodEndsAt ||
      isAtOrAfter(now, subscription.currentPeriodEndsAt)
    ) {
      return "suspended";
    }
    return "active";
  }

  return subscription.accessStatus;
}

export function deriveProSubscriptionEntitlement(
  subscription: ProSubscription | null | undefined,
  now: IsoDateTime,
): ProSubscriptionEntitlement {
  const status = deriveSubscriptionAccessStatus(subscription, now);
  const canTakeNewWork = [
    "trialing",
    "active",
    "grace_period",
    "cancel_at_period_end",
  ].includes(status);
  const effectiveUntil =
    status === "trialing"
      ? subscription?.trialEndsAt
      : status === "grace_period"
        ? subscription?.gracePeriodEndsAt
        : status === "cancel_at_period_end" && subscription
          ? cancellationAccessEndsAt(subscription)
          : undefined;

  return {
    status,
    canCreateQuotes: canTakeNewWork,
    canAcceptNewWork: canTakeNewWork,
    canManageExistingWork: true,
    canManageBilling: true,
    effectiveUntil,
  };
}
