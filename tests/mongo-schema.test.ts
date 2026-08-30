import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";

import {
  finalizeMongoSchemaMigration,
  inspectMongoSchema,
  migrateMongoSubscriptionSchema,
  mongoSchemaCollections,
} from "@/lib/mock/mongo-db";
import { listProSubscriptions, readDb } from "@/lib/mock/db";
import { env } from "@/lib/env";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

describe("consolidated MongoDB schema", () => {
  beforeAll(async () => {
    await resetMockDb();
    await finalizeMongoSchemaMigration();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("uses only the 13 approved camelCase collections", async () => {
    const schema = await inspectMongoSchema();

    expect(schema.names).toEqual([...mongoSchemaCollections].sort());
  });

  it("preserves profiles, configuration, service cases, and nested jobs", async () => {
    const schema = await inspectMongoSchema();
    const state = await readDb();

    expect(schema.counts.profile).toBe(4);
    expect(schema.counts.adminProfiles).toBe(1);
    expect(schema.counts.appConfig).toBe(23);
    expect(schema.counts.serviceCases).toBe(1);
    expect(schema.counts.proSubscriptions).toBe(2);
    expect(schema.counts.stripeWebhookEvents).toBe(0);
    expect(state.users).toHaveLength(5);
    expect(state.categories).toHaveLength(5);
    expect(state.districts).toHaveLength(18);
    expect(state.requests).toHaveLength(1);
    expect(state.quotes).toHaveLength(1);
    expect(state.bookings).toHaveLength(1);
    expect(state.bookingStatusEvents).toHaveLength(1);
  });

  it("migrates a real version-2 database without granting trials", async () => {
    if (!env.MONGODB_URI) {
      throw new Error("MONGODB_URI is required for the Mongo schema test.");
    }
    const client = await new MongoClient(env.MONGODB_URI).connect();
    try {
      const db = client.db(env.MONGODB_DATABASE);
      await Promise.all([
        db.collection("proSubscriptions").deleteMany({}),
        db.collection("stripeWebhookEvents").deleteMany({}),
        db
          .collection<{ _id: string; value: string }>("systemMetadata")
          .updateOne(
            { _id: "schemaVersion" },
            { $set: { value: "2" } },
            { upsert: true },
          ),
      ]);
    } finally {
      await client.close();
    }

    await expect(migrateMongoSubscriptionSchema()).resolves.toEqual({
      version: "3",
      subscriptions: 2,
    });
    const subscriptions = await listProSubscriptions();
    expect(subscriptions).toHaveLength(2);
    subscriptions.forEach((subscription) => {
      expect(subscription.accessStatus).toBe("setup_required");
      expect(subscription.trialConsumedAt).toBeUndefined();
      expect(subscription.trialStartedAt).toBeUndefined();
    });
  });
});
