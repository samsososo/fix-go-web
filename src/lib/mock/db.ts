import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { enableDatabaseSeeding, env } from "@/lib/env";
import {
  createMongoCredential,
  createMongoSession,
  findMongoCredentialByIdentifier,
  findMongoUserById,
  getMongoSessionUser,
  invalidateMongoSession,
  listMongoCredentialedDemoUsers,
  readMongoDb,
  resetMongoDb,
  verifyMongoUserCredentials,
  withMongoDb,
  writeMongoDb,
} from "@/lib/mock/mongo-db";
import {
  hashPassword,
  verifyPassword,
  createOpaqueToken,
} from "@/lib/security";
import { createSeedDb } from "@/mock/seed";
import { MockDb, User, UserRole } from "@/types/domain";

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

const dataDirectory = path.isAbsolute(env.DATA_DIR)
  ? env.DATA_DIR
  : path.join(/*turbopackIgnore: true*/ process.cwd(), env.DATA_DIR);
const sqlitePath = path.join(
  dataDirectory,
  env.NODE_ENV === "test"
    ? `hotfix.test.${process.pid}.sqlite`
    : "hotfix.sqlite",
);
type SqliteDatabase = Database.Database;

let connection: SqliteDatabase | null = null;

function shouldUseMongoStorage() {
  return env.STORAGE_DRIVER === "mongodb";
}

function ensureConnection() {
  if (connection) {
    return connection;
  }

  mkdirSync(dataDirectory, { recursive: true });
  connection = new Database(sqlitePath);
  connection.pragma("journal_mode = WAL");
  connection.exec("PRAGMA foreign_keys = ON;");
  initializeSchema(connection);
  bootstrapIfNeeded(connection);
  applyDataPatches(connection);
  return connection;
}

