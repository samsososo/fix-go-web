import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createCardSetupCheckoutSession,
  createMonthlyProSubscription,
  findExistingMonthlyProSubscription,
  getOrCreateStripeCustomerForPro,
  getStripeClient,
  inspectOwnedCardSetupCheckoutSession,
  retrieveOpenCardSetupCheckoutSession,
  retrieveSucceededCardSetup,
  setCustomerDefaultPaymentMethod,
  StripeBillingError,
  verifyStripeWebhookEvent,
} from "@/lib/stripe-billing";

function mockStripe() {
  const customer = {
    id: "cus_pro_1",
    object: "customer",
    deleted: undefined,
    metadata: { proId: "pro-1", accountType: "pro" },
  } as unknown as Stripe.Customer;
  const checkoutSession = {
    id: "cs_test_setup_1",
    object: "checkout.session",
    mode: "setup",
    status: "open",
    customer: customer.id,
    client_reference_id: "pro-1",
    metadata: {
      proId: "pro-1",
      purpose: "pro_subscription_card_setup",
      planCode: "pro_monthly_v1",
    },
    expires_at: 2_000_000_000,
    url: "https://checkout.stripe.test/session",
  } as unknown as Stripe.Checkout.Session;
  const subscription = {
    id: "sub_pro_1",
    object: "subscription",
    customer: customer.id,
    status: "trialing",
  } as unknown as Stripe.Subscription;
  const price = {
    id: "price_monthly_hkd_100",
    object: "price",
    active: true,
    currency: "hkd",
    type: "recurring",
    unit_amount: 10_000,
    recurring: {
      interval: "month",
      interval_count: 1,
    },
  } as unknown as Stripe.Price;
  const paymentMethod = {
    id: "pm_card_1",
    object: "payment_method",
    type: "card",
    customer: customer.id,
  } as unknown as Stripe.PaymentMethod;
  const setupIntent = {
    id: "seti_pro_1",
    object: "setup_intent",
    status: "succeeded",
    customer: customer.id,
    payment_method: paymentMethod,
    metadata: {
      proId: "pro-1",
      purpose: "pro_subscription_card_setup",
      planCode: "pro_monthly_v1",
    },
  } as unknown as Stripe.SetupIntent;

  const api = {
    customers: {
      create: vi.fn().mockResolvedValue(customer),
      retrieve: vi.fn().mockResolvedValue(customer),
      update: vi.fn().mockResolvedValue(customer),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue(checkoutSession),
        retrieve: vi.fn().mockResolvedValue(checkoutSession),
      },
    },
    setupIntents: {
      retrieve: vi.fn().mockResolvedValue(setupIntent),
    },
    paymentMethods: {
      retrieve: vi.fn().mockResolvedValue(paymentMethod),
    },
    prices: {
      retrieve: vi.fn().mockResolvedValue(price),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue(subscription),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };

  return {
    api,
    stripe: api as unknown as Stripe,
    customer,
    checkoutSession,
    subscription,
    paymentMethod,
    price,
    setupIntent,
  };
}

