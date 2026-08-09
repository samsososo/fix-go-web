import { createHash } from "node:crypto";
import { Db, MongoClient } from "mongodb";

import {
  normalizeSecurityAnswer,
  type AccountRecoverySetup,
  type PasswordResetRequest,
  type SecurityQuestionId,
} from "@/lib/account-recovery";
import { enableDatabaseSeeding, env } from "@/lib/env";
import { createOpaqueToken } from "@/lib/security";
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

type SystemMetadataDoc = {
  _id: string;
  value: string;
};

type ProfileDoc = MongoDoc<User> & {
  status: "active" | "suspended" | "deleted";
  customer?: Omit<CustomerProfile, "userId">;
  provider?: Omit<ProProfile, "userId">;
};

type AdminProfileDoc = MongoDoc<User> & {
  status: "active" | "suspended" | "deleted";
  adminRole: "admin" | "superAdmin";
  permissions: string[];
};

type AuthCredentialDoc = {
  _id: string;
  userId: string;
  password: string;
  isDemo: boolean;
};

type AccountRecoveryDoc = {
  _id: string;
  userId: string;
  dateOfBirth: string;
  securityQuestionId: SecurityQuestionId;
  securityAnswer: string;
  updatedAt: string;
};

type UserSessionDoc = {
  _id: string;
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
};

type LegacySessionDoc = Omit<UserSessionDoc, "expiresAt" | "createdAt"> & {
  expiresAt: string | Date;
  createdAt: string | Date;
};

type SecurityAttemptType = "login" | "passwordReset" | "smsVerification";

type SecurityAttemptDoc = {
  attemptType: SecurityAttemptType;
  identifier?: string;
  phone?: string;
  ipHash?: string;
  attemptedAt: Date;
  expiresAt: Date;
  success?: boolean;
};

type LegacyLoginAttemptDoc = {
  identifier: string;
  attemptedAt: string | Date;
  success: boolean;
};

type LegacyPasswordResetAttemptDoc = {
  phone: string;
  attemptedAt: string | Date;
  success: boolean;
};

type LegacySmsVerificationAttemptDoc = {
  phone: string;
  ipHash?: string;
  attemptedAt: string | Date;
};

type ServiceCategoryConfigDoc = {
  _id: string;
  configType: "serviceCategory";
  key: string;
  category: ServiceCategory;
};

type ServiceAreaConfigDoc = {
  _id: string;
  configType: "serviceArea";
  key: string;
  serviceArea: DistrictAreaSeed;
};

type AppConfigDoc = ServiceCategoryConfigDoc | ServiceAreaConfigDoc;

type ServiceCaseDoc = MongoDoc<ServiceRequest> & {
  quotes: Quote[];
  job?: Booking;
  jobStatusHistory: BookingStatusEvent[];
  attachments: Attachment[];
};

export const mongoSchemaCollections = [
  "profile",
  "adminProfiles",
  "authCredentials",
  "accountRecovery",
  "userSessions",
  "securityAttempts",
  "appConfig",
  "serviceCases",
  "userNotifications",
  "adminNotes",
  "systemMetadata",
] as const;

const legacyCollectionNames = [
  "users",
  "customerProfiles",
  "proProfiles",
  "passwordRecovery",
  "passwordResetAttempts",
  "smsVerificationAttempts",
  "sessions",
  "loginAttempts",
  "categories",
  "districts",
  "addresses",
  "attachments",
  "requests",
  "quotes",
  "bookings",
  "bookingStatusEvents",
  "notifications",
  "meta",
] as const;

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
    throw new Error("MONGODB_URI is required.");
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
  if (
    env.NODE_ENV === "test" &&
    !env.MONGODB_DATABASE.startsWith("hotfix_test")
  ) {
    throw new Error(
      "Tests may only connect to a MongoDB database prefixed with hotfix_test.",
    );
  }

  const client = await getMongoClient();
  const db = client.db(env.MONGODB_DATABASE);

  if (!initialized) {
    await migrateLegacySchema(db);
    await initializeMongo(db);
    await bootstrapIfNeeded(db);
    await applyDataPatches(db);
    initialized = true;
  }

  return db;
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function addMilliseconds(value: string | Date, milliseconds: number) {
  return new Date(toDate(value).getTime() + milliseconds);
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
    ["profile", "adminProfiles"].includes(collectionName) &&
    (replacement.email === null || replacement.email === "")
  ) {
    delete replacement.email;
  }

  return replacement;
}

function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function collectionExists(db: Db, name: string) {
  return db.listCollections({ name }, { nameOnly: true }).hasNext();
}

async function readCollection<T extends object>(db: Db, name: string) {
  if (!(await collectionExists(db, name))) {
    return [];
  }

  const docs = await db.collection<MongoDoc<T>>(name).find({}).toArray();
  return docs.map((doc) => stripMongoId<T>(doc as T & { _id: unknown }));
}

