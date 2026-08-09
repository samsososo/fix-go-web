import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  ensureProSubscription,
  failStripeWebhookEvent,
  findProSubscription,
  listProSubscriptions,
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
