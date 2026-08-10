import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";

import { env } from "@/lib/env";
import {
  activatePaidProSubscription,
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  completeProSubscriptionCheckoutReservation,
  completeProSubscriptionReactivationCheckoutReservation,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  ensureProSubscription,
  failStripeWebhookEvent,
  findProSubscription,
  listProSubscriptions,
  reserveProSubscriptionCheckout,
  reserveProSubscriptionReactivationCheckout,
  setProStripeCustomer,
  syncProSubscriptionLifecycle,
  withDb,
} from "@/lib/mock/db";
import { createUserAccount } from "@/lib/mock/repositories";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

async function activateLifecycleTestSubscription() {
  const proId = "user_pro_chan";
  await ensureProSubscription(proId);
  await setProStripeCustomer(proId, "cus_lifecycle_test");
  await reserveProSubscriptionCheckout({
    proId,
    reservationId: "reservation_lifecycle",
    reservationExpiresAt: "2099-08-09T13:00:00.000Z",
  });
  await completeProSubscriptionCheckoutReservation({
    proId,
    reservationId: "reservation_lifecycle",
    checkoutSessionId: "cs_lifecycle_test",
    checkoutSessionExpiresAt: "2099-08-09T14:00:00.000Z",
    stripeCustomerId: "cus_lifecycle_test",
  });
  await consumeProLifetimeTrial({
    proId,
    checkoutSessionId: "cs_lifecycle_test",
    stripeCustomerId: "cus_lifecycle_test",
    stripeSetupIntentId: "seti_lifecycle_test",
    stripePaymentMethodId: "pm_lifecycle_test",
    cardBoundAt: "2026-01-31T02:30:00.000Z",
    trialEndsAt: "2026-04-30T02:30:00.000Z",
  });
  await activateProTrialSubscription({
    proId,
    stripeSubscriptionId: "sub_lifecycle_test",
    stripePriceId: "price_lifecycle_test",
    stripeStatus: "active",
    stripeLivemode: false,
    currentPeriodStartedAt: "2026-08-01T00:00:00.000Z",
    currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
    lastStripeEventId: "evt_lifecycle_activation",
    lastStripeEventCreatedAt: "2026-04-30T02:30:00.000Z",
    lastStripeSyncedAt: "2026-08-01T00:00:01.000Z",
  });
  return proId;
}

function lifecycleSyncInput(
  overrides: Partial<Parameters<typeof syncProSubscriptionLifecycle>[0]> = {},
): Parameters<typeof syncProSubscriptionLifecycle>[0] {
  return {
    proId: "user_pro_chan",
    stripeCustomerId: "cus_lifecycle_test",
    stripeSubscriptionId: "sub_lifecycle_test",
    stripePriceId: "price_lifecycle_test",
    stripeStatus: "past_due",
    stripeLivemode: false,
    currentPeriodStartedAt: "2026-08-01T00:00:00.000Z",
    currentPeriodEndsAt: "2026-09-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    paymentUpdate: {
      type: "failed",
      invoiceId: "in_lifecycle_due",
      failedAt: "2026-08-10T00:00:00.000Z",
    },
    lastStripeEventId: "evt_lifecycle_failed",
    lastStripeEventCreatedAt: "2026-08-10T00:00:00.000Z",
    lastStripeSyncedAt: "2026-08-10T00:00:01.000Z",
    ...overrides,
  };
}