async function readRawCollection<T extends object>(db: Db, name: string) {
  if (!(await collectionExists(db, name))) {
    return [];
  }

  return db.collection<T>(name).find({}).toArray();
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

function userFromProfileDoc(doc: ProfileDoc | AdminProfileDoc): User {
  const {
    _id: _discarded,
    status: _status,
    customer: _customer,
    provider: _provider,
    adminRole: _adminRole,
    permissions: _permissions,
    ...user
  } = doc as ProfileDoc & AdminProfileDoc;
  void _discarded;
  void _status;
  void _customer;
  void _provider;
  void _adminRole;
  void _permissions;
  return user;
}

function requestFromServiceCase(doc: ServiceCaseDoc): ServiceRequest {
  const {
    _id: _discarded,
    quotes: _quotes,
    job: _job,
    jobStatusHistory: _history,
    attachments: _attachments,
    ...request
  } = doc;
  void _discarded;
  void _quotes;
  void _job;
  void _history;
  void _attachments;
  return request;
}

function buildProfileDocs(state: MockDb) {
  const customersById = new Map(
    state.customerProfiles.map((profile) => [profile.userId, profile]),
  );
  const providersById = new Map(
    state.proProfiles.map((profile) => [profile.userId, profile]),
  );

  const profiles: ProfileDoc[] = state.users
    .filter((user) => user.role !== "admin")
    .map((user) => {
      const customerProfile = customersById.get(user.id);
      const providerProfile = providersById.get(user.id);
      const customer = customerProfile
        ? {
            savedAddresses: customerProfile.savedAddresses,
            preferredLanguage: customerProfile.preferredLanguage,
          }
        : undefined;
      const provider = providerProfile
        ? {
            displayName: providerProfile.displayName,
            yearsOfExperience: providerProfile.yearsOfExperience,
            serviceCategoryIds: providerProfile.serviceCategoryIds,
            serviceAreaDistricts: providerProfile.serviceAreaDistricts,
            languagesSpoken: providerProfile.languagesSpoken,
            introduction: providerProfile.introduction,
            emergencyAvailability: providerProfile.emergencyAvailability,
            verificationStatus: providerProfile.verificationStatus,
            verificationLevel: providerProfile.verificationLevel,
            documentPlaceholders: providerProfile.documentPlaceholders,
            completedJobs: providerProfile.completedJobs,
            avgResponseHours: providerProfile.avgResponseHours,
          }
        : undefined;

      return {
        ...user,
        _id: user.id,
        status: "active",
        customer,
        provider,
      };
    });

  const admins: AdminProfileDoc[] = state.users
    .filter((user) => user.role === "admin")
    .map((user) => ({
      ...user,
      _id: user.id,
      status: "active",
      adminRole: "superAdmin",
      permissions: ["*"],
    }));

  return { profiles, admins };
}

function buildAppConfigDocs(state: MockDb): AppConfigDoc[] {
  return [
    ...state.categories.map<ServiceCategoryConfigDoc>((category) => ({
      _id: `serviceCategory:${category.id}`,
      configType: "serviceCategory",
      key: category.id,
      category,
    })),
    ...state.districts.map<ServiceAreaConfigDoc>((serviceArea) => ({
      _id: `serviceArea:${serviceArea.district}`,
      configType: "serviceArea",
      key: serviceArea.district,
      serviceArea,
    })),
  ];
}

function buildServiceCaseDocs(state: MockDb): ServiceCaseDoc[] {
  return state.requests.map((request) => {
    const job = state.bookings.find(
      (booking) => booking.requestId === request.id,
    );

    return {
      ...request,
      _id: request.id,
      quotes: state.quotes.filter((quote) => quote.requestId === request.id),
      job,
      jobStatusHistory: job
        ? state.bookingStatusEvents.filter(
            (event) => event.bookingId === job.id,
          )
        : [],
      attachments: state.attachments.filter(
        (attachment) => attachment.requestId === request.id,
      ),
    };
  });
}

async function writeState(db: Db, state: MockDb) {
  const { profiles, admins } = buildProfileDocs(state);
  const appConfig = buildAppConfigDocs(state);
  const serviceCases = buildServiceCaseDocs(state);

  await Promise.all([
    syncCollection<ProfileDoc>(db, "profile", profiles, (row) => row.id),
    syncCollection<AdminProfileDoc>(
      db,
      "adminProfiles",
      admins,
      (row) => row.id,
    ),
    syncCollection<AppConfigDoc>(db, "appConfig", appConfig, (row) => row._id),
    syncCollection<ServiceCaseDoc>(
      db,
      "serviceCases",
      serviceCases,
      (row) => row.id,
    ),
    syncCollection<NotificationItem>(
      db,
      "userNotifications",
      state.notifications,
      (row) => row.id,
    ),
    syncCollection<AdminNote>(
      db,
      "adminNotes",
      state.adminNotes,
      (row) => row.id,
    ),
  ]);
}

async function loadMongoDbStateFromDb(db: Db) {
  const [profileDocs, adminProfileDocs, appConfigDocs, serviceCaseDocs] =
    await Promise.all([
      db.collection<ProfileDoc>("profile").find({}).toArray(),
      db.collection<AdminProfileDoc>("adminProfiles").find({}).toArray(),
      db.collection<AppConfigDoc>("appConfig").find({}).toArray(),
      db.collection<ServiceCaseDoc>("serviceCases").find({}).toArray(),
    ]);
  const [notifications, adminNotes] = await Promise.all([
    readCollection<NotificationItem>(db, "userNotifications"),
    readCollection<AdminNote>(db, "adminNotes"),
  ]);

  const users = [
    ...profileDocs.map(userFromProfileDoc),
    ...adminProfileDocs.map(userFromProfileDoc),
  ];
  const customerProfiles = profileDocs.flatMap<CustomerProfile>((doc) =>
    doc.role === "customer" && doc.customer
      ? [{ userId: doc.id, ...doc.customer }]
      : [],
  );
  const proProfiles = profileDocs.flatMap<ProProfile>((doc) =>
    doc.role === "pro" && doc.provider
      ? [{ userId: doc.id, ...doc.provider }]
      : [],
  );
  const categories = appConfigDocs.flatMap<ServiceCategory>((doc) =>
    doc.configType === "serviceCategory" ? [doc.category] : [],
  );
  const districts = appConfigDocs.flatMap<DistrictAreaSeed>((doc) =>
    doc.configType === "serviceArea" ? [doc.serviceArea] : [],
  );
  const requests = serviceCaseDocs.map(requestFromServiceCase);
  const quotes = serviceCaseDocs.flatMap((doc) => doc.quotes);
  const bookings = serviceCaseDocs.flatMap((doc) => (doc.job ? [doc.job] : []));
  const bookingStatusEvents = serviceCaseDocs.flatMap(
    (doc) => doc.jobStatusHistory,
  );
  const attachments = serviceCaseDocs.flatMap((doc) => doc.attachments);
  const addressById = new Map<string, Address>();
  requests.forEach((request) =>
    addressById.set(request.address.id, request.address),
  );

  return {
    users,
    customerProfiles,
    proProfiles,
    categories,
    districts,
    addresses: [...addressById.values()],
    attachments,
    requests,
    quotes,
    bookings,
    bookingStatusEvents,
    notifications,
    adminNotes,
  } satisfies MockDb;
}

async function migrateLegacySchema(db: Db) {
  const currentVersion = await db
    .collection<SystemMetadataDoc>("systemMetadata")
    .findOne({ _id: "schemaVersion" });
  if (currentVersion?.value === "2") {
    return;
  }

  const legacyUsers = await readCollection<User>(db, "users");
  if (legacyUsers.length === 0) {
    await setMetadata(db, "schemaVersion", "2");
    return;
  }

  const [
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

  const validUserIds = new Set(legacyUsers.map((user) => user.id));
  const legacyState: MockDb = {
    users: legacyUsers,
    customerProfiles: customerProfiles.filter((row) =>
      validUserIds.has(row.userId),
    ),
    proProfiles: proProfiles.filter((row) => validUserIds.has(row.userId)),
    categories,
    districts,
    addresses,
    attachments,
    requests: requests.filter((row) => validUserIds.has(row.customerId)),
    quotes,
    bookings,
    bookingStatusEvents,
    notifications: notifications.filter((row) => validUserIds.has(row.userId)),
    adminNotes,
  };

  await writeState(db, legacyState);

  const [
    legacyRecovery,
    legacySessions,
    loginAttempts,
    resetAttempts,
    smsAttempts,
  ] = await Promise.all([
    readRawCollection<AccountRecoveryDoc>(db, "passwordRecovery"),
    readRawCollection<LegacySessionDoc>(db, "sessions"),
    readRawCollection<LegacyLoginAttemptDoc>(db, "loginAttempts"),
    readRawCollection<LegacyPasswordResetAttemptDoc>(
      db,
      "passwordResetAttempts",
    ),
    readRawCollection<LegacySmsVerificationAttemptDoc>(
      db,
      "smsVerificationAttempts",
    ),
  ]);

  await syncCollection<AccountRecoveryDoc>(
    db,
    "accountRecovery",
    legacyRecovery.filter((row) => validUserIds.has(row.userId)),
    (row) => row.userId,
  );
  await syncCollection<UserSessionDoc>(
    db,
    "userSessions",
    legacySessions
      .filter((row) => validUserIds.has(row.userId))
      .map((row) => ({
        ...row,
        expiresAt: toDate(row.expiresAt),
        createdAt: toDate(row.createdAt),
      })),
    (row) => row.id,
  );

  const securityAttempts: SecurityAttemptDoc[] = [
    ...loginAttempts.map((row) => ({
      attemptType: "login" as const,
      identifier: row.identifier,
      attemptedAt: toDate(row.attemptedAt),
      expiresAt: addMilliseconds(row.attemptedAt, 30 * 24 * 60 * 60 * 1000),
      success: row.success,
    })),
    ...resetAttempts.map((row) => ({
      attemptType: "passwordReset" as const,
      phone: row.phone,
      attemptedAt: toDate(row.attemptedAt),
      expiresAt: addMilliseconds(row.attemptedAt, 30 * 24 * 60 * 60 * 1000),
      success: row.success,
    })),
    ...smsAttempts.map((row) => ({
      attemptType: "smsVerification" as const,
      phone: row.phone,
      ipHash: row.ipHash,
      attemptedAt: toDate(row.attemptedAt),
      expiresAt: addMilliseconds(row.attemptedAt, 24 * 60 * 60 * 1000),
    })),
  ];
  const securityCollection =
    db.collection<SecurityAttemptDoc>("securityAttempts");
  await securityCollection.deleteMany({});
  if (securityAttempts.length > 0) {
    await securityCollection.insertMany(securityAttempts);
  }

  const legacyMetadata = await readRawCollection<SystemMetadataDoc>(db, "meta");
  if (legacyMetadata.length > 0) {
    await db.collection<SystemMetadataDoc>("systemMetadata").bulkWrite(
      legacyMetadata.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { value: row.value } },
          upsert: true,
        },
      })),
    );
  }

  await setMetadata(db, "schemaVersion", "2");
  await setMetadata(db, "legacyMigrationCompletedAt", new Date().toISOString());
}

