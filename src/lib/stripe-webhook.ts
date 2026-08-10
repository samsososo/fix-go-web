import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  activatePaidProSubscription,
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  clearProSubscriptionCheckoutSession,
  clearProSubscriptionReactivationCheckoutSession,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  failStripeWebhookEvent,
  findProSubscription,
  findProSubscriptionByStripeSubscriptionId,
  syncProSubscriptionLifecycle,
} from "@/lib/mock/db";
import {
  createMonthlyProSubscription,
  findExistingMonthlyProSubscription,
  retrieveOwnedMonthlyProSubscription,
  retrieveOwnedProSubscriptionInvoice,
  retrieveSucceededCardSetup,
  setCustomerDefaultPaymentMethod,
  STRIPE_CARD_SETUP_PURPOSE,
  STRIPE_PAID_REACTIVATION_PURPOSE,
} from "@/lib/stripe-billing";
import {
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_CURRENCY,
  PRO_SUBSCRIPTION_PLAN_CODE,
  createLifetimeTrialWindow,
  type ProSubscription,
  type StripeSubscriptionStatus,
} from "@/lib/subscription-policy";

const SUPPORTED_CHECKOUT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.expired",
] as const;

const SUPPORTED_LIFECYCLE_EVENT_TYPES = [
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.finalization_failed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

type SupportedCheckoutEventType =
  (typeof SUPPORTED_CHECKOUT_EVENT_TYPES)[number];

type SupportedLifecycleEventType =
  (typeof SUPPORTED_LIFECYCLE_EVENT_TYPES)[number];

type StripeWebhookClaim =
  | { status: "claimed"; leaseId: string }
  | { status: "processed" }
  | { status: "busy" };

export interface StripeWebhookDependencies {
  activatePaidProSubscription: typeof activatePaidProSubscription;
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
  clearProSubscriptionReactivationCheckoutSession: (
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
  findProSubscriptionByStripeSubscriptionId: (
    subscriptionId: string,
  ) => Promise<ProSubscription | null>;
  now: () => Date;
  randomUUID: () => string;
  retrieveSucceededCardSetup: typeof retrieveSucceededCardSetup;
  retrieveOwnedMonthlyProSubscription: typeof retrieveOwnedMonthlyProSubscription;
  retrieveOwnedProSubscriptionInvoice: typeof retrieveOwnedProSubscriptionInvoice;
  setCustomerDefaultPaymentMethod: typeof setCustomerDefaultPaymentMethod;
  syncProSubscriptionLifecycle: typeof syncProSubscriptionLifecycle;
}

export type StripeWebhookProcessingResult =
  | {
      status: 200;
      code: "event_ignored" | "event_processed" | "event_already_processed";
    }
  | { status: 409; code: "event_busy" | "event_lease_lost" }
  | { status: 500; code: "event_processing_failed" };

const defaultDependencies: StripeWebhookDependencies = {
  activatePaidProSubscription,
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  clearProSubscriptionCheckoutSession,
  clearProSubscriptionReactivationCheckoutSession,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  createMonthlyProSubscription,
  findExistingMonthlyProSubscription,
  failStripeWebhookEvent,
  findProSubscription,
  findProSubscriptionByStripeSubscriptionId,
  now: () => new Date(),
  randomUUID,
  retrieveSucceededCardSetup,
  retrieveOwnedMonthlyProSubscription,
  retrieveOwnedProSubscriptionInvoice,
  setCustomerDefaultPaymentMethod,
  syncProSubscriptionLifecycle,
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

function isSupportedLifecycleEventType(
  eventType: string,
): eventType is SupportedLifecycleEventType {
  return (SUPPORTED_LIFECYCLE_EVENT_TYPES as readonly string[]).includes(
    eventType,
  );
}

function isSupportedEventType(eventType: string) {
  return (
    isSupportedCheckoutEventType(eventType) ||
    isSupportedLifecycleEventType(eventType)
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

function requireSubscriptionObject(event: Stripe.Event) {
  const object = event.data.object as Partial<Stripe.Subscription>;
  if (object.object !== "subscription" || !object.id) {
    processingError("invalid_subscription_object");
  }
  return object as Stripe.Subscription;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return expandableId(invoice.parent?.subscription_details?.subscription);
}

function requireInvoiceObject(event: Stripe.Event) {
  const object = event.data.object as Partial<Stripe.Invoice>;
  if (object.object !== "invoice" || !object.id) {
    processingError("invalid_invoice_object");
  }
  return object as Stripe.Invoice;
}

function supportedEventObjectId(event: Stripe.Event) {
  if (isSupportedCheckoutEventType(event.type)) {
    return requireCheckoutSession(event).id;
  }
  if (event.type.startsWith("invoice.")) {
    return requireInvoiceObject(event).id;
  }
  return requireSubscriptionObject(event).id;
}

function unixSecondsToIso(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    processingError(errorCode);
  }

  return new Date(value * 1_000).toISOString();
}

function validatedStripeSubscriptionStatus(
  value: Stripe.Subscription.Status,
): StripeSubscriptionStatus {
  const supported: readonly StripeSubscriptionStatus[] = [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ];
  if (!supported.includes(value as StripeSubscriptionStatus)) {
    processingError("unsupported_subscription_status");
  }
  return value as StripeSubscriptionStatus;
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

function validatePaidReactivationCheckout(
  subscription: ProSubscription | null,
  session: Stripe.Checkout.Session,
) {
  const proId = session.metadata?.proId;
  const customerId = expandableId(session.customer);
  const newSubscriptionId = expandableId(session.subscription);
  if (
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    !proId ||
    session.metadata?.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    session.metadata?.purpose !== STRIPE_PAID_REACTIVATION_PURPOSE ||
    session.client_reference_id !== proId ||
    !customerId ||
    !newSubscriptionId ||
    !subscription ||
    subscription.proId !== proId ||
    subscription.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    subscription.stripeCustomerId !== customerId ||
    session.livemode !== subscription.stripeLivemode ||
    session.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    session.amount_subtotal !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    session.amount_total !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    session.payment_method_types.length !== 1 ||
    session.payment_method_types[0] !== "card"
  ) {
    processingError("reactivation_checkout_identity_mismatch");
  }

  if (
    subscription.stripeSubscriptionId === newSubscriptionId &&
    subscription.stripeStatus === "active"
  ) {
    return {
      proId,
      customerId,
      newSubscriptionId,
      subscription,
      alreadyActivated: true as const,
    };
  }

  if (
    !subscription.trialConsumedAt ||
    !subscription.stripeSubscriptionId ||
    !subscription.stripePriceId ||
    subscription.stripeStatus !== "canceled" ||
    subscription.pastDueInvoiceId ||
    subscription.reactivationCheckoutSessionId !== session.id ||
    session.metadata?.previousSubscriptionId !==
      subscription.stripeSubscriptionId
  ) {
    processingError("reactivation_local_state_mismatch");
  }

  return {
    proId,
    customerId,
    newSubscriptionId,
    previousSubscriptionId: subscription.stripeSubscriptionId,
    subscription,
    alreadyActivated: false as const,
  };
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
    lastStripeEventCreatedAt: cardBoundAt,
    lastStripeSyncedAt: dependencies.now().toISOString(),
  });
  if (!activated) {
    processingError("subscription_activation_conflict");
  }
}

async function processCompletedPaidReactivationCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  dependencies: StripeWebhookDependencies,
) {
  const proIdFromMetadata = session.metadata?.proId;
  const local = proIdFromMetadata
    ? await dependencies.findProSubscription(proIdFromMetadata)
    : null;
  const validated = validatePaidReactivationCheckout(local, session);
  if (validated.alreadyActivated) {
    return;
  }

  const canonical = await dependencies.retrieveOwnedMonthlyProSubscription({
    proId: validated.proId,
    customerId: validated.customerId,
    subscriptionId: validated.newSubscriptionId,
    expectedLivemode: validated.subscription.stripeLivemode,
    expectedNoTrial: true,
  });
  if (canonical.subscription.status !== "active") {
    processingError("reactivation_subscription_not_active");
  }
  const latestInvoiceId = expandableId(canonical.subscription.latest_invoice);
  if (!latestInvoiceId) {
    processingError("reactivation_invoice_missing");
  }
  const invoice = await dependencies.retrieveOwnedProSubscriptionInvoice({
    proId: validated.proId,
    customerId: validated.customerId,
    subscriptionId: validated.newSubscriptionId,
    invoiceId: latestInvoiceId,
    expectedLivemode: validated.subscription.stripeLivemode,
  });
  if (
    invoice.status !== "paid" ||
    invoice.amount_due !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    invoice.amount_paid !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    invoice.amount_remaining !== 0
  ) {
    processingError("reactivation_invoice_not_paid");
  }
  const paidAt = invoice.status_transitions.paid_at
    ? unixSecondsToIso(
        invoice.status_transitions.paid_at,
        "invalid_reactivation_paid_at",
      )
    : unixSecondsToIso(event.created, "invalid_event_created_at");
  const activated = await dependencies.activatePaidProSubscription({
    proId: validated.proId,
    stripeCustomerId: validated.customerId,
    previousStripeSubscriptionId: validated.previousSubscriptionId,
    reactivationCheckoutSessionId: session.id,
    stripeSubscriptionId: validated.newSubscriptionId,
    stripePriceId: canonical.item.price.id,
    stripeLivemode: canonical.subscription.livemode,
    currentPeriodStartedAt: unixSecondsToIso(
      canonical.item.current_period_start,
      "invalid_current_period_start",
    ),
    currentPeriodEndsAt: unixSecondsToIso(
      canonical.item.current_period_end,
      "invalid_current_period_end",
    ),
    latestInvoiceId,
    paidAt,
    lastStripeEventId: event.id,
    lastStripeEventCreatedAt: unixSecondsToIso(
      event.created,
      "invalid_event_created_at",
    ),
    lastStripeSyncedAt: dependencies.now().toISOString(),
  });
  if (!activated) {
    processingError("reactivation_activation_conflict");
  }
}

function canonicalSubscriptionInput(
  event: Stripe.Event,
  local: ProSubscription,
  canonical: Awaited<
    ReturnType<StripeWebhookDependencies["retrieveOwnedMonthlyProSubscription"]>
  >,
  paymentUpdate:
    | { type: "none" }
    | {
        type: "failed";
        invoiceId: string;
        failedAt: string;
        confirmed?: boolean;
      }
    | { type: "paid"; invoiceId: string; paidAt?: string },
  dependencies: StripeWebhookDependencies,
) {
  const { subscription, item } = canonical;
  const cancellationRequestedAt = subscription.canceled_at
    ? unixSecondsToIso(
        subscription.canceled_at,
        "invalid_cancellation_requested_at",
      )
    : undefined;
  const terminatedAt = subscription.ended_at
    ? unixSecondsToIso(subscription.ended_at, "invalid_terminated_at")
    : undefined;

  if (!local.stripeCustomerId || !local.stripeSubscriptionId) {
    processingError("local_subscription_identity_missing");
  }

  return {
    proId: local.proId,
    stripeCustomerId: local.stripeCustomerId,
    stripeSubscriptionId: local.stripeSubscriptionId,
    stripePriceId: item.price.id,
    stripeStatus: validatedStripeSubscriptionStatus(subscription.status),
    stripeLivemode: subscription.livemode,
    currentPeriodStartedAt: unixSecondsToIso(
      item.current_period_start,
      "invalid_current_period_start",
    ),
    currentPeriodEndsAt: unixSecondsToIso(
      item.current_period_end,
      "invalid_current_period_end",
    ),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancellationRequestedAt,
    terminatedAt,
    paymentUpdate,
    lastStripeEventId: event.id,
    lastStripeEventCreatedAt: unixSecondsToIso(
      event.created,
      "invalid_event_created_at",
    ),
    lastStripeSyncedAt: dependencies.now().toISOString(),
  };
}

async function retrieveCanonicalLifecycleSubscription(
  local: ProSubscription,
  dependencies: StripeWebhookDependencies,
) {
  if (
    !local.stripeCustomerId ||
    !local.stripeSubscriptionId ||
    !local.stripePriceId
  ) {
    processingError("local_subscription_identity_missing");
  }

  return dependencies.retrieveOwnedMonthlyProSubscription({
    proId: local.proId,
    customerId: local.stripeCustomerId,
    subscriptionId: local.stripeSubscriptionId,
    expectedPriceId: local.stripePriceId,
    ...(local.stripeSubscriptionHasTrial === false
      ? { expectedNoTrial: true }
      : { expectedTrialEndsAt: local.trialEndsAt }),
    expectedLivemode: local.stripeLivemode,
    allowHistoricalPriceId: true,
  });
}

async function processSubscriptionLifecycleEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies,
) {
  const eventSubscription = requireSubscriptionObject(event);
  const local = await dependencies.findProSubscriptionByStripeSubscriptionId(
    eventSubscription.id,
  );
  if (!local) {
    const proId = eventSubscription.metadata?.proId;
    if (
      eventSubscription.metadata?.planCode === PRO_SUBSCRIPTION_PLAN_CODE &&
      proId
    ) {
      const current = await dependencies.findProSubscription(proId);
      if (
        current?.stripeSubscriptionId &&
        current.stripeSubscriptionId !== eventSubscription.id
      ) {
        return;
      }
      processingError("local_subscription_not_found");
    }
    return;
  }
  const canonical = await retrieveCanonicalLifecycleSubscription(
    local,
    dependencies,
  );
  if (
    event.type === "customer.subscription.deleted" &&
    canonical.subscription.status !== "canceled"
  ) {
    processingError("subscription_not_terminated");
  }

  let paymentUpdate:
    | { type: "none" }
    | {
        type: "failed";
        invoiceId: string;
        failedAt: string;
        confirmed?: boolean;
      } = {
    type: "none",
  };
  if (
    ["past_due", "unpaid", "canceled"].includes(canonical.subscription.status)
  ) {
    const latestInvoiceId = expandableId(canonical.subscription.latest_invoice);
    if (latestInvoiceId) {
      const invoice = await dependencies.retrieveOwnedProSubscriptionInvoice({
        proId: local.proId,
        customerId: local.stripeCustomerId!,
        subscriptionId: local.stripeSubscriptionId!,
        invoiceId: latestInvoiceId,
        expectedLivemode: local.stripeLivemode,
      });
      if (invoice.status === "open" && invoice.amount_remaining > 0) {
        const previousStatus = (
          event.data.previous_attributes as
            | Partial<Stripe.Subscription>
            | undefined
        )?.status;
        const isSignedPastDueTransition =
          event.type === "customer.subscription.updated" &&
          ["past_due", "unpaid"].includes(canonical.subscription.status) &&
          Boolean(previousStatus) &&
          !["past_due", "unpaid"].includes(previousStatus!);
        const invoiceCreated = invoice.created;
        const hasValidInvoiceCreated =
          Number.isSafeInteger(invoiceCreated) && invoiceCreated >= 0;
        if (isSignedPastDueTransition || hasValidInvoiceCreated) {
          // A later cancel/update must never restart the grace clock. When the
          // signed transition is unavailable, the invoice creation time is a
          // conservative Stripe-owned lower bound for the first attempt.
          const failureUnix = isSignedPastDueTransition
            ? event.created
            : invoiceCreated;
          paymentUpdate = {
            type: "failed",
            invoiceId: invoice.id,
            failedAt: unixSecondsToIso(
              failureUnix,
              "invalid_invoice_failure_time",
            ),
            confirmed: false,
          };
        }
      }
    }
  }

  await dependencies.syncProSubscriptionLifecycle(
    canonicalSubscriptionInput(
      event,
      local,
      canonical,
      paymentUpdate,
      dependencies,
    ),
  );
}

async function processInvoiceLifecycleEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies,
) {
  const eventInvoice = requireInvoiceObject(event);
  const subscriptionId = invoiceSubscriptionId(eventInvoice);
  if (!subscriptionId) {
    if (
      eventInvoice.parent?.subscription_details?.metadata?.planCode ===
        PRO_SUBSCRIPTION_PLAN_CODE &&
      eventInvoice.parent.subscription_details.metadata?.proId
    ) {
      processingError("invoice_subscription_missing");
    }
    return;
  }
  const local =
    await dependencies.findProSubscriptionByStripeSubscriptionId(
      subscriptionId,
    );
  if (
    !local?.stripeCustomerId ||
    !local.stripeSubscriptionId ||
    !local.stripePriceId
  ) {
    const proId = eventInvoice.parent?.subscription_details?.metadata?.proId;
    if (
      eventInvoice.parent?.subscription_details?.metadata?.planCode ===
        PRO_SUBSCRIPTION_PLAN_CODE &&
      proId
    ) {
      const current = await dependencies.findProSubscription(proId);
      if (
        current?.stripeSubscriptionId &&
        current.stripeSubscriptionId !== subscriptionId
      ) {
        return;
      }
      processingError("local_subscription_not_found");
    }
    return;
  }

  const invoice = await dependencies.retrieveOwnedProSubscriptionInvoice({
    proId: local.proId,
    customerId: local.stripeCustomerId,
    subscriptionId: local.stripeSubscriptionId,
    invoiceId: eventInvoice.id,
    expectedLivemode: local.stripeLivemode,
  });
  const canonical = await retrieveCanonicalLifecycleSubscription(
    local,
    dependencies,
  );
  const eventCreatedAt = unixSecondsToIso(
    event.created,
    "invalid_event_created_at",
  );
  const canonicalLatestInvoiceId = expandableId(
    canonical.subscription.latest_invoice,
  );
  const isCurrentOrTrackedInvoice =
    !canonicalLatestInvoiceId ||
    canonicalLatestInvoiceId === invoice.id ||
    local.pastDueInvoiceId === invoice.id;
  const isSignedPaymentFailure = [
    "invoice.payment_failed",
    "invoice.payment_action_required",
  ].includes(event.type);
  if (
    isSignedPaymentFailure &&
    (!Number.isSafeInteger(eventInvoice.attempt_count) ||
      eventInvoice.attempt_count < 1)
  ) {
    processingError("invalid_invoice_attempt_count");
  }
  const isFirstPaymentAttempt = eventInvoice.attempt_count === 1;
  const paymentUpdate =
    invoice.status === "paid"
      ? {
          type: "paid" as const,
          invoiceId: invoice.id,
          ...(invoice.status_transitions.paid_at
            ? {
                paidAt: unixSecondsToIso(
                  invoice.status_transitions.paid_at,
                  "invalid_invoice_paid_at",
                ),
              }
            : {}),
        }
      : isSignedPaymentFailure &&
          invoice.status === "open" &&
          invoice.amount_remaining > 0 &&
          isCurrentOrTrackedInvoice &&
          ["past_due", "unpaid", "canceled"].includes(
            canonical.subscription.status,
          )
        ? {
            type: "failed" as const,
            invoiceId: invoice.id,
            failedAt: isFirstPaymentAttempt
              ? eventCreatedAt
              : unixSecondsToIso(
                  invoice.created,
                  "invalid_invoice_failure_time",
                ),
            confirmed: isFirstPaymentAttempt,
          }
        : { type: "none" as const };

  await dependencies.syncProSubscriptionLifecycle(
    canonicalSubscriptionInput(
      event,
      local,
      canonical,
      paymentUpdate,
      dependencies,
    ),
  );
}

