import Stripe from "stripe";

import { env } from "@/lib/env";
import {
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_CURRENCY,
  PRO_SUBSCRIPTION_INTERVAL,
  PRO_SUBSCRIPTION_PLAN_CODE,
} from "@/lib/subscription-policy";

const STRIPE_API_VERSION = Stripe.API_VERSION;
const STRIPE_REQUEST_TIMEOUT_MS = 20_000;
export const STRIPE_CARD_SETUP_PURPOSE = "pro_subscription_card_setup" as const;
export const STRIPE_PAID_REACTIVATION_PURPOSE =
  "pro_subscription_paid_reactivation" as const;

export type StripeClientFactory = (
  secretKey: string,
  config: Stripe.StripeConfig,
) => Stripe;

export interface StripeClientOptions {
  secretKey?: string;
  createClient?: StripeClientFactory;
}

export interface StripeBillingDependencies {
  stripe?: Stripe;
  monthlyPriceId?: string;
  webhookSecret?: string;
  nowUnix?: () => number;
}

export class StripeBillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeBillingError";
  }
}

let defaultStripeClient: Stripe | undefined;
let defaultStripeSecretKey: string | undefined;

function createDefaultStripeClient(
  secretKey: string,
  config: Stripe.StripeConfig,
) {
  return new Stripe(secretKey, config);
}

function requireNonEmpty(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new StripeBillingError(`${fieldName} is required.`);
  }

  return normalized;
}

function requireStripeId(
  value: string,
  prefix: "cus_" | "seti_" | "pm_" | "price_" | "cs_" | "sub_" | "in_",
  fieldName: string,
) {
  const normalized = requireNonEmpty(value, fieldName);
  if (!normalized.startsWith(prefix)) {
    throw new StripeBillingError(`${fieldName} is invalid.`);
  }

  return normalized;
}

function requireHttpUrl(value: string, fieldName: string) {
  const normalized = requireNonEmpty(value, fieldName);

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new StripeBillingError(`${fieldName} must be an HTTP(S) URL.`);
  }

  return normalized;
}

function requireIdempotencyKey(value: string) {
  const normalized = requireNonEmpty(value, "idempotencyKey");
  if (normalized.length > 255) {
    throw new StripeBillingError(
      "idempotencyKey must contain at most 255 characters.",
    );
  }

  return normalized;
}

function resolveStripe(dependencies: StripeBillingDependencies) {
  return dependencies.stripe ?? getStripeClient();
}

function configuredMonthlyPriceId(dependencies: StripeBillingDependencies) {
  return requireStripeId(
    dependencies.monthlyPriceId ?? env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    "price_",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
  );
}

function assertConfiguredMonthlyPrice(
  price: Stripe.Price,
  monthlyPriceId: string,
) {
  if (
    price.id !== monthlyPriceId ||
    !price.active ||
    price.type !== "recurring" ||
    price.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    price.unit_amount !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    price.recurring?.interval !== PRO_SUBSCRIPTION_INTERVAL ||
    price.recurring.interval_count !== 1
  ) {
    throw new StripeBillingError(
      "The configured Stripe Price does not match the HK$100 monthly plan.",
    );
  }
}

function assertHistoricalMonthlyPlanPrice(price: Stripe.Price) {
  if (
    price.type !== "recurring" ||
    price.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    price.unit_amount !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    price.recurring?.interval !== PRO_SUBSCRIPTION_INTERVAL ||
    price.recurring.interval_count !== 1
  ) {
    throw new StripeBillingError(
      "The historical Stripe Price does not match the HK$100 monthly plan.",
    );
  }
}

function configuredWebhookSecret(dependencies: StripeBillingDependencies) {
  const value = requireNonEmpty(
    dependencies.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET ?? "",
    "STRIPE_WEBHOOK_SECRET",
  );

  if (!value.startsWith("whsec_")) {
    throw new StripeBillingError("STRIPE_WEBHOOK_SECRET is invalid.");
  }

  return value;
}

