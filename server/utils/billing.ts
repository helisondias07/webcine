import Stripe from "stripe";
import config from "../config.ts";
import {
  derivePlanFromStatus,
  getDefaultBillingProfile,
  normalizePlan,
  normalizeSubscriptionStatus,
  type SubscriptionStatus,
  type UserBillingProfile,
  type UserPlan,
} from "./entitlements.ts";
import {
  getUidByStripeCustomerId,
  markStripeEventProcessed,
  hasProcessedStripeEvent,
  setStripeCustomerOwner,
  upsertUserBillingProfile,
} from "./firebase.ts";

const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: "2020-08-27",
});

export type CheckoutPlanId =
  | "premium_monthly"
  | "premium_annual"
  | "family_monthly"
  | "family_annual";

type PriceMap = Record<CheckoutPlanId, string>;

const planIds: PriceMap = {
  premium_monthly: config.STRIPE_PRICE_PREMIUM_MONTHLY ?? "",
  premium_annual: config.STRIPE_PRICE_PREMIUM_ANNUAL ?? "",
  family_monthly: config.STRIPE_PRICE_FAMILY_MONTHLY ?? "",
  family_annual: config.STRIPE_PRICE_FAMILY_ANNUAL ?? "",
};

export function getPriceForPlan(planId: string) {
  const key = planId as CheckoutPlanId;
  const priceId = planIds[key];
  return typeof priceId === "string" && priceId ? priceId : undefined;
}

function desiredPlanFromPlanId(planId: CheckoutPlanId): UserPlan {
  if (planId.startsWith("family")) {
    return "family";
  }
  return "premium";
}

export function planFromPriceId(priceId: string | null | undefined): UserPlan {
  if (!priceId) {
    return "free";
  }
  if (
    priceId === config.STRIPE_PRICE_FAMILY_MONTHLY ||
    priceId === config.STRIPE_PRICE_FAMILY_ANNUAL
  ) {
    return "family";
  }
  if (
    priceId === config.STRIPE_PRICE_PREMIUM_MONTHLY ||
    priceId === config.STRIPE_PRICE_PREMIUM_ANNUAL
  ) {
    return "premium";
  }
  return "free";
}

function normalizeStripeStatus(
  status: string | null | undefined,
): SubscriptionStatus {
  return normalizeSubscriptionStatus(status);
}

async function getOrCreateCustomer(email: string) {
  const existing = await stripe.customers.list({
    email,
    limit: 1,
  });
  const first = existing.data[0];
  if (first) {
    return first;
  }
  return await stripe.customers.create({ email });
}

export async function createCheckoutSession(opts: {
  uid: string;
  email: string;
  planId: CheckoutPlanId;
  frontendUrl: string;
}) {
  const customer = await getOrCreateCustomer(opts.email);
  await setStripeCustomerOwner(customer.id, opts.uid);

  const priceId = getPriceForPlan(opts.planId);
  if (!priceId) {
    throw new Error(`price_not_configured:${opts.planId}`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${opts.frontendUrl}/?checkout=success`,
    cancel_url: `${opts.frontendUrl}/?checkout=cancel`,
    metadata: {
      uid: opts.uid,
      planId: opts.planId,
    },
    subscription_data: {
      metadata: {
        uid: opts.uid,
        planId: opts.planId,
      },
    },
    payment_method_types: ["card", "boleto", "pix"] as any,
  });

  return session;
}

function resolveUidFromStripeObject(opts: {
  metadataUid?: string | null;
  customerId?: string | null;
}) {
  if (opts.metadataUid) {
    return opts.metadataUid;
  }
  if (opts.customerId) {
    return getUidByStripeCustomerId(opts.customerId);
  }
  return Promise.resolve(undefined);
}

async function upsertFromSubscription(args: {
  uid?: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  desiredPlan?: UserPlan;
  status?: string | null;
}) {
  const uid =
    args.uid ??
    (args.customerId ? await getUidByStripeCustomerId(args.customerId) : "");
  if (!uid) {
    return;
  }
  if (args.customerId) {
    await setStripeCustomerOwner(args.customerId, uid);
  }
  const normalizedDesiredPlan = normalizePlan(args.desiredPlan ?? "free");
  const subscriptionStatus = normalizeStripeStatus(args.status ?? "canceled");
  const plan = derivePlanFromStatus(normalizedDesiredPlan, subscriptionStatus);
  await upsertUserBillingProfile(uid, {
    plan,
    subscriptionStatus,
    stripeCustomerId: args.customerId ?? null,
    stripeSubscriptionId: args.subscriptionId ?? null,
  });
}

export async function handleStripeWebhook(
  payload: Buffer,
  signature: string | string[] | undefined,
) {
  if (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET) {
    throw new Error("stripe_not_configured");
  }
  if (!signature || typeof signature !== "string") {
    throw new Error("stripe_signature_missing");
  }

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    config.STRIPE_WEBHOOK_SECRET,
  );

  if (await hasProcessedStripeEvent(event.id)) {
    return { ignored: true, id: event.id, type: event.type };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadataUid = session.metadata?.uid ?? null;
    const customerId =
      typeof session.customer === "string" ? session.customer : null;
    const uid = await resolveUidFromStripeObject({ metadataUid, customerId });
    const planId = session.metadata?.planId as CheckoutPlanId | undefined;
    const desiredPlan = planId ? desiredPlanFromPlanId(planId) : "free";
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    let status: string | null = "active";
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      status = sub.status;
    }
    await upsertFromSubscription({
      uid,
      customerId,
      subscriptionId,
      desiredPlan,
      status,
    });
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const metadataUid = sub.metadata?.uid ?? null;
    const uid = await resolveUidFromStripeObject({ metadataUid, customerId });
    const priceId = sub.items.data[0]?.price?.id;
    const desiredPlan =
      planFromPriceId(priceId) ||
      normalizePlan((sub.metadata?.planId as string | undefined) ?? "free");
    await upsertFromSubscription({
      uid,
      customerId,
      subscriptionId: sub.id,
      desiredPlan,
      status: sub.status,
    });
  } else if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
    const subId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
    await upsertFromSubscription({
      customerId,
      subscriptionId: subId ?? null,
      desiredPlan: "free",
      status: "past_due",
    });
  }

  await markStripeEventProcessed(event.id, event.type);
  return { ignored: false, id: event.id, type: event.type };
}

export function billingEnabled() {
  return Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET);
}

export function getFrontendUrl(origin: string | undefined) {
  if (config.FRONTEND_URL) {
    return config.FRONTEND_URL;
  }
  if (origin && origin.startsWith("http")) {
    return origin;
  }
  return "http://localhost:5173";
}

export function toBillingResponse(
  profile: UserBillingProfile | undefined,
): UserBillingProfile {
  return profile ?? getDefaultBillingProfile();
}
