import { createHash } from "node:crypto";

import type { BulkWriteResult, Collection, Db, Document } from "mongodb";
import { z } from "zod";

export const EXTERNAL_UNVERIFIED_LEADS_COLLECTION =
  "externalUnverifiedLeads" as const;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_TITLE_CHARACTERS = 100;
const MAX_SUMMARY_CHARACTERS = 1_000;
const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/gu;

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const mailtoPattern = /mailto:[^\s<>'"\])}]+/giu;
const whatsAppLinkPattern =
  /(?:(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/[^\s<>'"\])}]+|(?:https?:\/\/)?wa\.me\/[^\s<>'"\])}]+|whatsapp:\/\/[^\s<>'"\])}]+)/giu;
const whatsAppKeywordPattern = /(?:whats?\s*app|wa\.me)/iu;
const telephoneLinkPattern = /(?:tel|sms):[+0-9().\s-]{7,}/giu;
const hongKongPhonePattern =
  /(?<!\d)(?:(?:(?:\+|00)\s*)?8[\s().-]*5[\s().-]*2[\s().-]*)?[2356789](?:[\s().-]*\d){7}(?!\d)/gu;
const internationalPhonePattern =
  /(?<![\p{L}\d])(?:\+|00)\s*\d(?:[\s().-]*\d){6,14}(?!\d)/gu;
const genericUrlPattern = /https?:\/\/[^\s<>'"]+/giu;
const contactPlaceholderPattern = /\[(?:PHONE|EMAIL|WHATSAPP)\]/giu;

const facebookPageSourceRowSchema = z
  .object({
    post_id: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_:-]+$/)
      .max(255),
    page_id: z.string().trim().regex(/^\d+$/).max(64),
    page_name: z.string().trim().min(1).max(255),
    message: z.string().max(100_000).nullable(),
    created_time: z.string().trim().min(1).max(64),
    permalink_url: z.string().trim().max(2_048).nullable(),
    full_picture: z.string().trim().max(2_048).nullable().optional(),
    shares_count: z.number().int().nonnegative().nullable(),
    reactions_count: z.number().int().nonnegative().nullable(),
    comments_count: z.number().int().nonnegative().nullable(),
    synced_at: z.string().trim().min(1).max(64),
  })
  .strict();

const dateInputSchema = z.union([z.date(), z.string().trim().min(1).max(64)]);

const mapOptionsSchema = z
  .object({
    sourceGeneratedAt: dateInputSchema,
    windowDays: z.number().int().min(1).max(31),
    retentionDays: z.number().int().min(1).max(365),
    importedAt: dateInputSchema.optional(),
    runId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.:-]+$/)
      .max(160)
      .optional(),
  })
  .strict();

const validDateSchema = z
  .date()
  .refine((value) => Number.isFinite(value.getTime()), "Invalid BSON Date");

const contactTypeSchema = z.enum(["phone", "email", "whatsapp"]);