function expandableId(
  value: { id: string } | string | null | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

/**
 * Returns the server-only Stripe client. Construction is lazy so builds and
 * tests that do not use billing do not require Stripe credentials.
 */
export function getStripeClient(options: StripeClientOptions = {}) {
  const secretKey = requireNonEmpty(
    options.secretKey ?? env.STRIPE_SECRET_KEY ?? "",
    "STRIPE_SECRET_KEY",
  );

  if (!/^sk_(?:test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
    throw new StripeBillingError("STRIPE_SECRET_KEY is invalid.");
  }

  const config: Stripe.StripeConfig = {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    maxNetworkRetries: 2,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    emitEventBodies: false,
  };

  if (options.createClient) {
    return options.createClient(secretKey, config);
  }

  if (!defaultStripeClient || defaultStripeSecretKey !== secretKey) {
    defaultStripeClient = createDefaultStripeClient(secretKey, config);
    defaultStripeSecretKey = secretKey;
  }

  return defaultStripeClient;
}

export interface CreateStripeCustomerForProInput {
  proId: string;
  email?: string;
  name?: string;
  idempotencyKey: string;
}

export async function createStripeCustomerForPro(
  input: CreateStripeCustomerForProInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);

  return stripe.customers.create(
    {
      ...(input.email ? { email: input.email.trim() } : {}),
      ...(input.name ? { name: input.name.trim() } : {}),
      preferred_locales: ["zh-HK"],
      metadata: {
        proId,
        accountType: "pro",
      },
    },
    { idempotencyKey },
  );
}

export interface RetrieveStripeCustomerForProInput {
  proId: string;
  customerId: string;
}

export async function retrieveStripeCustomerForPro(
  input: RetrieveStripeCustomerForProInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    throw new StripeBillingError("The Stripe Customer has been deleted.");
  }

  if (customer.metadata.proId !== proId) {
    throw new StripeBillingError(
      "The Stripe Customer does not belong to this professional account.",
    );
  }

  return customer;
}

export interface GetOrCreateStripeCustomerForProInput extends CreateStripeCustomerForProInput {
  existingCustomerId?: string;
}

export function getOrCreateStripeCustomerForPro(
  input: GetOrCreateStripeCustomerForProInput,
  dependencies: StripeBillingDependencies = {},
) {
  if (input.existingCustomerId) {
    return retrieveStripeCustomerForPro(
      {
        proId: input.proId,
        customerId: input.existingCustomerId,
      },
      dependencies,
    );
  }

  return createStripeCustomerForPro(input, dependencies);
}

