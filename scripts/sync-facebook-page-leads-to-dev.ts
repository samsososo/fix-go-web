import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import { z } from "zod";

import {
  EXTERNAL_UNVERIFIED_LEADS_COLLECTION,
  ensureExternalUnverifiedLeadIndexes,
  mapFacebookPageRowToExternalLead,
  upsertExternalUnverifiedLeads,
  validateHotfixDevMongoTarget,
  type ExternalUnverifiedLeadDocument,
  type FacebookPageSourceRow,
} from "../src/lib/external-unverified-leads";

type SqliteStatement = {
  all: (...parameters: unknown[]) => unknown[];
  run: (...parameters: unknown[]) => { changes: number | bigint };
};

type SqliteDatabase = {
  close: () => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

type SqliteConstructor = new (
  location: string,
  options: { readOnly: boolean },
) => SqliteDatabase;

type CliOptions = {
  apply: boolean;
  retentionDays?: number;
  windowDays?: number;
};

type SourceSnapshot = {
  successfulPageCount: number;
  sourceRows: FacebookPageSourceRow[];
};

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const facebookToolDir = path.join(projectRoot, "tools", "facebook_page_sync");
const facebookEnvPath = path.join(facebookToolDir, ".env");
const facebookSyncPath = path.join(facebookToolDir, "sync.py");
const privateSourceRoot = path.join(
  projectRoot,
  "data",
  "private-runs",
  "facebook-pages",
);

const optionalPositiveInteger = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(maximum).optional(),
  );

const facebookWrapperEnvironmentKeys = new Set([
  "FACEBOOK_GRAPH_API_VERSION",
  "FACEBOOK_LEAD_RETENTION_DAYS",
  "FACEBOOK_LEAD_WINDOW_DAYS",
  "FACEBOOK_PAGE_IDS",
  "FACEBOOK_SQLITE_PATH",
]);

const environmentSchema = z.object({
  FACEBOOK_GRAPH_API_VERSION: z
    .string()
    .regex(/^v[1-9]\d*\.0$/)
    .default("v26.0"),
  FACEBOOK_LEAD_RETENTION_DAYS: optionalPositiveInteger(365),
  FACEBOOK_LEAD_WINDOW_DAYS: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(31).default(7),
  ),
  FACEBOOK_PAGE_IDS: z.string().min(1),
  FACEBOOK_SQLITE_PATH: z.string().optional(),
  MONGODB_DATABASE: z.literal("hotfix_dev"),
  MONGODB_URI: z.string().min(1),
  PYTHON_BIN: z.string().min(1).default("python3"),
});