const externalUnverifiedLeadDocumentSchema = z
  .object({
    _id: z.string().regex(/^[a-f0-9]{64}$/),
    platform: z.literal("facebook"),
    sourceKind: z.literal("managed_page_graph_api"),
    sourceId: z.string().regex(/^\d+$/).max(64),
    sourcePageName: z.string().trim().min(1).max(255),
    sourcePostId: z
      .string()
      .regex(/^[A-Za-z0-9_:-]+$/)
      .max(255),
    stableId: z
      .string()
      .regex(/^[A-Za-z0-9_:-]+$/)
      .max(512),
    sourcePermalink: z.string().url().max(2_048).nullable(),
    sourceRunId: z
      .string()
      .regex(/^[A-Za-z0-9_.:-]+$/)
      .max(160),
    sourceRowSha256: z.string().regex(/^[a-f0-9]{64}$/),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceCreatedAt: validDateSchema,
    capturedAt: validDateSchema,
    sourceGeneratedAt: validDateSchema,
    deliveryWindowDays: z.number().int().min(1).max(31),
    expiresAt: validDateSchema,
    title: z.string().trim().min(1).max(MAX_TITLE_CHARACTERS),
    workSummary: z.string().trim().min(8).max(MAX_SUMMARY_CHARACTERS),
    moneyText: z.array(z.string().trim().min(1).max(120)).max(3),
    engagement: z
      .object({
        shares: z.number().int().nonnegative().nullable(),
        reactions: z.number().int().nonnegative().nullable(),
        comments: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    contactTypes: z
      .array(contactTypeSchema)
      .max(3)
      .refine(
        (values) => new Set(values).size === values.length,
        "contactTypes must be unique",
      ),
    redactionState: z.literal("supported_contact_patterns_redacted"),
    verificationState: z.literal("pending_human_review"),
    lawfulUseState: z.literal("pending_review"),
    outreachState: z.literal("not_authorized"),
    retentionState: z.literal("active"),
    needsReReview: z.boolean(),
    firstImportedAt: validDateSchema.optional(),
    lastSeenAt: validDateSchema.optional(),
    updatedAt: validDateSchema.optional(),
  })
  .strict();

export type FacebookPageSourceRow = z.infer<typeof facebookPageSourceRowSchema>;

export type ExternalLeadContactType = z.infer<typeof contactTypeSchema>;

export type MapFacebookPageRowOptions = z.input<typeof mapOptionsSchema>;

export type ExternalUnverifiedLeadDocument = z.infer<
  typeof externalUnverifiedLeadDocumentSchema
>;

export type ExternalUnverifiedLeadUpsertResult = {
  requestedRows: number;
  insertedRows: number;
  matchedRows: number;
  modifiedRows: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function testPattern(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function parseDate(value: Date | string, fieldName: string) {
  const parsed =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date-time.`);
  }
  return parsed;
}

function truncateByCodePoint(value: string, maximum: number) {
  const characters = Array.from(value);
  if (characters.length <= maximum) {
    return value;
  }
  return `${characters.slice(0, maximum - 1).join("")}…`;
}

function normalizeWhitespace(value: string) {
  return value
    .normalize("NFKC")
    .replace(zeroWidthPattern, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function sanitizeFacebookPermalink(value: string | null) {
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("permalink_url must be a valid Facebook HTTPS URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    (hostname !== "facebook.com" && !hostname.endsWith(".facebook.com")) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("permalink_url must be a valid Facebook HTTPS URL.");
  }

  const retainedQuery = new URLSearchParams();
  for (const key of ["story_fbid", "fbid", "id", "v"] as const) {
    const candidate = parsed.searchParams.get(key);
    if (candidate && /^\d+(?:_\d+)?$/u.test(candidate)) {
      retainedQuery.set(key, candidate);
    }
  }
  const mediaSet = parsed.searchParams.get("set");
  if (mediaSet && /^[A-Za-z0-9._-]{1,160}$/u.test(mediaSet)) {
    retainedQuery.set("set", mediaSet);
  }
  parsed.search = retainedQuery.toString();
  parsed.hash = "";
  if (
    /\/(?:permalink|story|photo|watch)\.php$/u.test(parsed.pathname) &&
    retainedQuery.size === 0
  ) {
    throw new Error("permalink_url is missing its Facebook post identity.");
  }
  return parsed.toString();
}

function redactDirectContacts(message: string) {
  const normalizedMessage = normalizeWhitespace(message);
  const contactTypes = new Set<ExternalLeadContactType>();
  const withoutWhatsAppLinks = normalizedMessage.replace(
    whatsAppLinkPattern,
    () => {
      contactTypes.add("whatsapp");
      return " [WHATSAPP] ";
    },
  );

  if (testPattern(whatsAppKeywordPattern, normalizedMessage)) {
    contactTypes.add("whatsapp");
  }

  let redacted = withoutWhatsAppLinks.replace(mailtoPattern, () => {
    contactTypes.add("email");
    return " [EMAIL] ";
  });
  redacted = redacted.replace(emailPattern, () => {
    contactTypes.add("email");
    return " [EMAIL] ";
  });
  redacted = redacted.replace(telephoneLinkPattern, () => {
    contactTypes.add("phone");
    return " [PHONE] ";
  });
  redacted = redacted.replace(hongKongPhonePattern, () => {
    contactTypes.add("phone");
    return " [PHONE] ";
  });
  redacted = redacted.replace(internationalPhonePattern, () => {
    contactTypes.add("phone");
    return " [PHONE] ";
  });
  redacted = redacted.replace(genericUrlPattern, " ");

  const orderedTypes: ExternalLeadContactType[] = [
    "phone",
    "email",
    "whatsapp",
  ];
  return {
    redacted: normalizeWhitespace(redacted),
    contactTypes: orderedTypes.filter((type) => contactTypes.has(type)),
  };
}

function assertNoRawDirectContacts(value: string, fieldName: string) {
  const normalizedValue = normalizeWhitespace(value);
  if (
    testPattern(emailPattern, normalizedValue) ||
    testPattern(mailtoPattern, normalizedValue) ||
    testPattern(whatsAppLinkPattern, normalizedValue) ||
    testPattern(telephoneLinkPattern, normalizedValue) ||
    testPattern(hongKongPhonePattern, normalizedValue) ||
    testPattern(internationalPhonePattern, normalizedValue)
  ) {
    throw new Error(`${fieldName} contains an unredacted direct contact.`);
  }
  if (normalizedValue !== value) {
    throw new Error(`${fieldName} is not normalized for persistence.`);
  }
}

type MoneyMatch = { index: number; end: number; value: string };

function extractMoneyText(value: string) {
  const amount = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d{1,2})?`;
  const currency = String.raw`(?:HKD|HK\$|港幣|港元|\$)`;
  const range = String.raw`(?:\s*(?:-|–|—|至|到)\s*(?:${currency}\s*)?${amount})?`;
  const period = String.raw`(?:\s*(?:蚊|元)?\s*(?:\/|每)?\s*(?:小時|鐘|時|日|天|月|hour|hr|day|month))?`;
  const patterns = [
    new RegExp(String.raw`${currency}\s*${amount}${range}${period}`, "giu"),
    new RegExp(
      String.raw`(?:時薪|日薪|月薪|人工|薪金|預算|budget)\s*[:：]?\s*(?:${currency}\s*)?${amount}${range}${period}`,
      "giu",
    ),
    new RegExp(String.raw`${amount}${range}\s*(?:蚊|元)${period}`, "giu"),
    /面議/gu,
  ];

  const matches: MoneyMatch[] = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const normalized = normalizeWhitespace(match[0]);
      if (normalized) {
        matches.push({
          index: match.index,
          end: match.index + match[0].length,
          value: normalized,
        });
      }
    }
  }

  matches.sort(
    (left, right) =>
      left.index - right.index ||
      right.end - right.index - (left.end - left.index),
  );
  const unique: string[] = [];
  const acceptedRanges: Array<{ index: number; end: number }> = [];
  for (const match of matches) {
    const overlapsAccepted = acceptedRanges.some(
      (range) => match.index < range.end && match.end > range.index,
    );
    if (!overlapsAccepted && !unique.includes(match.value)) {
      unique.push(match.value);
      acceptedRanges.push({ index: match.index, end: match.end });
    }
    if (unique.length === 3) {
      break;
    }
  }
  return unique;
}

function deriveWorkSummary(redactedMessage: string) {
  const withoutContactValues = redactedMessage
    .replace(contactPlaceholderPattern, " ")
    .replace(genericUrlPattern, " ");
  const summary = truncateByCodePoint(
    normalizeWhitespace(withoutContactValues),
    MAX_SUMMARY_CHARACTERS,
  );
  const substantiveLength = Array.from(
    summary.replace(/[\p{P}\p{S}\s]/gu, ""),
  ).length;
  if (substantiveLength < 8) {
    throw new Error(
      "message does not contain enough work detail after contact redaction.",
    );
  }
  return summary;
}

function deriveTitle(workSummary: string) {
  const candidates = workSummary
    .split(/[\n。！？!?]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const title = truncateByCodePoint(
    candidates.find(
      (value) => Array.from(value.replace(/[\p{P}\p{S}\s]/gu, "")).length >= 4,
    ) ?? workSummary,
    MAX_TITLE_CHARACTERS,
  );
  if (!title) {
    throw new Error("Unable to derive a title from the redacted message.");
  }
  return title;
}

function contentFingerprint(input: {
  sourcePageName: string;
  title: string;
  workSummary: string;
  moneyText: string[];
  contactTypes: ExternalLeadContactType[];
}) {
  return sha256(
    JSON.stringify([
      input.sourcePageName,
      input.title,
      input.workSummary,
      input.moneyText,
      input.contactTypes,
    ]),
  );
}

function validateExternalLeadDocument(value: unknown) {
  const doc = externalUnverifiedLeadDocumentSchema.parse(value);
  const expectedStableId = `facebook_page:${doc.sourceId}:${doc.sourcePostId}`;
  if (doc.stableId !== expectedStableId) {
    throw new Error(
      "stableId does not match the Facebook Page source identity.",
    );
  }
  if (doc._id !== sha256(doc.stableId)) {
    throw new Error("_id does not match the stableId SHA-256 digest.");
  }
  if (
    doc.sourcePermalink !== null &&
    sanitizeFacebookPermalink(doc.sourcePermalink) !== doc.sourcePermalink
  ) {
    throw new Error("sourcePermalink is not a canonical Facebook URL.");
  }
  assertNoRawDirectContacts(doc.sourcePageName, "sourcePageName");
  assertNoRawDirectContacts(doc.title, "title");
  assertNoRawDirectContacts(doc.workSummary, "workSummary");
  doc.moneyText.forEach((money, index) =>
    assertNoRawDirectContacts(money, `moneyText[${index}]`),
  );
  if (doc.contentSha256 !== contentFingerprint(doc)) {
    throw new Error("contentSha256 does not match the redacted lead content.");
  }

  const cutoff = new Date(
    doc.sourceGeneratedAt.getTime() -
      doc.deliveryWindowDays * DAY_IN_MILLISECONDS,
  );
  if (doc.sourceCreatedAt > doc.sourceGeneratedAt) {
    throw new Error("sourceCreatedAt cannot be later than sourceGeneratedAt.");
  }
  if (doc.sourceCreatedAt < cutoff) {
    throw new Error(
      "sourceCreatedAt is outside the configured delivery window.",
    );
  }
  if (doc.capturedAt < doc.sourceCreatedAt) {
    throw new Error("capturedAt cannot be earlier than sourceCreatedAt.");
  }
  if (doc.expiresAt <= doc.sourceGeneratedAt) {
    throw new Error("expiresAt must be later than sourceGeneratedAt.");
  }

  return doc;
}

export function mapFacebookPageRowToExternalLead(
  row: FacebookPageSourceRow,
  options: MapFacebookPageRowOptions,
): ExternalUnverifiedLeadDocument {
  const source = facebookPageSourceRowSchema.parse(row);
  const parsedOptions = mapOptionsSchema.parse(options);
  const sourceGeneratedAt = parseDate(
    parsedOptions.sourceGeneratedAt,
    "sourceGeneratedAt",
  );
  const importedAt = parseDate(
    parsedOptions.importedAt ?? sourceGeneratedAt,
    "importedAt",
  );
  const sourceCreatedAt = parseDate(source.created_time, "created_time");
  const capturedAt = parseDate(source.synced_at, "synced_at");
  const cutoff = new Date(
    sourceGeneratedAt.getTime() -
      parsedOptions.windowDays * DAY_IN_MILLISECONDS,
  );

  if (sourceCreatedAt > sourceGeneratedAt) {
    throw new Error("Facebook Page row is dated in the future.");
  }
  if (sourceCreatedAt < cutoff) {
    throw new Error("Facebook Page row is outside the delivery window.");
  }
  if (capturedAt < sourceCreatedAt) {
    throw new Error("Facebook Page row was captured before it was created.");
  }
  if (!source.message?.trim()) {
    throw new Error("Facebook Page row has no message to stage.");
  }

  const pageNameRedaction = redactDirectContacts(source.page_name);
  const messageRedaction = redactDirectContacts(source.message);
  const sourcePageName = pageNameRedaction.redacted;
  if (!sourcePageName) {
    throw new Error("Facebook Page row has no Page name after redaction.");
  }
  const workSummary = deriveWorkSummary(messageRedaction.redacted);
  const title = deriveTitle(workSummary);
  const moneyText = extractMoneyText(messageRedaction.redacted);
  const orderedContactTypes: ExternalLeadContactType[] = [
    "phone",
    "email",
    "whatsapp",
  ];
  const detectedContactTypes = new Set([
    ...pageNameRedaction.contactTypes,
    ...messageRedaction.contactTypes,
  ]);
  const contactTypes = orderedContactTypes.filter((type) =>
    detectedContactTypes.has(type),
  );
  const sourcePermalink = sanitizeFacebookPermalink(source.permalink_url);
  if (contactTypes.length === 0 && sourcePermalink === null) {
    throw new Error(
      "Facebook Page row has no usable contact route after redaction.",
    );
  }
  const stableId = `facebook_page:${source.page_id}:${source.post_id}`;
  const sourceRunId =
    parsedOptions.runId ??
    `facebook_page_sync:${sourceGeneratedAt.toISOString()}`;
  const expiresAt = new Date(
    importedAt.getTime() + parsedOptions.retentionDays * DAY_IN_MILLISECONDS,
  );
  const fingerprintInput = {
    sourcePageName,
    title,
    workSummary,
    moneyText,
    contactTypes,
  };

  return validateExternalLeadDocument({
    _id: sha256(stableId),
    platform: "facebook",
    sourceKind: "managed_page_graph_api",
    sourceId: source.page_id,
    sourcePostId: source.post_id,
    stableId,
    sourcePermalink,
    sourceRunId,
    sourceRowSha256: sha256(
      JSON.stringify([
        source.post_id,
        source.page_id,
        source.page_name,
        source.message,
        source.created_time,
        source.permalink_url,
        source.full_picture,
        source.shares_count,
        source.reactions_count,
        source.comments_count,
        source.synced_at,
      ]),
    ),
    contentSha256: contentFingerprint(fingerprintInput),
    sourceCreatedAt,
    capturedAt,
    sourceGeneratedAt,
    deliveryWindowDays: parsedOptions.windowDays,
    expiresAt,
    ...fingerprintInput,
    engagement: {
      shares: source.shares_count,
      reactions: source.reactions_count,
      comments: source.comments_count,
    },
    redactionState: "supported_contact_patterns_redacted",
    verificationState: "pending_human_review",
    lawfulUseState: "pending_review",
    outreachState: "not_authorized",
    retentionState: "active",
    needsReReview: false,
  });
}

export async function ensureExternalUnverifiedLeadIndexes(db: Db) {
  return db
    .collection<ExternalUnverifiedLeadDocument>(
      EXTERNAL_UNVERIFIED_LEADS_COLLECTION,
    )
    .createIndexes([
      {
        name: "external_lead_stable_id_unique",
        key: { stableId: 1 },
        unique: true,
      },
      {
        name: "external_lead_review_queue",
        key: {
          verificationState: 1,
          lawfulUseState: 1,
          retentionState: 1,
          sourceCreatedAt: -1,
        },
      },
      {
        name: "external_lead_expires_at_ttl",
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
      },
    ]);
}

export async function upsertExternalUnverifiedLeads(
  collection: Collection<ExternalUnverifiedLeadDocument>,
  docs: ExternalUnverifiedLeadDocument[],
  now: Date,
): Promise<ExternalUnverifiedLeadUpsertResult> {
  const operationTime = validDateSchema.parse(now);
  const validatedDocs = docs.map((doc) => validateExternalLeadDocument(doc));
  const ids = validatedDocs.map((doc) => doc._id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      "External lead batch contains duplicate source identities.",
    );
  }
  if (validatedDocs.length === 0) {
    return {
      requestedRows: 0,
      insertedRows: 0,
      matchedRows: 0,
      modifiedRows: 0,
    };
  }

  const result: BulkWriteResult = await collection.bulkWrite(
    validatedDocs.map((doc) => {
      const {
        _id: _discardedId,
        verificationState: _discardedVerificationState,
        lawfulUseState: _discardedLawfulUseState,
        outreachState: _discardedOutreachState,
        retentionState: _discardedRetentionState,
        needsReReview: _discardedReviewFlag,
        firstImportedAt: _discardedFirstImportedAt,
        lastSeenAt: _discardedLastSeenAt,
        updatedAt: _discardedUpdatedAt,
        ...mutableFields
      } = doc;
      void _discardedId;
      void _discardedVerificationState;
      void _discardedLawfulUseState;
      void _discardedOutreachState;
      void _discardedRetentionState;
      void _discardedReviewFlag;
      void _discardedFirstImportedAt;
      void _discardedLastSeenAt;
      void _discardedUpdatedAt;

      const suppressedRetention = {
        $in: ["$retentionState", ["deletion_requested", "deleted", "expired"]],
      };
      const literal = (value: unknown) => ({ $literal: value });
      const staleSourceSnapshot = {
        $and: [
          { $eq: [{ $type: "$sourceGeneratedAt" }, "date"] },
          { $lt: [literal(doc.sourceGeneratedAt), "$sourceGeneratedAt"] },
        ],
      };
      const refreshBlocked = {
        $or: [suppressedRetention, staleSourceSnapshot],
      };
      const contentChanged = {
        $and: [
          { $ne: [{ $type: "$contentSha256" }, "missing"] },
          { $ne: ["$contentSha256", literal(doc.contentSha256)] },
        ],
      };
      const refreshUnlessSuppressed = (fieldName: string, value: unknown) => ({
        $cond: [refreshBlocked, `$${fieldName}`, literal(value)],
      });
      const refreshedFields = Object.fromEntries(
        Object.entries(mutableFields).map(([fieldName, value]) => [
          fieldName,
          refreshUnlessSuppressed(fieldName, value),
        ]),
      );
      const resetStateOnContentChange = (
        fieldName: string,
        initialValue: string,
      ) => ({
        $cond: [
          refreshBlocked,
          `$${fieldName}`,
          {
            $cond: [
              contentChanged,
              literal(initialValue),
              { $ifNull: [`$${fieldName}`, literal(initialValue)] },
            ],
          },
        ],
      });
      const updatePipeline: Document[] = [
        {
          $set: {
            ...refreshedFields,
            expiresAt: {
              $cond: [
                refreshBlocked,
                "$expiresAt",
                {
                  $cond: [
                    { $eq: [{ $type: "$expiresAt" }, "date"] },
                    {
                      $cond: [
                        { $lt: [literal(doc.expiresAt), "$expiresAt"] },
                        literal(doc.expiresAt),
                        "$expiresAt",
                      ],
                    },
                    literal(doc.expiresAt),
                  ],
                },
              ],
            },
            verificationState: resetStateOnContentChange(
              "verificationState",
              "pending_human_review",
            ),
            lawfulUseState: resetStateOnContentChange(
              "lawfulUseState",
              "pending_review",
            ),
            outreachState: resetStateOnContentChange(
              "outreachState",
              "not_authorized",
            ),
            retentionState: {
              $ifNull: ["$retentionState", literal("active")],
            },
            needsReReview: {
              $cond: [
                refreshBlocked,
                { $ifNull: ["$needsReReview", false] },
                {
                  $or: [{ $eq: ["$needsReReview", true] }, contentChanged],
                },
              ],
            },
            firstImportedAt: {
              $cond: [
                refreshBlocked,
                "$firstImportedAt",
                { $ifNull: ["$firstImportedAt", literal(operationTime)] },
              ],
            },
            lastSeenAt: refreshUnlessSuppressed("lastSeenAt", operationTime),
            updatedAt: refreshUnlessSuppressed("updatedAt", operationTime),
          },
        },
      ];

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: updatePipeline,
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  return {
    requestedRows: validatedDocs.length,
    insertedRows: result.upsertedCount,
    matchedRows: result.matchedCount,
    modifiedRows: result.modifiedCount,
  };
}

export function validateHotfixDevMongoTarget(uri: string, database: string) {
  if (database !== "hotfix_dev" || /prod(?:uction)?/iu.test(database)) {
    throw new Error("External lead import is restricted to hotfix_dev.");
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI is not a valid MongoDB connection URI.");
  }
  if (!new Set(["mongodb:", "mongodb+srv:"]).has(parsed.protocol)) {
    throw new Error("MONGODB_URI must use the MongoDB protocol.");
  }

  let uriDatabase: string;
  try {
    uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("MONGODB_URI contains an invalid database path.");
  }
  if (uriDatabase !== database || /prod(?:uction)?/iu.test(uriDatabase)) {
    throw new Error(
      "MONGODB_URI database does not match the required hotfix_dev target.",
    );
  }

  const authSource = parsed.searchParams.get("authSource");
  if (
    authSource &&
    (authSource !== "hotfix_dev" || /prod(?:uction)?/iu.test(authSource))
  ) {
    throw new Error("MONGODB_URI authSource is not the hotfix_dev database.");
  }
}