export interface CreateCardSetupCheckoutSessionInput {
  proId: string;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

/**
 * Creates a hosted, card-only setup flow. There are deliberately no amount,
 * price, mode, line-item or arbitrary metadata inputs on this boundary.
 */
export function createCardSetupCheckoutSession(
  input: CreateCardSetupCheckoutSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const successUrl = requireHttpUrl(input.successUrl, "successUrl");
  const cancelUrl = requireHttpUrl(input.cancelUrl, "cancelUrl");
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const metadata = {
    proId,
    purpose: STRIPE_CARD_SETUP_PURPOSE,
    planCode: PRO_SUBSCRIPTION_PLAN_CODE,
  };

  return stripe.checkout.sessions.create(
    {
      mode: "setup",
      customer: customerId,
      client_reference_id: proId,
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      setup_intent_data: { metadata },
    },
    { idempotencyKey },
  );
}

export interface CreatePaidProSubscriptionCheckoutSessionInput {
  proId: string;
  customerId: string;
  previousSubscriptionId: string;
  successUrl: string;
  cancelUrl: string;
  expectedLivemode?: boolean;
  idempotencyKey: string;
}

function paidReactivationMetadata(
  proId: string,
  previousSubscriptionId: string,
) {
  return {
    proId,
    previousSubscriptionId,
    purpose: STRIPE_PAID_REACTIVATION_PURPOSE,
    planCode: PRO_SUBSCRIPTION_PLAN_CODE,
  };
}

function assertPaidProCheckoutIdentity(
  session: Stripe.Checkout.Session,
  input: {
    proId: string;
    customerId: string;
    previousSubscriptionId: string;
    expectedLivemode: boolean;
  },
) {
  if (
    session.mode !== "subscription" ||
    session.client_reference_id !== input.proId ||
    session.metadata?.proId !== input.proId ||
    session.metadata?.previousSubscriptionId !== input.previousSubscriptionId ||
    session.metadata?.purpose !== STRIPE_PAID_REACTIVATION_PURPOSE ||
    session.metadata?.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    expandableId(session.customer) !== input.customerId ||
    session.livemode !== input.expectedLivemode ||
    session.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    session.payment_method_types.length !== 1 ||
    session.payment_method_types[0] !== "card"
  ) {
    throw new StripeBillingError(
      "The Stripe Checkout Session does not match this paid professional subscription flow.",
    );
  }
}

async function retrieveEndedPreviousProSubscription(
  input: {
    proId: string;
    customerId: string;
    previousSubscriptionId: string;
    expectedLivemode?: boolean;
  },
  dependencies: StripeBillingDependencies,
) {
  const previous = await retrieveOwnedMonthlyProSubscription(
    {
      proId: input.proId,
      customerId: input.customerId,
      subscriptionId: input.previousSubscriptionId,
      expectedLivemode: input.expectedLivemode,
      allowHistoricalPriceId: true,
    },
    dependencies,
  );
  if (previous.subscription.status !== "canceled") {
    throw new StripeBillingError(
      "The previous Stripe subscription has not ended.",
    );
  }
  return previous;
}

/**
 * Starts a new paid subscription after a previous subscription has ended. The
 * fixed recurring Price is server configured and no trial input is exposed.
 */
export async function createPaidProSubscriptionCheckoutSession(
  input: CreatePaidProSubscriptionCheckoutSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const previousSubscriptionId = requireStripeId(
    input.previousSubscriptionId,
    "sub_",
    "previousSubscriptionId",
  );
  const successUrl = requireHttpUrl(input.successUrl, "successUrl");
  const cancelUrl = requireHttpUrl(input.cancelUrl, "cancelUrl");
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const monthlyPriceId = configuredMonthlyPriceId(dependencies);
  const [customer, price, previous] = await Promise.all([
    retrieveStripeCustomerForPro({ proId, customerId }, dependencies),
    stripe.prices.retrieve(monthlyPriceId),
    retrieveEndedPreviousProSubscription(
      {
        proId,
        customerId,
        previousSubscriptionId,
        expectedLivemode: input.expectedLivemode,
      },
      dependencies,
    ),
  ]);
  assertConfiguredMonthlyPrice(price, monthlyPriceId);
  const expectedLivemode = previous.subscription.livemode;
  if (
    customer.metadata.accountType !== "pro" ||
    customer.livemode !== expectedLivemode ||
    price.livemode !== expectedLivemode
  ) {
    throw new StripeBillingError(
      "The Stripe Customer or Price livemode does not match this professional account.",
    );
  }

  const metadata = paidReactivationMetadata(proId, previousSubscriptionId);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: proId,
      payment_method_types: ["card"],
      line_items: [{ price: monthlyPriceId, quantity: 1 }],
      allow_promotion_codes: false,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: { metadata },
    },
    { idempotencyKey },
  );
  assertPaidProCheckoutIdentity(session, {
    proId,
    customerId,
    previousSubscriptionId,
    expectedLivemode,
  });
  if (session.status !== "open" || !session.url) {
    throw new StripeBillingError(
      "Stripe did not return an open paid subscription Checkout Session.",
    );
  }
  requireHttpUrl(session.url, "Stripe Checkout Session URL");
  return session;
}

export interface InspectOwnedPaidProSubscriptionCheckoutSessionInput {
  proId: string;
  customerId: string;
  previousSubscriptionId: string;
  checkoutSessionId: string;
  expectedLivemode?: boolean;
}

/**
 * Reuses an open paid Checkout or preserves a completed one for its signed
 * webhook. Completed sessions must own a canonical, no-trial fixed plan.
 */