function logEvent(event: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    })}\n`,
  );
}

function safeErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const fields = [
      ...new Set(
        error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
      ),
    ];
    return fields.length > 0
      ? `Invalid or missing configuration: ${fields.join(", ")}.`
      : "Invalid or missing configuration.";
  }
  if (error instanceof Error && /^Mongo/u.test(error.name)) {
    return "MongoDB operation failed; check the DEV connection and collection permissions.";
  }
  if (error instanceof Error) {
    return error.message.replace(
      /mongodb(?:\+srv)?:\/\/[^\s@/]+(?::[^\s@/]*)?@/giu,
      "mongodb://[REDACTED]@",
    );
  }
  return "Unknown synchronization error.";
}

function parsePositiveInteger(value: string, flag: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }
    if (argument === "--retention-days" || argument === "--window-days") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }
      const parsed = parsePositiveInteger(value, argument);
      if (argument === "--retention-days") {
        if (parsed > 365) {
          throw new Error("--retention-days cannot exceed 365.");
        }
        options.retentionDays = parsed;
      } else {
        if (parsed > 31) {
          throw new Error("--window-days cannot exceed 31.");
        }
        options.windowDays = parsed;
      }
      index += 1;
      continue;
    }
    if (argument === "--help") {
      process.stdout.write(
        [
          "Usage: npm run db:sync:facebook-pages -- [--apply] --retention-days DAYS [--window-days DAYS]",
          "",
          "Without --apply the command fetches into the restricted SQLite cache and validates the derived rows without writing MongoDB.",
        ].join("\n") + "\n",
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function parsePageIds(raw: string) {
  const pageIds = [
    ...new Set(raw.split(",").map((value) => value.trim())),
  ].filter(Boolean);
  if (pageIds.length === 0 || pageIds.some((pageId) => !/^\d+$/.test(pageId))) {
    throw new Error("FACEBOOK_PAGE_IDS must contain numeric Page IDs.");
  }
  return pageIds;
}

export function assertRetentionCoversWindow(
  retentionDays: number,
  windowDays: number,
) {
  if (retentionDays < windowDays) {
    throw new Error(
      "The approved retention period cannot be shorter than the delivery window; reduce --window-days or increase --retention-days.",
    );
  }
}

function resolveSqlitePath(configuredPath?: string) {
  if (!configuredPath) {
    return path.join(privateSourceRoot, "posts.sqlite3");
  }
  return path.resolve(facebookToolDir, configuredPath);
}

async function readRestrictedFacebookEnvironment() {
  let handle;
  try {
    handle = await open(
      facebookEnvPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(
        "tools/facebook_page_sync/.env is missing; copy .env.example and chmod 600 first.",
      );
    }
    throw error;
  }

  try {
    const stats = await handle.stat();
    const currentUid =
      typeof process.getuid === "function" ? process.getuid() : null;
    if (
      !stats.isFile() ||
      stats.nlink !== 1 ||
      (stats.mode & 0o777) !== 0o600 ||
      (currentUid !== null && stats.uid !== currentUid)
    ) {
      throw new Error(
        "tools/facebook_page_sync/.env must be a current-user-owned, single-link regular file with exact mode 600.",
      );
    }

    const values: Record<string, string> = {};
    const contents = await handle.readFile({ encoding: "utf8" });
    for (const [lineIndex, rawLine] of contents.split(/\r?\n/u).entries()) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      if (line.startsWith("export ")) {
        line = line.slice("export ".length).trimStart();
      }
      const separator = line.indexOf("=");
      if (separator <= 0) {
        throw new Error(
          `Invalid tools/facebook_page_sync/.env entry on line ${lineIndex + 1}.`,
        );
      }
      const key = line.slice(0, separator).trim();
      if (!facebookWrapperEnvironmentKeys.has(key)) {
        continue;
      }
      let value = line.slice(separator + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } finally {
    await handle.close();
  }
}

export function assertPrivateSqlitePath(sqlitePath: string) {
  if (
    path.dirname(sqlitePath) !== privateSourceRoot ||
    !/^[A-Za-z0-9._-]+\.sqlite3$/u.test(path.basename(sqlitePath))
  ) {
    throw new Error(
      "FACEBOOK_SQLITE_PATH must name a .sqlite3 file directly inside data/private-runs/facebook-pages.",
    );
  }
}

async function ensurePrivateSourcePaths(sqlitePath: string) {
  assertPrivateSqlitePath(sqlitePath);

  await mkdir(privateSourceRoot, { recursive: true, mode: 0o700 });
  const sourceRootStats = await lstat(privateSourceRoot);
  if (!sourceRootStats.isDirectory() || sourceRootStats.isSymbolicLink()) {
    throw new Error(
      "The private Facebook source path must be a real directory.",
    );
  }
  const [canonicalProjectRoot, canonicalSourceRoot] = await Promise.all([
    realpath(projectRoot),
    realpath(privateSourceRoot),
  ]);
  if (
    canonicalSourceRoot !==
    path.join(canonicalProjectRoot, "data", "private-runs", "facebook-pages")
  ) {
    throw new Error(
      "The private Facebook source directory crosses a symlink boundary.",
    );
  }
  await chmod(privateSourceRoot, 0o700);

  try {
    const databaseStats = await lstat(sqlitePath);
    if (
      !databaseStats.isFile() ||
      databaseStats.isSymbolicLink() ||
      databaseStats.nlink !== 1
    ) {
      throw new Error(
        "FACEBOOK_SQLITE_PATH must be a single-link regular file, not a symlink.",
      );
    }
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

async function acquireSourceRunLock() {
  const lockPath = path.join(privateSourceRoot, "sync.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new Error(
        "Another Facebook Page sync is running, or a stale data/private-runs/facebook-pages/sync.lock needs operator review.",
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`, { encoding: "utf8" });
  } catch (error) {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
    throw error;
  }

  return async () => {
    await handle.close();
    await unlink(lockPath);
  };
}

