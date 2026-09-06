import { randomUUID } from "node:crypto";

import { MongoClient } from "mongodb";
import { z } from "zod";

type SystemMetadataDocument = {
  _id: string;
  value: string;
};

type ProfileIdentifierDocument = {
  _id: string;
  email?: string;
};

type AdminProfileDocument = ProfileIdentifierDocument & {
  id: string;
  role: "admin";
  fullName: string;
  locale: "zh-HK";
  createdAt: string;
  lastLoginAt: string;
  status: "active";
  adminRole: "superAdmin";
  permissions: string[];
};

type AuthCredentialDocument = {
  _id: string;
  userId: string;
  password: string;
  isDemo: false;
};

const adminNameSchema = z.string().trim().min(2).max(100);
const adminEmailSchema = z
  .email()
  .transform((value) => value.trim().toLowerCase());
const adminPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => value !== "HotfixAdmin123!", {
    message: "The example admin password cannot be used in production.",
  });

const configSchema = z
  .object({
    NODE_ENV: z.literal("production"),
    MONGODB_URI: z.string().min(1),
    MONGODB_DATABASE: z.string().regex(/(^|[_-])prod(?:uction)?($|[_-])/i),
    ENABLE_DATABASE_SEEDING: z.literal("false"),
    ENABLE_DEMO_LOGIN: z.literal("false"),
    PRODUCTION_ADMIN_1_FULL_NAME: adminNameSchema,
    PRODUCTION_ADMIN_1_EMAIL: adminEmailSchema,
    PRODUCTION_ADMIN_1_PASSWORD: adminPasswordSchema,
    PRODUCTION_ADMIN_2_FULL_NAME: adminNameSchema,
    PRODUCTION_ADMIN_2_EMAIL: adminEmailSchema,
    PRODUCTION_ADMIN_2_PASSWORD: adminPasswordSchema,
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
    if (
      config.PRODUCTION_ADMIN_1_PASSWORD === config.PRODUCTION_ADMIN_2_PASSWORD
    ) {
      context.addIssue({
        code: "custom",
        path: ["PRODUCTION_ADMIN_2_PASSWORD"],
        message: "Production admin passwords must be different.",
      });
    }
  });

const collectionsThatMustBeEmpty = [
  "profile",
  "adminProfiles",
  "authCredentials",
  "accountRecovery",
  "serviceCases",
  "proSubscriptions",
  "stripeWebhookEvents",
] as const;

function assertUriDatabase(uri: string, databaseName: string) {
  const uriDatabase = decodeURIComponent(new URL(uri).pathname.slice(1));
  if (uriDatabase && uriDatabase !== databaseName) {
    throw new Error(
      "MONGODB_URI database does not match MONGODB_DATABASE; provisioning stopped.",
    );
  }
}

async function main() {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid production admin configuration: ${parsed.error.message}`,
    );
  }

  const config = parsed.data;
  assertUriDatabase(config.MONGODB_URI, config.MONGODB_DATABASE);
  const requestedAdmins = [
    {
      fullName: config.PRODUCTION_ADMIN_1_FULL_NAME,
      email: config.PRODUCTION_ADMIN_1_EMAIL,
      password: config.PRODUCTION_ADMIN_1_PASSWORD,
    },
    {
      fullName: config.PRODUCTION_ADMIN_2_FULL_NAME,
      email: config.PRODUCTION_ADMIN_2_EMAIL,
      password: config.PRODUCTION_ADMIN_2_PASSWORD,
    },
  ];

  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();

  try {
    const database = client.db(config.MONGODB_DATABASE);
    const initialized = await database
      .collection<SystemMetadataDocument>("systemMetadata")
      .findOne({ _id: "productionInitializedAt" });
    if (!initialized) {
      throw new Error(
        "Production database has not been initialized; provisioning stopped.",
      );
    }

    const counts = Object.fromEntries(
      await Promise.all(
        collectionsThatMustBeEmpty.map(async (name) => [
          name,
          await database.collection(name).countDocuments(),
        ]),
      ),
    ) as Record<(typeof collectionsThatMustBeEmpty)[number], number>;
    const nonEmptyCollections = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
    if (nonEmptyCollections.length > 0) {
      throw new Error(
        `Production admin provisioning is only allowed before launch; non-empty collections: ${nonEmptyCollections.join(", ")}.`,
      );
    }

    const identifierFilters = requestedAdmins.map((admin) => ({
      email: admin.email,
    }));
    const duplicateIdentifiers = await Promise.all([
      database.collection<ProfileIdentifierDocument>("profile").findOne({
        $or: identifierFilters,
      }),
      database.collection<ProfileIdentifierDocument>("adminProfiles").findOne({
        $or: identifierFilters,
      }),
    ]);
    if (duplicateIdentifiers.some(Boolean)) {
      throw new Error(
        "An account already uses the requested production admin identifier.",
      );
    }

    if (config.PRODUCTION_ADMIN_DRY_RUN) {
      console.log(
        JSON.stringify({
          ok: true,
          dryRun: true,
          database: config.MONGODB_DATABASE,
          adminsRequested: requestedAdmins.length,
          readyToProvision: true,
        }),
      );
      return;
    }

    const createdAt = new Date().toISOString();
    const adminsToCreate = requestedAdmins.map((admin) => {
      const id = `admin_${randomUUID()}`;
      const profile: AdminProfileDocument = {
        _id: id,
        id,
        role: "admin",
        fullName: admin.fullName,
        email: admin.email,
        locale: "zh-HK",
        createdAt,
        lastLoginAt: createdAt,
        status: "active",
        adminRole: "superAdmin",
        permissions: ["*"],
      };
      const credential: AuthCredentialDocument = {
        _id: id,
        userId: id,
        password: admin.password,
        isDemo: false,
      };
      return { id, profile, credential };
    });
    const adminIds = adminsToCreate.map((admin) => admin.id);

    try {
      await database
        .collection<AdminProfileDocument>("adminProfiles")
        .insertMany(adminsToCreate.map((admin) => admin.profile));
      await database
        .collection<AuthCredentialDocument>("authCredentials")
        .insertMany(adminsToCreate.map((admin) => admin.credential));

      await database
        .collection<SystemMetadataDocument>("systemMetadata")
        .updateOne(
          { _id: "productionAdminProvisionedAt" },
          { $setOnInsert: { value: createdAt } },
          { upsert: true },
        );
    } catch (error) {
      await Promise.allSettled([
        database
          .collection<AuthCredentialDocument>("authCredentials")
          .deleteMany({ _id: { $in: adminIds } }),
        database
          .collection<AdminProfileDocument>("adminProfiles")
          .deleteMany({ _id: { $in: adminIds } }),
      ]);
      throw error;
    }

    console.log(
      JSON.stringify({
        ok: true,
        dryRun: false,
        database: config.MONGODB_DATABASE,
        adminsCreated: adminsToCreate.length,
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