export async function inspectOwnedPaidProSubscriptionCheckoutSession(
  input: InspectOwnedPaidProSubscriptionCheckoutSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const checkoutSessionId = requireStripeId(
    input.checkoutSessionId,
    "cs_",
    "checkoutSessionId",
  );
  const previousSubscriptionId = requireStripeId(
    input.previousSubscriptionId,
    "sub_",
    "previousSubscriptionId",
  );
  const monthlyPriceId = configuredMonthlyPriceId(dependencies);
  const [session, previous] = await Promise.all([
    stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["line_items.data.price"],
    }),
    retrieveEndedPreviousProSubscription(
      {
        proId,
        customerId,
        previousSubscriptionId,
        expectedLivemode: input.expectedLivemode,
      },
      dependencies,
    ),
  ]);
  const expectedLivemode = previous.subscription.livemode;
  assertPaidProCheckoutIdentity(session, {
    proId,
    customerId,
    previousSubscriptionId,
    expectedLivemode,
  });

  const lineItem = session.line_items?.data[0];
  const price = lineItem?.price;
  if (
    session.line_items?.data.length !== 1 ||
    !lineItem ||
    !price ||
    lineItem.quantity !== 1 ||
    lineItem.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    lineItem.amount_subtotal !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    lineItem.amount_total !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    lineItem.amount_discount !== 0 ||
    lineItem.amount_tax !== 0 ||
    session.amount_subtotal !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    session.amount_total !== PRO_SUBSCRIPTION_AMOUNT_MINOR ||
    price.livemode !== expectedLivemode
  ) {
    throw new StripeBillingError(
      "The Stripe Checkout line item does not match the HK$100 monthly plan.",
    );
  }
  assertConfiguredMonthlyPrice(price, monthlyPriceId);

  const nowUnix = dependencies.nowUnix?.() ?? Date.now() / 1_000;
  if (!Number.isFinite(nowUnix)) {
    throw new StripeBillingError("The current Unix timestamp is invalid.");
  }
  if (session.status === "expired") {
    return { status: "expired" as const, session };
  }
  if (session.status === "open") {
    if (session.expires_at <= Math.floor(nowUnix)) {
      return { status: "expired" as const, session };
    }
    if (
      session.subscription ||
      session.payment_status !== "unpaid" ||
      !session.url
    ) {
      throw new StripeBillingError(
        "The open Stripe Checkout Session state is invalid.",
      );
    }
    return {
      status: "open" as const,
      session,
      url: requireHttpUrl(session.url, "Stripe Checkout Session URL"),
    };
  }
  if (session.status !== "complete" || session.payment_status !== "paid") {
    throw new StripeBillingError(
      "The completed Stripe Checkout Session payment state is invalid.",
    );
  }
  const stripeSubscriptionId = expandableId(session.subscription);
  if (!stripeSubscriptionId) {
    throw new StripeBillingError(
      "The completed Stripe Checkout Session has no subscription.",
    );
  }
  const canonicalSubscription = await retrieveOwnedMonthlyProSubscription(
    {
      proId,
      customerId,
      subscriptionId: stripeSubscriptionId,
      expectedPriceId: monthlyPriceId,
      expectedLivemode,
      expectedNoTrial: true,
    },
    dependencies,
  );
  return {
    status: "complete" as const,
    session,
    canonicalSubscription,
  };
}

export interface RetrieveOpenCardSetupCheckoutSessionInput {
  proId: string;
  customerId: string;
  checkoutSessionId: string;
}

/**
 * Inspects an owned Checkout Session without treating "complete" as
 * replaceable. A completed Session must remain attached locally until its
 * signed webhook consumes the trial.
 */
export async function inspectOwnedCardSetupCheckoutSession(
  input: RetrieveOpenCardSetupCheckoutSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const checkoutSessionId = requireStripeId(
    input.checkoutSessionId,
    "cs_",
    "checkoutSessionId",
  );
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

  if (
    session.mode !== "setup" ||
    session.client_reference_id !== proId ||
    session.metadata?.proId !== proId ||
    session.metadata?.purpose !== STRIPE_CARD_SETUP_PURPOSE ||
    session.metadata?.planCode !== PRO_SUBSCRIPTION_PLAN_CODE
  ) {
    throw new StripeBillingError(
      "The Stripe Checkout Session does not belong to this card setup flow.",
    );
  }

  if (expandableId(session.customer) !== customerId) {
    throw new StripeBillingError(
      "The Stripe Checkout Session does not belong to this Customer.",
    );
  }

  const nowUnix = dependencies.nowUnix?.() ?? Date.now() / 1000;
  if (!Number.isFinite(nowUnix)) {
    throw new StripeBillingError("The current Unix timestamp is invalid.");
  }

  if (session.status === "complete") {
    return { status: "complete" as const, session };
  }
  if (
    session.status === "expired" ||
    session.expires_at <= Math.floor(nowUnix)
  ) {
    return { status: "expired" as const, session };
  }
  if (session.status !== "open") {
    throw new StripeBillingError(
      "The Stripe Checkout Session status is invalid.",
    );
  }

  if (!session.url) {
    throw new StripeBillingError("The Stripe Checkout Session has no URL.");
  }

  requireHttpUrl(session.url, "Stripe Checkout Session URL");
  return { status: "open" as const, session, url: session.url };
}

