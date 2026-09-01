import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import type { Collection, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import {
  EXTERNAL_UNVERIFIED_LEADS_COLLECTION,
  ensureExternalUnverifiedLeadIndexes,
  mapFacebookPageRowToExternalLead,
  type ExternalUnverifiedLeadDocument,
  type FacebookPageSourceRow,
  upsertExternalUnverifiedLeads,
  validateHotfixDevMongoTarget,
} from "@/lib/external-unverified-leads";
import {
  assertPrivateSqlitePath,
  assertRetentionCoversWindow,
  deriveLeads,
  parseCliOptions,
  parsePageIds,
  pruneRestrictedSourceRows,
  readSuccessfulSourceRows,
} from "../scripts/sync-facebook-page-leads-to-dev";

const sourceGeneratedAt = new Date("2026-09-01T00:00:00.000Z");
const importOptions = {
  sourceGeneratedAt,
  windowDays: 7,
  retentionDays: 30,
  importedAt: new Date("2026-09-01T00:05:00.000Z"),
  runId: "managed-page-run-sept-first",
};

function syntheticContactValues() {
  const phone = ["6123", "4567"].join("");
  const email = ["jobs", "example.invalid"].join("@");
  const whatsAppLink = ["https://", "wa.me", "/852", phone].join("");
  return { phone, email, whatsAppLink };
}

function sourceRow(
  overrides: Partial<FacebookPageSourceRow> = {},
): FacebookPageSourceRow {
  const { phone, email, whatsAppLink } = syntheticContactValues();
  return {
    post_id: "123456_987654",
    page_id: "123456",
    page_name: "Synthetic Repairs Page",
    message: [
      "九龍區搵水喉師傅，處理廚房漏水及更換來水掣。",
      "日薪 HK$1,200，另有交通津貼 $100。",
      `WhatsApp ${whatsAppLink}，電話 ${phone}，電郵 ${email}。`,
    ].join("\n"),
    created_time: "2026-08-30T09:00:00+0000",
    permalink_url:
      "https://www.facebook.com/123456/posts/987654?tracking=test#comments",
    full_picture: "https://images.example.invalid/synthetic.jpg",
    shares_count: 1,
    reactions_count: 2,
    comments_count: 3,
    synced_at: "2026-08-30T10:00:00+00:00",
    ...overrides,
  };
}

function mapRow(overrides: Partial<FacebookPageSourceRow> = {}) {
  return mapFacebookPageRowToExternalLead(sourceRow(overrides), importOptions);
}

type StoredLead = Omit<
  ExternalUnverifiedLeadDocument,
  "verificationState" | "lawfulUseState" | "outreachState" | "retentionState"
> & {
  verificationState: string;
  lawfulUseState: string;
  outreachState: string;
  retentionState: string;
};

class InMemoryExternalLeadCollection {
  readonly docs = new Map<string, StoredLead>();
  readonly bulkWriteOptions: unknown[] = [];

  private valuesEqual(left: unknown, right: unknown) {
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() === right.getTime();
    }
    return left === right;
  }

  private evaluate(expression: unknown, doc: Record<string, unknown>): unknown {
    if (expression instanceof Date) {
      return new Date(expression.getTime());
    }
    if (typeof expression === "string" && expression.startsWith("$")) {
      return doc[expression.slice(1)];
    }
    if (Array.isArray(expression)) {
      return expression.map((value) => this.evaluate(value, doc));
    }
    if (!expression || typeof expression !== "object") {
      return expression;
    }

    const operator = expression as Record<string, unknown>;
    if ("$literal" in operator) {
      return structuredClone(operator.$literal);
    }
    if ("$in" in operator) {
      const [value, choices] = this.evaluate(operator.$in, doc) as [
        unknown,
        unknown[],
      ];
      return choices.some((choice) => this.valuesEqual(value, choice));
    }
    if ("$eq" in operator || "$ne" in operator || "$lt" in operator) {
      const key = "$eq" in operator ? "$eq" : "$ne" in operator ? "$ne" : "$lt";
      const [left, right] = this.evaluate(operator[key], doc) as [
        unknown,
        unknown,
      ];
      if (key === "$eq") {
        return this.valuesEqual(left, right);
      }
      if (key === "$ne") {
        return !this.valuesEqual(left, right);
      }
      const leftValue = left instanceof Date ? left.getTime() : left;
      const rightValue = right instanceof Date ? right.getTime() : right;
      return (leftValue as number) < (rightValue as number);
    }
    if ("$and" in operator || "$or" in operator) {
      const key = "$and" in operator ? "$and" : "$or";
      const values = this.evaluate(operator[key], doc) as unknown[];
      return key === "$and" ? values.every(Boolean) : values.some(Boolean);
    }
    if ("$cond" in operator) {
      const [condition, whenTrue, whenFalse] = operator.$cond as unknown[];
      return this.evaluate(
        this.evaluate(condition, doc) ? whenTrue : whenFalse,
        doc,
      );
    }
    if ("$ifNull" in operator) {
      const [candidate, fallback] = operator.$ifNull as unknown[];
      const value = this.evaluate(candidate, doc);
      return value === null || value === undefined
        ? this.evaluate(fallback, doc)
        : value;
    }
    if ("$type" in operator) {
      const value = this.evaluate(operator.$type, doc);
      if (value === undefined) {
        return "missing";
      }
      if (value instanceof Date) {
        return "date";
      }
      return typeof value;
    }

    return Object.fromEntries(
      Object.entries(operator).map(([key, value]) => [
        key,
        this.evaluate(value, doc),
      ]),
    );
  }

  async bulkWrite(
    operations: Array<{
      updateOne: {
        filter: { _id: string };
        update: Array<{ $set: Record<string, unknown> }>;
        upsert: boolean;
      };
    }>,
    options: unknown,
  ) {
    this.bulkWriteOptions.push(options);
    let matchedCount = 0;
    let modifiedCount = 0;
    let upsertedCount = 0;

    for (const operation of operations) {
      const { filter, update } = operation.updateOne;
      const existing = this.docs.get(filter._id);
      const before = existing
        ? structuredClone(existing)
        : ({ _id: filter._id } as Record<string, unknown>);
      let next = structuredClone(before);
      for (const stage of update) {
        const stageInput = structuredClone(next);
        const evaluated = Object.fromEntries(
          Object.entries(stage.$set).map(([key, value]) => [
            key,
            this.evaluate(value, stageInput),
          ]),
        );
        next = { ...next, ...evaluated };
      }

      if (existing) {
        matchedCount += 1;
        if (JSON.stringify(before) !== JSON.stringify(next)) {
          modifiedCount += 1;
        }
        this.docs.set(filter._id, next as StoredLead);
        continue;
      }

      this.docs.set(filter._id, next as StoredLead);
      upsertedCount += 1;
    }

    return {
      matchedCount,
      modifiedCount,
      upsertedCount,
    };
  }
}

