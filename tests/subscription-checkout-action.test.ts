import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  clearSession: vi.fn(),
  localizedRoleHomePath: vi.fn((role: string) => "/" + role),
  requireRole: vi.fn(),
  signInAs: vi.fn(),
  signInWithCredentials: vi.fn(),
}));

vi.mock("@/lib/mock/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mock/db")>();
  return {
    ...actual,
    clearProSubscriptionCheckoutSession: vi.fn(),
    clearProSubscriptionReactivationCheckoutSession: vi.fn(),
    completeProSubscriptionCheckoutReservation: vi.fn(),
    completeProSubscriptionReactivationCheckoutReservation: vi.fn(),
    ensureProSubscription: vi.fn(),
    findProSubscription: vi.fn(),
    releaseProSubscriptionCheckout: vi.fn(),
    releaseProSubscriptionReactivationCheckout: vi.fn(),
    reserveProSubscriptionCheckout: vi.fn(),
    reserveProSubscriptionReactivationCheckout: vi.fn(),
    setProStripeCustomer: vi.fn(),
  };
});

vi.mock("@/lib/stripe-billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-billing")>();
  return {
    ...actual,
    createCardSetupCheckoutSession: vi.fn(),
    createPaidProSubscriptionCheckoutSession: vi.fn(),
    createProPaymentMethodPortalSession: vi.fn(),
    getOwnedProSubscriptionInvoicePaymentUrl: vi.fn(),
    getOrCreateStripeCustomerForPro: vi.fn(),
    inspectOwnedCardSetupCheckoutSession: vi.fn(),
    inspectOwnedPaidProSubscriptionCheckoutSession: vi.fn(),
    retrieveOpenCardSetupCheckoutSession: vi.fn(),
    setProSubscriptionAutoRenewal: vi.fn(),
  };
});

import { requireRole, signInAs, signInWithCredentials } from "@/lib/auth";
import {
  completeProSubscriptionCheckoutReservation,
  completeProSubscriptionReactivationCheckoutReservation,
  clearProSubscriptionCheckoutSession,
  ensureProSubscription,
  reserveProSubscriptionCheckout,
  reserveProSubscriptionReactivationCheckout,
  setProStripeCustomer,
} from "@/lib/mock/db";
import {
  createCardSetupCheckoutSession,
  createPaidProSubscriptionCheckoutSession,
  createProPaymentMethodPortalSession,
  getOwnedProSubscriptionInvoicePaymentUrl,
  getOrCreateStripeCustomerForPro,
  inspectOwnedCardSetupCheckoutSession,
  setProSubscriptionAutoRenewal,
} from "@/lib/stripe-billing";
import {
  setProSubscriptionAutoRenewalAction,
  signInDemoAction,
  startProOutstandingInvoicePaymentAction,
  startProPaymentMethodUpdateAction,
  startLoginAction,
  startProSubscriptionCheckoutAction,
} from "@/lib/actions";
import { env } from "@/lib/env";
import type { ProSubscription } from "@/lib/subscription-policy";
import type { User } from "@/types/domain";

const pro: User = {
  id: "user_pro_action",
  role: "pro",
  fullName: "測試師傅",
  email: "pro-action@hotfix.test",
  phone: "91234567",
  locale: "zh-HK",
  createdAt: "2026-08-09T10:00:00.000Z",
  lastLoginAt: "2026-08-09T10:00:00.000Z",
};