describe("Stripe billing adapter", () => {
  it("constructs a typed, retrying client only from a valid server secret", () => {
    const { stripe } = mockStripe();
    const createClient = vi.fn().mockReturnValue(stripe);

    expect(
      getStripeClient({
        secretKey: "sk_test_unit123",
        createClient,
      }),
    ).toBe(stripe);
    expect(createClient).toHaveBeenCalledWith(
      "sk_test_unit123",
      expect.objectContaining({
        apiVersion: "2026-07-29.dahlia",
        typescript: true,
        maxNetworkRetries: 2,
        emitEventBodies: false,
      }),
    );

    expect(() =>
      getStripeClient({ secretKey: "not-a-secret", createClient }),
    ).toThrow(StripeBillingError);
  });

  it("creates a Stripe Customer from server-owned pro identity only", async () => {
    const { api, stripe, customer } = mockStripe();

    await expect(
      getOrCreateStripeCustomerForPro(
        {
          proId: "pro-1",
          email: "pro@example.com",
          name: "陳師傅",
          idempotencyKey: "customer:pro-1",
        },
        { stripe },
      ),
    ).resolves.toBe(customer);

    expect(api.customers.create).toHaveBeenCalledWith(
      {
        email: "pro@example.com",
        name: "陳師傅",
        preferred_locales: ["zh-HK"],
        metadata: { proId: "pro-1", accountType: "pro" },
      },
      { idempotencyKey: "customer:pro-1" },
    );
  });

  it("retrieves and ownership-checks an existing Customer instead of duplicating it", async () => {
    const { api, stripe, customer } = mockStripe();

    await expect(
      getOrCreateStripeCustomerForPro(
        {
          proId: "pro-1",
          existingCustomerId: "cus_pro_1",
          idempotencyKey: "customer:pro-1",
        },
        { stripe },
      ),
    ).resolves.toBe(customer);

    expect(api.customers.retrieve).toHaveBeenCalledWith("cus_pro_1");
    expect(api.customers.create).not.toHaveBeenCalled();
  });

  it("creates a hosted card-only Setup Checkout Session with no charge input", async () => {
    const { api, stripe, checkoutSession } = mockStripe();

    await expect(
      createCardSetupCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          successUrl:
            "https://hotfix24.test/pro/billing/success?session_id={CHECKOUT_SESSION_ID}",
          cancelUrl: "https://hotfix24.test/pro/billing",
          idempotencyKey: "setup-checkout:pro-1:attempt-1",
        },
        { stripe },
      ),
    ).resolves.toBe(checkoutSession);

    const [params, requestOptions] = api.checkout.sessions.create.mock.calls[0];
    expect(params).toEqual({
      mode: "setup",
      customer: "cus_pro_1",
      client_reference_id: "pro-1",
      payment_method_types: ["card"],
      success_url:
        "https://hotfix24.test/pro/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://hotfix24.test/pro/billing",
      metadata: {
        proId: "pro-1",
        purpose: "pro_subscription_card_setup",
        planCode: "pro_monthly_v1",
      },
      setup_intent_data: {
        metadata: {
          proId: "pro-1",
          purpose: "pro_subscription_card_setup",
          planCode: "pro_monthly_v1",
        },
      },
    });
    expect(params).not.toHaveProperty("line_items");
    expect(params).not.toHaveProperty("amount");
    expect(params).not.toHaveProperty("subscription_data");
    expect(requestOptions).toEqual({
      idempotencyKey: "setup-checkout:pro-1:attempt-1",
    });
  });

  it("reuses an open, owned and unexpired card Setup Checkout Session", async () => {
    const { api, stripe, checkoutSession } = mockStripe();

    await expect(
      retrieveOpenCardSetupCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          checkoutSessionId: "cs_test_setup_1",
        },
        { stripe, nowUnix: () => 1_999_999_999 },
      ),
    ).resolves.toBe(checkoutSession);

    expect(api.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_test_setup_1",
    );
  });

  it.each([
    {
      label: "another professional account",
      patch: { client_reference_id: "pro-2" },
      message: "does not belong",
    },
    {
      label: "a completed status",
      patch: { status: "complete" },
      message: "is not open",
    },
  ])("rejects a Checkout Session for $label", async ({ patch, message }) => {
    const { api, stripe, checkoutSession } = mockStripe();
    api.checkout.sessions.retrieve.mockResolvedValue({
      ...checkoutSession,
      ...patch,
    });

    await expect(
      retrieveOpenCardSetupCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          checkoutSessionId: "cs_test_setup_1",
        },
        { stripe, nowUnix: () => 1_999_999_999 },
      ),
    ).rejects.toThrow(message);
  });

  it("preserves a completed Checkout Session for its pending webhook", async () => {
    const { api, stripe, checkoutSession } = mockStripe();
    api.checkout.sessions.retrieve.mockResolvedValue({
      ...checkoutSession,
      status: "complete",
      url: null,
    });

    await expect(
      inspectOwnedCardSetupCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          checkoutSessionId: "cs_test_setup_1",
        },
        { stripe, nowUnix: () => 1_999_999_999 },
      ),
    ).resolves.toMatchObject({
      status: "complete",
      session: { id: "cs_test_setup_1" },
    });
  });

  it("verifies the untouched webhook bytes with the configured secret", () => {
    const { api, stripe } = mockStripe();
    const rawBody = new Uint8Array([123, 34, 105, 100, 34, 58, 49, 125]);
    const event = { id: "evt_setup", type: "setup_intent.succeeded" };
    api.webhooks.constructEvent.mockReturnValue(event);

    expect(
      verifyStripeWebhookEvent(
        { rawBody, signature: "t=123,v1=signature" },
        { stripe, webhookSecret: "whsec_unit123" },
      ),
    ).toBe(event);
    expect(api.webhooks.constructEvent).toHaveBeenCalledWith(
      rawBody,
      "t=123,v1=signature",
      "whsec_unit123",
    );
  });

  it("retrieves and validates the succeeded card SetupIntent", async () => {
    const { api, stripe, setupIntent, paymentMethod } = mockStripe();

    await expect(
      retrieveSucceededCardSetup(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          setupIntentId: "seti_pro_1",
        },
        { stripe },
      ),
    ).resolves.toEqual({
      setupIntent,
      paymentMethod,
      paymentMethodId: "pm_card_1",
    });

    expect(api.setupIntents.retrieve).toHaveBeenCalledWith("seti_pro_1", {
      expand: ["payment_method"],
    });
    expect(api.paymentMethods.retrieve).not.toHaveBeenCalled();
  });

  it("retrieves the PaymentMethod when Stripe does not return the requested expansion", async () => {
    const { api, stripe, setupIntent, paymentMethod } = mockStripe();
    api.setupIntents.retrieve.mockResolvedValue({
      ...setupIntent,
      payment_method: "pm_card_1",
    });

    await expect(
      retrieveSucceededCardSetup(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          setupIntentId: "seti_pro_1",
        },
        { stripe },
      ),
    ).resolves.toEqual({
      setupIntent: { ...setupIntent, payment_method: "pm_card_1" },
      paymentMethod,
      paymentMethodId: "pm_card_1",
    });

    expect(api.paymentMethods.retrieve).toHaveBeenCalledWith("pm_card_1");
  });

  it("rejects a SetupIntent before it succeeds", async () => {
    const { api, stripe, setupIntent } = mockStripe();
    api.setupIntents.retrieve.mockResolvedValue({
      ...setupIntent,
      status: "requires_action",
    });

    await expect(
      retrieveSucceededCardSetup(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          setupIntentId: "seti_pro_1",
        },
        { stripe },
      ),
    ).rejects.toThrow("has not succeeded");
  });

  it("sets the Customer invoice default before creating a subscription", async () => {
    const { api, stripe, customer } = mockStripe();

    await expect(
      setCustomerDefaultPaymentMethod(
        { customerId: "cus_pro_1", paymentMethodId: "pm_card_1" },
        { stripe },
      ),
    ).resolves.toBe(customer);

    expect(api.customers.update).toHaveBeenCalledWith("cus_pro_1", {
      invoice_settings: { default_payment_method: "pm_card_1" },
    });
  });

  it("creates one configured monthly subscription with the exact trial end", async () => {
    const { api, stripe, subscription } = mockStripe();
    const trialEndUnix = 1_791_766_800;

    await expect(
      createMonthlyProSubscription(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          trialEndUnix,
          idempotencyKey: "subscription:pro-1:lifetime-trial",
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).resolves.toBe(subscription);

    const [params, requestOptions] = api.subscriptions.create.mock.calls[0];
    expect(params).toEqual({
      customer: "cus_pro_1",
      items: [{ price: "price_monthly_hkd_100", quantity: 1 }],
      collection_method: "charge_automatically",
      trial_end: trialEndUnix,
      trial_settings: {
        end_behavior: {
          missing_payment_method: "create_invoice",
        },
      },
      metadata: {
        proId: "pro-1",
        planCode: "pro_monthly_v1",
      },
    });
    expect(params).not.toHaveProperty("default_payment_method");
    expect(params).not.toHaveProperty("price_data");
    expect(params).not.toHaveProperty("amount");
    expect(requestOptions).toEqual({
      idempotencyKey: "subscription:pro-1:lifetime-trial",
    });
    expect(api.prices.retrieve).toHaveBeenCalledWith("price_monthly_hkd_100");
  });

  it("adopts the one matching remote subscription after a lost local write", async () => {
    const { api, stripe, price } = mockStripe();
    const trialEndUnix = 1_791_766_800;
    const existing = {
      id: "sub_recovered_1",
      object: "subscription",
      customer: "cus_pro_1",
      collection_method: "charge_automatically",
      status: "trialing",
      trial_end: trialEndUnix,
      metadata: {
        proId: "pro-1",
        planCode: "pro_monthly_v1",
      },
      items: {
        data: [{ price, quantity: 1 }],
      },
    } as unknown as Stripe.Subscription;
    api.subscriptions.list.mockResolvedValue({ data: [existing] });

    await expect(
      findExistingMonthlyProSubscription(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          trialEndUnix,
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).resolves.toBe(existing);
    expect(api.subscriptions.list).toHaveBeenCalledWith({
      customer: "cus_pro_1",
      status: "all",
      limit: 100,
    });
    expect(api.subscriptions.create).not.toHaveBeenCalled();
  });

  it("refuses to create a subscription for a misconfigured Price", async () => {
    const { api, stripe, price } = mockStripe();
    api.prices.retrieve.mockResolvedValue({
      ...price,
      unit_amount: 20_000,
    });

    await expect(
      createMonthlyProSubscription(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          trialEndUnix: 1_791_766_800,
          idempotencyKey: "subscription:pro-1:lifetime-trial",
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).rejects.toThrow("does not match the HK$100 monthly plan");
    expect(api.subscriptions.create).not.toHaveBeenCalled();
  });
});
