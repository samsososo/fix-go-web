export const PRO_SUBSCRIPTION_PLAN_CODE = "pro_monthly_v1" as const;
export const PRO_SUBSCRIPTION_AMOUNT_MINOR = 10_000 as const;
export const PRO_SUBSCRIPTION_CURRENCY = "hkd" as const;
export const PRO_SUBSCRIPTION_INTERVAL = "month" as const;
export const PRO_SUBSCRIPTION_TRIAL_MONTHS = 3 as const;
export const PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS = 14 as const;

export const PRO_SUBSCRIPTION_PLAN = {
  code: PRO_SUBSCRIPTION_PLAN_CODE,
  amountMinor: PRO_SUBSCRIPTION_AMOUNT_MINOR,
  currency: PRO_SUBSCRIPTION_CURRENCY,
  interval: PRO_SUBSCRIPTION_INTERVAL,
  trialMonths: PRO_SUBSCRIPTION_TRIAL_MONTHS,
  gracePeriodDays: PRO_SUBSCRIPTION_GRACE_PERIOD_DAYS,
} as const;

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
  planCode: typeof PRO_SUBSCRIPTION_PLAN_CODE;
  amountMinor: number;
  currency: typeof PRO_SUBSCRIPTION_CURRENCY;
  interval: typeof PRO_SUBSCRIPTION_INTERVAL;
  accessStatus: SubscriptionAccessStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeStatus?: StripeSubscriptionStatus;
  stripeLivemode?: boolean;
  checkoutSessionId?: string;
  checkoutSessionExpiresAt?: IsoDateTime;
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
  gracePeriodEndsAt?: IsoDateTime;
  latestInvoiceId?: string;
  lastPaymentSucceededAt?: IsoDateTime;
  terminatedAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  lastStripeEventId?: string;
  lastStripeSyncedAt?: IsoDateTime;
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

const HONG_KONG_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
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

function daysInUtcMonth(year: number, zeroBasedMonth: number) {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

/**
 * Adds three Hong Kong calendar months while preserving the Hong Kong local
 * time. Dates that do not exist in the target month are clamped to its final
 * day (for example, 31 January becomes 30 April).
 */
export function addThreeHongKongCalendarMonths(
  value: IsoDateTime,
): IsoDateTime {
  const timestamp = parseIsoDateTime(value, "value");
  const hongKongWallClock = new Date(timestamp + HONG_KONG_UTC_OFFSET_MS);
  const sourceYear = hongKongWallClock.getUTCFullYear();
  const sourceMonth = hongKongWallClock.getUTCMonth();
  const sourceDay = hongKongWallClock.getUTCDate();
  const absoluteTargetMonth =
    sourceYear * 12 + sourceMonth + PRO_SUBSCRIPTION_TRIAL_MONTHS;
  const targetYear = Math.floor(absoluteTargetMonth / 12);
  const targetMonth = absoluteTargetMonth % 12;
  const targetDay = Math.min(
    sourceDay,
    daysInUtcMonth(targetYear, targetMonth),
  );
  const targetHongKongWallClock = Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    hongKongWallClock.getUTCHours(),
    hongKongWallClock.getUTCMinutes(),
    hongKongWallClock.getUTCSeconds(),
    hongKongWallClock.getUTCMilliseconds(),
  );

  return toIsoDateTime(targetHongKongWallClock - HONG_KONG_UTC_OFFSET_MS);
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
    trialEndsAt: addThreeHongKongCalendarMonths(normalizedCardBoundAt),
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