async function initializeMongo(db: Db) {
  await Promise.all([
    db
      .collection<ProfileDoc>("profile")
      .createIndex({ email: 1 }, { unique: true, sparse: true }),
    db
      .collection<ProfileDoc>("profile")
      .createIndex({ phone: 1 }, { unique: true }),
    db.collection<ProfileDoc>("profile").createIndex({ role: 1, status: 1 }),
    db
      .collection<AdminProfileDoc>("adminProfiles")
      .createIndex({ email: 1 }, { unique: true, sparse: true }),
    db
      .collection<AdminProfileDoc>("adminProfiles")
      .createIndex({ phone: 1 }, { unique: true }),
    db
      .collection<AuthCredentialDoc>("authCredentials")
      .createIndex({ userId: 1 }, { unique: true }),
    db
      .collection<AccountRecoveryDoc>("accountRecovery")
      .createIndex({ userId: 1 }, { unique: true }),
    db
      .collection<UserSessionDoc>("userSessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<SecurityAttemptDoc>("securityAttempts").createIndex({
      attemptType: 1,
      identifier: 1,
      attemptedAt: -1,
    }),
    db.collection<SecurityAttemptDoc>("securityAttempts").createIndex({
      attemptType: 1,
      phone: 1,
      attemptedAt: -1,
    }),
    db.collection<SecurityAttemptDoc>("securityAttempts").createIndex({
      attemptType: 1,
      ipHash: 1,
      attemptedAt: -1,
    }),
    db
      .collection<SecurityAttemptDoc>("securityAttempts")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection<AppConfigDoc>("appConfig")
      .createIndex({ configType: 1, key: 1 }, { unique: true }),
    db.collection<ServiceCaseDoc>("serviceCases").createIndex({
      customerId: 1,
      status: 1,
      updatedAt: -1,
    }),
    db.collection<ServiceCaseDoc>("serviceCases").createIndex({
      matchedProIds: 1,
      status: 1,
      categoryId: 1,
      createdAt: -1,
    }),
    db.collection<ServiceCaseDoc>("serviceCases").createIndex({
      "quotes.proId": 1,
      "quotes.status": 1,
    }),
    db.collection<ServiceCaseDoc>("serviceCases").createIndex({
      "job.proId": 1,
      "job.status": 1,
      "job.updatedAt": -1,
    }),
    db
      .collection<MongoDoc<NotificationItem>>("userNotifications")
      .createIndex({ userId: 1, read: 1, createdAt: -1 }),
    db
      .collection<MongoDoc<AdminNote>>("adminNotes")
      .createIndex({ entityType: 1, entityId: 1, createdAt: -1 }),
  ]);
}