function runInTransaction<T>(db: SqliteDatabase, callback: () => T) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function initializeSchema(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE NOT NULL,
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      attempted_at TEXT NOT NULL,
      success INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pro_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS districts (
      district TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      category_id TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      pro_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      quote_id TEXT NOT NULL,
      pro_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booking_status_events (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      is_read INTEGER NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_notes (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}

function bootstrapIfNeeded(db: SqliteDatabase) {
  const alreadyBootstrapped = db
    .prepare("SELECT value FROM meta WHERE key = 'bootstrapped'")
    .get() as { value?: string } | undefined;

  if (alreadyBootstrapped?.value === "1") {
    return;
  }

  if (!enableDatabaseSeeding) {
    return;
  }

  const initialState = loadInitialState();
  writeState(db, initialState);

  const users = initialState.users.map((user) => ({
    userId: user.id,
    password:
      user.role === "admin" ? env.BOOTSTRAP_ADMIN_PASSWORD : env.DEMO_PASSWORD,
    isDemo: 1,
  }));

  const insertCredential = db.prepare(`
    INSERT INTO auth_credentials (user_id, password_hash, is_demo)
    VALUES (?, ?, ?)
  `);

  runInTransaction(db, () => {
    for (const user of users) {
      insertCredential.run(
        user.userId,
        hashPassword(user.password),
        user.isDemo,
      );
    }
    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('bootstrapped', '1')",
    ).run();
  });
}

function loadInitialState() {
  return createSeedDb();
}

function applyDataPatches(db: SqliteDatabase) {
  if (!enableDatabaseSeeding) {
    return;
  }

  const calendarPatch = db
    .prepare("SELECT value FROM meta WHERE key = 'demo_calendar_seed_v1'")
    .get() as { value?: string } | undefined;

  if (calendarPatch?.value === "1") {
    return;
  }

  const seed = createSeedDb();
  const seedRequest = seed.requests.find((request) => request.id === "req_1");
  const seedQuote = seed.quotes.find((quote) => quote.id === "quote_1");
  const seedBooking = seed.bookings.find(
    (booking) => booking.id === "booking_seed_amy_aircon",
  );
  const seedEvent = seed.bookingStatusEvents.find(
    (event) => event.id === "book_event_seed_amy_aircon_accepted",
  );

  if (!seedRequest || !seedQuote || !seedBooking || !seedEvent) {
    return;
  }

  runInTransaction(db, () => {
    const requestExists = db
      .prepare("SELECT id FROM requests WHERE id = ? LIMIT 1")
      .get(seedRequest.id);
    const quoteExists = db
      .prepare("SELECT id FROM quotes WHERE id = ? LIMIT 1")
      .get(seedQuote.id);
    const bookingExists = db
      .prepare("SELECT id FROM bookings WHERE id = ? LIMIT 1")
      .get(seedBooking.id);

    if (requestExists && quoteExists && !bookingExists) {
      db.prepare(
        "UPDATE requests SET status = ?, payload = ? WHERE id = ?",
      ).run(seedRequest.status, JSON.stringify(seedRequest), seedRequest.id);
      db.prepare("UPDATE quotes SET status = ?, payload = ? WHERE id = ?").run(
        seedQuote.status,
        JSON.stringify(seedQuote),
        seedQuote.id,
      );
      db.prepare(
        `
          INSERT INTO bookings (id, request_id, quote_id, pro_id, customer_id, status, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        seedBooking.id,
        seedBooking.requestId,
        seedBooking.quoteId,
        seedBooking.proId,
        seedBooking.customerId,
        seedBooking.status,
        JSON.stringify(seedBooking),
      );
      db.prepare(
        `
          INSERT OR IGNORE INTO booking_status_events (id, booking_id, status, payload)
          VALUES (?, ?, ?, ?)
        `,
      ).run(
        seedEvent.id,
        seedEvent.bookingId,
        seedEvent.status,
        JSON.stringify(seedEvent),
      );
    }

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('demo_calendar_seed_v1', '1')",
    ).run();
  });
}

function parsePayloadRows<T>(rows: Array<{ payload: string }>) {
  return rows.map((row) => JSON.parse(row.payload) as T);
}

function syncPayloadTable<T>(
  db: SqliteDatabase,
  options: {
    table: string;
    keyColumn: string;
    rows: T[];
    getKey: (row: T) => string;
    mapRow?: (row: T) => Record<string, unknown>;
  },
) {
  const keys = options.rows.map(options.getKey);
  const deleteStmt =
    keys.length > 0
      ? db.prepare(
          `DELETE FROM ${options.table} WHERE ${options.keyColumn} NOT IN (${keys.map(() => "?").join(", ")})`,
        )
      : db.prepare(`DELETE FROM ${options.table}`);

  if (keys.length > 0) {
    deleteStmt.run(...keys);
  } else {
    deleteStmt.run();
  }

  for (const row of options.rows) {
    const data = options.mapRow
      ? options.mapRow(row)
      : {
          [options.keyColumn]: options.getKey(row),
          payload: JSON.stringify(row),
        };
    const columns = Object.keys(data);
    const values = Object.values(data);
    const updatableColumns = columns.filter(
      (column) => column !== options.keyColumn,
    );
    const sql =
      updatableColumns.length > 0
        ? `INSERT INTO ${options.table} (${columns.join(", ")}) VALUES (${columns
            .map(() => "?")
            .join(
              ", ",
            )}) ON CONFLICT(${options.keyColumn}) DO UPDATE SET ${updatableColumns
            .map((column) => `${column}=excluded.${column}`)
            .join(", ")}`
        : `INSERT INTO ${options.table} (${columns.join(", ")}) VALUES (${columns
            .map(() => "?")
            .join(", ")}) ON CONFLICT(${options.keyColumn}) DO NOTHING`;

    db.prepare(sql).run(...values);
  }
}

function writeState(db: SqliteDatabase, state: MockDb) {
  runInTransaction(db, () => {
    syncPayloadTable(db, {
      table: "users",
      keyColumn: "id",
      rows: state.users,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        role: row.role,
        full_name: row.fullName,
        email: row.email ?? null,
        phone: row.phone,
        locale: row.locale,
        created_at: row.createdAt,
        last_login_at: row.lastLoginAt,
      }),
    });
    syncPayloadTable(db, {
      table: "customer_profiles",
      keyColumn: "user_id",
      rows: state.customerProfiles,
      getKey: (row) => row.userId,
      mapRow: (row) => ({ user_id: row.userId, payload: JSON.stringify(row) }),
    });
    syncPayloadTable(db, {
      table: "pro_profiles",
      keyColumn: "user_id",
      rows: state.proProfiles,
      getKey: (row) => row.userId,
      mapRow: (row) => ({ user_id: row.userId, payload: JSON.stringify(row) }),
    });
    syncPayloadTable(db, {
      table: "categories",
      keyColumn: "id",
      rows: state.categories,
      getKey: (row) => row.id,
      mapRow: (row) => ({ id: row.id, payload: JSON.stringify(row) }),
    });
    syncPayloadTable(db, {
      table: "districts",
      keyColumn: "district",
      rows: state.districts,
      getKey: (row) => row.district,
      mapRow: (row) => ({
        district: row.district,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "addresses",
      keyColumn: "id",
      rows: state.addresses,
      getKey: (row) => row.id,
    });
    syncPayloadTable(db, {
      table: "attachments",
      keyColumn: "id",
      rows: state.attachments,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        request_id: row.requestId,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "requests",
      keyColumn: "id",
      rows: state.requests,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        customer_id: row.customerId,
        status: row.status,
        category_id: row.categoryId,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "quotes",
      keyColumn: "id",
      rows: state.quotes,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        request_id: row.requestId,
        pro_id: row.proId,
        status: row.status,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "bookings",
      keyColumn: "id",
      rows: state.bookings,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        request_id: row.requestId,
        quote_id: row.quoteId,
        pro_id: row.proId,
        customer_id: row.customerId,
        status: row.status,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "booking_status_events",
      keyColumn: "id",
      rows: state.bookingStatusEvents,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        booking_id: row.bookingId,
        status: row.status,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "notifications",
      keyColumn: "id",
      rows: state.notifications,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        user_id: row.userId,
        is_read: row.read ? 1 : 0,
        payload: JSON.stringify(row),
      }),
    });
    syncPayloadTable(db, {
      table: "admin_notes",
      keyColumn: "id",
      rows: state.adminNotes,
      getKey: (row) => row.id,
      mapRow: (row) => ({
        id: row.id,
        entity_id: row.entityId,
        entity_type: row.entityType,
        payload: JSON.stringify(row),
      }),
    });
  });
}

export async function readDb() {
  if (shouldUseMongoStorage()) {
    return readMongoDb();
  }

  const db = ensureConnection();
  const users = (
    db
      .prepare(
        "SELECT id, role, full_name, email, phone, locale, created_at, last_login_at FROM users",
      )
      .all() as Array<{
      id: string;
      role: UserRole;
      full_name: string;
      email: string | null;
      phone: string;
      locale: User["locale"];
      created_at: string;
      last_login_at: string;
    }>
  ).map((row) => ({
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email ?? undefined,
    phone: row.phone,
    locale: row.locale,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }));

  return {
    users,
    customerProfiles: parsePayloadRows(
      db.prepare("SELECT payload FROM customer_profiles").all() as Array<{
        payload: string;
      }>,
    ),
    proProfiles: parsePayloadRows(
      db.prepare("SELECT payload FROM pro_profiles").all() as Array<{
        payload: string;
      }>,
    ),
    categories: parsePayloadRows(
      db.prepare("SELECT payload FROM categories").all() as Array<{
        payload: string;
      }>,
    ),
    districts: parsePayloadRows(
      db.prepare("SELECT payload FROM districts").all() as Array<{
        payload: string;
      }>,
    ),
    addresses: parsePayloadRows(
      db.prepare("SELECT payload FROM addresses").all() as Array<{
        payload: string;
      }>,
    ),
    attachments: parsePayloadRows(
      db.prepare("SELECT payload FROM attachments").all() as Array<{
        payload: string;
      }>,
    ),
    requests: parsePayloadRows(
      db.prepare("SELECT payload FROM requests").all() as Array<{
        payload: string;
      }>,
    ),
    quotes: parsePayloadRows(
      db.prepare("SELECT payload FROM quotes").all() as Array<{
        payload: string;
      }>,
    ),
    bookings: parsePayloadRows(
      db.prepare("SELECT payload FROM bookings").all() as Array<{
        payload: string;
      }>,
    ),
    bookingStatusEvents: parsePayloadRows(
      db.prepare("SELECT payload FROM booking_status_events").all() as Array<{
        payload: string;
      }>,
    ),
    notifications: parsePayloadRows(
      db.prepare("SELECT payload FROM notifications").all() as Array<{
        payload: string;
      }>,
    ),
    adminNotes: parsePayloadRows(
      db.prepare("SELECT payload FROM admin_notes").all() as Array<{
        payload: string;
      }>,
    ),
  } satisfies MockDb;
}

export async function writeDb(dbState: MockDb) {
  if (shouldUseMongoStorage()) {
    return writeMongoDb(dbState);
  }

  const db = ensureConnection();
  writeState(db, dbState);
}

export async function withDb<T>(updater: (db: MockDb) => Promise<T> | T) {
  if (shouldUseMongoStorage()) {
    return withMongoDb(updater);
  }

  const dbState = await readDb();
  const result = await updater(dbState);
  await writeDb(dbState);
  return result;
}

export async function findCredentialByIdentifier(identifier: string) {
  if (shouldUseMongoStorage()) {
    return findMongoCredentialByIdentifier(identifier);
  }

  const db = ensureConnection();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const row = db
    .prepare(
      `
        SELECT
          users.id,
          users.role,
          users.full_name,
          users.email,
          users.phone,
          users.locale,
          users.created_at,
          users.last_login_at,
          auth_credentials.password_hash,
          auth_credentials.is_demo
        FROM users
        INNER JOIN auth_credentials ON auth_credentials.user_id = users.id
        WHERE lower(coalesce(users.email, '')) = ? OR users.phone = ?
        LIMIT 1
      `,
    )
    .get(normalizedIdentifier, identifier.replace(/\D/g, "")) as
    | {
        id: string;
        role: UserRole;
        full_name: string;
        email: string | null;
        phone: string;
        locale: User["locale"];
        created_at: string;
        last_login_at: string;
        password_hash: string;
        is_demo: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    user: {
      id: row.id,
      role: row.role,
      fullName: row.full_name,
      email: row.email ?? undefined,
      phone: row.phone,
      locale: row.locale,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    } satisfies User,
    passwordHash: row.password_hash,
    isDemo: row.is_demo === 1,
  };
}

export async function findUserById(userId: string) {
  if (shouldUseMongoStorage()) {
    return findMongoUserById(userId);
  }

  const db = ensureConnection();
  const row = db
    .prepare(
      `
        SELECT id, role, full_name, email, phone, locale, created_at, last_login_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(userId) as
    | {
        id: string;
        role: UserRole;
        full_name: string;
        email: string | null;
        phone: string;
        locale: User["locale"];
        created_at: string;
        last_login_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email ?? undefined,
    phone: row.phone,
    locale: row.locale,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  } satisfies User;
}

export async function createCredential(
  userId: string,
  password: string,
  isDemo: boolean = false,
) {
  if (shouldUseMongoStorage()) {
    return createMongoCredential(userId, password, isDemo);
  }

  const db = ensureConnection();
  db.prepare(
    `
      INSERT OR REPLACE INTO auth_credentials (user_id, password_hash, is_demo)
      VALUES (?, ?, ?)
    `,
  ).run(userId, hashPassword(password), isDemo ? 1 : 0);
}

export async function verifyUserCredentials(
  identifier: string,
  password: string,
) {
  if (shouldUseMongoStorage()) {
    return verifyMongoUserCredentials(identifier, password);
  }

  const db = ensureConnection();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const recentFailures = (
    db
      .prepare(
        `
        SELECT count(*) as count
        FROM login_attempts
        WHERE identifier = ?
          AND success = 0
          AND attempted_at >= datetime('now', '-10 minutes')
      `,
      )
      .get(normalizedIdentifier) as { count: number }
  ).count;

  if (recentFailures >= 5) {
    return {
      ok: false as const,
      error: "Too many login attempts. Please try again later.",
    };
  }

  const credential = await findCredentialByIdentifier(identifier);
  if (!credential || !verifyPassword(password, credential.passwordHash)) {
    db.prepare(
      "INSERT INTO login_attempts (identifier, attempted_at, success) VALUES (?, ?, 0)",
    ).run(normalizedIdentifier, new Date().toISOString());
    return { ok: false as const, error: "Invalid credentials." };
  }

  db.prepare(
    "INSERT INTO login_attempts (identifier, attempted_at, success) VALUES (?, ?, 1)",
  ).run(normalizedIdentifier, new Date().toISOString());
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    credential.user.id,
  );

  return {
    ok: true as const,
    user: credential.user,
    isDemo: credential.isDemo,
  };
}

export async function createSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string },
) {
  if (shouldUseMongoStorage()) {
    return createMongoSession(userId, metadata);
  }

  const db = ensureConnection();
  const sessionId = createOpaqueToken();
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  db.prepare(
    `
      INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    sessionId,
    userId,
    expiresAt,
    new Date().toISOString(),
    metadata?.userAgent ?? null,
    metadata?.ipAddress ?? null,
  );

  return { sessionId, expiresAt };
}

export async function getSessionUser(sessionId: string) {
  if (shouldUseMongoStorage()) {
    return getMongoSessionUser(sessionId);
  }

  const db = ensureConnection();
  const session = db
    .prepare(
      "SELECT id, user_id, expires_at FROM sessions WHERE id = ? LIMIT 1",
    )
    .get(sessionId) as SessionRow | undefined;

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT id, role, full_name, email, phone, locale, created_at, last_login_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(session.user_id) as
    | {
        id: string;
        role: UserRole;
        full_name: string;
        email: string | null;
        phone: string;
        locale: User["locale"];
        created_at: string;
        last_login_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email ?? undefined,
    phone: row.phone,
    locale: row.locale,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  } satisfies User;
}

export async function invalidateSession(sessionId: string) {
  if (shouldUseMongoStorage()) {
    return invalidateMongoSession(sessionId);
  }

  const db = ensureConnection();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export async function listCredentialedDemoUsers() {
  if (shouldUseMongoStorage()) {
    return listMongoCredentialedDemoUsers();
  }

  const db = ensureConnection();
  const rows = db
    .prepare(
      `
        SELECT
          users.id,
          users.role,
          users.full_name,
          users.email,
          users.phone,
          users.locale,
          users.created_at,
          users.last_login_at
        FROM users
        INNER JOIN auth_credentials ON auth_credentials.user_id = users.id
        WHERE auth_credentials.is_demo = 1
        ORDER BY users.role, users.full_name
      `,
    )
    .all() as Array<{
    id: string;
    role: UserRole;
    full_name: string;
    email: string | null;
    phone: string;
    locale: User["locale"];
    created_at: string;
    last_login_at: string;
  }>;

  return rows.map(
    (row) =>
      ({
        id: row.id,
        role: row.role,
        fullName: row.full_name,
        email: row.email ?? undefined,
        phone: row.phone,
        locale: row.locale,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      }) satisfies User,
  );
}

export async function resetSqliteDb() {
  if (shouldUseMongoStorage()) {
    return resetMongoDb();
  }

  if (!enableDatabaseSeeding) {
    throw new Error("Database reset is disabled when seeding is disabled.");
  }

  const db = ensureConnection();
  const seed = createSeedDb();

  runInTransaction(db, () => {
    db.exec("DELETE FROM sessions;");
    db.exec("DELETE FROM login_attempts;");
    db.exec("DELETE FROM auth_credentials;");
  });

  writeState(db, seed);

  runInTransaction(db, () => {
    const insertCredential = db.prepare(`
      INSERT OR REPLACE INTO auth_credentials (user_id, password_hash, is_demo)
      VALUES (?, ?, ?)
    `);

    for (const user of seed.users) {
      insertCredential.run(
        user.id,
        hashPassword(
          user.role === "admin"
            ? env.BOOTSTRAP_ADMIN_PASSWORD
            : env.DEMO_PASSWORD,
        ),
        1,
      );
    }

    db.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('bootstrapped', '1')",
    ).run();
  });
}
