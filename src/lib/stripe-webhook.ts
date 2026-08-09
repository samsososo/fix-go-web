import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  clearProSubscriptionCheckoutSession,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  failStripeWebhookEvent,
  findProSubscription,
} from "@/lib/mock/db";
import {
  createMonthlyProSubscription,
  findExistingMonthlyProSubscription,
  retrieveSucceededCardSetup,
  setCustomerDefaultPaymentMethod,
  STRIPE_CARD_SETUP_PURPOSE,
} from "@/lib/stripe-billing";
import {
  PRO_SUBSCRIPTION_PLAN_CODE,
  createLifetimeTrialWindow,
  type ProSubscription,
} from "@/lib/subscription-policy";

const SUPPORTED_CHECKOUT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.expired",
] as const;

type SupportedCheckoutEventType =
  (typeof SUPPORTED_CHECKOUT_EVENT_TYPES)[number];

type StripeWebhookClaim =
  | { status: "claimed"; leaseId: string }
  | { status: "processed" }
  | { status: "busy" };

export interface StripeWebhookDependencies {
  activateProTrialSubscription: typeof activateProTrialSubscription;
  claimStripeWebhookEvent: (input: {
    eventId: string;
    eventType: string;
    objectId?: string;
    leaseId: string;
    leaseDurationMs?: number;
  }) => Promise<StripeWebhookClaim>;
  clearProSubscriptionCheckoutSession: (
    checkoutSessionId: string,
  ) => Promise<boolean>;
  completeStripeWebhookEvent: (
    eventId: string,
    leaseId: string,
  ) => Promise<boolean>;
  consumeProLifetimeTrial: typeof consumeProLifetimeTrial;
  createMonthlyProSubscription: typeof createMonthlyProSubscription;
  findExistingMonthlyProSubscription: typeof findExistingMonthlyProSubscription;
  failStripeWebhookEvent: (
    eventId: string,
    leaseId: string,
    errorCode: string,
  ) => Promise<boolean>;
  findProSubscription: (proId: string) => Promise<ProSubscription | null>;
  now: () => Date;
  randomUUID: () => string;
  retrieveSucceededCardSetup: typeof retrieveSucceededCardSetup;
  setCustomerDefaultPaymentMethod: typeof setCustomerDefaultPaymentMethod;
}

export type StripeWebhookProcessingResult =
  | {
      status: 200;
      code: "event_ignored" | "event_processed" | "event_already_processed";
    }
  | { status: 409; code: "event_busy" | "event_lease_lost" }
  | { status: 500; code: "event_processing_failed" };

const defaultDependencies: StripeWebhookDependencies = {
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  clearProSubscriptionCheckoutSession,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  createMonthlyProSubscription,
  findExistingMonthlyProSubscription,
  failStripeWebhookEvent,
  findProSubscription,
  now: () => new Date(),
  randomUUID,
  retrieveSucceededCardSetup,
  setCustomerDefaultPaymentMethod,
};

class StripeWebhookProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StripeWebhookProcessingError";
  }
}

function processingError(code: string): never {
  throw new StripeWebhookProcessingError(code);
}

function isSupportedCheckoutEventType(
  eventType: string,
): eventType is SupportedCheckoutEventType {
  return (SUPPORTED_CHECKOUT_EVENT_TYPES as readonly string[]).includes(
    eventType,
  );
}

function expandableId(value: { id: string } | string | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

function requireCheckoutSession(event: Stripe.Event) {
  const object = event.data.object as Partial<Stripe.Checkout.Session>;
  if (object.object !== "checkout.session" || !object.id) {
    processingError("invalid_checkout_session");
  }

  return object as Stripe.Checkout.Session;
}

function unixSecondsToIso(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    processingError(errorCode);
  }

  return new Date(value * 1_000).toISOString();
}

function isoToUnixSeconds(value: string, errorCode: string) {
  const milliseconds = Date.parse(value);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    milliseconds % 1_000 !== 0
  ) {
    processingError(errorCode);
  }

  return milliseconds / 1_000;
}

function validateLocalCheckout(
  subscription: ProSubscription | null,
  session: Stripe.Checkout.Session,
) {
  const proId = session.metadata?.proId;
  const customerId = expandableId(session.customer);

  if (
    session.mode !== "setup" ||
    !proId ||
    session.metadata?.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    session.metadata?.purpose !== STRIPE_CARD_SETUP_PURPOSE ||
    session.client_reference_id !== proId ||
    !customerId ||
    !subscription ||
    subscription.proId !== proId ||
    subscription.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    subscription.checkoutSessionId !== session.id ||
    subscription.stripeCustomerId !== customerId
  ) {
    processingError("checkout_identity_mismatch");
  }

  return { proId, customerId, subscription };
}

function validateConsumedTrial(
  subscription: ProSubscription,
  input: {
    checkoutSessionId: string;
    customerId: string;
    setupIntentId: string;
    paymentMethodId: string;
  },
) {
  if (
    !subscription.trialConsumedAt ||
    !subscription.trialEndsAt ||
    subscription.checkoutSessionId !== input.checkoutSessionId ||
    subscription.stripeCustomerId !== input.customerId ||
    subscription.stripeSetupIntentId !== input.setupIntentId ||
    subscription.stripePaymentMethodId !== input.paymentMethodId
  ) {
    processingError("trial_state_mismatch");
  }
}