describe("pro subscription persistence", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("backfills every existing pro without starting a trial", async () => {
    const subscriptions = await listProSubscriptions();

    expect(subscriptions.map((row) => row.proId).sort()).toEqual([
      "user_pro_chan",
      "user_pro_wong",
    ]);
    expect(subscriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accessStatus: "setup_required",
          amountMinor: 10_000,
          currency: "hkd",
          interval: "month",
          planCode: "pro_monthly_v1",
          cancelAtPeriodEnd: false,
        }),
      ]),
    );
    subscriptions.forEach((subscription) => {
      expect(subscription.cardBoundAt).toBeUndefined();
      expect(subscription.trialStartedAt).toBeUndefined();
      expect(subscription.trialEndsAt).toBeUndefined();
      expect(subscription.stripeCustomerId).toBeUndefined();
    });
  });

  it("reactivates a terminated subscription only after a paid no-trial Checkout", async () => {
    const proId = await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        stripeStatus: "canceled",
        cancelAtPeriodEnd: true,
        terminatedAt: "2026-09-01T00:00:00.000Z",
        paymentUpdate: { type: "none" },
        lastStripeEventId: "evt_clean_termination",
        lastStripeEventCreatedAt: "2026-09-01T00:00:00.000Z",
        lastStripeSyncedAt: "2026-09-01T00:00:01.000Z",
      }),
    );
    const before = await findProSubscription(proId);
    const trialConsumedAt = before?.trialConsumedAt;
    expect(before).toMatchObject({
      accessStatus: "terminated",
      stripeStatus: "canceled",
      stripeSubscriptionHasTrial: true,
    });

    await expect(
      reserveProSubscriptionReactivationCheckout({
        proId,
        reservationId: "reservation_reactivation",
        reservationExpiresAt: "2099-08-09T13:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      reactivationCheckoutReservationId: "reservation_reactivation",
    });
    await expect(
      completeProSubscriptionReactivationCheckoutReservation({
        proId,
        reservationId: "reservation_reactivation",
        checkoutSessionId: "cs_reactivation_repository",
        checkoutSessionExpiresAt: "2099-08-09T14:00:00.000Z",
        stripeCustomerId: "cus_lifecycle_test",
        previousStripeSubscriptionId: "sub_lifecycle_test",
      }),
    ).resolves.toMatchObject({
      reactivationCheckoutSessionId: "cs_reactivation_repository",
    });

    const reactivated = await activatePaidProSubscription({
      proId,
      stripeCustomerId: "cus_lifecycle_test",
      previousStripeSubscriptionId: "sub_lifecycle_test",
      reactivationCheckoutSessionId: "cs_reactivation_repository",
      stripeSubscriptionId: "sub_reactivated_repository",
      stripePriceId: "price_lifecycle_test",
      stripeLivemode: false,
      currentPeriodStartedAt: "2026-09-01T00:00:00.000Z",
      currentPeriodEndsAt: "2026-10-01T00:00:00.000Z",
      latestInvoiceId: "in_reactivated_repository",
      paidAt: "2026-09-01T00:00:00.000Z",
      lastStripeEventId: "evt_reactivated_repository",
      lastStripeEventCreatedAt: "2026-09-01T00:00:00.000Z",
      lastStripeSyncedAt: "2026-09-01T00:00:01.000Z",
    });

    expect(reactivated).toMatchObject({
      accessStatus: "active",
      stripeStatus: "active",
      stripeSubscriptionId: "sub_reactivated_repository",
      stripeSubscriptionHasTrial: false,
      trialConsumedAt,
      lastPaymentSucceededAt: "2026-09-01T00:00:00.000Z",
    });
    expect(reactivated?.reactivationCheckoutSessionId).toBeUndefined();
  });

  it("idempotently creates setup-required billing state for a new pro", async () => {
    const pro = await createUserAccount({
      fullName: "訂閱測試師傅",
      phone: "96786789",
      email: "subscription-pro@hotfix.hk",
      role: "pro",
      serviceCategoryIds: ["plumbing"],
      locale: "zh-HK",
      dateOfBirth: "1985-08-09",
      securityQuestionId: "childhood_character",
      securityAnswer: "叮噹",
      password: "NewPass123!",
      confirmPassword: "NewPass123!",
    });

    await expect(findProSubscription(pro.id)).resolves.toBeNull();
    const first = await ensureProSubscription(pro.id);
    const second = await ensureProSubscription(pro.id);

    expect(second.createdAt).toBe(first.createdAt);
    expect(second).toMatchObject({
      proId: pro.id,
      accessStatus: "setup_required",
      amountMinor: 10_000,
      currency: "hkd",
    });
  });

  it("does not create subscriptions for customer accounts", async () => {
    await expect(ensureProSubscription("user_customer_amy")).rejects.toThrow(
      "A valid pro account is required",
    );
    await expect(findProSubscription("user_customer_amy")).resolves.toBeNull();
  });

  it("preserves billing records across legacy marketplace writes", async () => {
    const subscriptionsBefore = await listProSubscriptions();
    await claimStripeWebhookEvent({
      eventId: "evt_preserved",
      eventType: "customer.subscription.created",
      leaseId: "lease_preserved",
    });
    await completeStripeWebhookEvent("evt_preserved", "lease_preserved");

    await withDb((db) => {
      const pro = db.users.find((user) => user.id === "user_pro_chan");
      if (!pro) {
        throw new Error("Seeded pro not found.");
      }
      pro.lastLoginAt = "2026-08-09T22:00:00.000Z";
    });

    await expect(listProSubscriptions()).resolves.toEqual(subscriptionsBefore);
    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_preserved",
        eventType: "customer.subscription.created",
        leaseId: "lease_after_marketplace_write",
      }),
    ).resolves.toEqual({ status: "processed" });
  });

  it("reserves one checkout and consumes the lifetime trial exactly once", async () => {
    const proId = "user_pro_chan";
    await ensureProSubscription(proId);
    await setProStripeCustomer(proId, "cus_step2_test");

    const reservations = await Promise.all(
      ["reservation_a", "reservation_b"].map((reservationId) =>
        reserveProSubscriptionCheckout({
          proId,
          reservationId,
          reservationExpiresAt: "2099-08-09T13:00:00.000Z",
        }),
      ),
    );
    const winner = reservations.find(Boolean);

    expect(reservations.filter(Boolean)).toHaveLength(1);
    expect(winner?.checkoutReservationId).toMatch(/^reservation_[ab]$/);

    const checkout = await completeProSubscriptionCheckoutReservation({
      proId,
      reservationId: winner!.checkoutReservationId!,
      checkoutSessionId: "cs_step2_test",
      checkoutSessionExpiresAt: "2099-08-09T14:00:00.000Z",
      stripeCustomerId: "cus_step2_test",
    });
    expect(checkout).toMatchObject({
      checkoutSessionId: "cs_step2_test",
      stripeCustomerId: "cus_step2_test",
    });
    await expect(
      reserveProSubscriptionCheckout({
        proId,
        reservationId: "reservation_after_checkout",
        reservationExpiresAt: "2099-08-09T15:00:00.000Z",
      }),
    ).resolves.toBeNull();

    const trialInput = {
      proId,
      checkoutSessionId: "cs_step2_test",
      stripeCustomerId: "cus_step2_test",
      stripeSetupIntentId: "seti_step2_test",
      stripePaymentMethodId: "pm_step2_test",
      cardBoundAt: "2026-01-31T02:30:00.000Z",
      trialEndsAt: "2026-04-30T02:30:00.000Z",
    };
    const trials = await Promise.all([
      consumeProLifetimeTrial(trialInput),
      consumeProLifetimeTrial(trialInput),
    ]);

    expect(trials.map((trial) => trial.status).sort()).toEqual([
      "consumed",
      "existing",
    ]);
    expect(trials[0].subscription.trialConsumedAt).toBe(
      "2026-01-31T02:30:00.000Z",
    );
    expect(trials[1].subscription.trialEndsAt).toBe("2026-04-30T02:30:00.000Z");

    await expect(
      consumeProLifetimeTrial({
        ...trialInput,
        checkoutSessionId: "cs_different",
      }),
    ).rejects.toThrow("does not match");

    const activation = {
      proId,
      stripeSubscriptionId: "sub_step2_test",
      stripePriceId: "price_step2_test",
      stripeStatus: "active" as const,
      stripeLivemode: false,
      currentPeriodStartedAt: "2026-01-31T02:30:00.000Z",
      currentPeriodEndsAt: "2026-04-30T02:30:00.000Z",
      lastStripeEventId: "evt_step2_test",
      lastStripeSyncedAt: "2026-01-31T02:30:01.000Z",
    };
    await expect(
      activateProTrialSubscription(activation),
    ).resolves.toMatchObject({
      accessStatus: "active",
      stripeSubscriptionId: "sub_step2_test",
      stripeStatus: "active",
      trialConsumedAt: "2026-01-31T02:30:00.000Z",
      trialEndsAt: "2026-04-30T02:30:00.000Z",
      lastStripeEventId: "evt_step2_test",
    });

    await expect(
      activateProTrialSubscription({
        ...activation,
        stripeStatus: "trialing",
        lastStripeEventId: "evt_stale_replay",
        lastStripeSyncedAt: "2026-01-31T02:30:02.000Z",
      }),
    ).resolves.toMatchObject({
      accessStatus: "active",
      stripeStatus: "active",
      lastStripeEventId: "evt_step2_test",
      lastStripeSyncedAt: "2026-01-31T02:30:01.000Z",
    });
  });

  it("fails closed when a partial lifetime-trial write already exists", async () => {
    const proId = "user_pro_chan";
    const partialCardBoundAt = "2026-02-28T02:30:00.000Z";
    await ensureProSubscription(proId);
    await setProStripeCustomer(proId, "cus_partial_history");

    if (!env.MONGODB_URI) {
      throw new Error("MONGODB_URI is required for subscription tests.");
    }
    const client = await new MongoClient(env.MONGODB_URI).connect();
    try {
      const subscriptions = client.db(env.MONGODB_DATABASE).collection<{
        _id: string;
        cardBoundAt?: string;
        checkoutSessionId?: string;
        checkoutSessionExpiresAt?: string;
      }>("proSubscriptions");
      await subscriptions.updateOne(
        { _id: proId },
        { $set: { cardBoundAt: partialCardBoundAt } },
      );

      await expect(
        reserveProSubscriptionCheckout({
          proId,
          reservationId: "reservation_after_partial_history",
          reservationExpiresAt: "2099-08-09T15:00:00.000Z",
        }),
      ).resolves.toBeNull();

      await subscriptions.updateOne(
        { _id: proId },
        {
          $set: {
            checkoutSessionId: "cs_partial_history",
            checkoutSessionExpiresAt: "2099-08-09T16:00:00.000Z",
          },
        },
      );
    } finally {
      await client.close();
    }

    await expect(
      consumeProLifetimeTrial({
        proId,
        checkoutSessionId: "cs_partial_history",
        stripeCustomerId: "cus_partial_history",
        stripeSetupIntentId: "seti_partial_history",
        stripePaymentMethodId: "pm_partial_history",
        cardBoundAt: "2026-03-01T02:30:00.000Z",
        trialEndsAt: "2026-06-01T02:30:00.000Z",
      }),
    ).rejects.toThrow("does not match");

    const persisted = await findProSubscription(proId);
    expect(persisted).toMatchObject({
      cardBoundAt: partialCardBoundAt,
      checkoutSessionId: "cs_partial_history",
    });
    expect(persisted?.trialConsumedAt).toBeUndefined();
    expect(persisted?.trialEndsAt).toBeUndefined();
  });

  it("starts one 14-day grace window that invoice retries cannot extend", async () => {
    await activateLifecycleTestSubscription();

    await expect(
      syncProSubscriptionLifecycle(lifecycleSyncInput()),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      stripeStatus: "past_due",
      pastDueInvoiceId: "in_lifecycle_due",
      firstPaymentFailedAt: "2026-08-10T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
    });

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          paymentUpdate: {
            type: "failed",
            invoiceId: "in_lifecycle_due",
            failedAt: "2026-08-18T00:00:00.000Z",
          },
          lastStripeEventId: "evt_lifecycle_retry_failed",
          lastStripeEventCreatedAt: "2026-08-18T00:00:00.000Z",
          lastStripeSyncedAt: "2026-08-18T00:00:01.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      firstPaymentFailedAt: "2026-08-10T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
    });

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          stripeStatus: "unpaid",
          paymentUpdate: {
            type: "failed",
            invoiceId: "in_lifecycle_due",
            failedAt: "2026-08-24T00:00:00.000Z",
          },
          lastStripeEventId: "evt_lifecycle_day_14",
          lastStripeEventCreatedAt: "2026-08-24T00:00:00.000Z",
          lastStripeSyncedAt: "2026-08-24T00:00:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "suspended",
      stripeStatus: "unpaid",
      firstPaymentFailedAt: "2026-08-10T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
    });
  });

  it("merges an older invoice failure into an already-started grace window", async () => {
    await activateLifecycleTestSubscription();

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          paymentUpdate: {
            type: "failed",
            invoiceId: "in_lifecycle_due",
            failedAt: "2026-08-10T00:00:02.000Z",
          },
          lastStripeEventId: "evt_subscription_past_due_newer",
          lastStripeEventCreatedAt: "2026-08-10T00:00:02.000Z",
          lastStripeSyncedAt: "2026-08-10T00:00:03.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      lastStripeEventId: "evt_subscription_past_due_newer",
    });

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          lastStripeEventId: "evt_invoice_failure_older",
          lastStripeEventCreatedAt: "2026-08-10T00:00:01.000Z",
          lastStripeSyncedAt: "2026-08-10T00:00:04.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      firstPaymentFailedAt: "2026-08-10T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
      lastStripeEventId: "evt_subscription_past_due_newer",
      lastStripeEventCreatedAt: "2026-08-10T00:00:02.000Z",
    });
  });

  it("replaces a provisional invoice time with the signed first failure time", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_lifecycle_due",
          failedAt: "2026-08-09T23:59:50.000Z",
          confirmed: false,
        },
      }),
    );

    const confirmed = await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_lifecycle_due",
          failedAt: "2026-08-10T00:00:05.000Z",
          confirmed: true,
        },
        lastStripeEventId: "evt_confirmed_failure",
        lastStripeEventCreatedAt: "2026-08-10T00:00:05.000Z",
        lastStripeSyncedAt: "2026-08-10T00:00:06.000Z",
      }),
    );

    expect(confirmed).toMatchObject({
      firstPaymentFailedAt: "2026-08-10T00:00:05.000Z",
      paymentFailureConfirmed: true,
      gracePeriodEndsAt: "2026-08-24T00:00:05.000Z",
    });

    const afterLaterRetry = await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_lifecycle_due",
          failedAt: "2026-08-09T23:59:50.000Z",
          confirmed: false,
        },
        lastStripeEventId: "evt_later_retry_delivered_after_confirmation",
        lastStripeEventCreatedAt: "2026-08-12T00:00:00.000Z",
        lastStripeSyncedAt: "2026-08-12T00:00:01.000Z",
      }),
    );

    expect(afterLaterRetry).toMatchObject({
      firstPaymentFailedAt: "2026-08-10T00:00:05.000Z",
      paymentFailureConfirmed: true,
      gracePeriodEndsAt: "2026-08-24T00:00:05.000Z",
    });
  });

  it("does not let an old paid invoice clear a different outstanding invoice", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(lifecycleSyncInput());

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          paymentUpdate: {
            type: "paid",
            invoiceId: "in_older_already_paid",
            paidAt: "2026-08-11T00:00:00.000Z",
          },
          lastStripeEventId: "evt_old_invoice_paid",
          lastStripeEventCreatedAt: "2026-08-11T00:00:00.000Z",
          lastStripeSyncedAt: "2026-08-11T00:00:01.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      pastDueInvoiceId: "in_lifecycle_due",
      firstPaymentFailedAt: "2026-08-10T00:00:00.000Z",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
    });
  });

  it("does not let an older failed event reopen debt after a newer payment", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(lifecycleSyncInput());
    await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        stripeStatus: "active",
        paymentUpdate: {
          type: "paid",
          invoiceId: "in_lifecycle_due",
          paidAt: "2026-08-12T00:00:00.000Z",
        },
        lastStripeEventId: "evt_paid_newer",
        lastStripeEventCreatedAt: "2026-08-12T00:00:00.000Z",
        lastStripeSyncedAt: "2026-08-12T00:00:01.000Z",
      }),
    );

    const afterStaleFailure = await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        paymentUpdate: {
          type: "failed",
          invoiceId: "in_lifecycle_due",
          failedAt: "2026-08-10T00:00:00.000Z",
          confirmed: true,
        },
        lastStripeEventId: "evt_failed_older_delivery",
        lastStripeEventCreatedAt: "2026-08-10T00:00:00.000Z",
        lastStripeSyncedAt: "2026-08-12T00:00:02.000Z",
      }),
    );

    expect(afterStaleFailure).toMatchObject({
      accessStatus: "active",
      stripeStatus: "active",
      lastStripeEventId: "evt_paid_newer",
    });
    expect(afterStaleFailure.pastDueInvoiceId).toBeUndefined();
    expect(afterStaleFailure.firstPaymentFailedAt).toBeUndefined();
    expect(afterStaleFailure.gracePeriodEndsAt).toBeUndefined();
  });

  it("restores active state only when canonical Stripe confirms payment", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(lifecycleSyncInput());

    const restored = await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        stripeStatus: "active",
        currentPeriodStartedAt: "2026-08-10T00:00:00.000Z",
        currentPeriodEndsAt: "2026-09-10T00:00:00.000Z",
        paymentUpdate: {
          type: "paid",
          invoiceId: "in_lifecycle_due",
          paidAt: "2026-08-12T00:00:00.000Z",
        },
        lastStripeEventId: "evt_lifecycle_paid",
        lastStripeEventCreatedAt: "2026-08-12T00:00:00.000Z",
        lastStripeSyncedAt: "2026-08-12T00:00:01.000Z",
      }),
    );

    expect(restored).toMatchObject({
      accessStatus: "active",
      stripeStatus: "active",
      latestInvoiceId: "in_lifecycle_due",
      lastPaymentSucceededAt: "2026-08-12T00:00:00.000Z",
    });
    expect(restored.pastDueInvoiceId).toBeUndefined();
    expect(restored.firstPaymentFailedAt).toBeUndefined();
    expect(restored.gracePeriodEndsAt).toBeUndefined();
  });

  it("keeps payment grace ahead of cancellation, then terminates at Stripe end", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(lifecycleSyncInput());

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          cancelAtPeriodEnd: true,
          cancellationRequestedAt: "2026-08-11T00:00:00.000Z",
          paymentUpdate: { type: "none" },
          lastStripeEventId: "evt_cancel_while_due",
          lastStripeEventCreatedAt: "2026-08-11T00:00:00.000Z",
          lastStripeSyncedAt: "2026-08-11T00:00:01.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "grace_period",
      cancelAtPeriodEnd: true,
      cancellationRequestedAt: "2026-08-11T00:00:00.000Z",
    });

    await expect(
      syncProSubscriptionLifecycle(
        lifecycleSyncInput({
          stripeStatus: "canceled",
          cancelAtPeriodEnd: true,
          terminatedAt: "2026-09-01T00:00:00.000Z",
          paymentUpdate: { type: "none" },
          lastStripeEventId: "evt_subscription_deleted",
          lastStripeEventCreatedAt: "2026-09-01T00:00:00.000Z",
          lastStripeSyncedAt: "2026-09-01T00:00:01.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      accessStatus: "suspended",
      stripeStatus: "canceled",
      pastDueInvoiceId: "in_lifecycle_due",
    });
  });

  it("does not let an early Stripe cancellation shorten an unpaid grace window", async () => {
    await activateLifecycleTestSubscription();
    await syncProSubscriptionLifecycle(lifecycleSyncInput());

    const canceledDuringGrace = await syncProSubscriptionLifecycle(
      lifecycleSyncInput({
        stripeStatus: "canceled",
        cancelAtPeriodEnd: true,
        terminatedAt: "2026-08-12T00:00:00.000Z",
        paymentUpdate: { type: "none" },
        lastStripeEventId: "evt_deleted_during_grace",
        lastStripeEventCreatedAt: "2026-08-12T00:00:00.000Z",
        lastStripeSyncedAt: "2026-08-12T00:00:01.000Z",
      }),
    );

    expect(canceledDuringGrace).toMatchObject({
      accessStatus: "grace_period",
      stripeStatus: "canceled",
      pastDueInvoiceId: "in_lifecycle_due",
      gracePeriodEndsAt: "2026-08-24T00:00:00.000Z",
    });
  });
});

