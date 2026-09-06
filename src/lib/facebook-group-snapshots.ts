import { MongoClient } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { cleanFacebookPostText } from "@/lib/facebook-post-text";
import { env } from "@/lib/env";
import {
  type FacebookSnapshotMongoTarget,
  validateFacebookSnapshotMongoTarget,
} from "@/lib/facebook-snapshot-mongo-target";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

export type FacebookGroupSnapshot = {
  id: string;
  sourceName: string;
  title: string;
  location: string;
  categoryId: string | null;
  message: string;
  contactText: string;
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
    review.region !== "HK" ||
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
    title: typeof review.title === "string" ? review.title : "",
    location:
      typeof review.displayLocation === "string" ? review.displayLocation : "",
    categoryId:
      typeof review.categoryId === "string" ? review.categoryId : null,
    message: cleanFacebookPostText(
      typeof review.displayText === "string"
        ? review.displayText
        : row.sourceMessage,
    ),
    // Only the reviewed post body may supply direct contacts, never feed comments.
    contactText:
      typeof review.displayText === "string"
        ? cleanFacebookPostText(review.displayText)
        : "",
    sourceUrl,
    permalink: groupUrl(row.sourcePermalink, true),
    truncated: row.truncated === true,
  };
}

async function authorizedSnapshotTarget(): Promise<FacebookSnapshotMongoTarget | null> {
  if (!env.MONGODB_URI) return null;
  let target: FacebookSnapshotMongoTarget;
  try {
    target = validateFacebookSnapshotMongoTarget(
      env.MONGODB_URI,
      env.MONGODB_DATABASE,
    );
  } catch {
    return null;
  }
  const user = await getCurrentUser();
  if (user?.role !== "pro") return null;
  const snapshot = await getProSubscriptionEntitlement(user.id);
  if (
    !snapshot.policyDataValid ||
    !snapshot.entitlement.canCreateQuotes ||
    !snapshot.entitlement.canAcceptNewWork
  )
    return null;

  return target;
}

function eligibleSnapshotFilter() {
  return {
    sourceKind: "group_browser_snapshot",
    "intentReview.version": 1,
    "intentReview.region": "HK",
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
  };
}

const snapshotProjection = {
  _id: 1,
  contentSha256: 1,
  intentReview: 1,
  sourceName: 1,
  sourceMessage: 1,
  sourceUrl: 1,
  sourcePermalink: 1,
  truncated: 1,
};

/** Read only: these snapshots are never converted into marketplace requests. */
export async function listFacebookGroupSnapshots(
  categoryId?: string,
): Promise<FacebookGroupSnapshot[]> {
  const target = await authorizedSnapshotTarget();
  if (!target) return [];

  const client = new MongoClient(target.uri, {
    serverSelectionTimeoutMS: 7000,
    authSource: target.database,
  });
  try {
    await client.connect();
    const rows = await client
      .db(target.database)
      .collection("externalFacebookGroupSnapshots")
      .find(
        {
          ...(categoryId ? { "intentReview.categoryId": categoryId } : {}),
          ...eligibleSnapshotFilter(),
        },
        {
          projection: snapshotProjection,
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

/** Read a single eligible snapshot, independently of the list's pagination cap. */
export async function getFacebookGroupSnapshot(
  id: string,
): Promise<FacebookGroupSnapshot | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const target = await authorizedSnapshotTarget();
  if (!target) return null;

  const client = new MongoClient(target.uri, {
    serverSelectionTimeoutMS: 7000,
    authSource: target.database,
  });
  try {
    await client.connect();
    const row = await client
      .db(target.database)
      .collection<{ _id: string } & Record<string, unknown>>(
        "externalFacebookGroupSnapshots",
      )
      .findOne(
        { _id: id, ...eligibleSnapshotFilter() },
        { projection: snapshotProjection },
      );
    return row ? toFacebookGroupSnapshot(row) : null;
  } finally {
    await client.close();
  }
}