function validateCreatedSubscription(
  stripeSubscription: Stripe.Subscription,
  input: {
    proId: string;
    customerId: string;
    trialEndUnix: number;
  },
) {
  const item = stripeSubscription.items.data[0];
  if (
    stripeSubscription.items.data.length !== 1 ||
    !item ||
    expandableId(stripeSubscription.customer) !== input.customerId ||
    stripeSubscription.metadata.proId !== input.proId ||
    stripeSubscription.metadata.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    stripeSubscription.trial_end !== input.trialEndUnix ||
    !["trialing", "active"].includes(stripeSubscription.status)
  ) {
    processingError("invalid_created_subscription");
  }

  return {
    item,
    status: stripeSubscription.status as "trialing" | "active",
  };
}

async function processCompletedCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  dependencies: StripeWebhookDependencies,
) {
  const proIdFromMetadata = session.metadata?.proId;
  const localSubscription = proIdFromMetadata
    ? await dependencies.findProSubscription(proIdFromMetadata)
    : null;
  const { proId, customerId, subscription } = validateLocalCheckout(
    localSubscription,
    session,
  );
  if (subscription.trialConsumedAt && subscription.stripeSubscriptionId) {
    return;
  }
  const setupIntentId = expandableId(session.setup_intent);
  if (!setupIntentId) {
    processingError("checkout_setup_intent_missing");
  }

  const cardSetup = await dependencies.retrieveSucceededCardSetup({
    proId,
    customerId,
    setupIntentId,
  });
  await dependencies.setCustomerDefaultPaymentMethod({
    customerId,
    paymentMethodId: cardSetup.paymentMethodId,
  });

  const cardBoundAt = unixSecondsToIso(
    event.created,
    "invalid_event_created_at",
  );
  const trialWindow = createLifetimeTrialWindow(subscription, cardBoundAt);
  const trialEndsAt = trialWindow?.trialEndsAt ?? subscription.trialEndsAt;
  if (!trialEndsAt) {
    processingError("lifetime_trial_unavailable");
  }

  const consumedTrial = await dependencies.consumeProLifetimeTrial({
    proId,
    checkoutSessionId: session.id,
    stripeCustomerId: customerId,
    stripeSetupIntentId: setupIntentId,
    stripePaymentMethodId: cardSetup.paymentMethodId,
    cardBoundAt,
    trialEndsAt,
  });
  validateConsumedTrial(consumedTrial.subscription, {
    checkoutSessionId: session.id,
    customerId,
    setupIntentId,
    paymentMethodId: cardSetup.paymentMethodId,
  });

  if (consumedTrial.subscription.stripeSubscriptionId) {
    return;
  }

  const canonicalTrialEndsAt = consumedTrial.subscription.trialEndsAt;
  if (!canonicalTrialEndsAt) {
    processingError("trial_end_missing");
  }
  const trialEndUnix = isoToUnixSeconds(
    canonicalTrialEndsAt,
    "invalid_trial_end",
  );
  const stripeSubscription =
    (await dependencies.findExistingMonthlyProSubscription({
      proId,
      customerId,
      trialEndUnix,
    })) ??
    (await dependencies.createMonthlyProSubscription({
      proId,
      customerId,
      trialEndUnix,
      idempotencyKey: `pro-subscription:${proId}:lifetime`,
    }));
  const validatedSubscription = validateCreatedSubscription(
    stripeSubscription,
    {
      proId,
      customerId,
      trialEndUnix,
    },
  );
  const subscriptionItem = validatedSubscription.item;

  const activated = await dependencies.activateProTrialSubscription({
    proId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: subscriptionItem.price.id,
    stripeStatus: validatedSubscription.status,
    stripeLivemode: stripeSubscription.livemode,
    currentPeriodStartedAt: unixSecondsToIso(
      subscriptionItem.current_period_start,
      "invalid_current_period_start",
    ),
    currentPeriodEndsAt: unixSecondsToIso(
      subscriptionItem.current_period_end,
      "invalid_current_period_end",
    ),
    lastStripeEventId: event.id,
    lastStripeSyncedAt: dependencies.now().toISOString(),
  });
  if (!activated) {
    processingError("subscription_activation_conflict");
  }
}

async function processClaimedEvent(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  dependencies: StripeWebhookDependencies,
) {
  if (event.type === "checkout.session.completed") {
    await processCompletedCheckout(event, session, dependencies);
    return;
  }

  await dependencies.clearProSubscriptionCheckoutSession(session.id);
}

/**
 * Applies the two Checkout events owned by subscription setup. Other Stripe
 * events are intentionally left unclaimed for the later lifecycle handler.
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies = defaultDependencies,
): Promise<StripeWebhookProcessingResult> {
  if (!isSupportedCheckoutEventType(event.type)) {
    return { status: 200, code: "event_ignored" };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = requireCheckoutSession(event);
  } catch {
    return { status: 500, code: "event_processing_failed" };
  }

  const leaseId = dependencies.randomUUID();
  let claim: StripeWebhookClaim;
  try {
    claim = await dependencies.claimStripeWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      objectId: session.id,
      leaseId,
    });
  } catch {
    return { status: 500, code: "event_processing_failed" };
  }

  if (claim.status === "processed") {
    return { status: 200, code: "event_already_processed" };
  }
  if (claim.status === "busy") {
    return { status: 409, code: "event_busy" };
  }

  try {
    await processClaimedEvent(event, session, dependencies);
    const completed = await dependencies.completeStripeWebhookEvent(
      event.id,
      claim.leaseId,
    );
    return completed
      ? { status: 200, code: "event_processed" }
      : { status: 409, code: "event_lease_lost" };
  } catch (error) {
    const errorCode =
      error instanceof StripeWebhookProcessingError
        ? error.code
        : "stripe_checkout_processing_failed";
    try {
      await dependencies.failStripeWebhookEvent(
        event.id,
        claim.leaseId,
        errorCode,
      );
    } catch {
      // Stripe receives a retryable response even if recording the failure fails.
    }
    return { status: 500, code: "event_processing_failed" };
  }
}
