import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createCardSetupCheckoutSession,
  createMonthlyProSubscription,
  createPaidProSubscriptionCheckoutSession,
  createProPaymentMethodPortalSession,
  findExistingMonthlyProSubscription,
  getOwnedProSubscriptionInvoicePaymentUrl,
  getOrCreateStripeCustomerForPro,
  getStripeClient,
  inspectOwnedCardSetupCheckoutSession,
  inspectOwnedPaidProSubscriptionCheckoutSession,
  retrieveOpenCardSetupCheckoutSession,
  retrieveOwnedMonthlyProSubscription,
  retrieveOwnedProSubscriptionInvoice,
  retrieveSucceededCardSetup,
  retryProSubscriptionInvoicePayment,
  setCustomerDefaultPaymentMethod,
  setProSubscriptionAutoRenewal,
  STRIPE_PAID_REACTIVATION_PURPOSE,
  StripeBillingError,
  verifyStripeWebhookEvent,
} from "@/lib/stripe-billing";

function mockStripe() {
  const customer = {
    id: "cus_pro_1",
    object: "customer",
    deleted: undefined,
    metadata: { proId: "pro-1", accountType: "pro" },
    livemode: false,
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
  const price = {
    id: "price_monthly_hkd_100",
    object: "price",
    active: true,
    livemode: false,
    currency: "hkd",
    type: "recurring",
    unit_amount: 10_000,
    recurring: {
      interval: "month",
      interval_count: 1,
    },
  } as unknown as Stripe.Price;
  const subscription = {
    id: "sub_pro_1",
    object: "subscription",
    customer: customer.id,
    collection_method: "charge_automatically",
    currency: "hkd",
    status: "trialing",
    livemode: false,
    trial_end: 1_791_766_800,
    cancel_at_period_end: false,
    metadata: { proId: "pro-1", planCode: "pro_monthly_v1" },
    items: {
      data: [
        {
          price,
          quantity: 1,
          current_period_start: 1_783_990_800,
          current_period_end: 1_791_766_800,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
  const invoice = {
    id: "in_pro_1",
    object: "invoice",
    customer: customer.id,
    collection_method: "charge_automatically",
    currency: "hkd",
    livemode: false,
    status: "open",
    amount_remaining: 10_000,
    hosted_invoice_url: "https://invoice.stripe.test/in_pro_1",
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: {
        subscription: subscription.id,
        metadata: { proId: "pro-1", planCode: "pro_monthly_v1" },
      },
    },
  } as unknown as Stripe.Invoice;
  const portalSession = {
    id: "bps_pro_1",
    object: "billing_portal.session",
    customer: customer.id,
    url: "https://billing.stripe.test/session",
  } as unknown as Stripe.BillingPortal.Session;
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
      retrieve: vi.fn().mockResolvedValue(subscription),
      update: vi.fn().mockResolvedValue({
        ...subscription,
        cancel_at_period_end: true,
      }),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    invoices: {
      retrieve: vi.fn().mockResolvedValue(invoice),
      pay: vi.fn().mockResolvedValue({ ...invoice, status: "paid" }),
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue(portalSession),
      },
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
    invoice,
    portalSession,
    paymentMethod,
    price,
    setupIntent,
  };
}

function paidSubscriptionCheckoutSession(
  price: Stripe.Price,
  overrides: Partial<Stripe.Checkout.Session> = {},
) {
  return {
    id: "cs_paid_reactivation_1",
    object: "checkout.session",
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    customer: "cus_pro_1",
    client_reference_id: "pro-1",
    currency: "hkd",
    amount_subtotal: 10_000,
    amount_total: 10_000,
    payment_method_types: ["card"],
    livemode: false,
    expires_at: 2_000_000_000,
    subscription: null,
    url: "https://checkout.stripe.test/paid-reactivation",
    metadata: {
      proId: "pro-1",
      previousSubscriptionId: "sub_previous_1",
      purpose: STRIPE_PAID_REACTIVATION_PURPOSE,
      planCode: "pro_monthly_v1",
    },
    line_items: {
      data: [
        {
          id: "li_paid_reactivation_1",
          object: "item",
          price,
          quantity: 1,
          currency: "hkd",
          amount_subtotal: 10_000,
          amount_total: 10_000,
          amount_discount: 0,
          amount_tax: 0,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function endedPreviousSubscription(subscription: Stripe.Subscription) {
  return {
    ...subscription,
    id: "sub_previous_1",
    status: "canceled",
  } as Stripe.Subscription;
}

function paidReactivatedSubscription(subscription: Stripe.Subscription) {
  return {
    ...subscription,
    id: "sub_reactivated_1",
    status: "active",
    trial_start: null,
    trial_end: null,
  } as Stripe.Subscription;
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

  it("creates a card-only paid reactivation Checkout with the fixed monthly Price and no trial", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const previous = endedPreviousSubscription(subscription);
    const session = paidSubscriptionCheckoutSession(price);
    api.checkout.sessions.create.mockResolvedValue(session);
    api.subscriptions.retrieve.mockResolvedValue(previous);
    const successUrl = "https://hotfix24.test/pro/billing?reactivation=success";
    const cancelUrl =
      "https://hotfix24.test/pro/billing?reactivation=cancelled";

    await expect(
      createPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          successUrl,
          cancelUrl,
          expectedLivemode: false,
          idempotencyKey: "paid-reactivation:pro-1:attempt-1",
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).resolves.toBe(session);

    expect(api.checkout.sessions.create).toHaveBeenCalledWith(
      {
        mode: "subscription",
        customer: "cus_pro_1",
        client_reference_id: "pro-1",
        payment_method_types: ["card"],
        line_items: [{ price: "price_monthly_hkd_100", quantity: 1 }],
        allow_promotion_codes: false,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          proId: "pro-1",
          previousSubscriptionId: "sub_previous_1",
          purpose: STRIPE_PAID_REACTIVATION_PURPOSE,
          planCode: "pro_monthly_v1",
        },
        subscription_data: {
          metadata: {
            proId: "pro-1",
            previousSubscriptionId: "sub_previous_1",
            purpose: STRIPE_PAID_REACTIVATION_PURPOSE,
            planCode: "pro_monthly_v1",
          },
        },
      },
      { idempotencyKey: "paid-reactivation:pro-1:attempt-1" },
    );
    const createParams = api.checkout.sessions.create.mock.calls[0][0];
    expect(createParams.subscription_data).not.toHaveProperty(
      "trial_period_days",
    );
    expect(createParams.subscription_data).not.toHaveProperty("trial_end");
    expect(api.customers.retrieve).toHaveBeenCalledWith("cus_pro_1");
    expect(api.prices.retrieve).toHaveBeenCalledWith("price_monthly_hkd_100");
  });

  it("allows a fixed-price ID rotation after the historical subscription ended", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const historicalPrice = {
      ...price,
      id: "price_historical_hkd_100",
      active: false,
    } as Stripe.Price;
    const previous = {
      ...endedPreviousSubscription(subscription),
      items: {
        data: [
          {
            ...subscription.items.data[0],
            price: historicalPrice,
          },
        ],
      },
    } as Stripe.Subscription;
    api.subscriptions.retrieve.mockResolvedValue(previous);
    api.checkout.sessions.create.mockResolvedValue(
      paidSubscriptionCheckoutSession(price),
    );

    await expect(
      createPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          successUrl: "https://hotfix24.test/pro/billing?checkout=reactivated",
          cancelUrl: "https://hotfix24.test/pro/billing?checkout=cancelled",
          expectedLivemode: false,
          idempotencyKey: "paid-reactivation:price-rotation",
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).resolves.toMatchObject({ id: "cs_paid_reactivation_1" });
  });

  it("reuses only an owned open paid reactivation Checkout", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const session = paidSubscriptionCheckoutSession(price);
    api.checkout.sessions.retrieve.mockResolvedValue(session);
    api.subscriptions.retrieve.mockResolvedValue(
      endedPreviousSubscription(subscription),
    );

    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 1_999_999_999,
        },
      ),
    ).resolves.toEqual({
      status: "open",
      session,
      url: "https://checkout.stripe.test/paid-reactivation",
    });
    expect(api.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_paid_reactivation_1",
      { expand: ["line_items.data.price"] },
    );
    expect(api.subscriptions.retrieve).toHaveBeenCalledWith("sub_previous_1");
  });

  it("preserves a completed paid Checkout only after canonical no-trial validation", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const previous = endedPreviousSubscription(subscription);
    const paidSubscription = paidReactivatedSubscription(subscription);
    const session = paidSubscriptionCheckoutSession(price, {
      status: "complete",
      payment_status: "paid",
      subscription: paidSubscription.id,
      url: null,
    });
    api.checkout.sessions.retrieve.mockResolvedValue(session);
    api.subscriptions.retrieve.mockImplementation(async (subscriptionId) =>
      subscriptionId === previous.id ? previous : paidSubscription,
    );

    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 2_000_000_001,
        },
      ),
    ).resolves.toMatchObject({
      status: "complete",
      session: { id: "cs_paid_reactivation_1" },
      canonicalSubscription: {
        subscription: { id: "sub_reactivated_1", status: "active" },
      },
    });
    expect(api.subscriptions.retrieve).toHaveBeenCalledWith("sub_previous_1");
    expect(api.subscriptions.retrieve).toHaveBeenCalledWith(
      "sub_reactivated_1",
    );
  });

  it("returns an owned expired paid Checkout without reusing its URL", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const session = paidSubscriptionCheckoutSession(price, {
      status: "expired",
      url: null,
    });
    api.checkout.sessions.retrieve.mockResolvedValue(session);
    api.subscriptions.retrieve.mockResolvedValue(
      endedPreviousSubscription(subscription),
    );

    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 1_999_999_999,
        },
      ),
    ).resolves.toEqual({ status: "expired", session });
  });

  it("rejects paid Checkout price, amount, ownership or livemode drift", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    api.subscriptions.retrieve.mockResolvedValue(
      endedPreviousSubscription(subscription),
    );
    api.checkout.sessions.retrieve.mockResolvedValue(
      paidSubscriptionCheckoutSession(price, { amount_total: 20_000 }),
    );

    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 1_999_999_999,
        },
      ),
    ).rejects.toThrow("does not match the HK$100 monthly plan");

    api.checkout.sessions.retrieve.mockResolvedValue(
      paidSubscriptionCheckoutSession(price, {
        client_reference_id: "pro-2",
      }),
    );
    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 1_999_999_999,
        },
      ),
    ).rejects.toThrow("does not match this paid professional subscription");
  });

  it("rejects a completed paid reactivation if Stripe attached any trial", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const previous = endedPreviousSubscription(subscription);
    const trialingReactivation = {
      ...subscription,
      id: "sub_reactivated_1",
    } as Stripe.Subscription;
    const session = paidSubscriptionCheckoutSession(price, {
      status: "complete",
      payment_status: "paid",
      subscription: trialingReactivation.id,
      url: null,
    });
    api.checkout.sessions.retrieve.mockResolvedValue(session);
    api.subscriptions.retrieve.mockImplementation(async (subscriptionId) =>
      subscriptionId === previous.id ? previous : trialingReactivation,
    );

    await expect(
      inspectOwnedPaidProSubscriptionCheckoutSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          previousSubscriptionId: "sub_previous_1",
          checkoutSessionId: "cs_paid_reactivation_1",
          expectedLivemode: false,
        },
        {
          stripe,
          monthlyPriceId: "price_monthly_hkd_100",
          nowUnix: () => 1_999_999_999,
        },
      ),
    ).rejects.toThrow("does not match this professional plan");
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

  it("retrieves and validates canonical fixed-plan subscription state", async () => {
    const { api, stripe } = mockStripe();

    await expect(
      retrieveOwnedMonthlyProSubscription(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          subscriptionId: "sub_pro_1",
          expectedPriceId: "price_monthly_hkd_100",
          expectedTrialEndsAt: "2026-10-12T01:00:00.000Z",
          expectedLivemode: false,
        },
        { stripe, monthlyPriceId: "price_monthly_hkd_100" },
      ),
    ).resolves.toMatchObject({
      subscription: { id: "sub_pro_1" },
      item: { price: { id: "price_monthly_hkd_100" } },
    });
    expect(api.subscriptions.retrieve).toHaveBeenCalledWith("sub_pro_1");
  });

  it("validates a persisted historical Price after the configured Price rotates", async () => {
    const { api, stripe, price, subscription } = mockStripe();
    const historicalPrice = {
      ...price,
      id: "price_historical_hkd_100",
      active: false,
    } as Stripe.Price;
    const historicalSubscription = {
      ...subscription,
      items: {
        data: [
          {
            ...subscription.items.data[0],
            price: historicalPrice,
          },
        ],
      },
    } as Stripe.Subscription;
    api.subscriptions.retrieve.mockResolvedValue(historicalSubscription);

    const input = {
      proId: "pro-1",
      customerId: "cus_pro_1",
      subscriptionId: "sub_pro_1",
      expectedPriceId: "price_historical_hkd_100",
      expectedTrialEndsAt: "2026-10-12T01:00:00.000Z",
      expectedLivemode: false,
      allowHistoricalPriceId: true,
    } as const;

    await expect(
      retrieveOwnedMonthlyProSubscription(input, {
        stripe,
        monthlyPriceId: "price_new_monthly_hkd_100",
      }),
    ).resolves.toMatchObject({
      item: { price: { id: "price_historical_hkd_100", active: false } },
    });

    await expect(
      retrieveOwnedMonthlyProSubscription(
        { ...input, allowHistoricalPriceId: false },
        { stripe, monthlyPriceId: "price_new_monthly_hkd_100" },
      ),
    ).rejects.toThrow("configured Stripe Price does not match");

    await expect(
      retrieveOwnedMonthlyProSubscription(
        { ...input, expectedPriceId: "price_wrong_historical" },
        { stripe, monthlyPriceId: "price_new_monthly_hkd_100" },
      ),
    ).rejects.toThrow("does not match this professional plan");

    api.subscriptions.retrieve.mockResolvedValue({
      ...historicalSubscription,
      items: {
        data: [
          {
            ...historicalSubscription.items.data[0],
            price: { ...historicalPrice, unit_amount: 20_000 },
          },
        ],
      },
    } as Stripe.Subscription);
    await expect(
      retrieveOwnedMonthlyProSubscription(input, {
        stripe,
        monthlyPriceId: "price_new_monthly_hkd_100",
      }),
    ).rejects.toThrow("historical Stripe Price does not match");
  });

  it("forces cancellation to period end with no proration", async () => {
    const { api, stripe } = mockStripe();

    await setProSubscriptionAutoRenewal(
      {
        proId: "pro-1",
        customerId: "cus_pro_1",
        subscriptionId: "sub_pro_1",
        expectedPriceId: "price_monthly_hkd_100",
        expectedTrialEndsAt: "2026-10-12T01:00:00.000Z",
        expectedLivemode: false,
        cancelAtPeriodEnd: true,
        idempotencyKey: "cancel:pro-1:attempt-1",
      },
      { stripe, monthlyPriceId: "price_monthly_hkd_100" },
    );

    expect(api.subscriptions.update).toHaveBeenCalledWith(
      "sub_pro_1",
      { cancel_at_period_end: true, proration_behavior: "none" },
      { idempotencyKey: "cancel:pro-1:attempt-1" },
    );
  });

  it("opens only the hosted payment-method update portal flow", async () => {
    const { api, stripe, portalSession } = mockStripe();
    const returnUrl = "https://hotfix24.test/pro/billing?billing=updated";

    await expect(
      createProPaymentMethodPortalSession(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          returnUrl,
        },
        { stripe },
      ),
    ).resolves.toBe(portalSession);
    expect(api.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_pro_1",
      locale: "zh-HK",
      return_url: returnUrl,
      flow_data: {
        type: "payment_method_update",
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      },
    });
    expect(
      api.billingPortal.sessions.create.mock.calls[0][0],
    ).not.toHaveProperty("subscription_update");
  });

  it("validates an owned invoice before exposing its Stripe-hosted payment page", async () => {
    const { api, stripe, invoice } = mockStripe();
    const input = {
      proId: "pro-1",
      customerId: "cus_pro_1",
      subscriptionId: "sub_pro_1",
      invoiceId: "in_pro_1",
      expectedLivemode: false,
    };

    await expect(
      retrieveOwnedProSubscriptionInvoice(input, { stripe }),
    ).resolves.toBe(invoice);
    await expect(
      getOwnedProSubscriptionInvoicePaymentUrl(input, { stripe }),
    ).resolves.toEqual({
      invoice,
      url: "https://invoice.stripe.test/in_pro_1",
    });
    expect(api.invoices.retrieve).toHaveBeenCalledWith("in_pro_1");
  });

  it("retries only an owned open invoice with the Customer default card", async () => {
    const { api, stripe } = mockStripe();

    await retryProSubscriptionInvoicePayment(
      {
        proId: "pro-1",
        customerId: "cus_pro_1",
        subscriptionId: "sub_pro_1",
        invoiceId: "in_pro_1",
        expectedLivemode: false,
        idempotencyKey: "invoice:retry:attempt-1",
      },
      { stripe },
    );

    expect(api.invoices.pay).toHaveBeenCalledWith(
      "in_pro_1",
      { off_session: true },
      { idempotencyKey: "invoice:retry:attempt-1" },
    );
  });

  it("rejects an invoice whose immutable plan ownership metadata differs", async () => {
    const { api, stripe, invoice } = mockStripe();
    api.invoices.retrieve.mockResolvedValue({
      ...invoice,
      parent: {
        ...invoice.parent,
        subscription_details: {
          ...invoice.parent!.subscription_details,
          metadata: { proId: "pro-2", planCode: "pro_monthly_v1" },
        },
      },
    });

    await expect(
      retrieveOwnedProSubscriptionInvoice(
        {
          proId: "pro-1",
          customerId: "cus_pro_1",
          subscriptionId: "sub_pro_1",
          invoiceId: "in_pro_1",
        },
        { stripe },
      ),
    ).rejects.toThrow("does not match this professional plan");
  });
});
