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
const NEW_SUBSCRIPTION_ID = "sub_webhook_reactivated";
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

function paidReactivationCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
) {
  return {
    id: "cs_reactivation_test",
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    livemode: false,
    currency: "hkd",
    amount_subtotal: 10_000,
    amount_total: 10_000,
    payment_method_types: ["card"],
    client_reference_id: PRO_ID,
    customer: CUSTOMER_ID,
    subscription: NEW_SUBSCRIPTION_ID,
    metadata: {
      proId: PRO_ID,
      planCode: "pro_monthly_v1",
      purpose: "pro_subscription_paid_reactivation",
      previousSubscriptionId: SUBSCRIPTION_ID,
    },
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
    data: {
      object,
      ...(type === "customer.subscription.updated"
        ? { previous_attributes: { status: "active" } }
        : {}),
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...overrides,
  } as Stripe.Event;
}

function stripeSubscription(overrides: Partial<Stripe.Subscription> = {}) {
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
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_end: TRIAL_END_UNIX,
    latest_invoice: "in_webhook_test",
    items: {
      data: [
        {
          current_period_start: CARD_BOUND_UNIX,
          current_period_end: TRIAL_END_UNIX,
          price: { id: PRICE_ID },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function lifecycleSubscription(
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return consumedSubscription({
    accessStatus: "active",
    stripeSubscriptionId: SUBSCRIPTION_ID,
    stripePriceId: PRICE_ID,
    stripeStatus: "active",
    stripeLivemode: false,
    currentPeriodStartedAt: CARD_BOUND_AT,
    currentPeriodEndsAt: TRIAL_ENDS_AT,
    ...overrides,
  });
}

function stripeInvoice(overrides: Partial<Stripe.Invoice> = {}) {
  return {
    id: "in_webhook_test",
    object: "invoice",
    created: CARD_BOUND_UNIX,
    customer: CUSTOMER_ID,
    collection_method: "charge_automatically",
    currency: "hkd",
    livemode: false,
    status: "open",
    attempt_count: 1,
    amount_remaining: 10_000,
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: {
        subscription: SUBSCRIPTION_ID,
        metadata: {
          proId: PRO_ID,
          planCode: "pro_monthly_v1",
        },
      },
    },
    status_transitions: { paid_at: null },
    ...overrides,
  } as unknown as Stripe.Invoice;
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
  const activatePaid: StripeWebhookDependencies["activatePaidProSubscription"] =
    vi.fn(async (input) =>
      consumedSubscription({
        accessStatus: "active",
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        stripeStatus: "active",
      }),
    );
  const claim: StripeWebhookDependencies["claimStripeWebhookEvent"] = vi.fn(
    async (input) => ({ status: "claimed", leaseId: input.leaseId }) as const,
  );
  const clear: StripeWebhookDependencies["clearProSubscriptionCheckoutSession"] =
    vi.fn(async () => true);
  const clearReactivation: StripeWebhookDependencies["clearProSubscriptionReactivationCheckoutSession"] =
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
  const findBySubscription: StripeWebhookDependencies["findProSubscriptionByStripeSubscriptionId"] =
    vi.fn(async () => lifecycleSubscription());
  const matchOpenLeads: StripeWebhookDependencies["matchOpenLeadsForPro"] =
    vi.fn(async () => 0);
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
  const retrieveSubscription: StripeWebhookDependencies["retrieveOwnedMonthlyProSubscription"] =
    vi.fn(async () => {
      const subscription = stripeSubscription({ status: "active" });
      return {
        subscription,
        item: subscription.items.data[0],
      } as Awaited<
        ReturnType<
          StripeWebhookDependencies["retrieveOwnedMonthlyProSubscription"]
        >
      >;
    });
  const retrieveInvoice: StripeWebhookDependencies["retrieveOwnedProSubscriptionInvoice"] =
    vi.fn(async () => stripeInvoice());
  const sync: StripeWebhookDependencies["syncProSubscriptionLifecycle"] = vi.fn(
    async () => lifecycleSubscription(),
  );

  return {
    activatePaidProSubscription: activatePaid,
    activateProTrialSubscription: activate,
    claimStripeWebhookEvent: claim,
    clearProSubscriptionCheckoutSession: clear,
    clearProSubscriptionReactivationCheckoutSession: clearReactivation,
    completeStripeWebhookEvent: complete,
    consumeProLifetimeTrial: consume,
    createMonthlyProSubscription: create,
    failStripeWebhookEvent: fail,
    findExistingMonthlyProSubscription: findExisting,
    findProSubscription: find,
    findProSubscriptionByStripeSubscriptionId: findBySubscription,
    matchOpenLeadsForPro: matchOpenLeads,
    now: () => new Date("2026-08-09T12:00:01.000Z"),
    randomUUID: () => "lease_webhook_test",
    retrieveSucceededCardSetup: retrieve,
    retrieveOwnedMonthlyProSubscription: retrieveSubscription,
    retrieveOwnedProSubscriptionInvoice: retrieveInvoice,
    setCustomerDefaultPaymentMethod: setDefault,
    syncProSubscriptionLifecycle: sync,
    ...overrides,
  };
}

describe("Stripe Checkout webhook processing", () => {
  it("ignores unrelated Stripe events without claiming", async () => {
    const dependencies = makeDependencies();
    const event = stripeEvent("setup_intent.succeeded", stripeSubscription());

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
      lastStripeEventCreatedAt: CARD_BOUND_AT,
      lastStripeSyncedAt: "2026-08-09T12:00:01.000Z",
    });
    expect(dependencies.matchOpenLeadsForPro).toHaveBeenCalledWith(PRO_ID);
    expect(dependencies.completeStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_webhook_test",
      "lease_webhook_test",
    );
    expect(dependencies.failStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("reactivates a terminated pro only after a full HK$100 Checkout payment", async () => {
    const terminated = consumedSubscription({
      accessStatus: "terminated",
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      stripeStatus: "canceled",
      stripeLivemode: false,
      reactivationCheckoutSessionId: "cs_reactivation_test",
    });
    const remote = stripeSubscription({
      id: NEW_SUBSCRIPTION_ID,
      status: "active",
      trial_end: null,
      latest_invoice: "in_reactivation_paid",
    });
    const paidInvoice = stripeInvoice({
      id: "in_reactivation_paid",
      status: "paid",
      amount_due: 10_000,
      amount_paid: 10_000,
      amount_remaining: 0,
      parent: {
        type: "subscription_details",
        quote_details: null,
        subscription_details: {
          subscription: NEW_SUBSCRIPTION_ID,
          metadata: {
            proId: PRO_ID,
            planCode: "pro_monthly_v1",
          },
        },
      },
      status_transitions: { paid_at: CARD_BOUND_UNIX } as never,
    });
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => terminated),
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => paidInvoice),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent(
          "checkout.session.completed",
          paidReactivationCheckoutSession(),
        ),
        dependencies,
      ),
    ).resolves.toEqual({ status: 200, code: "event_processed" });

    expect(
      dependencies.retrieveOwnedMonthlyProSubscription,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: NEW_SUBSCRIPTION_ID,
        expectedNoTrial: true,
      }),
    );
    expect(dependencies.activatePaidProSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStripeSubscriptionId: SUBSCRIPTION_ID,
        stripeSubscriptionId: NEW_SUBSCRIPTION_ID,
        latestInvoiceId: "in_reactivation_paid",
        paidAt: CARD_BOUND_AT,
      }),
    );
  });

  it("does not reactivate when the immediate HK$100 invoice is unpaid", async () => {
    const terminated = consumedSubscription({
      accessStatus: "terminated",
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      stripeStatus: "canceled",
      stripeLivemode: false,
      reactivationCheckoutSessionId: "cs_reactivation_test",
    });
    const remote = stripeSubscription({
      id: NEW_SUBSCRIPTION_ID,
      status: "active",
      trial_end: null,
      latest_invoice: "in_reactivation_paid",
    });
    const dependencies = makeDependencies({
      findProSubscription: vi.fn(async () => terminated),
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () =>
        stripeInvoice({
          id: "in_reactivation_paid",
          parent: {
            type: "subscription_details",
            quote_details: null,
            subscription_details: {
              subscription: NEW_SUBSCRIPTION_ID,
              metadata: {
                proId: PRO_ID,
                planCode: "pro_monthly_v1",
              },
            },
          },
        }),
      ),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent(
          "checkout.session.completed",
          paidReactivationCheckoutSession(),
        ),
        dependencies,
      ),
    ).resolves.toEqual({ status: 500, code: "event_processing_failed" });
    expect(dependencies.activatePaidProSubscription).not.toHaveBeenCalled();
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
          purpose: "pro_subscription_card_setup",
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

  it("starts grace from the signed first payment failure using canonical Stripe state", async () => {
    const remote = stripeSubscription({ status: "past_due" });
    const failedInvoice = stripeInvoice({
      status_transitions: {
        finalized_at: CARD_BOUND_UNIX - 3_600,
        paid_at: null,
      } as never,
    });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => failedInvoice),
    });
    const event = stripeEvent("invoice.payment_failed", failedInvoice, {
      id: "evt_payment_failed",
    });

    await expect(
      processStripeWebhookEvent(event, dependencies),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        proId: PRO_ID,
        stripeStatus: "past_due",
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_webhook_test",
          failedAt: CARD_BOUND_AT,
          confirmed: true,
        },
        lastStripeEventId: "evt_payment_failed",
      }),
    );
  });

  it("keeps a later retry provisional when it arrives before the first failure event", async () => {
    const invoiceCreated = CARD_BOUND_UNIX - 3_600;
    const remote = stripeSubscription({ status: "past_due" });
    const retriedInvoice = stripeInvoice({
      attempt_count: 2,
      created: invoiceCreated,
    });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => retriedInvoice),
    });

    await processStripeWebhookEvent(
      stripeEvent("invoice.payment_failed", retriedInvoice, {
        id: "evt_payment_retry_before_first_delivery",
      }),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_webhook_test",
          failedAt: new Date(invoiceCreated * 1_000).toISOString(),
          confirmed: false,
        },
      }),
    );
  });

  it("treats payment action required as an unsuccessful collection attempt", async () => {
    const remote = stripeSubscription({ status: "past_due" });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("invoice.payment_action_required", stripeInvoice()),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentUpdate: expect.objectContaining({ type: "failed" }),
      }),
    );
  });

  it("does not treat invoice finalization failure as a failed card charge", async () => {
    const dependencies = makeDependencies();

    await processStripeWebhookEvent(
      stripeEvent("invoice.finalization_failed", stripeInvoice()),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentUpdate: { type: "none" },
      }),
    );
  });

  it("does not let an old invoice finalization failure suspend a newer period", async () => {
    const remote = stripeSubscription({ latest_invoice: "in_current_period" });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("invoice.finalization_failed", stripeInvoice()),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ paymentUpdate: { type: "none" } }),
    );
  });

  it("acknowledges unrelated lifecycle objects without retrying forever", async () => {
    const unrelated = stripeSubscription({
      id: "sub_unrelated",
      metadata: {},
    });
    const dependencies = makeDependencies({
      findProSubscriptionByStripeSubscriptionId: vi.fn(async () => null),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent("customer.subscription.updated", unrelated),
        dependencies,
      ),
    ).resolves.toEqual({ status: 200, code: "event_processed" });
    expect(
      dependencies.retrieveOwnedMonthlyProSubscription,
    ).not.toHaveBeenCalled();
    expect(dependencies.failStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("keeps a zero-dollar trial invoice paid event in trialing state", async () => {
    const remote = stripeSubscription({ status: "trialing" });
    const paidInvoice = stripeInvoice({
      status: "paid",
      amount_due: 0,
      amount_paid: 0,
      amount_remaining: 0,
      status_transitions: { paid_at: CARD_BOUND_UNIX } as never,
    });
    const dependencies = makeDependencies({
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => paidInvoice),
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("invoice.paid", paidInvoice),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "trialing",
        paymentUpdate: expect.objectContaining({ type: "paid" }),
      }),
    );
  });

  it("synchronizes period-end cancellation from canonical subscription state", async () => {
    const remote = stripeSubscription({
      status: "active",
      cancel_at_period_end: true,
      canceled_at: CARD_BOUND_UNIX,
    });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("customer.subscription.updated", remote),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "active",
        cancelAtPeriodEnd: true,
        cancellationRequestedAt: CARD_BOUND_AT,
        paymentUpdate: { type: "none" },
      }),
    );
  });

  it("validates later lifecycle events for a paid reactivation as no-trial", async () => {
    const local = lifecycleSubscription({
      stripeSubscriptionHasTrial: false,
      trialEndsAt: TRIAL_ENDS_AT,
    });
    const remote = stripeSubscription({
      status: "active",
      trial_start: null,
      trial_end: null,
    });
    const dependencies = makeDependencies({
      findProSubscriptionByStripeSubscriptionId: vi.fn(async () => local),
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("customer.subscription.updated", remote),
      dependencies,
    );

    expect(
      dependencies.retrieveOwnedMonthlyProSubscription,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedNoTrial: true,
        allowHistoricalPriceId: true,
      }),
    );
    expect(
      vi.mocked(dependencies.retrieveOwnedMonthlyProSubscription).mock
        .calls[0]?.[0],
    ).not.toHaveProperty("expectedTrialEndsAt");
  });

  it("starts grace from a past-due subscription event even when it arrives before the invoice event", async () => {
    const remote = stripeSubscription({ status: "past_due" });
    const dueInvoice = stripeInvoice();
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => dueInvoice),
    });

    await processStripeWebhookEvent(
      stripeEvent("customer.subscription.updated", remote),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "past_due",
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_webhook_test",
          failedAt: CARD_BOUND_AT,
          confirmed: false,
        },
      }),
    );
  });

  it("does not restart grace from a later cancellation with the same open invoice", async () => {
    const invoiceCreated = CARD_BOUND_UNIX - 10 * 24 * 60 * 60;
    const remote = stripeSubscription({
      status: "canceled",
      ended_at: CARD_BOUND_UNIX,
    });
    const dueInvoice = stripeInvoice({ created: invoiceCreated });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
      retrieveOwnedProSubscriptionInvoice: vi.fn(async () => dueInvoice),
    });

    await processStripeWebhookEvent(
      stripeEvent("customer.subscription.deleted", remote),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_webhook_test",
          failedAt: new Date(invoiceCreated * 1_000).toISOString(),
          confirmed: false,
        },
      }),
    );
  });

  it("terminates only after canonical Stripe deletion", async () => {
    const remote = stripeSubscription({
      status: "canceled",
      ended_at: CARD_BOUND_UNIX,
    });
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => ({
        subscription: remote,
        item: remote.items.data[0],
      })) as never,
    });

    await processStripeWebhookEvent(
      stripeEvent("customer.subscription.deleted", remote),
      dependencies,
    );

    expect(dependencies.syncProSubscriptionLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeStatus: "canceled",
        terminatedAt: CARD_BOUND_AT,
      }),
    );
  });

  it("returns a retryable failure when canonical lifecycle ownership is rejected", async () => {
    const dependencies = makeDependencies({
      retrieveOwnedMonthlyProSubscription: vi.fn(async () => {
        throw new Error("ownership mismatch");
      }),
    });

    await expect(
      processStripeWebhookEvent(
        stripeEvent(
          "customer.subscription.updated",
          stripeSubscription({ status: "active" }),
        ),
        dependencies,
      ),
    ).resolves.toEqual({ status: 500, code: "event_processing_failed" });
    expect(dependencies.syncProSubscriptionLifecycle).not.toHaveBeenCalled();
    expect(dependencies.failStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_webhook_test",
      "lease_webhook_test",
      "stripe_lifecycle_processing_failed",
    );
  });
});
