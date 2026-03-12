export type UserPlan = "free" | "premium" | "family";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface UserEntitlements {
  virtualBrowser: boolean;
  maxParticipants: number;
}

export interface UserBillingProfile {
  plan: UserPlan;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  entitlements: UserEntitlements;
}

export const BILLING_STATUSES_ACTIVE = new Set<string>([
  "active",
  "trialing",
]);

const FALLBACK_MAX_PARTICIPANTS = 10;
const PREMIUM_MAX_PARTICIPANTS = 50;

export function getEntitlementsForPlan(plan: UserPlan): UserEntitlements {
  if (plan === "premium" || plan === "family") {
    return {
      virtualBrowser: true,
      maxParticipants: PREMIUM_MAX_PARTICIPANTS,
    };
  }
  return {
    virtualBrowser: false,
    maxParticipants: FALLBACK_MAX_PARTICIPANTS,
  };
}

export function getDefaultBillingProfile(): UserBillingProfile {
  const plan: UserPlan = "free";
  return {
    plan,
    subscriptionStatus: "canceled",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    entitlements: getEntitlementsForPlan(plan),
  };
}

export function normalizeSubscriptionStatus(
  rawStatus: string | null | undefined,
): SubscriptionStatus {
  switch (rawStatus) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
      return rawStatus;
    default:
      return "canceled";
  }
}

export function normalizePlan(rawPlan: string | null | undefined): UserPlan {
  if (rawPlan === "premium" || rawPlan === "family") {
    return rawPlan;
  }
  return "free";
}

export function derivePlanFromStatus(
  desiredPlan: UserPlan,
  status: SubscriptionStatus,
): UserPlan {
  return BILLING_STATUSES_ACTIVE.has(status) ? desiredPlan : "free";
}

export function isSubscriberPlan(plan: UserPlan): boolean {
  return plan === "premium" || plan === "family";
}
