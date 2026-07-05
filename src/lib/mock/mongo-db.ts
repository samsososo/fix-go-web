import { Db, Filter, MongoClient } from "mongodb";

import { enableDatabaseSeeding, env } from "@/lib/env";
import {
  createOpaqueToken,
  hashPassword,
  verifyPassword,
} from "@/lib/security";
import { createSeedDb } from "@/mock/seed";
import {
  AdminNote,
  Address,
  Attachment,
  Booking,
  BookingStatusEvent,
  CustomerProfile,
  DistrictAreaSeed,
  Locale,
  MockDb,
  NotificationItem,
  ProProfile,
  Quote,
  RequestStatus,
  ServiceCategory,
  ServiceRequest,
  User,
} from "@/types/domain";

type MongoDoc<T extends object> = T & { _id: string };

type MetaDoc = {
  _id: string;
  value: string;
};

type AuthCredentialDoc = {
  _id: string;
  userId: string;
  passwordHash: string;
  isDemo: boolean;
};

type SessionDoc = {
  _id: string;
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  userAgent?: string;
  ipAddress?: string;
};

type LoginAttemptDoc = {
  identifier: string;
  attemptedAt: string;
  success: boolean;
};

let clientPromise: Promise<MongoClient> | null = null;
let initialized = false;
const mongoReadCacheMs = env.NODE_ENV === "development" ? 10000 : 0;
let mongoReadCache: { expiresAt: number; state: MockDb } | null = null;
let mongoReadInflight: Promise<MockDb> | null = null;
let mongoSessionUserCache = new Map<
  string,
  { expiresAt: number; user: User | null }
>();

function requireMongoUri() {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required when STORAGE_DRIVER=mongodb.");
  }

  return env.MONGODB_URI;
}

async function getMongoClient() {
  if (!clientPromise) {
    clientPromise = new MongoClient(requireMongoUri(), {
      ignoreUndefined: true,
    }).connect();
  }

  return clientPromise;
}

async function getMongoDb() {
  const client = await getMongoClient();
  const db = client.db(env.MONGODB_DATABASE);

  if (!initialized) {
    await initializeMongo(db);
    await bootstrapIfNeeded(db);
    await applyDataPatches(db);
    initialized = true;
  }

  return db;
}

async function initializeMongo(db: Db) {
  await db
    .collection("users")
    .updateMany({ email: { $type: "null" } }, { $unset: { email: "" } });

  await Promise.all([
    db
      .collection<MongoDoc<User>>("users")
      .createIndex({ email: 1 }, { unique: true, sparse: true }),
    db
      .collection<MongoDoc<User>>("users")
      .createIndex({ phone: 1 }, { unique: true }),
    db
      .collection<AuthCredentialDoc>("authCredentials")
      .createIndex({ userId: 1 }, { unique: true }),
    db
      .collection<SessionDoc>("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<LoginAttemptDoc>("loginAttempts").createIndex({
      identifier: 1,
      attemptedAt: 1,
    }),
    db
      .collection<MongoDoc<ServiceRequest>>("requests")
      .createIndex({ customerId: 1, status: 1 }),
    db
      .collection<MongoDoc<ServiceRequest>>("requests")
      .createIndex({ categoryId: 1 }),
    db.collection<MongoDoc<ServiceRequest>>("requests").createIndex({
      matchedProIds: 1,
      status: 1,
      categoryId: 1,
      createdAt: -1,
    }),
    db
      .collection<MongoDoc<Quote>>("quotes")
      .createIndex({ requestId: 1, proId: 1 }),
    db
      .collection<MongoDoc<Booking>>("bookings")
      .createIndex({ customerId: 1, proId: 1, status: 1 }),
    db
      .collection<MongoDoc<Booking>>("bookings")
      .createIndex({ proId: 1, status: 1, updatedAt: -1 }),
    db
      .collection<MongoDoc<Booking>>("bookings")
      .createIndex({ proId: 1, scheduledDate: 1, updatedAt: 1 }),
    db
      .collection<MongoDoc<BookingStatusEvent>>("bookingStatusEvents")
      .createIndex({ bookingId: 1 }),
    db
      .collection<MongoDoc<NotificationItem>>("notifications")
      .createIndex({ userId: 1, read: 1, createdAt: -1 }),
  ]);
}

async function getMeta(db: Db, key: string) {
  return db.collection<MetaDoc>("meta").findOne({ _id: key });
}