function asMongoCollection(collection: InMemoryExternalLeadCollection) {
  return collection as unknown as Collection<ExternalUnverifiedLeadDocument>;
}

describe("external unverified lead mapping", () => {
  it("maps a managed Page row to a deterministic, redacted staging document", () => {
    const contacts = syntheticContactValues();
    const doc = mapRow();
    const persistedText = JSON.stringify(doc);

    expect(doc.stableId).toBe("facebook_page:123456:123456_987654");
    expect(doc._id).toMatch(/^[a-f0-9]{64}$/);
    expect(doc.sourceKind).toBe("managed_page_graph_api");
    expect(doc.sourcePageName).toBe("Synthetic Repairs Page");
    expect(doc.contactTypes).toEqual(["phone", "email", "whatsapp"]);
    expect(doc.moneyText).toEqual(["日薪 HK$1,200", "$100"]);
    expect(doc.verificationState).toBe("pending_human_review");
    expect(doc.lawfulUseState).toBe("pending_review");
    expect(doc.outreachState).toBe("not_authorized");
    expect(doc.retentionState).toBe("active");
    expect(doc.redactionState).toBe("supported_contact_patterns_redacted");
    expect(doc.engagement).toEqual({
      shares: 1,
      reactions: 2,
      comments: 3,
    });
    expect(doc.sourceCreatedAt).toBeInstanceOf(Date);
    expect(doc.capturedAt).toBeInstanceOf(Date);
    expect(doc.sourceGeneratedAt).toBeInstanceOf(Date);
    expect(doc.expiresAt).toBeInstanceOf(Date);
    expect(doc.sourcePermalink).toBe(
      "https://www.facebook.com/123456/posts/987654",
    );
    expect(persistedText).not.toContain(contacts.phone);
    expect(persistedText).not.toContain(contacts.email);
    expect(persistedText).not.toContain(contacts.whatsAppLink);
    expect(doc).not.toHaveProperty("message");
    expect(doc).not.toHaveProperty("pageName");
    expect(doc).not.toHaveProperty("fullPicture");
    expect(doc).not.toHaveProperty("customerId");
    expect(doc).not.toHaveProperty("matchedProIds");
  });

  it("keeps at most three explicit money expressions", () => {
    const doc = mapRow({
      message:
        "中環辦公室搵電工更換插座。時薪 $120，日薪 $900，預算 HK$2,000，另加500元，完工後面議。",
    });

    expect(doc.moneyText).toHaveLength(3);
    expect(doc.moneyText).toEqual(["時薪 $120", "日薪 $900", "預算 HK$2,000"]);
  });

  it("normalizes NFKC and zero-width text before redacting spaced and fullwidth contacts", () => {
    const { phone } = syntheticContactValues();
    const spacedPhone = phone.match(/.{1,2}/gu)?.join(" ") ?? phone;
    const zeroWidthPhone = phone.split("").join("\u200B");
    const fullwidthPhone = [...phone]
      .map((digit) => String.fromCharCode(0xff10 + Number(digit)))
      .join("");
    const fullwidthEmail = "jobs＠example.invalid";
    const doc = mapRow({
      page_name: `Ｓｙｎｔｈｅｔｉｃ維修 ${fullwidthPhone}`,
      message: [
        "灣仔辦公室搵電工檢查跳掣及更換插座。",
        `電話 ${spacedPhone} 或 ${zeroWidthPhone}，電郵 ${fullwidthEmail}。`,
        "日薪 ＨＫ＄１，２００。",
      ].join("\n"),
    });
    const persistedText = JSON.stringify(doc);

    expect(doc.sourcePageName).toBe("Synthetic維修 [PHONE]");
    expect(doc.contactTypes).toEqual(["phone", "email"]);
    expect(doc.moneyText).toEqual(["日薪 HK$1,200"]);
    expect(persistedText).not.toContain(phone);
    expect(persistedText).not.toContain(spacedPhone);
    expect(persistedText).not.toContain(fullwidthPhone);
    expect(persistedText).not.toContain("\u200B");
    expect(persistedText).not.toContain(fullwidthEmail);
  });

  it("rejects a non-normalized or contact-bearing source Page name before persistence", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const doc = mapRow();
    const { phone } = syntheticContactValues();
    const unsafe = {
      ...doc,
      sourcePageName: phone.split("").join("\u200B"),
    } as ExternalUnverifiedLeadDocument;

    await expect(
      upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [unsafe],
        new Date("2026-09-01T00:10:00.000Z"),
      ),
    ).rejects.toThrow(/sourcePageName/u);
    expect(collection.docs).toHaveLength(0);
  });

  it("rejects unknown input fields and missing work content", () => {
    expect(() =>
      mapFacebookPageRowToExternalLead(
        { ...sourceRow(), unexpected: true } as FacebookPageSourceRow,
        importOptions,
      ),
    ).toThrow();
    expect(() => mapRow({ message: null })).toThrow(/no message/u);
    expect(() =>
      mapRow({
        message: "九龍區搵水電師傅處理廚房漏水問題。",
        permalink_url: null,
      }),
    ).toThrow(/no usable contact route/u);
  });

  it("rejects future and out-of-window rows", () => {
    expect(() => mapRow({ created_time: "2026-09-01T00:00:01.000Z" })).toThrow(
      /future/u,
    );
    expect(() => mapRow({ created_time: "2026-08-24T23:59:59.999Z" })).toThrow(
      /outside the delivery window/u,
    );
  });

  it("rejects a non-Facebook permalink instead of persisting it", () => {
    expect(() =>
      mapRow({ permalink_url: "https://example.invalid/synthetic-post" }),
    ).toThrow(/Facebook HTTPS URL/u);
  });

  it("keeps only identity-bearing parameters for query-style Facebook permalinks", () => {
    const doc = mapRow({
      permalink_url:
        "https://www.facebook.com/permalink.php?story_fbid=987654&id=123456&utm_source=test#comments",
    });

    expect(doc.sourcePermalink).toBe(
      "https://www.facebook.com/permalink.php?story_fbid=987654&id=123456",
    );
    expect(() =>
      mapRow({
        permalink_url: "https://www.facebook.com/permalink.php?utm_source=test",
      }),
    ).toThrow(/missing its Facebook post identity/u);
  });
});