/**
 * Reuses only a still-open Checkout Session whose server-owned identity and
 * fixed setup-flow metadata all match the current professional account.
 */
export async function retrieveOpenCardSetupCheckoutSession(
  input: RetrieveOpenCardSetupCheckoutSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const state = await inspectOwnedCardSetupCheckoutSession(input, dependencies);
  if (state.status !== "open") {
    throw new StripeBillingError("The Stripe Checkout Session is not open.");
  }

  return state.session;
}

export interface VerifyStripeWebhookEventInput {
  rawBody: string | Uint8Array;
  signature: string;
}

export function verifyStripeWebhookEvent(
  input: VerifyStripeWebhookEventInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const signature = requireNonEmpty(input.signature, "Stripe signature");
  const webhookSecret = configuredWebhookSecret(dependencies);

  return stripe.webhooks.constructEvent(
    input.rawBody,
    signature,
    webhookSecret,
  );
}

export interface RetrieveSucceededCardSetupInput {
  proId: string;
  customerId: string;
  setupIntentId: string;
}

export interface SucceededCardSetup {
  setupIntent: Stripe.SetupIntent;
  paymentMethod: Stripe.PaymentMethod;
  paymentMethodId: string;
}

export async function retrieveSucceededCardSetup(
  input: RetrieveSucceededCardSetupInput,
  dependencies: StripeBillingDependencies = {},
): Promise<SucceededCardSetup> {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const setupIntentId = requireStripeId(
    input.setupIntentId,
    "seti_",
    "setupIntentId",
  );
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });

  if (setupIntent.status !== "succeeded") {
    throw new StripeBillingError("The Stripe SetupIntent has not succeeded.");
  }

  if (expandableId(setupIntent.customer) !== customerId) {
    throw new StripeBillingError(
      "The Stripe SetupIntent does not belong to this Customer.",
    );
  }

  if (
    setupIntent.metadata?.proId !== proId ||
    setupIntent.metadata?.purpose !== STRIPE_CARD_SETUP_PURPOSE ||
    setupIntent.metadata?.planCode !== PRO_SUBSCRIPTION_PLAN_CODE
  ) {
    throw new StripeBillingError(
      "The Stripe SetupIntent does not belong to this professional account.",
    );
  }

  const expandedPaymentMethod = setupIntent.payment_method;
  if (!expandedPaymentMethod) {
    throw new StripeBillingError(
      "The succeeded Stripe SetupIntent has no payment method.",
    );
  }

  const paymentMethod =
    typeof expandedPaymentMethod === "string"
      ? await stripe.paymentMethods.retrieve(expandedPaymentMethod)
      : expandedPaymentMethod;

  if (paymentMethod.type !== "card") {
    throw new StripeBillingError(
      "The saved Stripe payment method is not a card.",
    );
  }

  if (expandableId(paymentMethod.customer) !== customerId) {
    throw new StripeBillingError(
      "The saved Stripe payment method does not belong to this Customer.",
    );
  }

  return {
    setupIntent,
    paymentMethod,
    paymentMethodId: paymentMethod.id,
  };
}

export interface SetCustomerDefaultPaymentMethodInput {
  customerId: string;
  paymentMethodId: string;
}

