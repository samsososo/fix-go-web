import { MongoClient, type Db, type IndexDescriptionInfo } from "mongodb";
import { z } from "zod";

type SystemMetadataDocument = {
  _id: string;
  value: string;
};

type AdminProfileDocument = {
  _id: string;
  id: string;
  role: "admin";
  email: string;
  phone?: string;
  phoneVerificationRequiredAt?: string;
  phoneVerifiedAt?: string;
  status: "active" | "suspended" | "deleted";
};

type AuthCredentialDocument = {
  _id: string;
  userId: string;
};

const adminEmailSchema = z
  .email()
  .transform((value) => value.trim().toLowerCase());

const configSchema = z
  .object({
    NODE_ENV: z.literal("production"),
    MONGODB_URI: z.string().min(1),
    MONGODB_DATABASE: z.string().regex(/(^|[_-])prod(?:uction)?($|[_-])/i),
    ENABLE_DATABASE_SEEDING: z.literal("false"),
    ENABLE_DEMO_LOGIN: z.literal("false"),
    PRODUCTION_ADMIN_1_EMAIL: adminEmailSchema,
    PRODUCTION_ADMIN_2_EMAIL: adminEmailSchema,
    PRODUCTION_ADMIN_DRY_RUN: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((config, context) => {
    if (config.PRODUCTION_ADMIN_1_EMAIL === config.PRODUCTION_ADMIN_2_EMAIL) {
      context.addIssue({
        code: "custom",
        path: ["PRODUCTION_ADMIN_2_EMAIL"],
        message: "Production admin emails must be different.",
      });
    }
  });

const legacyPhoneIndexName = "phone_1";
const sparsePhoneIndexName = "phone_1_sparse";

function assertUriDatabase(uri: string, databaseName: string) {
  const uriDatabase = decodeURIComponent(new URL(uri).pathname.slice(1));
  if (uriDatabase && uriDatabase !== databaseName) {
    throw new Error(
      "MONGODB_URI database does not match MONGODB_DATABASE; migration stopped.",
    );
  }
}

function isSinglePhoneIndex(index: IndexDescriptionInfo) {
  const key = index.key as Record<string, unknown>;
  return Object.keys(key).length === 1 && key.phone === 1;
}

function isSparseUniquePhoneIndex(index: IndexDescriptionInfo) {
  return (
    isSinglePhoneIndex(index) && index.unique === true && index.sparse === true
  );
}

async function readPhoneIndexes(db: Db) {
  return (
    await db
      .collection<AdminProfileDocument>("adminProfiles")
      .listIndexes()
      .toArray()
  ).filter(isSinglePhoneIndex);
}

function assertKnownPhoneIndexes(indexes: IndexDescriptionInfo[]) {
  for (const index of indexes) {
    if (index.name === sparsePhoneIndexName) {
      if (!isSparseUniquePhoneIndex(index)) {
        throw new Error(
          `${sparsePhoneIndexName} has unexpected options; migration stopped.`,
        );
      }
      continue;
    }

    if (index.name === legacyPhoneIndexName) {
      if (index.unique !== true) {
        throw new Error(
          `${legacyPhoneIndexName} is not unique; migration stopped.`,
        );
      }
      continue;
    }

    throw new Error(
      `Unexpected admin phone index ${index.name ?? "without a name"}; migration stopped.`,
    );
  }
}

async function ensureSparsePhoneIndex(db: Db) {
  const collection = db.collection<AdminProfileDocument>("adminProfiles");
  let indexes = await readPhoneIndexes(db);
  assertKnownPhoneIndexes(indexes);

  if (!indexes.some((index) => index.name === sparsePhoneIndexName)) {
    await collection.createIndex(
      { phone: 1 },
      { name: sparsePhoneIndexName, unique: true, sparse: true },
    );
  }

  indexes = await readPhoneIndexes(db);
  assertKnownPhoneIndexes(indexes);
  if (
    !indexes.some(
      (index) =>
        index.name === sparsePhoneIndexName && isSparseUniquePhoneIndex(index),
    )
  ) {
    throw new Error("Sparse unique admin phone index was not created.");
  }

  if (indexes.some((index) => index.name === legacyPhoneIndexName)) {
    await collection.dropIndex(legacyPhoneIndexName);
  }

  const finalIndexes = await readPhoneIndexes(db);
  assertKnownPhoneIndexes(finalIndexes);
  if (
    finalIndexes.length !== 1 ||
    finalIndexes[0]?.name !== sparsePhoneIndexName ||
    !isSparseUniquePhoneIndex(finalIndexes[0])
  ) {
    throw new Error("Admin phone index verification failed.");
  }
}

async function main() {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid production admin migration configuration: ${parsed.error.message}`,
    );
  }

  const config = parsed.data;
  assertUriDatabase(config.MONGODB_URI, config.MONGODB_DATABASE);
  const emails = [
    config.PRODUCTION_ADMIN_1_EMAIL,
    config.PRODUCTION_ADMIN_2_EMAIL,
  ];
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();

  try {
    const db = client.db(config.MONGODB_DATABASE);
    const initialized = await db
      .collection<SystemMetadataDocument>("systemMetadata")
      .findOne({ _id: "productionInitializedAt" });
    if (!initialized) {
      throw new Error(
        "Production database has not been initialized; migration stopped.",
      );
    }

    const adminProfiles = db.collection<AdminProfileDocument>("adminProfiles");
    const [admins, totalAdminCount] = await Promise.all([
      adminProfiles.find({ email: { $in: emails } }).toArray(),
      adminProfiles.countDocuments({ role: "admin" }),
    ]);
    if (
      totalAdminCount !== 2 ||
      admins.length !== 2 ||
      admins.some(
        (admin) =>
          admin.role !== "admin" ||
          admin.status !== "active" ||
          admin.id !== admin._id ||
          !emails.includes(admin.email),
      ) ||
      new Set(admins.map((admin) => admin.email)).size !== 2
    ) {
      throw new Error(
        "Each configured email must match one active production administrator.",
      );
    }

    const adminIds = admins.map((admin) => admin._id);
    const [credentials, publicEmailCount] = await Promise.all([
      db
        .collection<AuthCredentialDocument>("authCredentials")
        .find({ _id: { $in: adminIds } })
        .toArray(),
      db.collection("profile").countDocuments({ email: { $in: emails } }),
    ]);
    if (
      credentials.length !== 2 ||
      credentials.some(
        (credential) =>
          credential.userId !== credential._id ||
          !adminIds.includes(credential.userId),
      )
    ) {
      throw new Error(
        "Both production administrators must have an intact login credential.",
      );
    }
    if (publicEmailCount !== 0) {
      throw new Error(
        "A configured administrator email is also used by a public account.",
      );
    }

    const phoneIndexes = await readPhoneIndexes(db);
    assertKnownPhoneIndexes(phoneIndexes);
    const adminsWithPhone = admins.filter(
      (admin) => typeof admin.phone === "string" && admin.phone.length > 0,
    ).length;

    if (config.PRODUCTION_ADMIN_DRY_RUN) {
      console.log(
        JSON.stringify({
          ok: true,
          dryRun: true,
          database: config.MONGODB_DATABASE,
          adminsMatched: admins.length,
          adminsWithPhone,
          readyToMigrate: true,
        }),
      );
      return;
    }

    await ensureSparsePhoneIndex(db);
    const result = await db
      .collection<AdminProfileDocument>("adminProfiles")
      .bulkWrite(
        admins.map((admin) => ({
          updateOne: {
            filter: {
              _id: admin._id,
              id: admin.id,
              email: admin.email,
              role: "admin" as const,
            },
            update: {
              $unset: {
                phone: "",
                phoneVerificationRequiredAt: "",
                phoneVerifiedAt: "",
              },
            },
          },
        })),
        { ordered: true },
      );
    if (result.matchedCount !== 2) {
      throw new Error(
        "Administrator records changed during migration; verification failed.",
      );
    }

    const remainingPhoneFields = await db
      .collection<AdminProfileDocument>("adminProfiles")
      .countDocuments({
        _id: { $in: admins.map((admin) => admin._id) },
        $or: [
          { phone: { $exists: true } },
          { phoneVerificationRequiredAt: { $exists: true } },
          { phoneVerifiedAt: { $exists: true } },
        ],
      });
    if (remainingPhoneFields !== 0) {
      throw new Error("Administrator phone removal verification failed.");
    }

    const migratedAt = new Date().toISOString();
    await db
      .collection<SystemMetadataDocument>("systemMetadata")
      .updateOne(
        { _id: "productionAdminEmailOnlyMigratedAt" },
        { $setOnInsert: { value: migratedAt } },
        { upsert: true },
      );

    console.log(
      JSON.stringify({
        ok: true,
        dryRun: false,
        database: config.MONGODB_DATABASE,
        adminsMatched: admins.length,
        adminsUpdated: result.modifiedCount,
        remainingPhoneFields,
      }),
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