describe("external unverified lead persistence helpers", () => {
  it("declares unique, review-queue, and expiresAt TTL indexes", async () => {
    const createIndexes = vi.fn(async (indexes) =>
      indexes.map((index: { name: string }) => index.name),
    );
    const collection = vi.fn(() => ({ createIndexes }));
    const db = { collection } as unknown as Db;

    await ensureExternalUnverifiedLeadIndexes(db);

    expect(collection).toHaveBeenCalledWith(
      EXTERNAL_UNVERIFIED_LEADS_COLLECTION,
    );
    expect(createIndexes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "external_lead_stable_id_unique",
          unique: true,
        }),
        expect.objectContaining({ name: "external_lead_review_queue" }),
        expect.objectContaining({
          name: "external_lead_expires_at_ttl",
          key: { expiresAt: 1 },
          expireAfterSeconds: 0,
        }),
      ]),
    );
  });

  it("upserts idempotently and preserves states when content is unchanged", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const firstDoc = mapRow();
    const firstNow = new Date("2026-09-01T00:10:00.000Z");

    await expect(
      upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [firstDoc],
        firstNow,
      ),
    ).resolves.toMatchObject({ requestedRows: 1, insertedRows: 1 });
    expect(collection.docs).toHaveLength(1);
    expect(collection.docs.get(firstDoc._id)?.moneyText).toEqual([
      "日薪 HK$1,200",
      "$100",
    ]);

    const stored = collection.docs.get(firstDoc._id);
    expect(stored).toBeDefined();
    if (!stored) {
      return;
    }
    stored.verificationState = "verified";
    stored.lawfulUseState = "approved";
    stored.outreachState = "authorized";
    collection.docs.set(stored._id, stored);

    const secondNow = new Date("2026-09-01T00:20:00.000Z");
    await expect(
      upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [mapRow()],
        secondNow,
      ),
    ).resolves.toMatchObject({ requestedRows: 1, matchedRows: 1 });

    expect(collection.docs).toHaveLength(1);
    expect(collection.docs.get(firstDoc._id)).toMatchObject({
      verificationState: "verified",
      lawfulUseState: "approved",
      outreachState: "authorized",
      retentionState: "active",
      needsReReview: false,
      firstImportedAt: firstNow,
      lastSeenAt: secondNow,
      updatedAt: secondNow,
    });
    expect(collection.bulkWriteOptions).toEqual([
      { ordered: false },
      { ordered: false },
    ]);
  });

  it("persists dollar-prefixed source values as Mongo pipeline literals", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const doc = mapRow({
      page_name: "$500維修專頁",
      message: "$500預算，九龍區搵水電師傅處理廚房漏水問題。",
    });

    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [doc],
      new Date("2026-09-01T00:10:00.000Z"),
    );

    expect(collection.docs.get(doc._id)).toMatchObject({
      sourcePageName: "$500維修專頁",
      title: "$500預算,九龍區搵水電師傅處理廚房漏水問題",
      workSummary: "$500預算,九龍區搵水電師傅處理廚房漏水問題。",
      moneyText: ["$500"],
    });
  });

  it("resets decision states and sets needsReReview when content changes", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const original = mapRow();
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [original],
      new Date("2026-09-01T00:10:00.000Z"),
    );

    const stored = collection.docs.get(original._id);
    expect(stored).toBeDefined();
    if (!stored) {
      return;
    }
    stored.verificationState = "verified";
    stored.lawfulUseState = "approved";
    stored.outreachState = "authorized";
    collection.docs.set(stored._id, stored);

    const changed = mapRow({
      message:
        "九龍區搵水喉師傅，改為處理浴室喉管滲水及更換來水掣。日薪 HK$1,300。",
    });
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [changed],
      new Date("2026-09-01T00:30:00.000Z"),
    );

    expect(collection.docs.get(original._id)).toMatchObject({
      contentSha256: changed.contentSha256,
      verificationState: "pending_human_review",
      lawfulUseState: "pending_review",
      outreachState: "not_authorized",
      needsReReview: true,
    });
  });

  it("never clears needsReReview during a stale concurrent refresh", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const original = mapRow();
    const changed = mapRow({
      message:
        "九龍區搵水喉師傅，改為處理浴室喉管滲水及更換來水掣。日薪 HK$1,300。",
    });
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [original],
      new Date("2026-09-01T00:10:00.000Z"),
    );
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [changed],
      new Date("2026-09-01T00:20:00.000Z"),
    );
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [original],
      new Date("2026-09-01T00:30:00.000Z"),
    );

    expect(collection.docs.get(original._id)?.needsReReview).toBe(true);
  });

  it("does not let an older source snapshot overwrite a newer run", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const newer = mapFacebookPageRowToExternalLead(
      sourceRow({
        message:
          "九龍區搵水喉師傅，最新資料係處理浴室喉管滲水。日薪 HK$1,400。",
      }),
      {
        ...importOptions,
        sourceGeneratedAt: new Date("2026-09-02T00:00:00.000Z"),
        importedAt: new Date("2026-09-02T00:05:00.000Z"),
        runId: "newer-managed-page-run",
      },
    );
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [newer],
      new Date("2026-09-02T00:10:00.000Z"),
    );
    const before = structuredClone(collection.docs.get(newer._id));

    const older = mapRow({
      message: "九龍區搵水喉師傅，較舊資料係處理廚房漏水。日薪 HK$1,100。",
    });
    await expect(
      upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [older],
        new Date("2026-09-02T00:20:00.000Z"),
      ),
    ).resolves.toMatchObject({ matchedRows: 1, modifiedRows: 0 });

    expect(collection.docs.get(newer._id)).toEqual(before);
    expect(collection.docs.get(newer._id)).toMatchObject({
      sourceRunId: "newer-managed-page-run",
      sourceGeneratedAt: new Date("2026-09-02T00:00:00.000Z"),
      contentSha256: newer.contentSha256,
    });
  });

  it("does not extend an existing expiry during refresh", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const original = mapRow();
    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [original],
      new Date("2026-09-01T00:10:00.000Z"),
    );
    const laterExpiry = mapFacebookPageRowToExternalLead(sourceRow(), {
      ...importOptions,
      retentionDays: 90,
    });
    expect(laterExpiry.expiresAt > original.expiresAt).toBe(true);

    await upsertExternalUnverifiedLeads(
      asMongoCollection(collection),
      [laterExpiry],
      new Date("2026-09-01T00:20:00.000Z"),
    );

    expect(collection.docs.get(original._id)?.expiresAt).toEqual(
      original.expiresAt,
    );
  });

  it.each(["deletion_requested", "deleted", "expired"])(
    "does not refresh or resurrect a %s lead",
    async (retentionState) => {
      const collection = new InMemoryExternalLeadCollection();
      const original = mapRow();
      await upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [original],
        new Date("2026-09-01T00:10:00.000Z"),
      );
      const stored = collection.docs.get(original._id);
      expect(stored).toBeDefined();
      if (!stored) {
        return;
      }
      stored.retentionState = retentionState;
      collection.docs.set(stored._id, stored);
      const before = structuredClone(stored);
      const changed = mapRow({
        message:
          "九龍區搵水喉師傅，改為處理浴室喉管滲水及更換來水掣。日薪 HK$1,300。",
      });

      await expect(
        upsertExternalUnverifiedLeads(
          asMongoCollection(collection),
          [changed],
          new Date("2026-09-01T00:40:00.000Z"),
        ),
      ).resolves.toMatchObject({ matchedRows: 1, modifiedRows: 0 });
      expect(collection.docs.get(original._id)).toEqual(before);
    },
  );

  it("validates the whole batch before making a database call", async () => {
    const collection = new InMemoryExternalLeadCollection();
    const doc = mapRow();

    await expect(
      upsertExternalUnverifiedLeads(
        asMongoCollection(collection),
        [doc, structuredClone(doc)],
        new Date("2026-09-01T00:10:00.000Z"),
      ),
    ).rejects.toThrow(/duplicate source identities/u);
    expect(collection.docs).toHaveLength(0);
  });
});