export function setCustomerDefaultPaymentMethod(
  input: SetCustomerDefaultPaymentMethodInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const paymentMethodId = requireStripeId(
    input.paymentMethodId,
    "pm_",
    "paymentMethodId",
  );

  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

export interface CreateMonthlyProSubscriptionInput {
  proId: string;
  customerId: string;
  trialEndUnix: number;
  idempotencyKey: string;
}

export interface FindExistingMonthlyProSubscriptionInput {
  proId: string;
  customerId: string;
  trialEndUnix: number;
}

/**
 * Reconciles a remote subscription after a process dies between Stripe
 * creation and the local activation write. This remains safe after Stripe's
 * idempotency-key retention window has elapsed.
 */
export async function findExistingMonthlyProSubscription(
  input: FindExistingMonthlyProSubscriptionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const monthlyPriceId = configuredMonthlyPriceId(dependencies);
  if (!Number.isSafeInteger(input.trialEndUnix) || input.trialEndUnix <= 0) {
    throw new StripeBillingError(
      "trialEndUnix must be a positive Unix timestamp in whole seconds.",
    );
  }

  const candidates: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  let examined = 0;
  do {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    examined += subscriptions.data.length;
    candidates.push(
      ...subscriptions.data.filter(
        (subscription) =>
          expandableId(subscription.customer) === customerId &&
          subscription.metadata.proId === proId &&
          subscription.metadata.planCode === PRO_SUBSCRIPTION_PLAN_CODE,
      ),
    );

    if (!subscriptions.has_more) {
      break;
    }
    const lastSubscription = subscriptions.data.at(-1);
    if (!lastSubscription || examined >= 1_000) {
      throw new StripeBillingError(
        "Unable to safely reconcile all Stripe subscriptions.",
      );
    }
    startingAfter = lastSubscription.id;
  } while (true);

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length !== 1) {
    throw new StripeBillingError(
      "Multiple Stripe subscriptions match this professional account.",
    );
  }

  const subscription = candidates[0];
  const item = subscription.items.data[0];
  if (
    subscription.items.data.length !== 1 ||
    !item ||
    !["trialing", "active"].includes(subscription.status) ||
    item.quantity !== 1 ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.trial_end !== input.trialEndUnix
  ) {
    throw new StripeBillingError(
      "The existing Stripe subscription does not match the expected trial.",
    );
  }
  assertConfiguredMonthlyPrice(item.price, monthlyPriceId);

  return subscription;
}

/**
 * Creates the single configured monthly plan. The saved Customer invoice
 * default is intentionally used; no subscription-level payment method can be
 * supplied by a caller.
 */
export async function createMonthlyProSubscription(
  input: CreateMonthlyProSubscriptionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const monthlyPriceId = configuredMonthlyPriceId(dependencies);
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);

  if (!Number.isSafeInteger(input.trialEndUnix) || input.trialEndUnix <= 0) {
    throw new StripeBillingError(
      "trialEndUnix must be a positive Unix timestamp in whole seconds.",
    );
  }

  const price = await stripe.prices.retrieve(monthlyPriceId);
  assertConfiguredMonthlyPrice(price, monthlyPriceId);

  return stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: monthlyPriceId, quantity: 1 }],
      collection_method: "charge_automatically",
      trial_end: input.trialEndUnix,
      trial_settings: {
        end_behavior: {
          missing_payment_method: "create_invoice",
        },
      },
      metadata: {
        proId,
        planCode: PRO_SUBSCRIPTION_PLAN_CODE,
      },
    },
    { idempotencyKey },
  );
}

export interface RetrieveOwnedMonthlyProSubscriptionInput {
  proId: string;
  customerId: string;
  subscriptionId: string;
  expectedPriceId?: string;
  expectedTrialEndsAt?: string;
  expectedLivemode?: boolean;
  expectedNoTrial?: boolean;
  allowHistoricalPriceId?: boolean;
}

function assertUnixTimestamp(value: number, fieldName: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new StripeBillingError(`${fieldName} is invalid.`);
  }
}

function expectedTrialEndUnix(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp % 1_000) {
    throw new StripeBillingError("expectedTrialEndsAt is invalid.");
  }

  return timestamp / 1_000;
}

