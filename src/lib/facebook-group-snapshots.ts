import { MongoClient } from "mongodb";

import { getCurrentUser } from "@/lib/auth";
import { cleanFacebookPostText } from "@/lib/facebook-post-text";
import { env } from "@/lib/env";
import { redactDirectContacts } from "@/lib/external-unverified-leads";
import {
  type FacebookSnapshotMongoTarget,
  validateFacebookSnapshotMongoTarget,
} from "@/lib/facebook-snapshot-mongo-target";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import {
  hongKongAreaNamesZh,
  hongKongDistrictNamesZh,
} from "@/lib/hk-service-areas";

export type FacebookGroupSnapshot = {
  locked?: false;
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

export type FacebookGroupSnapshotPreview = Pick<
  FacebookGroupSnapshot,
  "id" | "title" | "location" | "categoryId"
> & { locked: true };

export type PublicJobPreview = Pick<
  FacebookGroupSnapshot,
  "id" | "title" | "location" | "categoryId"
>;

const publicPlaces = Object.entries({
  ...hongKongDistrictNamesZh,
  ...hongKongAreaNamesZh,
});

/** Homepage summaries only; never select raw text, contacts or source links. */
export async function listPublicJobPreviews(): Promise<PublicJobPreview[]> {
  if (!env.MONGODB_URI) return [];
  let target: FacebookSnapshotMongoTarget;
  try {
    target = validateFacebookSnapshotMongoTarget(
      env.MONGODB_URI,
      env.MONGODB_DATABASE,
    );
  } catch {
    return [];
  }
  const client = new MongoClient(target.uri, {
    serverSelectionTimeoutMS: 7000,
    authSource: target.database,
  });
  try {
    await client.connect();
    const rows = await client
      .db(target.database)
      .collection("externalFacebookGroupSnapshots")
      .find(eligibleSnapshotFilter(), {
        projection: {
          _id: 1,
          "intentReview.title": 1,
          "intentReview.displayLocation": 1,
          "intentReview.categoryId": 1,
        },
      })
      .sort({ capturedAt: -1, _id: 1 })
      .limit(12)
      .toArray();
    return rows.flatMap((row) => {
      const review = row.intentReview;
      if (typeof row._id !== "string" || typeof review?.title !== "string")
        return [];
      const title = redactDirectContacts(
        review.title.normalize("NFKC").replace(/\p{Cf}/gu, ""),
      )
        .redacted.replace(/\[(?:PHONE|EMAIL|WHATSAPP)\]/g, "")
        .trim()
        .slice(0, 80);
      if (!title) return [];
      const location =
        typeof review.displayLocation === "string"
          ? review.displayLocation.normalize("NFKC").replace(/\p{Cf}/gu, "")
          : "";
      // Return only recognized areas, never a building/unit or free-form address.
      const places = publicPlaces
        .filter(
          ([en, zh]) =>
            new RegExp(`\\b${en}\\b`, "i").test(location) ||
            location.includes(zh) ||
            (zh.length > 2 && location.includes(zh.replace(/區$/, ""))),
        )
        .map(([, zh]) => (zh.length > 2 ? zh.replace(/區$/, "") : zh));
      return [
        {
          id: row._id,
          title,
          location: [...new Set(places)].join("、") || "香港（地區未提供）",
          categoryId: [
            "plumbing",
            "electrical",
            "aircon",
            "renovation",
          ].includes(review.categoryId)
            ? (review.categoryId as string)
            : null,
        },
      ];
    });
  } catch {
    // Keep the homepage available without exposing connection details or fake jobs.
    console.warn("Public job previews unavailable");
    return [];
  } finally {
    await client.close();
  }
}

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

async function authorizedSnapshotTarget(
  allowPreview = false,
): Promise<(FacebookSnapshotMongoTarget & { canViewDetails: boolean }) | null> {
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
  if (!snapshot.policyDataValid) return null;
  const canViewDetails =
    snapshot.entitlement.canCreateQuotes &&
    snapshot.entitlement.canAcceptNewWork;
  if (
    !canViewDetails &&
    !(allowPreview && snapshot.entitlement.status === "setup_required")
  )
    return null;

  return { ...target, canViewDetails };
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
): Promise<(FacebookGroupSnapshot | FacebookGroupSnapshotPreview)[]> {
  const target = await authorizedSnapshotTarget(true);
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
    return rows.flatMap<FacebookGroupSnapshot | FacebookGroupSnapshotPreview>(
      (row) => {
        const mapped = toFacebookGroupSnapshot(row);
        if (!mapped) return [];
        if (target.canViewDetails) return [mapped];
        // Return an explicit preview allowlist, never raw text or source links.
        return [
          {
            id: mapped.id,
            title: redactDirectContacts(
              mapped.title.normalize("NFKC").replace(/\p{Cf}/gu, ""),
            ).redacted,
            location: redactDirectContacts(
              mapped.location.normalize("NFKC").replace(/\p{Cf}/gu, ""),
            ).redacted,
            categoryId: mapped.categoryId,
            locked: true,
          },
        ];
      },
    );
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
