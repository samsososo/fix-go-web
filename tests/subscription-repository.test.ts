import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";

import { env } from "@/lib/env";
import {
  activateProTrialSubscription,
  claimStripeWebhookEvent,
  completeProSubscriptionCheckoutReservation,
  completeStripeWebhookEvent,
  consumeProLifetimeTrial,
  ensureProSubscription,
  failStripeWebhookEvent,
  findProSubscription,
  listProSubscriptions,
  reserveProSubscriptionCheckout,
  setProStripeCustomer,
  withDb,
} from "@/lib/mock/db";
import { createUserAccount } from "@/lib/mock/repositories";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

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