function assertOwnedMonthlyProSubscription(
  subscription: Stripe.Subscription,
  input: RetrieveOwnedMonthlyProSubscriptionInput,
  dependencies: StripeBillingDependencies,
) {
  const monthlyPriceId = configuredMonthlyPriceId(dependencies);
  const item = subscription.items.data[0];
  const trialEndUnix = expectedTrialEndUnix(input.expectedTrialEndsAt);

  if (
    subscription.id !== input.subscriptionId ||
    expandableId(subscription.customer) !== input.customerId ||
    subscription.metadata.proId !== input.proId ||
    subscription.metadata.planCode !== PRO_SUBSCRIPTION_PLAN_CODE ||
    subscription.collection_method !== "charge_automatically" ||
    subscription.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    subscription.items.data.length !== 1 ||
    !item ||
    item.quantity !== 1 ||
    (input.expectedPriceId && item.price.id !== input.expectedPriceId) ||
    (input.expectedLivemode !== undefined &&
      subscription.livemode !== input.expectedLivemode) ||
    (trialEndUnix !== undefined && subscription.trial_end !== trialEndUnix) ||
    (input.expectedNoTrial &&
      (subscription.status === "trialing" ||
        subscription.trial_start !== null ||
        subscription.trial_end !== null))
  ) {
    throw new StripeBillingError(
      "The Stripe subscription does not match this professional plan.",
    );
  }

  if (input.allowHistoricalPriceId) {
    assertHistoricalMonthlyPlanPrice(item.price);
  } else {
    assertConfiguredMonthlyPrice(item.price, monthlyPriceId);
  }
  assertUnixTimestamp(item.current_period_start, "current period start");
  assertUnixTimestamp(item.current_period_end, "current period end");
  if (item.current_period_end <= item.current_period_start) {
    throw new StripeBillingError("The Stripe subscription period is invalid.");
  }

  return { subscription, item };
}

/**
 * Retrieves canonical Stripe state and checks every server-owned identifier and
 * fixed-plan attribute before it can be applied to local lifecycle state.
 */
export async function retrieveOwnedMonthlyProSubscription(
  input: RetrieveOwnedMonthlyProSubscriptionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const normalized = {
    ...input,
    proId: requireNonEmpty(input.proId, "proId"),
    customerId: requireStripeId(input.customerId, "cus_", "customerId"),
    subscriptionId: requireStripeId(
      input.subscriptionId,
      "sub_",
      "subscriptionId",
    ),
    ...(input.expectedPriceId
      ? {
          expectedPriceId: requireStripeId(
            input.expectedPriceId,
            "price_",
            "expectedPriceId",
          ),
        }
      : {}),
  };
  const subscription = await stripe.subscriptions.retrieve(
    normalized.subscriptionId,
  );
  return assertOwnedMonthlyProSubscription(
    subscription,
    normalized,
    dependencies,
  );
}

export interface SetProSubscriptionAutoRenewalInput extends RetrieveOwnedMonthlyProSubscriptionInput {
  cancelAtPeriodEnd: boolean;
  idempotencyKey: string;
}

/**
 * Cancellation is always scheduled at period end and never prorated. Passing
 * false safely withdraws a still-pending cancellation before Stripe ends it.
 */
export async function setProSubscriptionAutoRenewal(
  input: SetProSubscriptionAutoRenewalInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const current = await retrieveOwnedMonthlyProSubscription(
    input,
    dependencies,
  );
  if (current.subscription.status === "canceled") {
    throw new StripeBillingError("The Stripe subscription has already ended.");
  }
  if (current.subscription.cancel_at_period_end === input.cancelAtPeriodEnd) {
    return current;
  }

  const updated = await stripe.subscriptions.update(
    current.subscription.id,
    {
      cancel_at_period_end: input.cancelAtPeriodEnd,
      proration_behavior: "none",
    },
    { idempotencyKey: requireIdempotencyKey(input.idempotencyKey) },
  );
  return assertOwnedMonthlyProSubscription(updated, input, dependencies);
}

export interface CreateProPaymentMethodPortalSessionInput {
  proId: string;
  customerId: string;
  returnUrl: string;
  locale?: "en" | "zh-HK";
}

/**
 * Opens only Stripe's payment-method update flow. It does not expose generic
 * portal subscription modifications, which could end a trial immediately or
 * bypass the application's period-end cancellation policy.
 */
