import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Db, MongoClient } from "mongodb";

import {
  normalizeSecurityAnswer,
  type AccountRecoverySetup,
  type PasswordResetRequest,
  type SecurityQuestionId,
} from "@/lib/account-recovery";
import { enableDatabaseSeeding, env, smsVerificationForceOff } from "@/lib/env";
import { createHongKongServiceAreas } from "@/lib/hk-service-areas";
import { createOpaqueToken } from "@/lib/security";
import {
  defaultSmsVerificationConfig,
  resolveSmsVerificationConfig,
  SMS_VERIFICATION_CONFIG_ID,
  type SmsVerificationConfig,
  type SmsVerificationConfigState,
} from "@/lib/sms-verification-config";
import {
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_CURRENCY,
  PRO_SUBSCRIPTION_INTERVAL,
  PRO_SUBSCRIPTION_PLAN_CODE,
  addThreeHongKongCalendarMonths,
  calculateGracePeriodEndsAt,
  type ProSubscription,
  type SubscriptionAccessStatus,
  type StripeSubscriptionStatus,
} from "@/lib/subscription-policy";
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

type MutationLockDoc = {
  _id: string;
  leaseId: string;
  leaseExpiresAt: Date;
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

type SmsVerificationChallengeDoc = {
  _id: string;
  userId: string;
  purpose?: "account" | "signup";
  phone: string;
  codeHash: string;
  codeSalt: string;
  attempts: number;
  sendCount: number;
  sendWindowStartedAt: Date;
  lastSentAt: Date;
  resendAvailableAt: Date;
  codeExpiresAt: Date;
  verifiedAt?: Date;
  verifiedExpiresAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
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

type SmsVerificationConfigDoc = SmsVerificationConfig & {
  _id: typeof SMS_VERIFICATION_CONFIG_ID;
  configType: "feature";
  key: "smsVerification";
  updatedAt: string;
  updatedBy: string;
};

type AppConfigDoc =
  | ServiceCategoryConfigDoc
  | ServiceAreaConfigDoc
  | SmsVerificationConfigDoc;

type ServiceCaseDoc = MongoDoc<ServiceRequest> & {
  quotes: Quote[];
  job?: Booking;
  jobStatusHistory: BookingStatusEvent[];
  attachments: Attachment[];
};

type ProSubscriptionDoc = MongoDoc<ProSubscription>;

type StripeWebhookEventStatus = "processing" | "processed" | "failed";

type StripeWebhookEventDoc = {
  _id: string;
  eventType: string;
  objectId?: string;
  status: StripeWebhookEventStatus;
  attempts: number;
  leaseId?: string;
  leaseExpiresAt?: Date;
  receivedAt: Date;
  processedAt?: Date;
  lastErrorCode?: string;
};

export const mongoSchemaCollections = [
  "profile",
  "adminProfiles",
  "authCredentials",
  "accountRecovery",
  "userSessions",
  "securityAttempts",
  "smsVerificationChallenges",
  "appConfig",
  "serviceCases",
  "userNotifications",
  "adminNotes",
  "systemMetadata",
  "proSubscriptions",
  "stripeWebhookEvents",
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

const MUTATION_LOCK_ID = "lock:marketplace-subscription-write";
const MUTATION_LOCK_LEASE_MS = 30_000;
const MUTATION_LOCK_WAIT_MS = 25;
const MUTATION_LOCK_MAX_WAIT_MS = 10_000;

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
    await ensureSmsVerificationConfig(db);
    await bootstrapIfNeeded(db);
    await syncHongKongServiceAreas(db);
    await applyDataPatches(db);
    await migrateSubscriptionSchema(db);
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

async function syncMarketplaceAppConfig(
  db: Db,
  rows: Array<ServiceCategoryConfigDoc | ServiceAreaConfigDoc>,
) {
  const collection = db.collection<AppConfigDoc>("appConfig");
  const keys = rows.map((row) => row._id);

  await collection.deleteMany({
    configType: { $in: ["serviceCategory", "serviceArea"] },
    _id: { $nin: keys },
  });

  if (rows.length > 0) {
    await collection.bulkWrite(
      rows.map((row) => ({
        replaceOne: {
          filter: { _id: row._id },
          replacement: row,
          upsert: true,
        },
      })),
    );
  }
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

function buildAppConfigDocs(
  state: MockDb,
): Array<ServiceCategoryConfigDoc | ServiceAreaConfigDoc> {
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

function buildDefaultSmsVerificationConfigDoc(
  updatedAt = new Date().toISOString(),
): SmsVerificationConfigDoc {
  return {
    _id: SMS_VERIFICATION_CONFIG_ID,
    configType: "feature",
    key: "smsVerification",
    ...defaultSmsVerificationConfig,
    updatedAt,
    updatedBy: "system",
  };
}

async function ensureSmsVerificationConfig(db: Db) {
  await db
    .collection<AppConfigDoc>("appConfig")
    .updateOne(
      { _id: SMS_VERIFICATION_CONFIG_ID },
      { $setOnInsert: buildDefaultSmsVerificationConfigDoc() },
      { upsert: true },
    );
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

function buildInitialProSubscription(
  proId: string,
  createdAt = new Date().toISOString(),
): ProSubscriptionDoc {
  return {
    _id: proId,
    proId,
    planCode: PRO_SUBSCRIPTION_PLAN_CODE,
    amountMinor: PRO_SUBSCRIPTION_AMOUNT_MINOR,
    currency: PRO_SUBSCRIPTION_CURRENCY,
    interval: PRO_SUBSCRIPTION_INTERVAL,
    accessStatus: "setup_required",
    cancelAtPeriodEnd: false,
    createdAt,
    updatedAt: createdAt,
  };
}

async function backfillProSubscriptions(db: Db) {
  const pros = await db
    .collection<ProfileDoc>("profile")
    .find({ role: "pro", status: { $ne: "deleted" } })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  if (pros.length === 0) {
    return;
  }

  const createdAt = new Date().toISOString();
  await db.collection<ProSubscriptionDoc>("proSubscriptions").bulkWrite(
    pros.map((pro) => {
      const subscription = buildInitialProSubscription(pro._id, createdAt);
      return {
        updateOne: {
          filter: { _id: pro._id },
          update: { $setOnInsert: subscription },
          upsert: true,
        },
      };
    }),
  );
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
    syncMarketplaceAppConfig(db, appConfig),
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
  if (Number(currentVersion?.value ?? 0) >= 2) {
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

async function migrateSubscriptionSchema(db: Db) {
  const currentVersion = await getMetadata(db, "schemaVersion");
  const version = Number(currentVersion?.value ?? 0);
  if (version >= 3) {
    return;
  }
  if (version !== 2) {
    throw new Error(
      `Subscription schema migration requires schema version 2; received ${currentVersion?.value ?? "missing"}.`,
    );
  }

  await backfillProSubscriptions(db);
  await setMetadata(db, "schemaVersion", "3");
  await setMetadata(
    db,
    "subscriptionMigrationCompletedAt",
    new Date().toISOString(),
  );
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
      .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
      .createIndex({ userId: 1 }, { unique: true }),
    db
      .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
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
    db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .createIndex({ stripeCustomerId: 1 }, { unique: true, sparse: true }),
    db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .createIndex({ stripeSubscriptionId: 1 }, { unique: true, sparse: true }),
    db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .createIndex({ checkoutSessionId: 1 }, { unique: true, sparse: true }),
    db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .createIndex({ stripeSetupIntentId: 1 }, { unique: true, sparse: true }),
    db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .createIndex(
        { reactivationCheckoutSessionId: 1 },
        { unique: true, sparse: true },
      ),
    db.collection<ProSubscriptionDoc>("proSubscriptions").createIndex({
      accessStatus: 1,
      gracePeriodEndsAt: 1,
    }),
    db.collection<StripeWebhookEventDoc>("stripeWebhookEvents").createIndex({
      status: 1,
      leaseExpiresAt: 1,
    }),
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

async function syncHongKongServiceAreas(db: Db) {
  const patchKey = "hong_kong_service_areas_v1";
  if (await getMetadata(db, patchKey)) {
    return;
  }

  const serviceAreas = createHongKongServiceAreas();
  await db.collection<ServiceAreaConfigDoc>("appConfig").bulkWrite(
    serviceAreas.map((serviceArea) => ({
      updateOne: {
        filter: { _id: `serviceArea:${serviceArea.district}` },
        update: {
          $set: {
            configType: "serviceArea" as const,
            key: serviceArea.district,
            serviceArea,
          },
        },
        upsert: true,
      },
    })),
  );
  await setMetadata(db, patchKey, "1");
  clearMongoReadCache();
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

export async function getMongoSmsVerificationConfig(): Promise<SmsVerificationConfigState> {
  const db = await getMongoDb();
  const config = await db
    .collection<AppConfigDoc>("appConfig")
    .findOne({ _id: SMS_VERIFICATION_CONFIG_ID });

  return resolveSmsVerificationConfig(config, smsVerificationForceOff);
}

export async function setMongoSmsVerificationEnabled(input: {
  enabled: boolean;
  updatedBy: string;
}): Promise<SmsVerificationConfigState> {
  const updatedBy = input.updatedBy.trim();
  if (!updatedBy) {
    throw new Error("An administrator is required to update SMS settings.");
  }

  const db = await getMongoDb();
  const currentDoc = await db
    .collection<AppConfigDoc>("appConfig")
    .findOne({ _id: SMS_VERIFICATION_CONFIG_ID });
  const current = resolveSmsVerificationConfig(currentDoc, false);
  const next: SmsVerificationConfigDoc = {
    _id: SMS_VERIFICATION_CONFIG_ID,
    configType: "feature",
    key: "smsVerification",
    enabled: input.enabled,
    provider: current.provider,
    otpTtlSeconds: current.otpTtlSeconds,
    resendCooldownSeconds: current.resendCooldownSeconds,
    maxAttempts: current.maxAttempts,
    maxSendsPerHour: current.maxSendsPerHour,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  await db
    .collection<AppConfigDoc>("appConfig")
    .replaceOne({ _id: SMS_VERIFICATION_CONFIG_ID }, next, { upsert: true });

  return resolveSmsVerificationConfig(next, smsVerificationForceOff);
}

export async function writeMongoDb(dbState: MockDb) {
  const db = await getMongoDb();
  await writeState(db, dbState);
  clearMongoReadCache();
  clearMongoSessionUserCache();
}

type MongoMutationLease = {
  assertOwned: () => Promise<void>;
};

async function withMongoMutationLock<T>(
  db: Db,
  operation: (lease: MongoMutationLease) => Promise<T>,
) {
  const leaseId = createOpaqueToken();
  const deadline = Date.now() + MUTATION_LOCK_MAX_WAIT_MS;
  const collection = db.collection<MutationLockDoc>("systemMetadata");

  while (true) {
    const now = new Date();
    try {
      const lock = await collection.findOneAndUpdate(
        {
          _id: MUTATION_LOCK_ID,
          $or: [
            { leaseExpiresAt: { $lte: now } },
            { leaseId },
            { leaseExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            leaseId,
            leaseExpiresAt: new Date(now.getTime() + MUTATION_LOCK_LEASE_MS),
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (lock?.leaseId === leaseId) {
        break;
      }
    } catch (error) {
      if (!isDuplicateMongoKey(error)) {
        throw error;
      }
    }

    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the database mutation lock.");
    }
    await new Promise((resolve) => setTimeout(resolve, MUTATION_LOCK_WAIT_MS));
  }

  let heartbeatFailure: Error | undefined;
  let heartbeatRunning = false;
  const renewLease = async () => {
    const now = new Date();
    const renewed = await collection.updateOne(
      {
        _id: MUTATION_LOCK_ID,
        leaseId,
        leaseExpiresAt: { $gt: now },
      },
      {
        $set: {
          leaseExpiresAt: new Date(now.getTime() + MUTATION_LOCK_LEASE_MS),
        },
      },
    );
    if (renewed.matchedCount !== 1) {
      throw new Error("The database mutation lock lease was lost.");
    }
  };
  const heartbeat = setInterval(() => {
    if (heartbeatRunning || heartbeatFailure) {
      return;
    }
    heartbeatRunning = true;
    void renewLease()
      .catch((error) => {
        heartbeatFailure =
          error instanceof Error
            ? error
            : new Error("The database mutation lock heartbeat failed.");
      })
      .finally(() => {
        heartbeatRunning = false;
      });
  }, MUTATION_LOCK_LEASE_MS / 3);
  heartbeat.unref();

  const lease: MongoMutationLease = {
    assertOwned: async () => {
      if (heartbeatFailure) {
        throw heartbeatFailure;
      }
      await renewLease();
    },
  };

  try {
    return await operation(lease);
  } finally {
    clearInterval(heartbeat);
    await collection.deleteOne({ _id: MUTATION_LOCK_ID, leaseId });
  }
}

export async function withMongoDb<T>(updater: (db: MockDb) => Promise<T> | T) {
  const db = await getMongoDb();
  return withMongoMutationLock(db, async (lease) => {
    // Mutations deliberately bypass the development read cache. Combined with
    // the Mongo-backed lease, this prevents two app instances from accepting
    // the same quote or writing an entitlement decision from stale state.
    const dbState = await loadMongoDbStateFromDb(db);
    const result = await updater(dbState);
    await lease.assertOwned();
    await writeState(db, dbState);
    clearMongoReadCache();
    clearMongoSessionUserCache();
    return result;
  });
}

export async function ensureMongoProSubscription(proId: string) {
  const db = await getMongoDb();
  const pro = await db.collection<ProfileDoc>("profile").findOne({
    _id: proId,
    role: "pro",
    status: { $ne: "deleted" },
  });
  if (!pro) {
    throw new Error("A valid pro account is required for a subscription.");
  }

  const initial = buildInitialProSubscription(proId);
  await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .updateOne({ _id: proId }, { $setOnInsert: initial }, { upsert: true });
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOne({ _id: proId });
  if (!subscription) {
    throw new Error("Unable to initialize the pro subscription.");
  }

  return stripMongoId<ProSubscription>(subscription);
}

export async function findMongoProSubscription(proId: string) {
  const db = await getMongoDb();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOne({ _id: proId });
  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function findMongoProSubscriptionByStripeSubscriptionId(
  stripeSubscriptionId: string,
) {
  const db = await getMongoDb();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOne({ stripeSubscriptionId });
  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function listMongoProSubscriptions() {
  const db = await getMongoDb();
  const subscriptions = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .find({})
    .sort({ createdAt: 1, proId: 1 })
    .toArray();
  return subscriptions.map((subscription) =>
    stripMongoId<ProSubscription>(subscription),
  );
}

export async function reserveMongoProSubscriptionCheckout(input: {
  proId: string;
  reservationId: string;
  reservationExpiresAt: string;
}) {
  const expiresAt = new Date(input.reservationExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new TypeError("Checkout reservation expiry must be in the future.");
  }

  const db = await getMongoDb();
  const now = new Date().toISOString();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOneAndUpdate(
      {
        _id: input.proId,
        accessStatus: "setup_required",
        checkoutSessionId: { $exists: false },
        stripeSubscriptionId: { $exists: false },
        cardBoundAt: { $exists: false },
        trialConsumedAt: { $exists: false },
        trialGrantedAt: { $exists: false },
        trialStartedAt: { $exists: false },
        trialEndsAt: { $exists: false },
        $or: [
          { checkoutReservationId: { $exists: false } },
          { checkoutReservationExpiresAt: { $lte: now } },
          { checkoutReservationId: input.reservationId },
        ],
      },
      {
        $set: {
          checkoutReservationId: input.reservationId,
          checkoutReservationExpiresAt: expiresAt.toISOString(),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );

  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function releaseMongoProSubscriptionCheckout(
  proId: string,
  reservationId: string,
) {
  const db = await getMongoDb();
  const result = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .updateOne(
      { _id: proId, checkoutReservationId: reservationId },
      {
        $set: { updatedAt: new Date().toISOString() },
        $unset: {
          checkoutReservationId: "",
          checkoutReservationExpiresAt: "",
        },
      },
    );
  return result.modifiedCount === 1;
}

export async function setMongoProStripeCustomer(
  proId: string,
  stripeCustomerId: string,
) {
  const db = await getMongoDb();
  const collection = db.collection<ProSubscriptionDoc>("proSubscriptions");
  const subscription = await collection.findOneAndUpdate(
    {
      _id: proId,
      $or: [{ stripeCustomerId: { $exists: false } }, { stripeCustomerId }],
    },
    {
      $set: {
        stripeCustomerId,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" },
  );

  if (subscription) {
    return stripMongoId<ProSubscription>(subscription);
  }

  const existing = await collection.findOne({ _id: proId });
  if (!existing) {
    throw new Error("The pro subscription does not exist.");
  }

  return stripMongoId<ProSubscription>(existing);
}

export async function completeMongoProSubscriptionCheckoutReservation(input: {
  proId: string;
  reservationId: string;
  checkoutSessionId: string;
  checkoutSessionExpiresAt: string;
  stripeCustomerId: string;
}) {
  const checkoutExpiresAt = new Date(input.checkoutSessionExpiresAt);
  if (!Number.isFinite(checkoutExpiresAt.getTime())) {
    throw new TypeError("Checkout session expiry must be a valid date-time.");
  }

  const db = await getMongoDb();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOneAndUpdate(
      {
        _id: input.proId,
        accessStatus: "setup_required",
        checkoutReservationId: input.reservationId,
        cardBoundAt: { $exists: false },
        trialConsumedAt: { $exists: false },
        trialGrantedAt: { $exists: false },
        trialStartedAt: { $exists: false },
        trialEndsAt: { $exists: false },
        stripeSubscriptionId: { $exists: false },
        $or: [
          { stripeCustomerId: { $exists: false } },
          { stripeCustomerId: input.stripeCustomerId },
        ],
      },
      {
        $set: {
          stripeCustomerId: input.stripeCustomerId,
          checkoutSessionId: input.checkoutSessionId,
          checkoutSessionExpiresAt: checkoutExpiresAt.toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          checkoutReservationId: "",
          checkoutReservationExpiresAt: "",
        },
      },
      { returnDocument: "after" },
    );

  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function clearMongoProSubscriptionCheckoutSession(
  checkoutSessionId: string,
) {
  const db = await getMongoDb();
  const result = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .updateOne(
      {
        checkoutSessionId,
        cardBoundAt: { $exists: false },
        trialConsumedAt: { $exists: false },
        trialGrantedAt: { $exists: false },
        trialStartedAt: { $exists: false },
        trialEndsAt: { $exists: false },
        stripeSubscriptionId: { $exists: false },
      },
      {
        $set: { updatedAt: new Date().toISOString() },
        $unset: {
          checkoutSessionId: "",
          checkoutSessionExpiresAt: "",
          checkoutReservationId: "",
          checkoutReservationExpiresAt: "",
        },
      },
    );
  return result.modifiedCount === 1;
}

export async function reserveMongoProSubscriptionReactivationCheckout(input: {
  proId: string;
  reservationId: string;
  reservationExpiresAt: string;
}) {
  const expiresAt = new Date(input.reservationExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new TypeError(
      "Reactivation reservation expiry must be in the future.",
    );
  }

  const db = await getMongoDb();
  const now = new Date().toISOString();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOneAndUpdate(
      {
        _id: input.proId,
        stripeStatus: "canceled",
        stripeCustomerId: { $exists: true },
        stripeSubscriptionId: { $exists: true },
        stripePriceId: { $exists: true },
        trialConsumedAt: { $exists: true },
        pastDueInvoiceId: { $exists: false },
        reactivationCheckoutSessionId: { $exists: false },
        $or: [
          { reactivationCheckoutReservationId: { $exists: false } },
          { reactivationCheckoutReservationExpiresAt: { $lte: now } },
          { reactivationCheckoutReservationId: input.reservationId },
        ],
      },
      {
        $set: {
          reactivationCheckoutReservationId: input.reservationId,
          reactivationCheckoutReservationExpiresAt: expiresAt.toISOString(),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function releaseMongoProSubscriptionReactivationCheckout(
  proId: string,
  reservationId: string,
) {
  const db = await getMongoDb();
  const result = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .updateOne(
      { _id: proId, reactivationCheckoutReservationId: reservationId },
      {
        $set: { updatedAt: new Date().toISOString() },
        $unset: {
          reactivationCheckoutReservationId: "",
          reactivationCheckoutReservationExpiresAt: "",
        },
      },
    );
  return result.modifiedCount === 1;
}

export async function completeMongoProSubscriptionReactivationCheckoutReservation(input: {
  proId: string;
  reservationId: string;
  checkoutSessionId: string;
  checkoutSessionExpiresAt: string;
  stripeCustomerId: string;
  previousStripeSubscriptionId: string;
}) {
  const checkoutExpiresAt = new Date(input.checkoutSessionExpiresAt);
  if (!Number.isFinite(checkoutExpiresAt.getTime())) {
    throw new TypeError(
      "Reactivation Checkout expiry must be a valid date-time.",
    );
  }
  const db = await getMongoDb();
  const subscription = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .findOneAndUpdate(
      {
        _id: input.proId,
        stripeStatus: "canceled",
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.previousStripeSubscriptionId,
        trialConsumedAt: { $exists: true },
        pastDueInvoiceId: { $exists: false },
        reactivationCheckoutReservationId: input.reservationId,
      },
      {
        $set: {
          reactivationCheckoutSessionId: input.checkoutSessionId,
          reactivationCheckoutSessionExpiresAt: checkoutExpiresAt.toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          reactivationCheckoutReservationId: "",
          reactivationCheckoutReservationExpiresAt: "",
        },
      },
      { returnDocument: "after" },
    );
  return subscription ? stripMongoId<ProSubscription>(subscription) : null;
}

export async function clearMongoProSubscriptionReactivationCheckoutSession(
  checkoutSessionId: string,
) {
  const db = await getMongoDb();
  const result = await db
    .collection<ProSubscriptionDoc>("proSubscriptions")
    .updateOne(
      {
        reactivationCheckoutSessionId: checkoutSessionId,
        stripeStatus: "canceled",
        pastDueInvoiceId: { $exists: false },
      },
      {
        $set: { updatedAt: new Date().toISOString() },
        $unset: {
          reactivationCheckoutSessionId: "",
          reactivationCheckoutSessionExpiresAt: "",
          reactivationCheckoutReservationId: "",
          reactivationCheckoutReservationExpiresAt: "",
        },
      },
    );
  return result.modifiedCount === 1;
}

export type ConsumeProLifetimeTrialResult = {
  status: "consumed" | "existing";
  subscription: ProSubscription;
};

/**
 * Atomically consumes the one lifetime trial before the Stripe subscription is
 * created. If Stripe creation is interrupted, a webhook retry resumes from the
 * persisted trial dates instead of granting a fresh trial.
 */
export async function consumeMongoProLifetimeTrial(input: {
  proId: string;
  checkoutSessionId: string;
  stripeCustomerId: string;
  stripeSetupIntentId: string;
  stripePaymentMethodId: string;
  cardBoundAt: string;
  trialEndsAt: string;
}): Promise<ConsumeProLifetimeTrialResult> {
  const cardBoundAt = new Date(input.cardBoundAt);
  if (!Number.isFinite(cardBoundAt.getTime())) {
    throw new TypeError("Card binding time must be a valid date-time.");
  }
  const normalizedCardBoundAt = cardBoundAt.toISOString();
  const expectedTrialEndsAt = addThreeHongKongCalendarMonths(
    normalizedCardBoundAt,
  );
  if (new Date(input.trialEndsAt).toISOString() !== expectedTrialEndsAt) {
    throw new Error(
      "Trial end must be exactly three Hong Kong calendar months.",
    );
  }

  const db = await getMongoDb();
  const collection = db.collection<ProSubscriptionDoc>("proSubscriptions");
  const subscription = await collection.findOneAndUpdate(
    {
      _id: input.proId,
      accessStatus: "setup_required",
      checkoutSessionId: input.checkoutSessionId,
      stripeCustomerId: input.stripeCustomerId,
      cardBoundAt: { $exists: false },
      trialConsumedAt: { $exists: false },
      trialGrantedAt: { $exists: false },
      trialStartedAt: { $exists: false },
      trialEndsAt: { $exists: false },
      stripeSubscriptionId: { $exists: false },
    },
    {
      $set: {
        stripeSetupIntentId: input.stripeSetupIntentId,
        stripePaymentMethodId: input.stripePaymentMethodId,
        cardBoundAt: normalizedCardBoundAt,
        trialConsumedAt: normalizedCardBoundAt,
        trialGrantedAt: normalizedCardBoundAt,
        trialStartedAt: normalizedCardBoundAt,
        trialEndsAt: expectedTrialEndsAt,
        updatedAt: normalizedCardBoundAt,
      },
      $unset: {
        checkoutReservationId: "",
        checkoutReservationExpiresAt: "",
      },
    },
    { returnDocument: "after" },
  );

  if (subscription) {
    return {
      status: "consumed",
      subscription: stripMongoId<ProSubscription>(subscription),
    };
  }

  const existing = await collection.findOne({ _id: input.proId });
  if (!existing) {
    throw new Error("The pro subscription does not exist.");
  }
  if (
    !existing.trialConsumedAt ||
    !existing.trialEndsAt ||
    existing.checkoutSessionId !== input.checkoutSessionId ||
    existing.stripeCustomerId !== input.stripeCustomerId ||
    existing.stripeSetupIntentId !== input.stripeSetupIntentId ||
    existing.stripePaymentMethodId !== input.stripePaymentMethodId
  ) {
    throw new Error("The checkout session does not match this subscription.");
  }

  return {
    status: "existing",
    subscription: stripMongoId<ProSubscription>(existing),
  };
}

export async function activateMongoProTrialSubscription(input: {
  proId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeStatus: StripeSubscriptionStatus;
  stripeLivemode: boolean;
  currentPeriodStartedAt?: string;
  currentPeriodEndsAt?: string;
  lastStripeEventId: string;
  lastStripeEventCreatedAt?: string;
  lastStripeSyncedAt: string;
}) {
  if (input.stripeStatus !== "trialing" && input.stripeStatus !== "active") {
    throw new Error("The new Stripe subscription is not active or trialing.");
  }
  const accessStatus = input.stripeStatus;

  const db = await getMongoDb();
  const collection = db.collection<ProSubscriptionDoc>("proSubscriptions");
  const subscription = await collection.findOneAndUpdate(
    {
      _id: input.proId,
      accessStatus: "setup_required",
      trialConsumedAt: { $exists: true },
      stripeSubscriptionId: { $exists: false },
    },
    {
      $set: {
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.stripePriceId,
        stripeStatus: input.stripeStatus,
        stripeLivemode: input.stripeLivemode,
        stripeSubscriptionHasTrial: true,
        accessStatus,
        currentPeriodStartedAt: input.currentPeriodStartedAt,
        currentPeriodEndsAt: input.currentPeriodEndsAt,
        cancelAtPeriodEnd: false,
        lastStripeEventId: input.lastStripeEventId,
        lastStripeEventCreatedAt: input.lastStripeEventCreatedAt,
        lastStripeSyncedAt: input.lastStripeSyncedAt,
        updatedAt: input.lastStripeSyncedAt,
      },
      $unset: {
        checkoutReservationId: "",
        checkoutReservationExpiresAt: "",
      },
    },
    { returnDocument: "after" },
  );

  if (subscription) {
    return stripMongoId<ProSubscription>(subscription);
  }

  const existing = await collection.findOne({ _id: input.proId });
  return existing?.stripeSubscriptionId === input.stripeSubscriptionId
    ? stripMongoId<ProSubscription>(existing)
    : null;
}

export async function activateMongoPaidProSubscription(input: {
  proId: string;
  stripeCustomerId: string;
  previousStripeSubscriptionId: string;
  reactivationCheckoutSessionId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeLivemode: boolean;
  currentPeriodStartedAt: string;
  currentPeriodEndsAt: string;
  latestInvoiceId: string;
  paidAt: string;
  lastStripeEventId: string;
  lastStripeEventCreatedAt: string;
  lastStripeSyncedAt: string;
}) {
  const currentPeriodStartedAt = normalizedIso(
    input.currentPeriodStartedAt,
    "Current period start",
  );
  const currentPeriodEndsAt = normalizedIso(
    input.currentPeriodEndsAt,
    "Current period end",
  );
  if (Date.parse(currentPeriodEndsAt) <= Date.parse(currentPeriodStartedAt)) {
    throw new Error("Current subscription period must end after it starts.");
  }
  const paidAt = normalizedIso(input.paidAt, "Payment success time");
  const eventCreatedAt = normalizedIso(
    input.lastStripeEventCreatedAt,
    "Stripe event creation time",
  );
  const syncedAt = normalizedIso(
    input.lastStripeSyncedAt,
    "Stripe synchronization time",
  );

  const db = await getMongoDb();
  return withMongoMutationLock(db, async (lease) => {
    const collection = db.collection<ProSubscriptionDoc>("proSubscriptions");
    await lease.assertOwned();
    const subscription = await collection.findOneAndUpdate(
      {
        _id: input.proId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.previousStripeSubscriptionId,
        stripeStatus: "canceled",
        reactivationCheckoutSessionId: input.reactivationCheckoutSessionId,
        trialConsumedAt: { $exists: true },
        pastDueInvoiceId: { $exists: false },
      },
      {
        $set: {
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripePriceId: input.stripePriceId,
          stripeStatus: "active",
          stripeLivemode: input.stripeLivemode,
          stripeSubscriptionHasTrial: false,
          accessStatus: "active",
          currentPeriodStartedAt,
          currentPeriodEndsAt,
          cancelAtPeriodEnd: false,
          latestInvoiceId: input.latestInvoiceId,
          lastPaymentSucceededAt: paidAt,
          lastStripeEventId: input.lastStripeEventId,
          lastStripeEventCreatedAt: eventCreatedAt,
          lastStripeSyncedAt: syncedAt,
          updatedAt: syncedAt,
        },
        $unset: {
          cancellationRequestedAt: "",
          terminatedAt: "",
          pastDueInvoiceId: "",
          firstPaymentFailedAt: "",
          paymentFailureConfirmed: "",
          gracePeriodEndsAt: "",
          reactivationCheckoutSessionId: "",
          reactivationCheckoutSessionExpiresAt: "",
          reactivationCheckoutReservationId: "",
          reactivationCheckoutReservationExpiresAt: "",
        },
        $inc: { stripeLifecycleRevision: 1 },
      },
      { returnDocument: "after" },
    );
    if (subscription) {
      clearMongoReadCache();
      return stripMongoId<ProSubscription>(subscription);
    }

    const existing = await collection.findOne({ _id: input.proId });
    return existing?.stripeSubscriptionId === input.stripeSubscriptionId &&
      existing.accessStatus === "active"
      ? stripMongoId<ProSubscription>(existing)
      : null;
  });
}

export type ProSubscriptionLifecyclePaymentUpdate =
  | { type: "none" }
  | {
      type: "failed";
      invoiceId: string;
      failedAt: string;
      confirmed?: boolean;
    }
  | { type: "paid"; invoiceId: string; paidAt?: string };

export interface SyncMongoProSubscriptionLifecycleInput {
  proId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeStatus: StripeSubscriptionStatus;
  stripeLivemode: boolean;
  currentPeriodStartedAt: string;
  currentPeriodEndsAt: string;
  cancelAtPeriodEnd: boolean;
  cancellationRequestedAt?: string;
  terminatedAt?: string;
  paymentUpdate: ProSubscriptionLifecyclePaymentUpdate;
  lastStripeEventId: string;
  lastStripeEventCreatedAt: string;
  lastStripeSyncedAt: string;
}

function normalizedIso(value: string, fieldName: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${fieldName} must be a valid ISO date-time.`);
  }
  return new Date(timestamp).toISOString();
}

function earlierIso(first: string, second: string) {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function laterIso(first: string | undefined, second: string | undefined) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(first) >= Date.parse(second) ? first : second;
}

function lifecycleAccessStatus(
  stripeStatus: StripeSubscriptionStatus,
  cancelAtPeriodEnd: boolean,
  gracePeriodEndsAt: string | undefined,
  now: string,
): SubscriptionAccessStatus {
  // An outstanding charge keeps its original 336-hour grace window even if
  // Stripe's dunning configuration ends the remote subscription early.
  // Cancellation stops future renewal; it does not erase the current debt or
  // shorten the promised grace period.
  if (
    gracePeriodEndsAt &&
    ["past_due", "unpaid", "canceled"].includes(stripeStatus)
  ) {
    return Date.parse(now) < Date.parse(gracePeriodEndsAt)
      ? "grace_period"
      : "suspended";
  }
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") {
    return "terminated";
  }
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return "suspended";
  }
  if (stripeStatus === "trialing" || stripeStatus === "active") {
    return cancelAtPeriodEnd ? "cancel_at_period_end" : stripeStatus;
  }
  return "suspended";
}

/**
 * Applies canonical Stripe lifecycle state with optimistic concurrency. Older
 * lifecycle snapshots cannot replace newer state, but their invoice facts are
 * merged so out-of-order payment failures still start the fixed grace window.
 */
export async function syncMongoProSubscriptionLifecycle(
  input: SyncMongoProSubscriptionLifecycleInput,
) {
  const eventCreatedAt = normalizedIso(
    input.lastStripeEventCreatedAt,
    "Stripe event creation time",
  );
  const syncedAt = normalizedIso(
    input.lastStripeSyncedAt,
    "Stripe synchronization time",
  );
  const currentPeriodStartedAt = normalizedIso(
    input.currentPeriodStartedAt,
    "Current period start",
  );
  const currentPeriodEndsAt = normalizedIso(
    input.currentPeriodEndsAt,
    "Current period end",
  );
  if (Date.parse(currentPeriodEndsAt) <= Date.parse(currentPeriodStartedAt)) {
    throw new Error("Current subscription period must end after it starts.");
  }
  const cancellationRequestedAt = input.cancellationRequestedAt
    ? normalizedIso(input.cancellationRequestedAt, "Cancellation request time")
    : undefined;
  const terminatedAt = input.terminatedAt
    ? normalizedIso(input.terminatedAt, "Subscription termination time")
    : undefined;
  const paymentUpdate =
    input.paymentUpdate.type === "failed"
      ? {
          ...input.paymentUpdate,
          failedAt: normalizedIso(
            input.paymentUpdate.failedAt,
            "First payment failure time",
          ),
        }
      : input.paymentUpdate.type === "paid" && input.paymentUpdate.paidAt
        ? {
            ...input.paymentUpdate,
            paidAt: normalizedIso(
              input.paymentUpdate.paidAt,
              "Payment success time",
            ),
          }
        : input.paymentUpdate;

  const db = await getMongoDb();
  return withMongoMutationLock(db, async (lease) => {
    const collection = db.collection<ProSubscriptionDoc>("proSubscriptions");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await collection.findOne({ _id: input.proId });
      if (!existing) {
        throw new Error("The pro subscription does not exist.");
      }
      if (
        existing.stripeCustomerId !== input.stripeCustomerId ||
        existing.stripeSubscriptionId !== input.stripeSubscriptionId ||
        existing.stripePriceId !== input.stripePriceId ||
        existing.stripeLivemode !== input.stripeLivemode ||
        !existing.trialConsumedAt
      ) {
        throw new Error("Stripe lifecycle identity does not match locally.");
      }
      const isStaleEvent = Boolean(
        existing.lastStripeEventCreatedAt &&
        Date.parse(existing.lastStripeEventCreatedAt) >
          Date.parse(eventCreatedAt),
      );
      if (
        isStaleEvent &&
        paymentUpdate.type === "failed" &&
        !existing.pastDueInvoiceId &&
        (existing.stripeStatus === "active" ||
          existing.stripeStatus === "trialing")
      ) {
        return stripMongoId<ProSubscription>(existing);
      }
      if (isStaleEvent && paymentUpdate.type === "none") {
        return stripMongoId<ProSubscription>(existing);
      }

      let pastDueInvoiceId = existing.pastDueInvoiceId;
      let firstPaymentFailedAt = existing.firstPaymentFailedAt;
      let paymentFailureConfirmed =
        Boolean(existing.pastDueInvoiceId) &&
        existing.paymentFailureConfirmed !== false;
      let gracePeriodEndsAt = existing.gracePeriodEndsAt;
      let latestInvoiceId = existing.latestInvoiceId;
      let lastPaymentSucceededAt = existing.lastPaymentSucceededAt;

      if (paymentUpdate.type === "failed") {
        latestInvoiceId = paymentUpdate.invoiceId;
        const incomingConfirmed = paymentUpdate.confirmed !== false;
        if (!pastDueInvoiceId) {
          pastDueInvoiceId = paymentUpdate.invoiceId;
          firstPaymentFailedAt = paymentUpdate.failedAt;
          paymentFailureConfirmed = incomingConfirmed;
        } else if (pastDueInvoiceId === paymentUpdate.invoiceId) {
          if (incomingConfirmed && !paymentFailureConfirmed) {
            // Replace the conservative provisional time exactly once when the
            // signed invoice failure/action-required event arrives.
            firstPaymentFailedAt = paymentUpdate.failedAt;
            paymentFailureConfirmed = true;
          } else if (incomingConfirmed && firstPaymentFailedAt) {
            firstPaymentFailedAt = earlierIso(
              firstPaymentFailedAt,
              paymentUpdate.failedAt,
            );
          } else if (!paymentFailureConfirmed && firstPaymentFailedAt) {
            firstPaymentFailedAt = earlierIso(
              firstPaymentFailedAt,
              paymentUpdate.failedAt,
            );
          } else if (!firstPaymentFailedAt) {
            firstPaymentFailedAt = paymentUpdate.failedAt;
          }
        }
        if (firstPaymentFailedAt) {
          gracePeriodEndsAt = calculateGracePeriodEndsAt(firstPaymentFailedAt);
        }
      } else if (paymentUpdate.type === "paid") {
        if (!pastDueInvoiceId || pastDueInvoiceId === paymentUpdate.invoiceId) {
          latestInvoiceId = paymentUpdate.invoiceId;
        }
        lastPaymentSucceededAt = laterIso(
          lastPaymentSucceededAt,
          paymentUpdate.paidAt,
        );
        if (pastDueInvoiceId === paymentUpdate.invoiceId) {
          pastDueInvoiceId = undefined;
          firstPaymentFailedAt = undefined;
          paymentFailureConfirmed = false;
          gracePeriodEndsAt = undefined;
        }
      }

      if (
        !isStaleEvent &&
        (input.stripeStatus === "active" ||
          input.stripeStatus === "trialing") &&
        paymentUpdate.type !== "failed"
      ) {
        pastDueInvoiceId = undefined;
        firstPaymentFailedAt = undefined;
        paymentFailureConfirmed = false;
        gracePeriodEndsAt = undefined;
      }

      const canonicalStripeStatus =
        isStaleEvent && existing.stripeStatus
          ? existing.stripeStatus
          : input.stripeStatus;
      const canonicalCancelAtPeriodEnd = isStaleEvent
        ? existing.cancelAtPeriodEnd
        : input.cancelAtPeriodEnd;
      const canonicalCurrentPeriodStartedAt = isStaleEvent
        ? (existing.currentPeriodStartedAt ?? currentPeriodStartedAt)
        : currentPeriodStartedAt;
      const canonicalCurrentPeriodEndsAt = isStaleEvent
        ? (existing.currentPeriodEndsAt ?? currentPeriodEndsAt)
        : currentPeriodEndsAt;
      const accessStatus = lifecycleAccessStatus(
        canonicalStripeStatus,
        canonicalCancelAtPeriodEnd,
        gracePeriodEndsAt,
        syncedAt,
      );
      const setFields: Partial<ProSubscriptionDoc> = {
        stripeStatus: canonicalStripeStatus,
        accessStatus,
        currentPeriodStartedAt: canonicalCurrentPeriodStartedAt,
        currentPeriodEndsAt: canonicalCurrentPeriodEndsAt,
        cancelAtPeriodEnd: canonicalCancelAtPeriodEnd,
        lastStripeEventId: isStaleEvent
          ? existing.lastStripeEventId
          : input.lastStripeEventId,
        lastStripeEventCreatedAt: isStaleEvent
          ? existing.lastStripeEventCreatedAt
          : eventCreatedAt,
        lastStripeSyncedAt: syncedAt,
        updatedAt: syncedAt,
        ...(canonicalCancelAtPeriodEnd
          ? {
              cancellationRequestedAt:
                cancellationRequestedAt ??
                existing.cancellationRequestedAt ??
                eventCreatedAt,
            }
          : {}),
        ...(accessStatus === "terminated"
          ? {
              terminatedAt:
                terminatedAt ?? existing.terminatedAt ?? eventCreatedAt,
            }
          : {}),
        ...(pastDueInvoiceId ? { pastDueInvoiceId } : {}),
        ...(firstPaymentFailedAt ? { firstPaymentFailedAt } : {}),
        ...(pastDueInvoiceId ? { paymentFailureConfirmed } : {}),
        ...(gracePeriodEndsAt ? { gracePeriodEndsAt } : {}),
        ...(latestInvoiceId ? { latestInvoiceId } : {}),
        ...(lastPaymentSucceededAt ? { lastPaymentSucceededAt } : {}),
      };
      const unsetFields: Record<string, ""> = {};
      if (!canonicalCancelAtPeriodEnd) {
        unsetFields.cancellationRequestedAt = "";
      }
      if (accessStatus !== "terminated") {
        unsetFields.terminatedAt = "";
      }
      if (!pastDueInvoiceId) {
        unsetFields.pastDueInvoiceId = "";
      }
      if (!firstPaymentFailedAt) {
        unsetFields.firstPaymentFailedAt = "";
      }
      if (!pastDueInvoiceId) {
        unsetFields.paymentFailureConfirmed = "";
      }
      if (!gracePeriodEndsAt) {
        unsetFields.gracePeriodEndsAt = "";
      }

      const revision = existing.stripeLifecycleRevision;
      await lease.assertOwned();
      const updated = await collection.findOneAndUpdate(
        {
          _id: input.proId,
          stripeCustomerId: input.stripeCustomerId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          ...(revision === undefined
            ? { stripeLifecycleRevision: { $exists: false } }
            : { stripeLifecycleRevision: revision }),
        },
        {
          $set: setFields,
          $inc: { stripeLifecycleRevision: 1 },
          ...(Object.keys(unsetFields).length > 0
            ? { $unset: unsetFields }
            : {}),
        },
        { returnDocument: "after" },
      );
      if (updated) {
        clearMongoReadCache();
        return stripMongoId<ProSubscription>(updated);
      }
    }

    throw new Error("Unable to synchronize Stripe lifecycle state safely.");
  });
}

function isDuplicateMongoKey(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000,
  );
}

export type StripeWebhookClaimResult =
  | { status: "claimed"; leaseId: string }
  | { status: "processed" }
  | { status: "busy" };

/**
 * Coordinates at-least-once Stripe delivery. Claiming does not make later
 * business writes exactly-once: every handler must still re-fetch canonical
 * Stripe state and apply an idempotent conditional update before completing
 * the event.
 */
export async function claimMongoStripeWebhookEvent(input: {
  eventId: string;
  eventType: string;
  objectId?: string;
  leaseId: string;
  leaseDurationMs?: number;
}): Promise<StripeWebhookClaimResult> {
  const db = await getMongoDb();
  const collection = db.collection<StripeWebhookEventDoc>(
    "stripeWebhookEvents",
  );
  const now = new Date();
  const leaseExpiresAt = new Date(
    now.getTime() + (input.leaseDurationMs ?? 5 * 60 * 1000),
  );
  const event: StripeWebhookEventDoc = {
    _id: input.eventId,
    eventType: input.eventType,
    objectId: input.objectId,
    status: "processing",
    attempts: 1,
    leaseId: input.leaseId,
    leaseExpiresAt,
    receivedAt: now,
  };

  try {
    await collection.insertOne(event);
    return { status: "claimed", leaseId: input.leaseId };
  } catch (error) {
    if (!isDuplicateMongoKey(error)) {
      throw error;
    }
  }

  const existing = await collection.findOne({ _id: input.eventId });
  if (existing?.status === "processed") {
    return { status: "processed" };
  }
  if (
    existing?.status === "processing" &&
    existing.leaseExpiresAt &&
    existing.leaseExpiresAt.getTime() > now.getTime()
  ) {
    return { status: "busy" };
  }

  const reclaimed = await collection.findOneAndUpdate(
    {
      _id: input.eventId,
      status: { $ne: "processed" },
      $or: [
        { status: "failed" },
        { leaseExpiresAt: { $lte: now } },
        { leaseExpiresAt: { $exists: false } },
      ],
    },
    {
      $set: {
        eventType: input.eventType,
        objectId: input.objectId,
        status: "processing",
        leaseId: input.leaseId,
        leaseExpiresAt,
      },
      $inc: { attempts: 1 },
      $unset: { lastErrorCode: "", processedAt: "" },
    },
    { returnDocument: "after" },
  );

  return reclaimed
    ? { status: "claimed", leaseId: input.leaseId }
    : { status: "busy" };
}

export async function completeMongoStripeWebhookEvent(
  eventId: string,
  leaseId: string,
) {
  const db = await getMongoDb();
  const result = await db
    .collection<StripeWebhookEventDoc>("stripeWebhookEvents")
    .updateOne(
      { _id: eventId, status: "processing", leaseId },
      {
        $set: { status: "processed", processedAt: new Date() },
        $unset: { leaseId: "", leaseExpiresAt: "", lastErrorCode: "" },
      },
    );
  return result.modifiedCount === 1;
}

export async function failMongoStripeWebhookEvent(
  eventId: string,
  leaseId: string,
  errorCode: string,
) {
  const db = await getMongoDb();
  const safeErrorCode = errorCode
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 80);
  const result = await db
    .collection<StripeWebhookEventDoc>("stripeWebhookEvents")
    .updateOne(
      { _id: eventId, status: "processing", leaseId },
      {
        $set: { status: "failed", lastErrorCode: safeErrorCode },
        $unset: { leaseId: "", leaseExpiresAt: "", processedAt: "" },
      },
    );
  return result.modifiedCount === 1;
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

function hashSmsVerificationCode(code: string, salt: string) {
  return scryptSync(code, salt, 32).toString("base64url");
}

function smsVerificationCodesMatch(
  code: string,
  salt: string,
  expectedHash: string,
) {
  try {
    const actual = Buffer.from(hashSmsVerificationCode(code, salt));
    const expected = Buffer.from(expectedHash);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

async function recordSmsVerificationAttempt(
  db: Db,
  phone: string,
  success: boolean,
) {
  const attemptedAt = new Date();
  await db.collection<SecurityAttemptDoc>("securityAttempts").insertOne({
    attemptType: "smsVerification",
    phone,
    attemptedAt,
    expiresAt: addMilliseconds(attemptedAt, 30 * 24 * 60 * 60 * 1000),
    success,
  });
}

export async function issueMongoSmsVerificationChallenge(input: {
  userId: string;
  phone: string;
  code: string;
  otpTtlSeconds: number;
  resendCooldownSeconds: number;
  maxSendsPerHour: number;
}) {
  const db = await getMongoDb();
  const user = await findProfileById(db, input.userId);
  if (
    !user ||
    user.role === "admin" ||
    user.phone !== input.phone ||
    !user.phoneVerificationRequiredAt ||
    user.phoneVerifiedAt
  ) {
    return { status: "unavailable" as const };
  }

  const collection = db.collection<SmsVerificationChallengeDoc>(
    "smsVerificationChallenges",
  );
  const now = new Date();
  let existing = await collection.findOne({ userId: input.userId });
  if (existing && existing.expiresAt.getTime() <= now.getTime()) {
    await collection.deleteOne({ _id: existing._id });
    existing = null;
  }

  if (existing && existing.resendAvailableAt.getTime() > now.getTime()) {
    return {
      status: "cooldown" as const,
      challengeId: existing._id,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (existing.resendAvailableAt.getTime() - now.getTime()) / 1000,
        ),
      ),
    };
  }

  const sendWindowStartedAt =
    existing &&
    existing.sendWindowStartedAt.getTime() > now.getTime() - 60 * 60 * 1000
      ? existing.sendWindowStartedAt
      : now;
  const previousSendCount =
    existing && sendWindowStartedAt === existing.sendWindowStartedAt
      ? existing.sendCount
      : 0;
  if (previousSendCount >= input.maxSendsPerHour) {
    return {
      status: "rate_limited" as const,
      challengeId: existing?._id,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (sendWindowStartedAt.getTime() + 60 * 60 * 1000 - now.getTime()) /
            1000,
        ),
      ),
    };
  }

  const codeSalt = randomBytes(16).toString("base64url");
  const challenge: SmsVerificationChallengeDoc = {
    _id: existing?._id ?? createOpaqueToken(),
    userId: user.id,
    purpose: "account",
    phone: user.phone,
    codeHash: hashSmsVerificationCode(input.code, codeSalt),
    codeSalt,
    attempts: 0,
    sendCount: previousSendCount + 1,
    sendWindowStartedAt,
    lastSentAt: now,
    resendAvailableAt: addMilliseconds(now, input.resendCooldownSeconds * 1000),
    codeExpiresAt: addMilliseconds(now, input.otpTtlSeconds * 1000),
    expiresAt: addMilliseconds(now, 24 * 60 * 60 * 1000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    await collection.replaceOne({ _id: existing._id }, challenge);
  } else {
    await collection.insertOne(challenge);
  }

  return {
    status: "sent" as const,
    challengeId: challenge._id,
    retryAfterSeconds: input.resendCooldownSeconds,
  };
}

export async function getMongoSmsVerificationChallenge(challengeId: string) {
  const challenge = await (await getMongoDb())
    .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
    .findOne({
      _id: challengeId,
      expiresAt: { $gt: new Date() },
      $or: [{ purpose: "account" }, { purpose: { $exists: false } }],
    });
  if (!challenge) {
    return null;
  }

  return {
    id: challenge._id,
    userId: challenge.userId,
    phone: challenge.phone,
    attempts: challenge.attempts,
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    codeExpiresAt: challenge.codeExpiresAt.toISOString(),
  };
}

export async function verifyMongoSmsVerificationChallenge(input: {
  challengeId: string;
  code: string;
  maxAttempts: number;
}) {
  const db = await getMongoDb();
  const collection = db.collection<SmsVerificationChallengeDoc>(
    "smsVerificationChallenges",
  );
  const challenge = await collection.findOne({ _id: input.challengeId });
  if (
    !challenge ||
    challenge.purpose === "signup" ||
    challenge.expiresAt.getTime() <= Date.now()
  ) {
    return { status: "missing" as const };
  }
  if (challenge.attempts >= input.maxAttempts) {
    return { status: "locked" as const };
  }
  if (challenge.codeExpiresAt.getTime() <= Date.now()) {
    return { status: "expired" as const };
  }

  if (
    !smsVerificationCodesMatch(
      input.code,
      challenge.codeSalt,
      challenge.codeHash,
    )
  ) {
    const nextAttempts = challenge.attempts + 1;
    await collection.updateOne(
      { _id: challenge._id, attempts: challenge.attempts },
      { $inc: { attempts: 1 }, $set: { updatedAt: new Date() } },
    );
    await recordSmsVerificationAttempt(db, challenge.phone, false);
    return nextAttempts >= input.maxAttempts
      ? { status: "locked" as const }
      : {
          status: "invalid" as const,
          attemptsRemaining: input.maxAttempts - nextAttempts,
        };
  }

  const claimed = await collection.deleteOne({
    _id: challenge._id,
    codeHash: challenge.codeHash,
    attempts: challenge.attempts,
  });
  if (claimed.deletedCount !== 1) {
    return { status: "missing" as const };
  }

  const verifiedAt = new Date().toISOString();
  const updated = await db.collection<ProfileDoc>("profile").updateOne(
    {
      _id: challenge.userId,
      phone: challenge.phone,
      phoneVerificationRequiredAt: { $exists: true },
    },
    { $set: { phoneVerifiedAt: verifiedAt } },
  );
  if (updated.matchedCount !== 1) {
    return { status: "missing" as const };
  }

  await recordSmsVerificationAttempt(db, challenge.phone, true);
  clearMongoReadCache();
  clearMongoSessionUserCache();
  const user = await findProfileById(db, challenge.userId);
  return user
    ? { status: "verified" as const, user }
    : { status: "missing" as const };
}

const SIGNUP_PHONE_VERIFICATION_VALIDITY_MS = 30 * 60 * 1000;

export async function issueMongoSignupSmsVerificationChallenge(input: {
  challengeId?: string;
  phone: string;
  code: string;
  otpTtlSeconds: number;
  resendCooldownSeconds: number;
  maxSendsPerHour: number;
}) {
  const db = await getMongoDb();
  const collection = db.collection<SmsVerificationChallengeDoc>(
    "smsVerificationChallenges",
  );
  const now = new Date();
  let existing = input.challengeId
    ? await collection.findOne({
        _id: input.challengeId,
        purpose: "signup",
      })
    : null;

  if (
    existing &&
    (existing.phone !== input.phone ||
      existing.expiresAt.getTime() <= now.getTime())
  ) {
    await collection.deleteOne({ _id: existing._id, purpose: "signup" });
    existing = null;
  }

  if (!existing) {
    existing = await collection.findOne(
      {
        purpose: "signup",
        phone: input.phone,
        expiresAt: { $gt: now },
      },
      { sort: { updatedAt: -1 } },
    );
  }

  if (existing && existing.resendAvailableAt.getTime() > now.getTime()) {
    return {
      status: "cooldown" as const,
      challengeId: existing._id,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (existing.resendAvailableAt.getTime() - now.getTime()) / 1000,
        ),
      ),
      codeExpiresInSeconds: Math.max(
        0,
        Math.ceil((existing.codeExpiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  const sendWindowStartedAt =
    existing &&
    existing.sendWindowStartedAt.getTime() > now.getTime() - 60 * 60 * 1000
      ? existing.sendWindowStartedAt
      : now;
  const previousSendCount =
    existing && sendWindowStartedAt === existing.sendWindowStartedAt
      ? existing.sendCount
      : 0;
  if (previousSendCount >= input.maxSendsPerHour) {
    return {
      status: "rate_limited" as const,
      challengeId: existing?._id,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (sendWindowStartedAt.getTime() + 60 * 60 * 1000 - now.getTime()) /
            1000,
        ),
      ),
    };
  }

  const codeSalt = randomBytes(16).toString("base64url");
  const challenge: SmsVerificationChallengeDoc = {
    _id: existing?._id ?? createOpaqueToken(),
    userId: existing?.userId ?? `signup:${createOpaqueToken()}`,
    purpose: "signup",
    phone: input.phone,
    codeHash: hashSmsVerificationCode(input.code, codeSalt),
    codeSalt,
    attempts: 0,
    sendCount: previousSendCount + 1,
    sendWindowStartedAt,
    lastSentAt: now,
    resendAvailableAt: addMilliseconds(now, input.resendCooldownSeconds * 1000),
    codeExpiresAt: addMilliseconds(now, input.otpTtlSeconds * 1000),
    expiresAt: addMilliseconds(now, 24 * 60 * 60 * 1000),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (existing) {
    await collection.replaceOne({ _id: existing._id }, challenge);
  } else {
    await collection.insertOne(challenge);
  }

  return {
    status: "sent" as const,
    challengeId: challenge._id,
    retryAfterSeconds: input.resendCooldownSeconds,
    codeExpiresInSeconds: input.otpTtlSeconds,
  };
}

export async function getMongoSignupSmsVerificationChallenge(
  challengeId: string,
) {
  const challenge = await (await getMongoDb())
    .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
    .findOne({
      _id: challengeId,
      purpose: "signup",
      expiresAt: { $gt: new Date() },
    });
  if (!challenge) {
    return null;
  }

  return {
    id: challenge._id,
    phone: challenge.phone,
    attempts: challenge.attempts,
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    codeExpiresAt: challenge.codeExpiresAt.toISOString(),
    verifiedAt: challenge.verifiedAt?.toISOString(),
    verifiedExpiresAt: challenge.verifiedExpiresAt?.toISOString(),
  };
}

export async function verifyMongoSignupSmsVerificationChallenge(input: {
  challengeId: string;
  phone: string;
  code: string;
  maxAttempts: number;
}) {
  const db = await getMongoDb();
  const collection = db.collection<SmsVerificationChallengeDoc>(
    "smsVerificationChallenges",
  );
  const challenge = await collection.findOne({
    _id: input.challengeId,
    purpose: "signup",
    phone: input.phone,
  });
  const now = new Date();
  if (!challenge || challenge.expiresAt.getTime() <= now.getTime()) {
    return { status: "missing" as const };
  }
  if (
    challenge.verifiedAt &&
    challenge.verifiedExpiresAt &&
    challenge.verifiedExpiresAt.getTime() > now.getTime()
  ) {
    return {
      status: "verified" as const,
      phone: challenge.phone,
      verifiedAt: challenge.verifiedAt.toISOString(),
    };
  }
  if (challenge.attempts >= input.maxAttempts) {
    return { status: "locked" as const };
  }
  if (challenge.codeExpiresAt.getTime() <= now.getTime()) {
    return { status: "expired" as const };
  }

  if (
    !smsVerificationCodesMatch(
      input.code,
      challenge.codeSalt,
      challenge.codeHash,
    )
  ) {
    const nextAttempts = challenge.attempts + 1;
    await collection.updateOne(
      { _id: challenge._id, attempts: challenge.attempts },
      { $inc: { attempts: 1 }, $set: { updatedAt: now } },
    );
    await recordSmsVerificationAttempt(db, challenge.phone, false);
    return nextAttempts >= input.maxAttempts
      ? { status: "locked" as const }
      : {
          status: "invalid" as const,
          attemptsRemaining: input.maxAttempts - nextAttempts,
        };
  }

  const verifiedExpiresAt = addMilliseconds(
    now,
    SIGNUP_PHONE_VERIFICATION_VALIDITY_MS,
  );
  const verified = await collection.updateOne(
    {
      _id: challenge._id,
      purpose: "signup",
      phone: input.phone,
      codeHash: challenge.codeHash,
      attempts: challenge.attempts,
      verifiedAt: { $exists: false },
    },
    {
      $set: {
        verifiedAt: now,
        verifiedExpiresAt,
        expiresAt: verifiedExpiresAt,
        updatedAt: now,
      },
    },
  );
  if (verified.matchedCount !== 1) {
    return { status: "missing" as const };
  }

  await recordSmsVerificationAttempt(db, challenge.phone, true);
  return {
    status: "verified" as const,
    phone: challenge.phone,
    verifiedAt: now.toISOString(),
  };
}

export async function getMongoVerifiedSignupPhone(input: {
  challengeId: string;
  phone: string;
}) {
  const now = new Date();
  const challenge = await (await getMongoDb())
    .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
    .findOne({
      _id: input.challengeId,
      purpose: "signup",
      phone: input.phone,
      verifiedAt: { $exists: true },
      verifiedExpiresAt: { $gt: now },
      expiresAt: { $gt: now },
    });

  return challenge?.verifiedAt
    ? {
        phone: challenge.phone,
        verifiedAt: challenge.verifiedAt.toISOString(),
      }
    : null;
}

export async function consumeMongoVerifiedSignupPhone(input: {
  challengeId: string;
  phone: string;
}) {
  const deleted = await (await getMongoDb())
    .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
    .deleteOne({
      _id: input.challengeId,
      purpose: "signup",
      phone: input.phone,
      verifiedAt: { $exists: true },
      verifiedExpiresAt: { $gt: new Date() },
    });
  return deleted.deletedCount === 1;
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

export async function matchMongoOpenLeadsForPro(proId: string) {
  const db = await getMongoDb();
  const profile = await db.collection<ProfileDoc>("profile").findOne({
    _id: proId,
    role: "pro",
    status: { $ne: "deleted" },
  });
  const categoryIds = profile?.provider?.serviceCategoryIds ?? [];
  if (categoryIds.length === 0) {
    return 0;
  }

  const result = await db.collection<ServiceCaseDoc>("serviceCases").updateMany(
    {
      categoryId: { $in: categoryIds },
      status: { $in: openMongoLeadStatuses },
      matchedProIds: { $ne: proId },
    },
    { $addToSet: { matchedProIds: proId } },
  );
  clearMongoReadCache();
  return result.modifiedCount;
}

export async function listMongoOpenLeadPreviewsForPro(
  proId: string,
  categoryId?: string,
) {
  const db = await getMongoDb();
  const profile = await db.collection<ProfileDoc>("profile").findOne({
    _id: proId,
    role: "pro",
    status: { $ne: "deleted" },
  });
  const specialtyCategoryIds = profile?.provider?.serviceCategoryIds ?? [];
  if (
    specialtyCategoryIds.length === 0 ||
    (categoryId && !specialtyCategoryIds.includes(categoryId))
  ) {
    return [];
  }

  const filter: Record<string, unknown> = {
    categoryId: categoryId ?? { $in: specialtyCategoryIds },
    status: { $in: openMongoLeadStatuses },
  };
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

  return cases.flatMap((serviceCase) => {
    const request = requestFromServiceCase(serviceCase);
    const customer = usersById.get(request.customerId);
    if (!customer) {
      return [];
    }
    return [
      {
        ...request,
        existingQuote: undefined,
        customer,
        category: categoriesById.get(request.categoryId) ?? null,
      },
    ];
  });
}

export async function listMongoRelevantLeads(
  proId: string,
  categoryId?: string,
  includeClosedQuoteRecords = false,
) {
  const db = await getMongoDb();
  const filter: Record<string, unknown> = includeClosedQuoteRecords
    ? { "quotes.proId": proId }
    : {
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

  return cases.flatMap((serviceCase) => {
    const request = requestFromServiceCase(serviceCase);
    const customer = usersById.get(request.customerId);
    if (!customer) {
      return [];
    }
    return [
      {
        ...request,
        existingQuote: serviceCase.quotes.find(
          (quote) => quote.proId === proId,
        ),
        customer,
        category: categoriesById.get(request.categoryId) ?? null,
      },
    ];
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
    db
      .collection<SmsVerificationChallengeDoc>("smsVerificationChallenges")
      .deleteMany({}),
    db.collection<AccountRecoveryDoc>("accountRecovery").deleteMany({}),
    db.collection<AuthCredentialDoc>("authCredentials").deleteMany({}),
    db.collection<ProSubscriptionDoc>("proSubscriptions").deleteMany({}),
    db.collection<StripeWebhookEventDoc>("stripeWebhookEvents").deleteMany({}),
    db
      .collection<AppConfigDoc>("appConfig")
      .replaceOne(
        { _id: SMS_VERIFICATION_CONFIG_ID },
        buildDefaultSmsVerificationConfigDoc(),
        { upsert: true },
      ),
  ]);
  await writeState(db, seed);
  await backfillProSubscriptions(db);

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
  await setMetadata(db, "schemaVersion", "3");
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

export async function migrateMongoSubscriptionSchema() {
  const db = await getMongoDb();
  await migrateSubscriptionSchema(db);
  const version = await getMetadata(db, "schemaVersion");
  return {
    version: version?.value,
    subscriptions: await db
      .collection<ProSubscriptionDoc>("proSubscriptions")
      .countDocuments(),
  };
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
  if (version?.value !== "3") {
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