async function restrictSqliteFiles(databasePath: string) {
  for (const candidate of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ]) {
    try {
      const candidateStats = await lstat(candidate);
      if (
        !candidateStats.isFile() ||
        candidateStats.isSymbolicLink() ||
        candidateStats.nlink !== 1
      ) {
        throw new Error(
          "SQLite source files must be single-link regular files, not symlinks.",
        );
      }
      await chmod(candidate, 0o600);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }
}

async function runPythonSync(options: {
  databasePath: string;
  graphApiVersion: string;
  initialLookbackDays: number;
  pythonBin: string;
  runId: string;
}) {
  const status = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      options.pythonBin,
      [
        facebookSyncPath,
        "--env-file",
        facebookEnvPath,
        "--database",
        options.databasePath,
        "--graph-api-version",
        options.graphApiVersion,
        "--initial-lookback-days",
        String(options.initialLookbackDays),
        "--run-id",
        options.runId,
      ],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error("Facebook Page sync was interrupted."));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (status >= 2) {
    throw new Error("Facebook Page source sync failed before a usable run.");
  }
  return status;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SQLite returned an invalid row.");
  }
  return value as Record<string, unknown>;
}

export function readSuccessfulSourceRows(options: {
  databasePath: string;
  pageIds: string[];
  runId: string;
  runStartedAt: Date;
  windowDays: number;
}): SourceSnapshot {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: SqliteConstructor;
  };
  const database = new DatabaseSync(options.databasePath, { readOnly: true });
  try {
    const placeholders = options.pageIds.map(() => "?").join(", ");
    const stateRows = database
      .prepare(
        `SELECT page_id, last_successful_run_id
         FROM page_sync_state
         WHERE page_id IN (${placeholders})`,
      )
      .all(...options.pageIds)
      .map(asRecord);
    const successfulPageIds = new Set(
      stateRows
        .filter((row) => {
          return row.last_successful_run_id === options.runId;
        })
        .map((row) => String(row.page_id)),
    );

    if (successfulPageIds.size === 0) {
      return { successfulPageCount: 0, sourceRows: [] };
    }

    const successfulIds = [...successfulPageIds];
    const successfulPlaceholders = successfulIds.map(() => "?").join(", ");
    const cutoff = new Date(
      options.runStartedAt.getTime() - options.windowDays * 86_400_000,
    );
    const rows = database
      .prepare(
        `SELECT post_id, page_id, page_name, message, created_time,
                permalink_url, shares_count, reactions_count, comments_count,
                synced_at
         FROM posts
         WHERE page_id IN (${successfulPlaceholders})
         ORDER BY page_id, created_time DESC, post_id`,
      )
      .all(...successfulIds)
      .map(asRecord)
      .filter((row) => {
        if (typeof row.created_time !== "string") {
          return false;
        }
        const createdAt = new Date(row.created_time);
        return (
          Number.isFinite(createdAt.getTime()) &&
          createdAt >= cutoff &&
          createdAt <= options.runStartedAt
        );
      }) as FacebookPageSourceRow[];

    return {
      successfulPageCount: successfulPageIds.size,
      sourceRows: rows,
    };
  } finally {
    database.close();
  }
}