describe("development MongoDB target validation", () => {
  it("accepts only an exact hotfix_dev database and matching URI path", () => {
    expect(() =>
      validateHotfixDevMongoTarget(
        "mongodb://dev-user:secret@127.0.0.1:27018/hotfix_dev?authSource=hotfix_dev",
        "hotfix_dev",
      ),
    ).not.toThrow();
  });

  it("rejects production, mismatched, and non-MongoDB targets", () => {
    expect(() =>
      validateHotfixDevMongoTarget(
        "mongodb://prod-user:secret@localhost/hotfix_prod",
        "hotfix_prod",
      ),
    ).toThrow(/hotfix_dev/u);
    expect(() =>
      validateHotfixDevMongoTarget(
        "mongodb://dev-user:secret@localhost/another_dev",
        "hotfix_dev",
      ),
    ).toThrow(/does not match/u);
    expect(() =>
      validateHotfixDevMongoTarget(
        "mongodb://dev-user:secret@localhost/hotfix_dev?authSource=hotfix_prod",
        "hotfix_dev",
      ),
    ).toThrow(/authSource/u);
    expect(() =>
      validateHotfixDevMongoTarget(
        "https://localhost/hotfix_dev",
        "hotfix_dev",
      ),
    ).toThrow(/MongoDB protocol/u);
  });
});