function setupRequired(
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return {
    proId: pro.id,
    planCode: "pro_monthly_v1",
    amountMinor: 10_000,
    currency: "hkd",
    interval: "month",
    accessStatus: "setup_required",
    cancelAtPeriodEnd: false,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

function activeSubscription(
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return setupRequired({
    accessStatus: "active",
    stripeCustomerId: "cus_action_test",
    stripeSubscriptionId: "sub_action_test",
    stripePriceId: "price_action_test",
    stripeStatus: "active",
    stripeLivemode: false,
    trialConsumedAt: "2026-08-09T10:00:00.000Z",
    trialEndsAt: "2026-11-09T10:00:00.000Z",
    currentPeriodStartedAt: "2026-11-09T10:00:00.000Z",
    currentPeriodEndsAt: "2026-12-09T10:00:00.000Z",
    ...overrides,
  });
}

function terminatedSubscription(
  overrides: Partial<ProSubscription> = {},
): ProSubscription {
  return activeSubscription({
    accessStatus: "terminated",
    stripeStatus: "canceled",
    currentPeriodEndsAt: "2026-08-09T10:00:00.000Z",
    ...overrides,
  });
}

describe("pro card setup action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(pro);
    vi.mocked(ensureProSubscription).mockResolvedValue(setupRequired());
  });

  it("derives the pro identity from the session and creates a server-owned setup flow", async () => {
    vi.mocked(getOrCreateStripeCustomerForPro).mockResolvedValue({
      id: "cus_action_test",
    } as never);
    vi.mocked(setProStripeCustomer).mockResolvedValue(
      setupRequired({ stripeCustomerId: "cus_action_test" }),
    );
    vi.mocked(reserveProSubscriptionCheckout).mockImplementation(
      async (input) =>
        setupRequired({
          stripeCustomerId: "cus_action_test",
          checkoutReservationId: input.reservationId,
          checkoutReservationExpiresAt: input.reservationExpiresAt,
        }),
    );
    vi.mocked(createCardSetupCheckoutSession).mockResolvedValue({
      id: "cs_action_test",
      url: "https://checkout.stripe.test/action",
      expires_at: 2_000_000_000,
    } as never);
    vi.mocked(completeProSubscriptionCheckoutReservation).mockResolvedValue(
      setupRequired({
        stripeCustomerId: "cus_action_test",
        checkoutSessionId: "cs_action_test",
      }),
    );

    await expect(
      startProSubscriptionCheckoutAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: true,
      url: "https://checkout.stripe.test/action",
    });

    expect(requireRole).toHaveBeenCalledWith("pro", "zh-HK");
    expect(getOrCreateStripeCustomerForPro).toHaveBeenCalledWith({
      proId: pro.id,
      existingCustomerId: undefined,
      email: pro.email,
      name: pro.fullName,
      idempotencyKey: "pro-customer:" + pro.id,
    });
    expect(createCardSetupCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        proId: pro.id,
        customerId: "cus_action_test",
        successUrl: new URL(
          "/pro/billing?checkout=success",
          env.APP_URL,
        ).toString(),
        cancelUrl: new URL(
          "/pro/billing?checkout=cancelled",
          env.APP_URL,
        ).toString(),
      }),
    );
  });

  it("reuses the owned open Checkout Session instead of creating duplicates", async () => {
    vi.mocked(ensureProSubscription).mockResolvedValue(
      setupRequired({
        stripeCustomerId: "cus_action_test",
        checkoutSessionId: "cs_action_test",
        checkoutSessionExpiresAt: "2099-08-09T12:00:00.000Z",
      }),
    );
    vi.mocked(inspectOwnedCardSetupCheckoutSession).mockResolvedValue({
      status: "open",
      session: {
        id: "cs_action_test",
        url: "https://checkout.stripe.test/existing",
      },
      url: "https://checkout.stripe.test/existing",
    } as never);

    await expect(
      startProSubscriptionCheckoutAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: true,
      url: "https://checkout.stripe.test/existing",
    });
    expect(createCardSetupCheckoutSession).not.toHaveBeenCalled();
    expect(reserveProSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("keeps a completed Checkout attached while its webhook is pending", async () => {
    vi.mocked(ensureProSubscription).mockResolvedValue(
      setupRequired({
        stripeCustomerId: "cus_action_test",
        checkoutSessionId: "cs_action_test",
        checkoutSessionExpiresAt: "2099-08-09T12:00:00.000Z",
      }),
    );
    vi.mocked(inspectOwnedCardSetupCheckoutSession).mockResolvedValue({
      status: "complete",
      session: { id: "cs_action_test" },
    } as never);

    await expect(
      startProSubscriptionCheckoutAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: false,
      error: "Stripe 正在確認已完成嘅付款設定，請稍等片刻。",
    });
    expect(clearProSubscriptionCheckoutSession).not.toHaveBeenCalled();
    expect(createCardSetupCheckoutSession).not.toHaveBeenCalled();
    expect(reserveProSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("does not offer another Checkout when any lifetime-trial history exists", async () => {
    vi.mocked(ensureProSubscription).mockResolvedValue(
      setupRequired({
        stripeCustomerId: "cus_action_test",
        checkoutSessionId: "cs_action_test",
        cardBoundAt: "2026-08-09T22:05:04.000Z",
      }),
    );

    await expect(
      startProSubscriptionCheckoutAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: false,
      error: "Stripe 正在確認已完成嘅付款設定，請稍等片刻。",
    });
    expect(inspectOwnedCardSetupCheckoutSession).not.toHaveBeenCalled();
    expect(createCardSetupCheckoutSession).not.toHaveBeenCalled();
  });

  it("starts an immediate HK$100 no-trial Checkout after a clean termination", async () => {
    const terminated = terminatedSubscription();
    vi.mocked(ensureProSubscription).mockResolvedValue(terminated);
    vi.mocked(reserveProSubscriptionReactivationCheckout).mockResolvedValue({
      ...terminated,
      reactivationCheckoutReservationId: "reservation_reactivation",
    });
    vi.mocked(createPaidProSubscriptionCheckoutSession).mockResolvedValue({
      id: "cs_paid_reactivation_action",
      url: "https://checkout.stripe.test/reactivation",
      expires_at: 2_000_000_000,
    } as never);
    vi.mocked(
      completeProSubscriptionReactivationCheckoutReservation,
    ).mockResolvedValue({
      ...terminated,
      reactivationCheckoutSessionId: "cs_paid_reactivation_action",
    });

    await expect(
      startProSubscriptionCheckoutAction({ locale: "en" }),
    ).resolves.toEqual({
      ok: true,
      url: "https://checkout.stripe.test/reactivation",
    });

    expect(createPaidProSubscriptionCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        proId: pro.id,
        customerId: "cus_action_test",
        previousSubscriptionId: "sub_action_test",
        successUrl: new URL(
          "/pro/billing?checkout=reactivated",
          env.APP_URL,
        ).toString(),
      }),
    );
    expect(createCardSetupCheckoutSession).not.toHaveBeenCalled();
    expect(getOrCreateStripeCustomerForPro).not.toHaveBeenCalled();
  });

  it("sends a pro who still needs a card to billing after login", async () => {
    vi.mocked(signInWithCredentials).mockResolvedValue({
      ok: true,
      user: pro,
      isDemo: false,
    });

    await expect(
      startLoginAction({
        identifier: pro.phone,
        password: "ValidPass123!",
        locale: "zh-HK",
      }),
    ).resolves.toEqual({
      ok: true,
      target: "/pro/billing",
    });
  });

  it("applies the same setup redirect to a demo pro login", async () => {
    vi.mocked(signInAs).mockResolvedValue(pro);

    await expect(
      signInDemoAction({ userId: pro.id, locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: true,
      target: "/pro/billing",
    });
  });
});