export function pruneRestrictedSourceRows(options: {
  databasePath: string;
  pageIds: string[];
  retentionCutoff: Date;
}) {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: SqliteConstructor;
  };
  const database = new DatabaseSync(options.databasePath, { readOnly: false });
  try {
    database.exec("PRAGMA secure_delete = ON");
    const rows = database
      .prepare("SELECT post_id, page_id, created_time FROM posts")
      .all()
      .map(asRecord);
    const activePageIds = new Set(options.pageIds);
    const expiredPostIds = rows.flatMap((row) => {
      const createdAt =
        typeof row.created_time === "string"
          ? new Date(row.created_time)
          : new Date(Number.NaN);
      const shouldDelete =
        typeof row.post_id !== "string" ||
        typeof row.page_id !== "string" ||
        !activePageIds.has(row.page_id) ||
        !Number.isFinite(createdAt.getTime()) ||
        createdAt < options.retentionCutoff;
      return shouldDelete && typeof row.post_id === "string"
        ? [row.post_id]
        : [];
    });

    let deletedRows = 0;
    for (let index = 0; index < expiredPostIds.length; index += 250) {
      const batch = expiredPostIds.slice(index, index + 250);
      const placeholders = batch.map(() => "?").join(", ");
      const result = database
        .prepare(`DELETE FROM posts WHERE post_id IN (${placeholders})`)
        .run(...batch);
      deletedRows += Number(result.changes);
    }

    const pagePlaceholders = options.pageIds.map(() => "?").join(", ");
    database
      .prepare(
        `DELETE FROM page_sync_state WHERE page_id NOT IN (${pagePlaceholders})`,
      )
      .run(...options.pageIds);
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.exec("VACUUM");
    return deletedRows;
  } finally {
    database.close();
  }
}

async function pruneRestrictedSourceRowsIfPresent(options: {
  databasePath: string;
  pageIds: string[];
  retentionCutoff: Date;
}) {
  try {
    await lstat(options.databasePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return 0;
    }
    throw error;
  }
  return pruneRestrictedSourceRows(options);
}

export function deriveLeads(options: {
  rows: FacebookPageSourceRow[];
  runId: string;
  runStartedAt: Date;
  retentionDays: number;
  windowDays: number;
}) {
  const leads: ExternalUnverifiedLeadDocument[] = [];
  let rejectedRows = 0;
  for (const row of options.rows) {
    try {
      leads.push(
        mapFacebookPageRowToExternalLead(row, {
          runId: options.runId,
          sourceGeneratedAt: options.runStartedAt,
          windowDays: options.windowDays,
          retentionDays: options.retentionDays,
        }),
      );
    } catch {
      rejectedRows += 1;
    }
  }
  return { leads, rejectedRows };
}

async function applyToDevMongo(options: {
  databaseName: string;
  leads: ExternalUnverifiedLeadDocument[];
  mongoUri: string;
  now: Date;
}) {
  const client = new MongoClient(options.mongoUri, { ignoreUndefined: true });
  await client.connect();
  try {
    const database = client.db(options.databaseName);
    await ensureExternalUnverifiedLeadIndexes(database);
    const collection = database.collection<ExternalUnverifiedLeadDocument>(
      EXTERNAL_UNVERIFIED_LEADS_COLLECTION,
    );
    const result = await upsertExternalUnverifiedLeads(
      collection,
      options.leads,
      options.now,
    );
    return result;
  } finally {
    await client.close();
  }
}

