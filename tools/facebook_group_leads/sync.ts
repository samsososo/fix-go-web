import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, parseArgs, parseEnv } from "node:util";
import { BSON, MongoClient, type Document } from "mongodb";

import { validateFacebookSnapshotMongoTarget } from "../../src/lib/facebook-snapshot-mongo-target";

type Row = Document & { _id: string };
type Candidate = {
  sourceUrl: string;
  postId: string | null;
  author?: string;
  body: string;
  title: string;
  displayLocation: string;
  regionEvidence: string;
  intent: string;
  categoryId: string;
  capturedAt: string;
  truncated?: boolean;
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const config: { sources: { name: string; url: string; enabled: boolean }[] } =
  JSON.parse(
    fs.readFileSync(new URL("./sources.json", import.meta.url), "utf8"),
  );
const sources = new Map<string, string>(
  config.sources.filter((s) => s.enabled).map((s) => [s.url, s.name]),
);
const excluded = new Set(["deleted", "deletion_requested", "expired"]);
const normalized = (text: string) =>
  text.normalize("NFKC").replace(/\p{Cf}/gu, "");
const redact = (text: string) =>
  normalized(text)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(
      /(?<![A-Za-z0-9$])\+?[0-9OoIiLl](?:[ \t().-]*[0-9OoIiLl]){6,14}(?![A-Za-z0-9])/g,
      "[PHONE]",
    );
const bodyKey = (row: Row) =>
  redact(row.intentReview?.displayText || row.sourceMessage || "").replace(
    /[\s，。,:：;；!?！？]/g,
    "",
  );
const permalink = (value: unknown) =>
  typeof value === "string" ? value.replace(/\/$/, "") : null;

function eligible(row: Row, now: Date) {
  return (
    row.sourceKind === "group_browser_snapshot" &&
    row.verificationState === "pending_human_review" &&
    !excluded.has(row.retentionState) &&
    (row.expiresAt === undefined || row.expiresAt > now) &&
    row.intentReview?.version === 1 &&
    row.intentReview?.region === "HK" &&
    ["service_request", "recruitment"].includes(row.intentReview?.intent) &&
    row.contentSha256 === row.intentReview?.contentSha256
  );
}

function validate(row: Row) {
  assert(/^[a-f0-9]{64}$/.test(row._id), "Invalid snapshot identity");
  assert(sources.has(row.sourceUrl), "Source is not enabled");
  assert(
    typeof row.sourceMessage === "string" &&
      sha(row.sourceMessage) === row.contentSha256,
    "Invalid content hash",
  );
  assert(
    row.intentReview?.title &&
      row.intentReview?.displayText &&
      row.intentReview?.categoryId,
    "Incomplete review",
  );
  assert(
    row.sourcePermalink === null ||
      row.sourcePermalink === undefined ||
      new RegExp(
        "^" +
          row.sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "(?:posts|permalink)/[0-9]+/?$",
      ).test(row.sourcePermalink),
    "Invalid source permalink",
  );
}

function candidate(row: Candidate, reviewedAt: Date): Row {
  assert(sources.has(row.sourceUrl), "Unknown source");
  for (const field of ["body", "title", "displayLocation"] as const) {
    assert(
      typeof row[field] === "string" && row[field].trim(),
      "Missing display field",
    );
    assert(
      redact(row[field]) === normalized(row[field]),
      "Unredacted contact in input",
    );
  }
  assert(
    ["post_text", "source_context"].includes(row.regionEvidence),
    "Missing region evidence",
  );
  assert(
    ["service_request", "recruitment"].includes(row.intent),
    "Invalid demand intent",
  );
  assert(
    ["plumbing", "electrical", "aircon", "renovation", "cleaning"].includes(
      row.categoryId,
    ),
    "Invalid category",
  );
  assert(
    row.postId === null ||
      (typeof row.postId === "string" && /^\d+$/.test(row.postId)),
    "Invalid post ID",
  );
  assert(
    row.postId || (typeof row.author === "string" && row.author.trim()),
    "Snapshot needs stable author evidence",
  );
  const capturedAt = new Date(row.capturedAt);
  assert(
    Number.isFinite(capturedAt.getTime()) && capturedAt <= reviewedAt,
    "Invalid capture time",
  );
  const contentSha256 = sha(row.body);
  const stableId =
    row.postId ||
    "snapshot:" + sha(JSON.stringify([row.sourceUrl, row.author, row.body]));
  const sourcePermalink = row.postId
    ? `${row.sourceUrl}posts/${row.postId}/`
    : null;
  return {
    _id: sha(JSON.stringify([row.sourceUrl, stableId, contentSha256])),
    platform: "facebook",
    sourceKind: "group_browser_snapshot",
    sourceName: sources.get(row.sourceUrl),
    sourceUrl: row.sourceUrl,
    sourcePostId: row.postId,
    sourcePermalink,
    sourceStableId: stableId,
    identityConfidence: row.postId ? "permalink" : "snapshot_only",
    contentSha256,
    sourceMessage: row.body,
    sourceLinks: sourcePermalink ? [sourcePermalink] : [],
    capturedAt,
    sourceGeneratedAt: reviewedAt,
    sourceCreatedAt: null,
    needsDateReview: true,
    needsIdentityReview: !row.postId,
    truncated: row.truncated === true,
    verificationState: "pending_human_review",
    lawfulUseState: "pending_review",
    outreachState: "not_authorized",
    contactState: "contacts_redacted",
    coverage: "bounded_visible_feed",
    retentionPolicyState: "pending_configuration",
    firstImportedAt: reviewedAt,
    intentReview: {
      version: 1,
      intent: row.intent,
      region: "HK",
      regionEvidence: row.regionEvidence,
      contentSha256,
      title: row.title,
      displayText: row.body,
      displayLocation: row.displayLocation,
      categoryId: row.categoryId,
      method: "agent_content_review",
      policyVersion: "2026-09-13-broader-demand",
      reviewedAt,
      reason:
        "Individually reviewed HK work demand; source-context inferences and posting dates remain unverified.",
    },
  };
}

function plan(incoming: Row[], existing: Row[]) {
  const inserts: Row[] = [];
  let skipped = 0;
  for (const row of incoming) {
    validate(row);
    const sameId = existing.find((old) => old._id === row._id);
    assert(
      !sameId || sameId.contentSha256 === row.contentSha256,
      "Existing identity conflict",
    );
    const duplicate = [...existing, ...inserts].some(
      (old) =>
        old._id === row._id ||
        (permalink(row.sourcePermalink) &&
          permalink(old.sourcePermalink) === permalink(row.sourcePermalink)) ||
        (old.sourceUrl === row.sourceUrl &&
          old.sourceStableId &&
          old.sourceStableId === row.sourceStableId) ||
        (bodyKey(row) && bodyKey(old) === bodyKey(row)),
    );
    if (duplicate) skipped++;
    else inserts.push(row);
  }
  return { inserts, skipped };
}

function selfTest() {
  const now = new Date();
  const sourceUrl = [...sources.keys()][0];
  const row = candidate(
    {
      sourceUrl,
      postId: "123",
      body: "Synthetic request to install a light",
      title: "Synthetic installation",
      displayLocation: "香港（地區未提供）",
      regionEvidence: "source_context",
      intent: "service_request",
      categoryId: "electrical",
      capturedAt: now.toISOString(),
    },
    now,
  );
  assert(eligible(row, now));
  assert(!eligible({ ...row, expiresAt: null }, now));
  assert(!eligible({ ...row, retentionState: "deleted" }, now));
  assert(
    !eligible(
      { ...row, intentReview: { ...row.intentReview, contentSha256: "stale" } },
      now,
    ),
  );
  assert(plan([row, row], []).inserts.length === 1);
  assert(
    plan(
      [{ ...row, _id: "b".repeat(64) }],
      [{ ...row, retentionState: "deleted" }],
    ).inserts.length === 0,
  );
  assert(
    plan([{ ...row, _id: "b".repeat(64), sourcePermalink: null }], [row])
      .inserts.length === 0,
  );
  assert.throws(() => plan([row], [{ ...row, contentSha256: "conflict" }]));
  assert.throws(() =>
    validateFacebookSnapshotMongoTarget(
      "mongodb://localhost/hotfix_dev?authSource=hotfix_prod",
      "hotfix_dev",
    ),
  );
  for (const sample of [
    "9".repeat(8),
    "+44 " + "7".repeat(10),
    "０".repeat(10),
    "O" + "9".repeat(9),
  ])
    assert(redact(sample) === "[PHONE]");
  assert(redact("$1200-$1600\n09:00 - 18:00") === "$1200-$1600\n09:00 - 18:00");
  console.log(JSON.stringify({ selfTest: "passed" }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "run-dir": { type: "string" },
      apply: { type: "boolean" },
      "self-test": { type: "boolean" },
    },
  });
  if (values["self-test"]) return selfTest();
  const runDir = path.resolve(values["run-dir"] || "");
  const privateRoot = path.resolve("data/private-runs");
  assert(
    runDir.startsWith(privateRoot + path.sep),
    "Use a private run directory",
  );
  process.umask(0o077);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  assert(
    fs.realpathSync(runDir).startsWith(fs.realpathSync(privateRoot) + path.sep),
    "Invalid private output path",
  );
  fs.chmodSync(runDir, 0o700);
  const now = new Date();
  const payload = values.input
    ? JSON.parse(fs.readFileSync(values.input, "utf8"))
    : { candidates: [], reviewedAt: now.toISOString() };
  assert(Array.isArray(payload.candidates), "Invalid candidates");
  const reviewedAt = new Date(payload.reviewedAt);
  assert(
    Number.isFinite(reviewedAt.getTime()) && reviewedAt <= now,
    "Invalid review timestamp",
  );
  const incoming = payload.candidates.map((row: Candidate) =>
    candidate(row, reviewedAt),
  );
  const targets = (
    [
      [".env.dev", "hotfix_dev"],
      [".env.production", "hotfix_prod"],
    ] as const
  ).map(([file, database]) => {
    const env = parseEnv(fs.readFileSync(file, "utf8"));
    assert(env.MONGODB_DATABASE === database, "Environment database mismatch");
    assert(typeof env.MONGODB_URI === "string", "Missing database URI");
    return validateFacebookSnapshotMongoTarget(env.MONGODB_URI, database);
  });
  const clients = targets.map(
    (t) => new MongoClient(t.uri, { serverSelectionTimeoutMS: 7000 }),
  );
  try {
    await Promise.all(clients.map((c) => c.connect()));
    const collections = clients.map((c, i) =>
      c
        .db(targets[i].database)
        .collection<Row>("externalFacebookGroupSnapshots"),
    );
    const before = await Promise.all(
      collections.map((c) => c.find({}).sort({ _id: 1 }).toArray()),
    );
    const devPlan = plan(incoming, before[0]);
    const approved = [...before[0], ...devPlan.inserts].filter((row) =>
      eligible(row, now),
    );
    const prodPlan = plan(approved, before[1]);
    const plans = [devPlan, prodPlan];
    const summary = {
      mode: values.apply ? "apply" : "dry_run",
      devEligible: approved.length,
      devToInsert: devPlan.inserts.length,
      prodToInsert: prodPlan.inserts.length,
      prodSkipped: prodPlan.skipped,
      beforeEligible: before.map(
        (rows) => rows.filter((row) => eligible(row, now)).length,
      ),
      inputSha256: sha(BSON.EJSON.stringify(approved)),
      verified: false,
    };
    console.log(JSON.stringify(summary));
    if (!values.apply) return;
    const backup = path.join(runDir, `before-${now.getTime()}.private.ejson`);
    fs.writeFileSync(
      backup,
      BSON.EJSON.stringify({
        targets: targets.map((t) => t.database),
        before,
        approved,
      }),
      { mode: 0o600, flag: "wx" },
    );
    for (let i = 0; i < collections.length; i++) {
      // Verify DEV fully before any PROD writes. Never replace existing rows.
      for (const row of plans[i].inserts) {
        const result = await collections[i].updateOne(
          { _id: row._id },
          { $setOnInsert: row },
          { upsert: true },
        );
        assert(
          result.upsertedCount === 1,
          "Concurrent insert; stop and recheck",
        );
      }
      const after = await collections[i].find({}).sort({ _id: 1 }).toArray();
      assert(
        after.length === before[i].length + plans[i].inserts.length,
        "Unexpected collection count",
      );
      for (const old of before[i])
        assert(
          isDeepStrictEqual(
            old,
            after.find((row) => row._id === old._id),
          ),
          "Existing record changed",
        );
      for (const row of plans[i].inserts)
        assert(
          isDeepStrictEqual(
            row,
            after.find((actual) => actual._id === row._id),
          ),
          "Inserted record verification failed",
        );
    }
    const after = await Promise.all(
      collections.map((c) => c.find({}).toArray()),
    );
    const receipt = {
      ...summary,
      verified: true,
      afterEligible: after.map(
        (rows) => rows.filter((row) => eligible(row, new Date())).length,
      ),
      afterTotals: after.map((rows) => rows.length),
      existingRecordsUnchanged: true,
      humanReviewStatus: "pending",
      verifiedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(runDir, "sync-receipt.json"),
      JSON.stringify(receipt, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(receipt));
  } finally {
    await Promise.all(clients.map((c) => c.close()));
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      errorType: error.name,
      code: error.code || "validation_or_connection_failure",
    }),
  );
  process.exitCode = 1;
});