export async function createProPaymentMethodPortalSession(
  input: CreateProPaymentMethodPortalSessionInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const proId = requireNonEmpty(input.proId, "proId");
  const customerId = requireStripeId(input.customerId, "cus_", "customerId");
  const returnUrl = requireHttpUrl(input.returnUrl, "returnUrl");

  await retrieveStripeCustomerForPro({ proId, customerId }, dependencies);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    locale: input.locale ?? "zh-HK",
    return_url: returnUrl,
    flow_data: {
      type: "payment_method_update",
      after_completion: {
        type: "redirect",
        redirect: { return_url: returnUrl },
      },
    },
  });
  requireHttpUrl(session.url, "Stripe Billing Portal URL");
  if (session.customer !== customerId) {
    throw new StripeBillingError(
      "The Stripe Billing Portal Session belongs to another Customer.",
    );
  }

  return session;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return expandableId(invoice.parent?.subscription_details?.subscription);
}

export interface RetrieveOwnedProSubscriptionInvoiceInput {
  proId: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  expectedLivemode?: boolean;
}

function assertOwnedProSubscriptionInvoice(
  invoice: Stripe.Invoice,
  input: RetrieveOwnedProSubscriptionInvoiceInput,
) {
  if (
    invoice.id !== input.invoiceId ||
    expandableId(invoice.customer) !== input.customerId ||
    invoiceSubscriptionId(invoice) !== input.subscriptionId ||
    invoice.parent?.subscription_details?.metadata?.proId !== input.proId ||
    invoice.parent.subscription_details.metadata?.planCode !==
      PRO_SUBSCRIPTION_PLAN_CODE ||
    invoice.collection_method !== "charge_automatically" ||
    invoice.currency !== PRO_SUBSCRIPTION_CURRENCY ||
    (input.expectedLivemode !== undefined &&
      invoice.livemode !== input.expectedLivemode)
  ) {
    throw new StripeBillingError(
      "The Stripe invoice does not match this professional plan.",
    );
  }

  return invoice;
}

export async function retrieveOwnedProSubscriptionInvoice(
  input: RetrieveOwnedProSubscriptionInvoiceInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const normalized = {
    ...input,
    proId: requireNonEmpty(input.proId, "proId"),
    customerId: requireStripeId(input.customerId, "cus_", "customerId"),
    subscriptionId: requireStripeId(
      input.subscriptionId,
      "sub_",
      "subscriptionId",
    ),
    invoiceId: requireStripeId(input.invoiceId, "in_", "invoiceId"),
  };
  const invoice = await stripe.invoices.retrieve(normalized.invoiceId);
  return assertOwnedProSubscriptionInvoice(invoice, normalized);
}

export async function getOwnedProSubscriptionInvoicePaymentUrl(
  input: RetrieveOwnedProSubscriptionInvoiceInput,
  dependencies: StripeBillingDependencies = {},
) {
  const invoice = await retrieveOwnedProSubscriptionInvoice(
    input,
    dependencies,
  );
  if (
    invoice.status !== "open" ||
    invoice.amount_remaining <= 0 ||
    !invoice.hosted_invoice_url
  ) {
    throw new StripeBillingError(
      "The Stripe invoice has no outstanding hosted payment page.",
    );
  }
  return {
    invoice,
    url: requireHttpUrl(
      invoice.hosted_invoice_url,
      "Stripe hosted invoice URL",
    ),
  };
}

export interface RetryProSubscriptionInvoicePaymentInput extends RetrieveOwnedProSubscriptionInvoiceInput {
  idempotencyKey: string;
}

/** Attempts the owned unpaid invoice using the Customer's new default card. */
export async function retryProSubscriptionInvoicePayment(
  input: RetryProSubscriptionInvoicePaymentInput,
  dependencies: StripeBillingDependencies = {},
) {
  const stripe = resolveStripe(dependencies);
  const invoice = await retrieveOwnedProSubscriptionInvoice(
    input,
    dependencies,
  );
  if (invoice.status === "paid") {
    return invoice;
  }
  if (invoice.status !== "open" || invoice.amount_remaining <= 0) {
    throw new StripeBillingError("The Stripe invoice cannot be retried.");
  }

  const paid = await stripe.invoices.pay(
    invoice.id,
    { off_session: true },
    { idempotencyKey: requireIdempotencyKey(input.idempotencyKey) },
  );
  return assertOwnedProSubscriptionInvoice(paid, input);
}