describe("pro subscription lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(pro);
    vi.mocked(ensureProSubscription).mockResolvedValue(activeSubscription());
  });

  it("opens only the owned Stripe payment-method update flow", async () => {
    vi.mocked(createProPaymentMethodPortalSession).mockResolvedValue({
      url: "https://billing.stripe.test/payment-method-update",
    } as never);

    await expect(
      startProPaymentMethodUpdateAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: true,
      url: "https://billing.stripe.test/payment-method-update",
    });
    expect(createProPaymentMethodPortalSession).toHaveBeenCalledWith({
      proId: pro.id,
      customerId: "cus_action_test",
      locale: "zh-HK",
      returnUrl: new URL(
        "/pro/billing?billing=updated",
        env.APP_URL,
      ).toString(),
    });
  });

  it("exposes only the locally-recorded owned invoice payment page", async () => {
    vi.mocked(ensureProSubscription).mockResolvedValue(
      activeSubscription({
        accessStatus: "grace_period",
        stripeStatus: "past_due",
        pastDueInvoiceId: "in_action_due",
      }),
    );
    vi.mocked(getOwnedProSubscriptionInvoicePaymentUrl).mockResolvedValue({
      url: "https://invoice.stripe.test/in_action_due",
    } as never);

    await expect(
      startProOutstandingInvoicePaymentAction({ locale: "zh-HK" }),
    ).resolves.toEqual({
      ok: true,
      url: "https://invoice.stripe.test/in_action_due",
    });
    expect(getOwnedProSubscriptionInvoicePaymentUrl).toHaveBeenCalledWith({
      proId: pro.id,
      customerId: "cus_action_test",
      subscriptionId: "sub_action_test",
      invoiceId: "in_action_due",
      expectedLivemode: false,
    });
  });

  it("schedules cancellation at period end without local optimistic state", async () => {
    vi.mocked(setProSubscriptionAutoRenewal).mockResolvedValue({} as never);

    await expect(
      setProSubscriptionAutoRenewalAction({
        locale: "zh-HK",
        cancelAtPeriodEnd: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(setProSubscriptionAutoRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        proId: pro.id,
        customerId: "cus_action_test",
        subscriptionId: "sub_action_test",
        expectedPriceId: "price_action_test",
        expectedTrialEndsAt: "2026-11-09T10:00:00.000Z",
        expectedLivemode: false,
        allowHistoricalPriceId: true,
        cancelAtPeriodEnd: true,
      }),
    );
  });

  it("fails closed when no owned outstanding invoice exists", async () => {
    await expect(
      startProOutstandingInvoicePaymentAction({ locale: "en" }),
    ).resolves.toEqual({
      ok: false,
      error:
        "Unable to retry the outstanding payment. Update your card first, then try again.",
    });
    expect(getOwnedProSubscriptionInvoicePaymentUrl).not.toHaveBeenCalled();
  });
});