async function processClaimedEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies,
) {
  if (isSupportedLifecycleEventType(event.type)) {
    if (event.type.startsWith("invoice.")) {
      await processInvoiceLifecycleEvent(event, dependencies);
    } else {
      await processSubscriptionLifecycleEvent(event, dependencies);
    }
    return;
  }

  const session = requireCheckoutSession(event);
  const purpose = session.metadata?.purpose;
  if (
    purpose !== STRIPE_CARD_SETUP_PURPOSE &&
    purpose !== STRIPE_PAID_REACTIVATION_PURPOSE
  ) {
    return;
  }
  if (event.type === "checkout.session.completed") {
    if (purpose === STRIPE_PAID_REACTIVATION_PURPOSE) {
      await processCompletedPaidReactivationCheckout(
        event,
        session,
        dependencies,
      );
    } else {
      await processCompletedCheckout(event, session, dependencies);
    }
  } else if (purpose === STRIPE_PAID_REACTIVATION_PURPOSE) {
    await dependencies.clearProSubscriptionReactivationCheckoutSession(
      session.id,
    );
  } else {
    await dependencies.clearProSubscriptionCheckoutSession(session.id);
  }
}

/**
 * Applies card setup and the owned monthly-plan lifecycle. Every lifecycle
 * handler re-fetches canonical Stripe state before an idempotent local write.
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookDependencies = defaultDependencies,
): Promise<StripeWebhookProcessingResult> {
  if (!isSupportedEventType(event.type)) {
    return { status: 200, code: "event_ignored" };
  }

  let objectId: string;
  try {
    objectId = supportedEventObjectId(event);
  } catch {
    return { status: 500, code: "event_processing_failed" };
  }

  const leaseId = dependencies.randomUUID();
  let claim: StripeWebhookClaim;
  try {
    claim = await dependencies.claimStripeWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      objectId,
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
    await processClaimedEvent(event, dependencies);
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
        : "stripe_lifecycle_processing_failed";
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
