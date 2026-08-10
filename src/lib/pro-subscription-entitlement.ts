import { cache } from "react";

import { findProSubscription, listProSubscriptions } from "@/lib/mock/db";
import {
  deriveProSubscriptionEntitlement,
  type IsoDateTime,
  type ProSubscription,
  type ProSubscriptionEntitlement,
} from "@/lib/subscription-policy";

export type ProSubscriptionEntitlementSnapshot = {
  subscription: ProSubscription | null;
  entitlement: ProSubscriptionEntitlement;
  policyDataValid: boolean;
};

export class ProNewWorkRestrictedError extends Error {
  readonly code = "PRO_NEW_WORK_RESTRICTED" as const;

  constructor() {
    super("The pro subscription does not currently allow new work.");
    this.name = "ProNewWorkRestrictedError";
  }
}

function failClosedEntitlement(
  subscription: ProSubscription | null,
): ProSubscriptionEntitlement {
  return {
    status: subscription ? "suspended" : "setup_required",
    canCreateQuotes: false,
    canAcceptNewWork: false,
    canManageExistingWork: true,
    canManageBilling: true,
    effectiveUntil: undefined,
  };
}

export function evaluateProSubscriptionEntitlement(
  subscription: ProSubscription | null,
  now: IsoDateTime,
): ProSubscriptionEntitlementSnapshot {
  try {
    return {
      subscription,
      entitlement: deriveProSubscriptionEntitlement(subscription, now),
      policyDataValid: true,
    };
  } catch {
    return {
      subscription,
      entitlement: failClosedEntitlement(subscription),
      policyDataValid: false,
    };
  }
}

const readCurrentProSubscriptionEntitlement = cache(async (proId: string) => {
  const subscription = await findProSubscription(proId);
  return evaluateProSubscriptionEntitlement(
    subscription,
    new Date().toISOString(),
  );
});

export async function getProSubscriptionEntitlement(
  proId: string,
  now?: IsoDateTime,
) {
  if (now) {
    const subscription = await findProSubscription(proId);
    return evaluateProSubscriptionEntitlement(subscription, now);
  }

  return readCurrentProSubscriptionEntitlement(proId);
}

export async function getProIdsEligibleForNewWork(now?: IsoDateTime) {
  const evaluatedAt = now ?? new Date().toISOString();
  const subscriptions = await listProSubscriptions();

  return new Set(
    subscriptions.flatMap((subscription) => {
      const { entitlement } = evaluateProSubscriptionEntitlement(
        subscription,
        evaluatedAt,
      );
      return entitlement.canAcceptNewWork ? [subscription.proId] : [];
    }),
  );
}

export async function assertProCanCreateQuotes(
  proId: string,
  now?: IsoDateTime,
) {
  const snapshot = await getProSubscriptionEntitlement(
    proId,
    now ?? new Date().toISOString(),
  );
  if (!snapshot.entitlement.canCreateQuotes) {
    throw new ProNewWorkRestrictedError();
  }
  return snapshot;
}

export async function assertProCanAcceptNewWork(
  proId: string,
  now?: IsoDateTime,
) {
  const snapshot = await getProSubscriptionEntitlement(
    proId,
    now ?? new Date().toISOString(),
  );
  if (!snapshot.entitlement.canAcceptNewWork) {
    throw new ProNewWorkRestrictedError();
  }
  return snapshot;
}

export function isProNewWorkRestrictedError(
  error: unknown,
): error is ProNewWorkRestrictedError {
  return (
    error instanceof ProNewWorkRestrictedError ||
    (error instanceof Error &&
      "code" in error &&
      error.code === "PRO_NEW_WORK_RESTRICTED")
  );
}