async function getMetadata(db: Db, key: string) {
  return db
    .collection<SystemMetadataDoc>("systemMetadata")
    .findOne({ _id: key });
}

async function setMetadata(db: Db, key: string, value: string) {
  await db
    .collection<SystemMetadataDoc>("systemMetadata")
    .updateOne({ _id: key }, { $set: { value } }, { upsert: true });
}

async function bootstrapIfNeeded(db: Db) {
  const alreadyBootstrapped = await getMetadata(db, "bootstrapped");
  if (alreadyBootstrapped?.value === "1" || !enableDatabaseSeeding) {
    return;
  }

  const initialState = createSeedDb();
  await writeState(db, initialState);

  const credentials = initialState.users.map((user) => ({
    _id: user.id,
    userId: user.id,
    password:
      user.role === "admin" ? env.BOOTSTRAP_ADMIN_PASSWORD : env.DEMO_PASSWORD,
    isDemo: true,
  }));
  if (credentials.length > 0) {
    await db.collection<AuthCredentialDoc>("authCredentials").bulkWrite(
      credentials.map((credential) => ({
        updateOne: {
          filter: { _id: credential._id },
          update: { $set: credential },
          upsert: true,
        },
      })),
    );
  }

  await setMetadata(db, "bootstrapped", "1");
}