describe("Facebook Page DEV sync command options", () => {
  it("defaults to a MongoDB dry-run and requires explicit apply", () => {
    expect(parseCliOptions(["--retention-days", "30"])).toEqual({
      apply: false,
      retentionDays: 30,
    });
    expect(
      parseCliOptions([
        "--apply",
        "--retention-days",
        "30",
        "--window-days",
        "7",
      ]),
    ).toEqual({ apply: true, retentionDays: 30, windowDays: 7 });
  });

  it("rejects unknown command options and invalid Page IDs", () => {
    expect(() => parseCliOptions(["--write-production"])).toThrow(
      /Unknown argument/u,
    );
    expect(() => parsePageIds("123,not-a-page")).toThrow(/numeric Page IDs/u);
    expect(parsePageIds("123, 456,123")).toEqual(["123", "456"]);
    expect(() => parseCliOptions(["--retention-days", "366"])).toThrow(
      /cannot exceed 365/u,
    );
    expect(() => parseCliOptions(["--window-days", "32"])).toThrow(
      /cannot exceed 31/u,
    );
    expect(() => assertRetentionCoversWindow(7, 7)).not.toThrow();
    expect(() => assertRetentionCoversWindow(6, 7)).toThrow(
      /cannot be shorter/u,
    );
  });

  it("restricts the raw SQLite source to the ignored private directory", () => {
    expect(() =>
      assertPrivateSqlitePath(
        path.join(
          process.cwd(),
          "data",
          "private-runs",
          "facebook-pages",
          "synthetic.sqlite3",
        ),
      ),
    ).not.toThrow();
    expect(() =>
      assertPrivateSqlitePath(path.join(os.tmpdir(), "facebook.sqlite3")),
    ).toThrow(/directly inside/u);
    expect(() =>
      assertPrivateSqlitePath(
        path.join(
          process.cwd(),
          "data",
          "private-runs",
          "facebook-pages",
          "nested",
          "synthetic.sqlite3",
        ),
      ),
    ).toThrow(/directly inside/u);
  });

  it("reads only Pages that completed this run and rows inside the fixed window", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "hotfix24-page-sync-test-"),
    );
    const databasePath = path.join(directory, "source.sqlite3");
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (location: string) => {
        close: () => void;
        exec: (sql: string) => void;
      };
    };
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE page_sync_state (
          page_id TEXT PRIMARY KEY,
          last_created_time TEXT,
          last_successful_sync_at TEXT NOT NULL,
          last_successful_run_id TEXT
        );
        CREATE TABLE posts (
          post_id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL,
          page_name TEXT NOT NULL,
          message TEXT,
          created_time TEXT NOT NULL,
          permalink_url TEXT,
          full_picture TEXT,
          shares_count INTEGER,
          reactions_count INTEGER,
          comments_count INTEGER,
          synced_at TEXT NOT NULL
        );
        INSERT INTO page_sync_state VALUES
          ('111', NULL, '2026-09-01T00:00:00.000Z', 'synthetic-run'),
          ('222', NULL, '2026-09-01T00:00:10.000Z', 'older-run');
        INSERT INTO posts VALUES
          ('111_new', '111', 'Page One', '九龍區搵水電師傅處理漏水',
           '2026-08-31T12:00:00.000Z',
           'https://www.facebook.com/111/posts/1', NULL, 0, 0, 0,
           '2026-09-01T00:00:10.000Z'),
          ('111_old', '111', 'Page One', '舊有水電工作資料',
           '2026-08-24T23:59:59.000Z',
           'https://www.facebook.com/111/posts/2', NULL, 0, 0, 0,
           '2026-09-01T00:00:10.000Z'),
          ('222_new', '222', 'Page Two', '未完成同步嘅工作資料',
           '2026-08-31T12:00:00.000Z',
           'https://www.facebook.com/222/posts/3', NULL, 0, 0, 0,
           '2026-08-31T23:59:59.000Z');
      `);
    } finally {
      database.close();
    }

    try {
      const snapshot = readSuccessfulSourceRows({
        databasePath,
        pageIds: ["111", "222"],
        runId: "synthetic-run",
        runStartedAt: sourceGeneratedAt,
        windowDays: 7,
      });
      expect(snapshot.successfulPageCount).toBe(1);
      expect(snapshot.sourceRows.map((row) => row.post_id)).toEqual([
        "111_new",
      ]);

      const derived = deriveLeads({
        rows: snapshot.sourceRows,
        runId: "synthetic-run",
        runStartedAt: sourceGeneratedAt,
        retentionDays: 30,
        windowDays: 7,
      });
      expect(derived).toMatchObject({
        rejectedRows: 0,
        leads: [
          expect.objectContaining({
            sourceId: "111",
            verificationState: "pending_human_review",
          }),
        ],
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("securely prunes expired rows and Pages removed from the allowlist", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "hotfix24-page-prune-test-"),
    );
    const databasePath = path.join(directory, "source.sqlite3");
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (location: string) => {
        close: () => void;
        exec: (sql: string) => void;
        prepare: (sql: string) => { all: () => unknown[] };
      };
    };
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE page_sync_state (
          page_id TEXT PRIMARY KEY,
          last_created_time TEXT,
          last_successful_sync_at TEXT NOT NULL,
          last_successful_run_id TEXT
        );
        CREATE TABLE posts (
          post_id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL,
          created_time TEXT NOT NULL
        );
        INSERT INTO page_sync_state VALUES
          ('111', NULL, '2026-09-01T00:00:00.000Z', 'run'),
          ('999', NULL, '2026-09-01T00:00:00.000Z', 'run');
        INSERT INTO posts VALUES
          ('keep', '111', '2026-08-31T00:00:00.000Z'),
          ('expired', '111', '2026-07-01T00:00:00.000Z'),
          ('removed-page', '999', '2026-08-31T00:00:00.000Z');
      `);
    } finally {
      database.close();
    }

    try {
      expect(
        pruneRestrictedSourceRows({
          databasePath,
          pageIds: ["111"],
          retentionCutoff: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ).toBe(2);

      const check = new DatabaseSync(databasePath);
      try {
        expect(
          check.prepare("SELECT post_id FROM posts ORDER BY post_id").all(),
        ).toEqual([{ post_id: "keep" }]);
        expect(
          check.prepare("SELECT page_id FROM page_sync_state").all(),
        ).toEqual([{ page_id: "111" }]);
      } finally {
        check.close();
      }
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