async function setMeta(db: Db, key: string, value: string) {
  await db
    .collection<MetaDoc>("meta")
    .updateOne({ _id: key }, { $set: { value } }, { upsert: true });
}

function stripMongoId<T extends object>(doc: T & { _id: unknown }) {
  const { _id: _discarded, ...rest } = doc;
  void _discarded;
  return rest as T;
}

function cloneMockDbState(state: MockDb) {
  return structuredClone(state) as MockDb;
}

function cloneUser(user: User | null) {
  return user ? (structuredClone(user) as User) : null;
}

function clearMongoReadCache() {
  mongoReadCache = null;
  mongoReadInflight = null;
}

function clearMongoSessionUserCache(sessionId?: string) {
  if (sessionId) {
    mongoSessionUserCache.delete(sessionId);
    return;
  }

  mongoSessionUserCache = new Map();
}

function sanitizeMongoReplacement(
  collectionName: string,
  row: Record<string, unknown>,
) {
  const replacement = Object.fromEntries(
    Object.entries(row).filter((entry) => entry[1] !== undefined),
  );

  if (
    collectionName === "users" &&
    (replacement.email === null || replacement.email === "")
  ) {
    delete replacement.email;
  }

  return replacement;
}

function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const grouped = new Map<string, T[]>();

  rows.forEach((row) => {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  return grouped;
}

async function readCollection<T extends object>(db: Db, name: string) {
  const docs = await db.collection<MongoDoc<T>>(name).find({}).toArray();
  return docs.map((doc) => stripMongoId<T>(doc as T & { _id: unknown }));
}

async function syncCollection<T extends object>(
  db: Db,
  name: string,
  rows: T[],
  getKey: (row: T) => string,
) {
  const collection = db.collection<{ _id: string } & Record<string, unknown>>(
    name,
  );
  const keys = rows.map(getKey);

  if (keys.length > 0) {
    await collection.deleteMany({ _id: { $nin: keys } });
  } else {
    await collection.deleteMany({});
  }

  if (rows.length === 0) {
    return;
  }

  await collection.bulkWrite(
    rows.map((row) => {
      const key = getKey(row);
      return {
        replaceOne: {
          filter: { _id: key },
          replacement: sanitizeMongoReplacement(name, {
            ...(row as Record<string, unknown>),
            _id: key,
          }),
          upsert: true,
        },
      };
    }),
  );
}

async function writeState(db: Db, state: MockDb) {
  await syncCollection<User>(db, "users", state.users, (row) => row.id);
  await syncCollection<CustomerProfile>(
    db,
    "customerProfiles",
    state.customerProfiles,
    (row) => row.userId,
  );
  await syncCollection<ProProfile>(
    db,
    "proProfiles",
    state.proProfiles,
    (row) => row.userId,
  );
  await syncCollection<ServiceCategory>(
    db,
    "categories",
    state.categories,
    (row) => row.id,
  );
  await syncCollection<DistrictAreaSeed>(
    db,
    "districts",
    state.districts,
    (row) => row.district,
  );
  await syncCollection<Address>(
    db,
    "addresses",
    state.addresses,
    (row) => row.id,
  );
  await syncCollection<Attachment>(
    db,
    "attachments",
    state.attachments,
    (row) => row.id,
  );
  await syncCollection<ServiceRequest>(
    db,
    "requests",
    state.requests,
    (row) => row.id,
  );
  await syncCollection<Quote>(db, "quotes", state.quotes, (row) => row.id);
  await syncCollection<Booking>(
    db,
    "bookings",
    state.bookings,
    (row) => row.id,
  );
  await syncCollection<BookingStatusEvent>(
    db,
    "bookingStatusEvents",
    state.bookingStatusEvents,
    (row) => row.id,
  );
  await syncCollection<NotificationItem>(
    db,
    "notifications",
    state.notifications,
    (row) => row.id,
  );
  await syncCollection<AdminNote>(
    db,
    "adminNotes",
    state.adminNotes,
    (row) => row.id,
  );
}

async function bootstrapIfNeeded(db: Db) {
  const alreadyBootstrapped = await getMeta(db, "bootstrapped");
  if (alreadyBootstrapped?.value === "1") {
    return;
  }

  if (!enableDatabaseSeeding) {
    return;
  }

  const initialState = createSeedDb();
  await writeState(db, initialState);

  const credentials = initialState.users.map((user) => ({
    _id: user.id,
    userId: user.id,
    passwordHash: hashPassword(
      user.role === "admin" ? env.BOOTSTRAP_ADMIN_PASSWORD : env.DEMO_PASSWORD,
    ),
    isDemo: true,
  }));

  if (credentials.length > 0) {
    await db.collection<AuthCredentialDoc>("authCredentials").bulkWrite(
      credentials.map((credential) => ({
        updateOne: {
          filter: { _id: credential._id },
          update: {
            $set: {
              userId: credential.userId,
              passwordHash: credential.passwordHash,
              isDemo: credential.isDemo,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  await setMeta(db, "bootstrapped", "1");
}

async function applyDataPatches(db: Db) {
  if (!enableDatabaseSeeding) {
    return;
  }

  const calendarPatch = await getMeta(db, "demo_calendar_seed_v1");

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

  if (calendarPatch?.value !== "1") {
    const requestExists = await db
      .collection<MongoDoc<ServiceRequest>>("requests")
      .findOne({ _id: seedRequest.id });
    const quoteExists = await db
      .collection<MongoDoc<Quote>>("quotes")
      .findOne({ _id: seedQuote.id });
    const bookingExists = await db
      .collection<MongoDoc<Booking>>("bookings")
      .findOne({ _id: seedBooking.id });

    if (requestExists && quoteExists && !bookingExists) {
      await Promise.all([
        db
          .collection<MongoDoc<ServiceRequest>>("requests")
          .updateOne(
            { _id: seedRequest.id },
            { $set: seedRequest },
            { upsert: true },
          ),
        db
          .collection<MongoDoc<Quote>>("quotes")
          .updateOne(
            { _id: seedQuote.id },
            { $set: seedQuote },
            { upsert: true },
          ),
        db
          .collection<MongoDoc<Booking>>("bookings")
          .updateOne(
            { _id: seedBooking.id },
            { $set: seedBooking },
            { upsert: true },
          ),
        db
          .collection<MongoDoc<BookingStatusEvent>>("bookingStatusEvents")
          .updateOne(
            { _id: seedEvent.id },
            { $set: seedEvent },
            { upsert: true },
          ),
      ]);
    }

    await setMeta(db, "demo_calendar_seed_v1", "1");
  }

  const durationPatch = await getMeta(db, "demo_duration_seed_v1");
  if (durationPatch?.value === "1") {
    return;
  }

  await Promise.all([
    db.collection<MongoDoc<Quote>>("quotes").updateOne(
      { _id: seedQuote.id },
      {
        $set: {
          estimatedDurationMinutes: seedQuote.estimatedDurationMinutes,
        },
      },
    ),
    db.collection<MongoDoc<Booking>>("bookings").updateOne(
      { _id: seedBooking.id },
      {
        $set: {
          estimatedDurationMinutes: seedBooking.estimatedDurationMinutes,
        },
      },
    ),
  ]);

  await setMeta(db, "demo_duration_seed_v1", "1");
}

async function loadMongoDbState() {
  const db = await getMongoDb();

  const [
    users,
    customerProfiles,
    proProfiles,
    categories,
    districts,
    addresses,
    attachments,
    requests,
    quotes,
    bookings,
    bookingStatusEvents,
    notifications,
    adminNotes,
  ] = await Promise.all([
    readCollection<User>(db, "users"),
    readCollection<CustomerProfile>(db, "customerProfiles"),
    readCollection<ProProfile>(db, "proProfiles"),
    readCollection<ServiceCategory>(db, "categories"),
    readCollection<DistrictAreaSeed>(db, "districts"),
    readCollection<Address>(db, "addresses"),
    readCollection<Attachment>(db, "attachments"),
    readCollection<ServiceRequest>(db, "requests"),
    readCollection<Quote>(db, "quotes"),
    readCollection<Booking>(db, "bookings"),
    readCollection<BookingStatusEvent>(db, "bookingStatusEvents"),
    readCollection<NotificationItem>(db, "notifications"),
    readCollection<AdminNote>(db, "adminNotes"),
  ]);

  return {
    users,
    customerProfiles,
    proProfiles,
    categories,
    districts,
    addresses,
    attachments,
    requests,
    quotes,
    bookings,
    bookingStatusEvents,
    notifications,
    adminNotes,
  } satisfies MockDb;
}

export async function readMongoDb() {
  if (mongoReadCacheMs > 0 && mongoReadCache) {
    if (mongoReadCache.expiresAt > Date.now()) {
      return cloneMockDbState(mongoReadCache.state);
    }
    clearMongoReadCache();
  }

  if (mongoReadCacheMs > 0 && mongoReadInflight) {
    return cloneMockDbState(await mongoReadInflight);
  }

  const loadPromise = loadMongoDbState();
  if (mongoReadCacheMs > 0) {
    mongoReadInflight = loadPromise;
  }

  try {
    const state = await loadPromise;

    if (mongoReadCacheMs > 0) {
      mongoReadCache = {
        expiresAt: Date.now() + mongoReadCacheMs,
        state: cloneMockDbState(state),
      };
    }

    return state;
  } finally {
    if (mongoReadInflight === loadPromise) {
      mongoReadInflight = null;
    }
  }
}

export async function writeMongoDb(dbState: MockDb) {
  const db = await getMongoDb();
  await writeState(db, dbState);
  clearMongoReadCache();
  clearMongoSessionUserCache();
}

export async function withMongoDb<T>(updater: (db: MockDb) => Promise<T> | T) {
  const dbState = await readMongoDb();
  const result = await updater(dbState);
  await writeMongoDb(dbState);
  return result;
}

export async function findMongoCredentialByIdentifier(identifier: string) {
  const db = await getMongoDb();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const phone = identifier.replace(/\D/g, "");
  const user = await db.collection<MongoDoc<User>>("users").findOne({
    $or: [{ email: normalizedIdentifier }, { phone }],
  });

  if (!user) {
    return null;
  }

  const credential = await db
    .collection<AuthCredentialDoc>("authCredentials")
    .findOne({ _id: user.id });

  if (!credential) {
    return null;
  }

  return {
    user: stripMongoId<User>(user),
    passwordHash: credential.passwordHash,
    isDemo: credential.isDemo,
  };
}

export async function findMongoUserById(userId: string) {
  const db = await getMongoDb();
  const row = await db
    .collection<MongoDoc<User>>("users")
    .findOne({ _id: userId });

  return row ? stripMongoId<User>(row) : null;
}

export async function listMongoCategoryOptions(locale: Locale) {
  const db = await getMongoDb();
  const categories = await db
    .collection<MongoDoc<ServiceCategory>>("categories")
    .find({ _id: { $ne: "cleaning" } })
    .toArray();

  return categories.map((categoryDoc) => {
    const category = stripMongoId<ServiceCategory>(categoryDoc);
    return {
      id: category.id,
      label: category.name[locale],
      subcategories: category.subcategories.map((subcategory) => ({
        id: subcategory.id,
        label: subcategory.name[locale],
      })),
    };
  });
}

const openMongoLeadStatuses: RequestStatus[] = [
  "submitted",
  "awaiting_quotes",
  "quoted",
];

export async function listMongoRelevantLeads(
  proId: string,
  categoryId?: string,
) {
  const db = await getMongoDb();
  const filter: Filter<MongoDoc<ServiceRequest>> = {
    matchedProIds: proId,
    status: { $in: openMongoLeadStatuses },
  };

  if (categoryId) {
    filter.categoryId = categoryId;
  }

  const requests = (
    await db
      .collection<MongoDoc<ServiceRequest>>("requests")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray()
  ).map(stripMongoId<ServiceRequest>);

  if (requests.length === 0) {
    return [];
  }

  const requestIds = requests.map((request) => request.id);
  const customerIds = [
    ...new Set(requests.map((request) => request.customerId)),
  ];
  const categoryIds = [
    ...new Set(requests.map((request) => request.categoryId)),
  ];

  const [quotes, users, categories] = await Promise.all([
    db
      .collection<MongoDoc<Quote>>("quotes")
      .find({ requestId: { $in: requestIds }, proId })
      .toArray(),
    db
      .collection<MongoDoc<User>>("users")
      .find({ _id: { $in: customerIds } })
      .toArray(),
    db
      .collection<MongoDoc<ServiceCategory>>("categories")
      .find({ _id: { $in: categoryIds } })
      .toArray(),
  ]);

  const quoteByRequestId = new Map(
    quotes.map((quoteDoc) => {
      const quote = stripMongoId<Quote>(quoteDoc);
      return [quote.requestId, quote] as const;
    }),
  );
  const usersById = mapById(users.map(stripMongoId<User>));
  const categoriesById = mapById(categories.map(stripMongoId<ServiceCategory>));

  return requests.map((request) => {
    const customer = usersById.get(request.customerId);
    if (!customer) {
      throw new Error("User not found");
    }

    return {
      ...request,
      existingQuote: quoteByRequestId.get(request.id),
      customer,
      category: categoriesById.get(request.categoryId) ?? null,
    };
  });
}

async function hydrateMongoBookings(db: Db, bookings: Booking[]) {
  if (bookings.length === 0) {
    return [];
  }

  const requestIds = [...new Set(bookings.map((booking) => booking.requestId))];
  const userIds = [
    ...new Set(
      bookings.flatMap((booking) => [booking.customerId, booking.proId]),
    ),
  ];
  const quoteIds = [...new Set(bookings.map((booking) => booking.quoteId))];
  const bookingIds = bookings.map((booking) => booking.id);

  const [requests, users, quotes, bookingStatusEvents] = await Promise.all([
    db
      .collection<MongoDoc<ServiceRequest>>("requests")
      .find({ _id: { $in: requestIds } })
      .toArray(),
    db
      .collection<MongoDoc<User>>("users")
      .find({ _id: { $in: userIds } })
      .toArray(),
    db
      .collection<MongoDoc<Quote>>("quotes")
      .find({ _id: { $in: quoteIds } })
      .toArray(),
    db
      .collection<MongoDoc<BookingStatusEvent>>("bookingStatusEvents")
      .find({ bookingId: { $in: bookingIds } })
      .toArray(),
  ]);

  const requestsById = mapById(requests.map(stripMongoId<ServiceRequest>));
  const usersById = mapById(users.map(stripMongoId<User>));
  const quotesById = mapById(quotes.map(stripMongoId<Quote>));
  const eventsByBookingId = groupBy(
    bookingStatusEvents.map(stripMongoId<BookingStatusEvent>),
    (event) => event.bookingId,
  );

  return bookings.map((booking) => ({
    ...booking,
    request: requestsById.get(booking.requestId) ?? null,
    customer: usersById.get(booking.customerId) ?? null,
    pro: usersById.get(booking.proId) ?? null,
    quote: quotesById.get(booking.quoteId) ?? null,
    timeline: eventsByBookingId.get(booking.id) ?? [],
  }));
}

export async function listMongoProJobs(proId: string) {
  const db = await getMongoDb();
  const bookings = (
    await db
      .collection<MongoDoc<Booking>>("bookings")
      .find({ proId })
      .sort({ updatedAt: -1 })
      .toArray()
  ).map(stripMongoId<Booking>);

  const hydratedBookings = await hydrateMongoBookings(db, bookings);
  return hydratedBookings.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function listMongoProCalendarBookings(proId: string) {
  const db = await getMongoDb();
  const bookings = (
    await db
      .collection<MongoDoc<Booking>>("bookings")
      .find({ proId, status: { $ne: "cancelled" } })
      .sort({ scheduledDate: 1, updatedAt: 1 })
      .toArray()
  ).map(stripMongoId<Booking>);

  const hydratedBookings = await hydrateMongoBookings(db, bookings);
  return hydratedBookings.sort((a, b) =>
    (a.scheduledDate ?? a.updatedAt).localeCompare(
      b.scheduledDate ?? b.updatedAt,
    ),
  );
}

export async function createMongoCredential(
  userId: string,
  password: string,
  isDemo: boolean = false,
) {
  const db = await getMongoDb();
  await db
    .collection<AuthCredentialDoc>("authCredentials")
    .updateOne(
      { _id: userId },
      { $set: { userId, passwordHash: hashPassword(password), isDemo } },
      { upsert: true },
    );
}

export async function verifyMongoUserCredentials(
  identifier: string,
  password: string,
) {
  const db = await getMongoDb();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const recentWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recentFailures = await db
    .collection<LoginAttemptDoc>("loginAttempts")
    .countDocuments({
      identifier: normalizedIdentifier,
      success: false,
      attemptedAt: { $gte: recentWindowStart },
    });

  if (recentFailures >= 5) {
    return {
      ok: false as const,
      error: "Too many login attempts. Please try again later.",
    };
  }

  const credential = await findMongoCredentialByIdentifier(identifier);
  if (!credential || !verifyPassword(password, credential.passwordHash)) {
    await db.collection<LoginAttemptDoc>("loginAttempts").insertOne({
      identifier: normalizedIdentifier,
      attemptedAt: new Date().toISOString(),
      success: false,
    });
    return { ok: false as const, error: "Invalid credentials." };
  }

  await Promise.all([
    db.collection<LoginAttemptDoc>("loginAttempts").insertOne({
      identifier: normalizedIdentifier,
      attemptedAt: new Date().toISOString(),
      success: true,
    }),
    db
      .collection<MongoDoc<User>>("users")
      .updateOne(
        { _id: credential.user.id },
        { $set: { lastLoginAt: new Date().toISOString() } },
      ),
  ]);

  return {
    ok: true as const,
    user: credential.user,
    isDemo: credential.isDemo,
  };
}

export async function createMongoSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string },
) {
  const db = await getMongoDb();
  const sessionId = createOpaqueToken();
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  await db.collection<SessionDoc>("sessions").insertOne({
    _id: sessionId,
    id: sessionId,
    userId,
    expiresAt,
    createdAt: new Date().toISOString(),
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  return { sessionId, expiresAt };
}

export async function getMongoSessionUser(sessionId: string) {
  if (mongoReadCacheMs > 0) {
    const cached = mongoSessionUserCache.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneUser(cached.user);
    }
    if (cached) {
      clearMongoSessionUserCache(sessionId);
    }
  }

  const db = await getMongoDb();
  const session = await db
    .collection<SessionDoc>("sessions")
    .findOne({ _id: sessionId });

  if (!session) {
    if (mongoReadCacheMs > 0) {
      mongoSessionUserCache.set(sessionId, {
        expiresAt: Date.now() + mongoReadCacheMs,
        user: null,
      });
    }
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await db.collection<SessionDoc>("sessions").deleteOne({ _id: sessionId });
    clearMongoSessionUserCache(sessionId);
    return null;
  }

  const user = await findMongoUserById(session.userId);
  if (mongoReadCacheMs > 0) {
    mongoSessionUserCache.set(sessionId, {
      expiresAt: Date.now() + mongoReadCacheMs,
      user: cloneUser(user),
    });
  }

  return user;
}

export async function invalidateMongoSession(sessionId: string) {
  const db = await getMongoDb();
  await db.collection<SessionDoc>("sessions").deleteOne({ _id: sessionId });
  clearMongoSessionUserCache(sessionId);
}

export async function listMongoCredentialedDemoUsers() {
  const db = await getMongoDb();
  const credentials = await db
    .collection<AuthCredentialDoc>("authCredentials")
    .find({ isDemo: true })
    .toArray();
  const ids = credentials.map((credential) => credential.userId);

  if (ids.length === 0) {
    return [];
  }

  const users = await db
    .collection<MongoDoc<User>>("users")
    .find({ _id: { $in: ids } })
    .toArray();

  return users
    .map(stripMongoId<User>)
    .sort(
      (a, b) =>
        a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName),
    );
}

export async function resetMongoDb() {
  if (!enableDatabaseSeeding) {
    throw new Error("Database reset is disabled when seeding is disabled.");
  }

  const db = await getMongoDb();
  const seed = createSeedDb();

  await Promise.all([
    db.collection<SessionDoc>("sessions").deleteMany({}),
    db.collection<LoginAttemptDoc>("loginAttempts").deleteMany({}),
    db.collection<AuthCredentialDoc>("authCredentials").deleteMany({}),
  ]);

  await writeState(db, seed);

  const credentials = seed.users.map((user) => ({
    _id: user.id,
    userId: user.id,
    passwordHash: hashPassword(
      user.role === "admin" ? env.BOOTSTRAP_ADMIN_PASSWORD : env.DEMO_PASSWORD,
    ),
    isDemo: true,
  }));

  if (credentials.length > 0) {
    await db.collection<AuthCredentialDoc>("authCredentials").bulkWrite(
      credentials.map((credential) => ({
        updateOne: {
          filter: { _id: credential._id },
          update: {
            $set: {
              userId: credential.userId,
              passwordHash: credential.passwordHash,
              isDemo: credential.isDemo,
            },
          },
          upsert: true,
        },
      })),
    );
  }

  await setMeta(db, "bootstrapped", "1");
  await setMeta(db, "demo_calendar_seed_v1", "1");
  clearMongoReadCache();
  clearMongoSessionUserCache();
}