async function applyDataPatches(db: Db) {
  if (!enableDatabaseSeeding) {
    return;
  }

  const seed = createSeedDb();
  const state = await loadMongoDbStateFromDb(db);
  let changed = false;

  if (!(await getMetadata(db, "demo_calendar_seed_v1"))) {
    const seedRequest = seed.requests.find((row) => row.id === "req_1");
    const seedQuote = seed.quotes.find((row) => row.id === "quote_1");
    const seedBooking = seed.bookings.find(
      (row) => row.id === "booking_seed_amy_aircon",
    );
    const seedEvent = seed.bookingStatusEvents.find(
      (row) => row.id === "book_event_seed_amy_aircon_accepted",
    );
    if (
      seedRequest &&
      seedQuote &&
      seedBooking &&
      seedEvent &&
      state.requests.some((row) => row.id === seedRequest.id) &&
      state.quotes.some((row) => row.id === seedQuote.id) &&
      !state.bookings.some((row) => row.id === seedBooking.id)
    ) {
      state.bookings.push(seedBooking);
      state.bookingStatusEvents.push(seedEvent);
      changed = true;
    }
    await setMetadata(db, "demo_calendar_seed_v1", "1");
  }

  if (!(await getMetadata(db, "demo_duration_seed_v1"))) {
    const seededQuote = seed.quotes.find((row) => row.id === "quote_1");
    const seededBooking = seed.bookings.find(
      (row) => row.id === "booking_seed_amy_aircon",
    );
    const quote = state.quotes.find((row) => row.id === "quote_1");
    const booking = state.bookings.find(
      (row) => row.id === "booking_seed_amy_aircon",
    );
    if (seededQuote && quote) {
      quote.estimatedDurationMinutes = seededQuote.estimatedDurationMinutes;
      changed = true;
    }
    if (seededBooking && booking) {
      booking.estimatedDurationMinutes = seededBooking.estimatedDurationMinutes;
      changed = true;
    }
    await setMetadata(db, "demo_duration_seed_v1", "1");
  }

  if (changed) {
    await writeState(db, state);
  }
}

