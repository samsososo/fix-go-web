import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  processStripeWebhookEvent,
  type StripeWebhookDependencies,
} from "@/lib/stripe-webhook";
import type { ProSubscription } from "@/lib/subscription-policy";

const PRO_ID = "user_pro_webhook";
const CUSTOMER_ID = "cus_webhook_test";
const CHECKOUT_SESSION_ID = "cs_test_webhook";
const SETUP_INTENT_ID = "seti_webhook_test";
const PAYMENT_METHOD_ID = "pm_webhook_test";
const SUBSCRIPTION_ID = "sub_webhook_test";
const PRICE_ID = "price_webhook_test";
const CARD_BOUND_AT = "2026-08-09T12:00:00.000Z";
const TRIAL_ENDS_AT = "2026-11-09T12:00:00.000Z";
const CARD_BOUND_UNIX = Date.parse(CARD_BOUND_AT) / 1_000;
const TRIAL_END_UNIX = Date.parse(TRIAL_ENDS_AT) / 1_000;

function localSubscription(
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return {
    proId: PRO_ID,
    planCode: "pro_monthly_v1",
    amountMinor: 10_000,
    currency: "hkd",
    interval: "month",
    accessStatus: "setup_required",
    stripeCustomerId: CUSTOMER_ID,
    checkoutSessionId: CHECKOUT_SESSION_ID,
    checkoutSessionExpiresAt: "2026-08-09T13:00:00.000Z",
    cancelAtPeriodEnd: false,
    createdAt: "2026-08-09T11:00:00.000Z",
    updatedAt: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: CHECKOUT_SESSION_ID,
    object: "checkout.session",
    mode: "setup",
    client_reference_id: PRO_ID,
    customer: CUSTOMER_ID,
    metadata: {
      proId: PRO_ID,
      planCode: "pro_monthly_v1",
      purpose: "pro_subscription_card_setup",
    },
    setup_intent: SETUP_INTENT_ID,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function stripeEvent(
  type: Stripe.Event.Type,
  object: Stripe.Event.Data.Object,
  overrides: Partial<Stripe.Event> = {},
) {
  return {
    id: "evt_webhook_test",
    object: "event",
    api_version: null,
    created: CARD_BOUND_UNIX,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...overrides,
  } as Stripe.Event;
}

function stripeSubscription() {
  return {
    id: SUBSCRIPTION_ID,
    object: "subscription",
    customer: CUSTOMER_ID,
    livemode: false,
    metadata: {
      proId: PRO_ID,
      planCode: "pro_monthly_v1",
    },
    status: "trialing",
    trial_end: TRIAL_END_UNIX,
    items: {
      data: [
        {
          current_period_start: CARD_BOUND_UNIX,
          current_period_end: TRIAL_END_UNIX,
          price: { id: PRICE_ID },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function consumedSubscription(overrides: Partial<ProSubscription> = {}) {
  return localSubscription({
    stripeSetupIntentId: SETUP_INTENT_ID,
    stripePaymentMethodId: PAYMENT_METHOD_ID,
    cardBoundAt: CARD_BOUND_AT,
    trialConsumedAt: CARD_BOUND_AT,
    trialGrantedAt: CARD_BOUND_AT,
    trialStartedAt: CARD_BOUND_AT,
    trialEndsAt: TRIAL_ENDS_AT,
    ...overrides,
  });
}

function makeDependencies(
  overrides: Partial<StripeWebhookDependencies> = {},
): StripeWebhookDependencies {
  const activate: StripeWebhookDependencies["activateProTrialSubscription"] =
    vi.fn(async (input) =>
      consumedSubscription({
        accessStatus: input.stripeStatus,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        stripeStatus: input.stripeStatus,
      }),
    );
  const claim: StripeWebhookDependencies["claimStripeWebhookEvent"] = vi.fn(
    async (input) => ({ status: "claimed", leaseId: input.leaseId }) as const,
  );
  const clear: StripeWebhookDependencies["clearProSubscriptionCheckoutSession"] =
    vi.fn(async () => true);
  const complete: StripeWebhookDependencies["completeStripeWebhookEvent"] =
    vi.fn(async () => true);
  const consume: StripeWebhookDependencies["consumeProLifetimeTrial"] = vi.fn(
    async () => ({
      status: "consumed" as const,
      subscription: consumedSubscription(),
    }),
  );
  const create: StripeWebhookDependencies["createMonthlyProSubscription"] =
    vi.fn(
      async () =>
        stripeSubscription() as Awaited<
          ReturnType<StripeWebhookDependencies["createMonthlyProSubscription"]>
        >,
    );
  const fail: StripeWebhookDependencies["failStripeWebhookEvent"] = vi.fn(
    async () => true,
  );
  const findExisting: StripeWebhookDependencies["findExistingMonthlyProSubscription"] =
    vi.fn(async () => null);
  const find: StripeWebhookDependencies["findProSubscription"] = vi.fn(
    async () => localSubscription(),
  );
  const retrieve: StripeWebhookDependencies["retrieveSucceededCardSetup"] =
    vi.fn(async () => ({
      setupIntent: { id: SETUP_INTENT_ID } as Stripe.SetupIntent,
      paymentMethod: { id: PAYMENT_METHOD_ID } as Stripe.PaymentMethod,
      paymentMethodId: PAYMENT_METHOD_ID,
    }));
  const setDefault: StripeWebhookDependencies["setCustomerDefaultPaymentMethod"] =
    vi.fn(
      async () =>
        ({ id: CUSTOMER_ID }) as Awaited<
          ReturnType<
            StripeWebhookDependencies["setCustomerDefaultPaymentMethod"]
          >
        >,
    );

  return {
    activateProTrialSubscription: activate,
    claimStripeWebhookEvent: claim,
    clearProSubscriptionCheckoutSession: clear,
    completeStripeWebhookEvent: complete,
    consumeProLifetimeTrial: consume,
    createMonthlyProSubscription: create,
    failStripeWebhookEvent: fail,
    findExistingMonthlyProSubscription: findExisting,
    findProSubscription: find,
    now: () => new Date("2026-08-09T12:00:01.000Z"),
    randomUUID: () => "lease_webhook_test",
    retrieveSucceededCardSetup: retrieve,
    setCustomerDefaultPaymentMethod: setDefault,
    ...overrides,
  };
}

describe("Stripe Checkout webhook processing", () => {
  it("ignores events owned by later billing lifecycle steps without claiming", async () => {
    const dependencies = makeDependencies();
    const event = stripeEvent(
      "customer.subscription.updated",
      stripeSubscription(),
    );

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 200, code: "event_ignored" });
    expect(dependencies.claimStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns a retryable response while another worker owns the event", async () => {
    const dependencies = makeDependencies({
      claimStripeWebhookEvent: vi.fn(async () => ({ status: "busy" }) as const),
    });
    const event = stripeEvent("checkout.session.completed", checkoutSession());

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 409, code: "event_busy" });
    expect(dependencies.findProSubscription).not.toHaveBeenCalled();
  });

  it("starts the one lifetime trial only after the card setup succeeds", async () => {
    const dependencies = makeDependencies();
    const event = stripeEvent("checkout.session.completed", checkoutSession());

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(dependencies.retrieveSucceededCardSetup).toHaveBeenCalledWith({
      proId: PRO_ID,
      customerId: CUSTOMER_ID,
      setupIntentId: SETUP_INTENT_ID,
    });
    expect(dependencies.setCustomerDefaultPaymentMethod).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });
    expect(dependencies.consumeProLifetimeTrial).toHaveBeenCalledWith({
      proId: PRO_ID,
      checkoutSessionId: CHECKOUT_SESSION_ID,
      stripeCustomerId: CUSTOMER_ID,
      stripeSetupIntentId: SETUP_INTENT_ID,
      stripePaymentMethodId: PAYMENT_METHOD_ID,
      cardBoundAt: CARD_BOUND_AT,
      trialEndsAt: TRIAL_ENDS_AT,
    });
    expect(dependencies.createMonthlyProSubscription).toHaveBeenCalledWith({
      proId: PRO_ID,
      customerId: CUSTOMER_ID,
      trialEndUnix: TRIAL_END_UNIX,
      idempotencyKey: `pro-subscription:${PRO_ID}:lifetime`,
    });
    expect(dependencies.activateProTrialSubscription).toHaveBeenCalledWith({
      proId: PRO_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      stripeStatus: "trialing",
      stripeLivemode: false,
      currentPeriodStartedAt: CARD_BOUND_AT,
      currentPeriodEndsAt: TRIAL_ENDS_AT,
      lastStripeEventId: "evt_webhook_test",
      lastStripeSyncedAt: "2026-08-09T12:00:01.000Z",
    });
    expect(dependencies.completeStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_webhook_test",
      "lease_webhook_test",
    );
    expect(dependencies.failStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("resumes subscription creation after a retry interrupted after trial consumption", async () => {
    const existing = consumedSubscription();
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => existing),
      consumeProLifetimeTrial: vi.fn(async () => ({
        status: "existing" as const,
        subscription: existing,
      })),
    });
    const event = stripeEvent("checkout.session.completed", checkoutSession());

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(dependencies.createMonthlyProSubscription).toHaveBeenCalledTimes(1);
    expect(dependencies.activateProTrialSubscription).toHaveBeenCalledTimes(1);
  });

  it("adopts an existing remote subscription after a lost local activation write", async () => {
    const existingLocal = consumedSubscription();
    const existingRemote = stripeSubscription();
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => existingLocal),
      consumeProLifetimeTrial: vi.fn(async () => ({
        status: "existing" as const,
        subscription: existingLocal,
      })),
      findExistingMonthlyProSubscription: vi.fn(async () => existingRemote),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent("checkout.session.completed", checkoutSession()),
        dependencies,
      ),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(dependencies.createMonthlyProSubscription).not.toHaveBeenCalled();
    expect(dependencies.activateProTrialSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: SUBSCRIPTION_ID,
      }),
    );
  });

  it("does not create a second subscription when a retry finds activation complete", async () => {
    const existing = consumedSubscription({
      accessStatus: "trialing",
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      stripeStatus: "trialing",
    });
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => existing),
      consumeProLifetimeTrial: vi.fn(async () => ({
        status: "existing" as const,
        subscription: existing,
      })),
    });

    await processStripeWebhookEvent(
      stripeEvent("checkout.session.completed", checkoutSession()),
      dependencies,
    );

    expect(dependencies.createMonthlyProSubscription).not.toHaveBeenCalled();
    expect(dependencies.activateProTrialSubscription).not.toHaveBeenCalled();
    expect(dependencies.completeStripeWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("does not reapply an old card for a duplicate logical event after activation", async () => {
    const existing = consumedSubscription({
      accessStatus: "trialing",
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      stripeStatus: "trialing",
    });
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => existing),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent("checkout.session.completed", checkoutSession(), {
          id: "evt_same_checkout_new_delivery",
        }),
        dependencies,
      ),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(dependencies.retrieveSucceededCardSetup).not.toHaveBeenCalled();
    expect(dependencies.setCustomerDefaultPaymentMethod).not.toHaveBeenCalled();
    expect(dependencies.consumeProLifetimeTrial).not.toHaveBeenCalled();
    expect(dependencies.createMonthlyProSubscription).not.toHaveBeenCalled();
  });

  it("fails safely when signed Checkout identity does not match local state", async () => {
    const dependencies = makeDependencies();
    const event = stripeEvent(
      "checkout.session.completed",
      checkoutSession({
        metadata: {
          proId: PRO_ID,
          planCode: "unexpected_plan",
        },
      }),
    );

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 500, code: "event_processing_failed" });
    expect(dependencies.retrieveSucceededCardSetup).not.toHaveBeenCalled();
    expect(dependencies.failStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_webhook_test",
      "lease_webhook_test",
      "checkout_identity_mismatch",
    );
  });

  it("clears an expired setup session and completes the event idempotently", async () => {
    const dependencies = makeDependencies();
    const event = stripeEvent("checkout.session.expired", checkoutSession());

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(
      dependencies.clearProSubscriptionCheckoutSession,
    ).toHaveBeenCalledWith(CHECKOUT_SESSION_ID);
    expect(dependencies.consumeProLifetimeTrial).not.toHaveBeenCalled();
    expect(dependencies.completeStripeWebhookEvent).toHaveBeenCalledTimes(1);
  });
});