describe("Stripe webhook event claims", () => {
  beforeEach(async () => {
    await resetMockDb();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("lets one worker claim an event while duplicates wait", async () => {
    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_once",
        eventType: "customer.subscription.updated",
        objectId: "sub_test",
        leaseId: "lease_first",
      }),
    ).resolves.toEqual({ status: "claimed", leaseId: "lease_first" });

    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_once",
        eventType: "customer.subscription.updated",
        objectId: "sub_test",
        leaseId: "lease_second",
      }),
    ).resolves.toEqual({ status: "busy" });

    await expect(
      completeStripeWebhookEvent("evt_once", "lease_first"),
    ).resolves.toBe(true);
    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_once",
        eventType: "customer.subscription.updated",
        objectId: "sub_test",
        leaseId: "lease_third",
      }),
    ).resolves.toEqual({ status: "processed" });
  });

  it("allows a failed event to be safely reclaimed", async () => {
    await claimStripeWebhookEvent({
      eventId: "evt_retry",
      eventType: "invoice.payment_failed",
      objectId: "in_test",
      leaseId: "lease_failed",
    });
    await expect(
      failStripeWebhookEvent(
        "evt_retry",
        "lease_failed",
        "stripe timeout with unsafe spaces",
      ),
    ).resolves.toBe(true);

    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_retry",
        eventType: "invoice.payment_failed",
        objectId: "in_test",
        leaseId: "lease_retry",
      }),
    ).resolves.toEqual({ status: "claimed", leaseId: "lease_retry" });
  });

  it("rejects the wrong lease and reclaims an expired lease", async () => {
    await claimStripeWebhookEvent({
      eventId: "evt_expired",
      eventType: "invoice.paid",
      leaseId: "lease_expired",
      leaseDurationMs: 0,
    });
    await expect(
      completeStripeWebhookEvent("evt_expired", "wrong_lease"),
    ).resolves.toBe(false);
    await expect(
      claimStripeWebhookEvent({
        eventId: "evt_expired",
        eventType: "invoice.paid",
        leaseId: "lease_reclaimed",
      }),
    ).resolves.toEqual({
      status: "claimed",
      leaseId: "lease_reclaimed",
    });
  });

  it("grants only one claim under concurrent delivery", async () => {
    const claims = await Promise.all(
      ["lease_a", "lease_b", "lease_c"].map((leaseId) =>
        claimStripeWebhookEvent({
          eventId: "evt_concurrent",
          eventType: "invoice.payment_failed",
          leaseId,
        }),
      ),
    );

    expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(
      1,
    );
    expect(claims.filter((claim) => claim.status === "busy")).toHaveLength(2);
  });
});