async function loadMongoDbState() {
  return loadMongoDbStateFromDb(await getMongoDb());
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

async function findProfileByIdentifier(db: Db, identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const phone = identifier.replace(/\D/g, "");
  const query = { $or: [{ email: normalizedIdentifier }, { phone }] };
  const profile = await db.collection<ProfileDoc>("profile").findOne(query);
  if (profile) {
    return userFromProfileDoc(profile);
  }
  const admin = await db
    .collection<AdminProfileDoc>("adminProfiles")
    .findOne(query);
  return admin ? userFromProfileDoc(admin) : null;
}

async function findProfileById(db: Db, userId: string) {
  const profile = await db
    .collection<ProfileDoc>("profile")
    .findOne({ _id: userId });
  if (profile) {
    return userFromProfileDoc(profile);
  }
  const admin = await db
    .collection<AdminProfileDoc>("adminProfiles")
    .findOne({ _id: userId });
  return admin ? userFromProfileDoc(admin) : null;
}

async function findProfilesByIds(db: Db, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const [profiles, admins] = await Promise.all([
    db
      .collection<ProfileDoc>("profile")
      .find({ _id: { $in: ids } })
      .toArray(),
    db
      .collection<AdminProfileDoc>("adminProfiles")
      .find({ _id: { $in: ids } })
      .toArray(),
  ]);
  return [
    ...profiles.map(userFromProfileDoc),
    ...admins.map(userFromProfileDoc),
  ];
}

export async function findMongoCredentialByIdentifier(identifier: string) {
  const db = await getMongoDb();
  const user = await findProfileByIdentifier(db, identifier);
  if (!user) {
    return null;
  }
  const credential = await db
    .collection<AuthCredentialDoc>("authCredentials")
    .findOne({ _id: user.id });
  if (!credential) {
    return null;
  }
  return { user, password: credential.password, isDemo: credential.isDemo };
}

export async function findMongoPasswordRecoveryByUserId(userId: string) {
  const db = await getMongoDb();
  const recovery = await db
    .collection<AccountRecoveryDoc>("accountRecovery")
    .findOne({ _id: userId });
  return recovery
    ? {
        userId: recovery.userId,
        dateOfBirth: recovery.dateOfBirth,
        securityQuestionId: recovery.securityQuestionId,
        securityAnswer: recovery.securityAnswer,
        updatedAt: recovery.updatedAt,
      }
    : null;
}

export async function findMongoUserById(userId: string) {
  return findProfileById(await getMongoDb(), userId);
}

export async function listMongoCategoryOptions(locale: Locale) {
  const db = await getMongoDb();
  const rows = await db
    .collection<ServiceCategoryConfigDoc>("appConfig")
    .find({ configType: "serviceCategory", key: { $ne: "cleaning" } })
    .toArray();
  return rows.map(({ category }) => ({
    id: category.id,
    label: category.name[locale],
    subcategories: category.subcategories.map((subcategory) => ({
      id: subcategory.id,
      label: subcategory.name[locale],
    })),
  }));
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
  const filter: Record<string, unknown> = {
    matchedProIds: proId,
    status: { $in: openMongoLeadStatuses },
  };
  if (categoryId) {
    filter.categoryId = categoryId;
  }
  const cases = await db
    .collection<ServiceCaseDoc>("serviceCases")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  if (cases.length === 0) {
    return [];
  }

  const customerIds = [...new Set(cases.map((row) => row.customerId))];
  const categoryIds = [...new Set(cases.map((row) => row.categoryId))];
  const [users, categoryDocs] = await Promise.all([
    findProfilesByIds(db, customerIds),
    db
      .collection<ServiceCategoryConfigDoc>("appConfig")
      .find({
        configType: "serviceCategory",
        key: { $in: categoryIds },
      })
      .toArray(),
  ]);
  const usersById = mapById(users);
  const categoriesById = mapById(categoryDocs.map((row) => row.category));

  return cases.map((serviceCase) => {
    const request = requestFromServiceCase(serviceCase);
    const customer = usersById.get(request.customerId);
    if (!customer) {
      throw new Error("User not found");
    }
    return {
      ...request,
      existingQuote: serviceCase.quotes.find((quote) => quote.proId === proId),
      customer,
      category: categoriesById.get(request.categoryId) ?? null,
    };
  });
}

async function hydrateMongoJobCases(db: Db, cases: ServiceCaseDoc[]) {
  const jobs = cases.flatMap((row) => (row.job ? [row.job] : []));
  const userIds = [
    ...new Set(jobs.flatMap((job) => [job.customerId, job.proId])),
  ];
  const usersById = mapById(await findProfilesByIds(db, userIds));
  const casesByJobId = new Map(
    cases.flatMap((row) => (row.job ? [[row.job.id, row] as const] : [])),
  );

  return jobs.map((job) => {
    const serviceCase = casesByJobId.get(job.id);
    if (!serviceCase) {
      throw new Error("Service case not found");
    }
    return {
      ...job,
      request: requestFromServiceCase(serviceCase),
      customer: usersById.get(job.customerId) ?? null,
      pro: usersById.get(job.proId) ?? null,
      quote:
        serviceCase.quotes.find((quote) => quote.id === job.quoteId) ?? null,
      timeline: serviceCase.jobStatusHistory,
    };
  });
}

export async function listMongoProJobs(proId: string) {
  const db = await getMongoDb();
  const cases = await db
    .collection<ServiceCaseDoc>("serviceCases")
    .find({ "job.proId": proId })
    .sort({ "job.updatedAt": -1 })
    .toArray();
  return (await hydrateMongoJobCases(db, cases)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function listMongoProCalendarBookings(proId: string) {
  const db = await getMongoDb();
  const cases = await db
    .collection<ServiceCaseDoc>("serviceCases")
    .find({ "job.proId": proId, "job.status": { $ne: "cancelled" } })
    .sort({ "job.scheduledDate": 1, "job.updatedAt": 1 })
    .toArray();
  return (await hydrateMongoJobCases(db, cases)).sort((a, b) =>
    (a.scheduledDate ?? a.updatedAt).localeCompare(
      b.scheduledDate ?? b.updatedAt,
    ),
  );
}

export async function createMongoCredential(
  userId: string,
  password: string,
  isDemo: boolean = false,
  recovery?: AccountRecoverySetup,
) {
  const db = await getMongoDb();
  await db
    .collection<AuthCredentialDoc>("authCredentials")
    .updateOne(
      { _id: userId },
      { $set: { userId, password, isDemo } },
      { upsert: true },
    );
  if (recovery) {
    await db.collection<AccountRecoveryDoc>("accountRecovery").updateOne(
      { _id: userId },
      {
        $set: {
          userId,
          dateOfBirth: recovery.dateOfBirth,
          securityQuestionId: recovery.securityQuestionId,
          securityAnswer: recovery.securityAnswer,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }
}

export async function resetMongoPasswordWithRecovery(
  input: PasswordResetRequest,
) {
  const db = await getMongoDb();
  const phone = input.phone.replace(/\D/g, "");
  const resetWindowStart = new Date(Date.now() - 15 * 60 * 1000);
  const attempts = db.collection<SecurityAttemptDoc>("securityAttempts");
  const recentFailures = await attempts.countDocuments({
    attemptType: "passwordReset",
    phone,
    success: false,
    attemptedAt: { $gte: resetWindowStart },
  });
  if (recentFailures >= 5) {
    return { ok: false as const, reason: "rate_limited" as const };
  }

  const user = await findProfileByIdentifier(db, phone);
  const [credential, recovery] = user
    ? await Promise.all([
        db
          .collection<AuthCredentialDoc>("authCredentials")
          .findOne({ _id: user.id }),
        db
          .collection<AccountRecoveryDoc>("accountRecovery")
          .findOne({ _id: user.id }),
      ])
    : [null, null];
  const matches = Boolean(
    user &&
    credential &&
    recovery &&
    recovery.dateOfBirth === input.dateOfBirth &&
    recovery.securityQuestionId === input.securityQuestionId &&
    normalizeSecurityAnswer(recovery.securityAnswer) ===
      normalizeSecurityAnswer(input.securityAnswer),
  );
  const now = new Date();
  const attemptBase = {
    attemptType: "passwordReset" as const,
    phone,
    attemptedAt: now,
    expiresAt: addMilliseconds(now, 30 * 24 * 60 * 60 * 1000),
  };

  if (!user || !credential || !recovery || !matches) {
    await attempts.insertOne({ ...attemptBase, success: false });
    return { ok: false as const, reason: "mismatch" as const };
  }

  await Promise.all([
    db
      .collection<AuthCredentialDoc>("authCredentials")
      .updateOne({ _id: user.id }, { $set: { password: input.newPassword } }),
    db
      .collection<UserSessionDoc>("userSessions")
      .deleteMany({ userId: user.id }),
    attempts.deleteMany({ attemptType: "passwordReset", phone }),
  ]);
  await attempts.insertOne({ ...attemptBase, success: true });
  clearMongoSessionUserCache();
  return { ok: true as const };
}

export async function reserveMongoSmsVerificationAttempt(input: {
  phone: string;
  ipAddress?: string;
}) {
  const db = await getMongoDb();
  const collection = db.collection<SecurityAttemptDoc>("securityAttempts");
  const phone = input.phone.replace(/\D/g, "");
  const ipHash = input.ipAddress
    ? createHash("sha256").update(input.ipAddress).digest("hex")
    : undefined;
  const now = new Date();
  const lastAttempt = await collection
    .find({ attemptType: "smsVerification", phone })
    .sort({ attemptedAt: -1 })
    .limit(1)
    .next();
  if (lastAttempt) {
    const elapsedMs = now.getTime() - lastAttempt.attemptedAt.getTime();
    const cooldownMs = 60 * 1000;
    if (elapsedMs < cooldownMs) {
      return {
        ok: false as const,
        reason: "cooldown" as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((cooldownMs - elapsedMs) / 1000),
        ),
      };
    }
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [phoneAttempts, ipAttempts] = await Promise.all([
    collection.countDocuments({
      attemptType: "smsVerification",
      phone,
      attemptedAt: { $gte: hourAgo },
    }),
    ipHash
      ? collection.countDocuments({
          attemptType: "smsVerification",
          ipHash,
          attemptedAt: { $gte: hourAgo },
        })
      : Promise.resolve(0),
  ]);
  if (phoneAttempts >= 5 || ipAttempts >= 20) {
    return {
      ok: false as const,
      reason: "rate_limited" as const,
      retryAfterSeconds: 60 * 60,
    };
  }

  await collection.insertOne({
    attemptType: "smsVerification",
    phone,
    ipHash,
    attemptedAt: now,
    expiresAt: addMilliseconds(now, 24 * 60 * 60 * 1000),
  });
  return { ok: true as const, retryAfterSeconds: 60 };
}

export async function verifyMongoUserCredentials(
  identifier: string,
  password: string,
) {
  const db = await getMongoDb();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const attempts = db.collection<SecurityAttemptDoc>("securityAttempts");
  const recentFailures = await attempts.countDocuments({
    attemptType: "login",
    identifier: normalizedIdentifier,
    success: false,
    attemptedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
  });
  if (recentFailures >= 5) {
    return {
      ok: false as const,
      error: "Too many login attempts. Please try again later.",
    };
  }

  const credential = await findMongoCredentialByIdentifier(identifier);
  const now = new Date();
  const attempt = {
    attemptType: "login" as const,
    identifier: normalizedIdentifier,
    attemptedAt: now,
    expiresAt: addMilliseconds(now, 30 * 24 * 60 * 60 * 1000),
  };
  if (!credential || password !== credential.password) {
    await attempts.insertOne({ ...attempt, success: false });
    return { ok: false as const, error: "Invalid credentials." };
  }

  await Promise.all([
    attempts.insertOne({ ...attempt, success: true }),
    credential.user.role === "admin"
      ? db
          .collection<AdminProfileDoc>("adminProfiles")
          .updateOne(
            { _id: credential.user.id },
            { $set: { lastLoginAt: now.toISOString() } },
          )
      : db
          .collection<ProfileDoc>("profile")
          .updateOne(
            { _id: credential.user.id },
            { $set: { lastLoginAt: now.toISOString() } },
          ),
  ]);
  return {
    ok: true as const,
    user: { ...credential.user, lastLoginAt: now.toISOString() },
    isDemo: credential.isDemo,
  };
}

export async function createMongoSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string },
) {
  const db = await getMongoDb();
  const sessionId = createOpaqueToken();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.getTime() + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  );
  await db.collection<UserSessionDoc>("userSessions").insertOne({
    _id: sessionId,
    id: sessionId,
    userId,
    expiresAt,
    createdAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });
  return { sessionId, expiresAt: expiresAt.toISOString() };
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
    .collection<UserSessionDoc>("userSessions")
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
  if (session.expiresAt.getTime() <= Date.now()) {
    await db
      .collection<UserSessionDoc>("userSessions")
      .deleteOne({ _id: sessionId });
    clearMongoSessionUserCache(sessionId);
    return null;
  }

  const user = await findProfileById(db, session.userId);
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
  await db
    .collection<UserSessionDoc>("userSessions")
    .deleteOne({ _id: sessionId });
  clearMongoSessionUserCache(sessionId);
}

export async function listMongoCredentialedDemoUsers() {
  const db = await getMongoDb();
  const credentials = await db
    .collection<AuthCredentialDoc>("authCredentials")
    .find({ isDemo: true })
    .toArray();
  const users = await findProfilesByIds(
    db,
    credentials.map((credential) => credential.userId),
  );
  return users.sort(
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
    db.collection<UserSessionDoc>("userSessions").deleteMany({}),
    db.collection<SecurityAttemptDoc>("securityAttempts").deleteMany({}),
    db.collection<AccountRecoveryDoc>("accountRecovery").deleteMany({}),
    db.collection<AuthCredentialDoc>("authCredentials").deleteMany({}),
  ]);
  await writeState(db, seed);

  const credentials = seed.users.map((user) => ({
    _id: user.id,
    userId: user.id,
    password:
      user.role === "admin" ? env.BOOTSTRAP_ADMIN_PASSWORD : env.DEMO_PASSWORD,
    isDemo: true,
  }));
  if (credentials.length > 0) {
    await db.collection<AuthCredentialDoc>("authCredentials").bulkWrite(
      credentials.map((credential) => ({
        updateOne: {
          filter: { _id: credential._id },
          update: { $set: credential },
          upsert: true,
        },
      })),
    );
  }
  await setMetadata(db, "bootstrapped", "1");
  await setMetadata(db, "demo_calendar_seed_v1", "1");
  await setMetadata(db, "demo_duration_seed_v1", "1");
  clearMongoReadCache();
  clearMongoSessionUserCache();
}

export async function inspectMongoSchema() {
  const db = await getMongoDb();
  const rows = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = rows.map((row) => row.name).sort();
  const counts = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        await db.collection(name).countDocuments(),
      ]),
    ),
  );
  return { names, counts };
}