async function main() {
  process.umask(0o077);
  const cli = parseCliOptions(process.argv.slice(2));
  const facebookEnvironment = await readRestrictedFacebookEnvironment();
  const environment = environmentSchema.parse({
    ...facebookEnvironment,
    ...process.env,
  });
  const retentionDays =
    cli.retentionDays ?? environment.FACEBOOK_LEAD_RETENTION_DAYS;
  if (!retentionDays) {
    throw new Error(
      "Set FACEBOOK_LEAD_RETENTION_DAYS or pass --retention-days with an approved value.",
    );
  }
  const windowDays = cli.windowDays ?? environment.FACEBOOK_LEAD_WINDOW_DAYS;
  assertRetentionCoversWindow(retentionDays, windowDays);
  const sourceLookbackDays = Math.min(retentionDays, Math.max(14, windowDays));
  const pageIds = parsePageIds(environment.FACEBOOK_PAGE_IDS);
  validateHotfixDevMongoTarget(
    environment.MONGODB_URI,
    environment.MONGODB_DATABASE,
  );

  const databasePath = resolveSqlitePath(environment.FACEBOOK_SQLITE_PATH);
  await ensurePrivateSourcePaths(databasePath);
  const releaseSourceRunLock = await acquireSourceRunLock();
  try {
    const runId = randomUUID();
    const runStartedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    logEvent("facebook_page_lead_sync_started", {
      mode: cli.apply ? "apply" : "dry_run",
      requestedPageCount: pageIds.length,
      graphApiVersion: environment.FACEBOOK_GRAPH_API_VERSION,
      windowDays,
      sourceLookbackDays,
      retentionDays,
    });

    let prunedSourceRows = 0;
    const sourceResult = await (async () => {
      try {
        const sourceExitCode = await runPythonSync({
          databasePath,
          graphApiVersion: environment.FACEBOOK_GRAPH_API_VERSION,
          initialLookbackDays: sourceLookbackDays,
          pythonBin: environment.PYTHON_BIN,
          runId,
        });
        const snapshot = readSuccessfulSourceRows({
          databasePath,
          pageIds,
          runId,
          runStartedAt,
          windowDays,
        });
        const derived = deriveLeads({
          rows: snapshot.sourceRows,
          runId,
          runStartedAt,
          retentionDays,
          windowDays,
        });
        return { sourceExitCode, snapshot, ...derived };
      } finally {
        prunedSourceRows = await pruneRestrictedSourceRowsIfPresent({
          databasePath,
          pageIds,
          retentionCutoff: new Date(
            runStartedAt.getTime() - retentionDays * 86_400_000,
          ),
        });
        await restrictSqliteFiles(databasePath);
      }
    })();
    const { leads, rejectedRows, snapshot, sourceExitCode } = sourceResult;

    if (!cli.apply) {
      logEvent("facebook_page_lead_sync_finished", {
        status: sourceExitCode === 0 ? "dry_run_complete" : "partial_source",
        successfulPageCount: snapshot.successfulPageCount,
        sourceRows: snapshot.sourceRows.length,
        validStagingRows: leads.length,
        rejectedRows,
        prunedSourceRows,
        mongoWrites: 0,
      });
      if (sourceExitCode !== 0) {
        process.exitCode = 1;
      }
      return;
    }

    const result = await applyToDevMongo({
      databaseName: environment.MONGODB_DATABASE,
      leads,
      mongoUri: environment.MONGODB_URI,
      now: new Date(),
    });
    logEvent("facebook_page_lead_sync_finished", {
      status: sourceExitCode === 0 ? "pending_human_review" : "partial_source",
      successfulPageCount: snapshot.successfulPageCount,
      sourceRows: snapshot.sourceRows.length,
      validStagingRows: leads.length,
      rejectedRows,
      prunedSourceRows,
      insertedRows: result.insertedRows,
      matchedRows: result.matchedRows,
      modifiedRows: result.modifiedRows,
    });
    if (sourceExitCode !== 0) {
      process.exitCode = 1;
    }
  } finally {
    await releaseSourceRunLock();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    logEvent("facebook_page_lead_sync_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorMessage: safeErrorMessage(error),
    });
    process.exitCode = 1;
  });
}
