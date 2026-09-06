import { MongoClient } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { cleanFacebookPostText } from "@/lib/facebook-post-text";
import { env } from "@/lib/env";
import { validateHotfixDevMongoTarget } from "@/lib/external-unverified-leads";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

export type FacebookGroupSnapshot = {
  id: string;
  sourceName: string;
  message: string;
  sourceUrl: string;
  permalink: string | null;
  truncated: boolean;
};

function groupUrl(value: unknown, post: boolean): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const pattern = post
      ? /^\/groups\/[^/]+\/(?:posts|permalink)\/\d+\/?$/
      : /^\/groups\/[A-Za-z0-9._-]+\/?$/;
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.facebook.com" ||
      url.username ||
      url.password ||
      !pattern.test(url.pathname)
    )
      return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function toFacebookGroupSnapshot(
  row: Record<string, unknown>,
): FacebookGroupSnapshot | null {
  const review = row.intentReview as Record<string, unknown> | undefined;
  if (
    !review ||
    review.version !== 1 ||
    !["service_request", "recruitment"].includes(String(review.intent)) ||
    typeof row.contentSha256 !== "string" ||
    review.contentSha256 !== row.contentSha256
  )
    return null;
  const sourceUrl = groupUrl(row.sourceUrl, false);
  if (
    !sourceUrl ||
    typeof row._id !== "string" ||
    typeof row.sourceName !== "string" ||
    typeof row.sourceMessage !== "string"
  )
    return null;
  return {
    id: row._id,
    sourceName: row.sourceName,
    message: cleanFacebookPostText(row.sourceMessage),
    sourceUrl,
    permalink: groupUrl(row.sourcePermalink, true),
    truncated: row.truncated === true,
  };
}

/** Read only: these snapshots are never converted into marketplace requests. */
export async function listFacebookGroupSnapshots(): Promise<
  FacebookGroupSnapshot[]
> {
  if (env.MONGODB_DATABASE !== "hotfix_dev" || !env.MONGODB_URI) return [];
  try {
    validateHotfixDevMongoTarget(env.MONGODB_URI, env.MONGODB_DATABASE);
  } catch {
    return [];
  }
  const user = await getCurrentUser();
  if (user?.role !== "pro") return [];
  const snapshot = await getProSubscriptionEntitlement(user.id);
  if (
    !snapshot.policyDataValid ||
    !snapshot.entitlement.canCreateQuotes ||
    !snapshot.entitlement.canAcceptNewWork
  )
    return [];

  const client = new MongoClient(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 7000,
  });
  try {
    await client.connect();
    const rows = await client
      .db("hotfix_dev")
      .collection("externalFacebookGroupSnapshots")
      .find(
        {
          sourceKind: "group_browser_snapshot",
          "intentReview.version": 1,
          "intentReview.intent": { $in: ["service_request", "recruitment"] },
          $expr: { $eq: ["$intentReview.contentSha256", "$contentSha256"] },
          verificationState: "pending_human_review",
          retentionState: {
            $nin: ["deleted", "deletion_requested", "expired"],
          },
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } },
          ],
        },
        {
          projection: {
            _id: 1,
            contentSha256: 1,
            intentReview: 1,
            sourceName: 1,
            sourceMessage: 1,
            sourceUrl: 1,
            sourcePermalink: 1,
            truncated: 1,
          },
        },
      )
      .sort({ capturedAt: -1, _id: 1 })
      .limit(100)
      .toArray();
    return rows.flatMap((row) => {
      const mapped = toFacebookGroupSnapshot(row);
      return mapped ? [mapped] : [];
    });
  } finally {
    await client.close();
  }
}