export async function initializeMongoProductionDb() {
  if (env.NODE_ENV !== "production") {
    throw new Error(
      "Production database initialization requires NODE_ENV=production.",
    );
  }
  if (enableDatabaseSeeding) {
    throw new Error(
      "Production database initialization requires seeding to be disabled.",
    );
  }
  if (!/(^|[_-])prod(?:uction)?($|[_-])/i.test(env.MONGODB_DATABASE)) {
    throw new Error(
      "Production database initialization requires a database name containing prod or production.",
    );
  }

  const db = await getMongoDb();
  const demoCredentialCount = await db
    .collection<AuthCredentialDoc>("authCredentials")
    .countDocuments({ isDemo: true });
  if (demoCredentialCount > 0) {
    throw new Error(
      "Production database initialization stopped because demo credentials were found.",
    );
  }

  const configDocs = buildAppConfigDocs(createSeedDb());
  if (configDocs.length > 0) {
    await db.collection<AppConfigDoc>("appConfig").bulkWrite(
      configDocs.map((config) => ({
        updateOne: {
          filter: { _id: config._id },
          update: { $setOnInsert: config },
          upsert: true,
        },
      })),
    );
  }

  await setMetadata(db, "bootstrapped", "1");
  await db
    .collection<SystemMetadataDoc>("systemMetadata")
    .updateOne(
      { _id: "productionInitializedAt" },
      { $setOnInsert: { value: new Date().toISOString() } },
      { upsert: true },
    );

  const schema = await inspectMongoSchema();
  return {
    database: env.MONGODB_DATABASE,
    collections: schema.names,
    counts: schema.counts,
    configDocuments: await db
      .collection<AppConfigDoc>("appConfig")
      .countDocuments(),
    demoCredentials: demoCredentialCount,
  };
}

export async function finalizeMongoSchemaMigration() {
  const db = await getMongoDb();
  const version = await getMetadata(db, "schemaVersion");
  if (version?.value !== "2") {
    throw new Error("Schema migration has not completed.");
  }
  const state = await loadMongoDbStateFromDb(db);
  if (state.users.length === 0 || state.categories.length === 0) {
    throw new Error(
      "New schema validation failed; legacy collections were kept.",
    );
  }

  const validUserIds = new Set(state.users.map((user) => user.id));
  await db
    .collection<AuthCredentialDoc>("authCredentials")
    .deleteMany({ userId: { $nin: [...validUserIds] } });

  const dropped: string[] = [];
  for (const name of legacyCollectionNames) {
    if (await collectionExists(db, name)) {
      await db.collection(name).drop();
      dropped.push(name);
    }
  }
  await setMetadata(db, "legacyCollectionsDroppedAt", new Date().toISOString());
  clearMongoReadCache();
  clearMongoSessionUserCache();
  return { dropped };
}

export async function closeMongoConnection() {
  const pendingClient = clientPromise;
  clientPromise = null;
  initialized = false;
  clearMongoReadCache();
  clearMongoSessionUserCache();
  if (pendingClient) {
    const client = await pendingClient;
    await client.close();
  }
}
