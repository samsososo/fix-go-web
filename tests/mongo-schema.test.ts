import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  finalizeMongoSchemaMigration,
  inspectMongoSchema,
  mongoSchemaCollections,
} from "@/lib/mock/mongo-db";
import { readDb } from "@/lib/mock/db";
import { closeMockDb, resetMockDb } from "./helpers/mock-db";

describe("consolidated MongoDB schema", () => {
  beforeAll(async () => {
    await resetMockDb();
    await finalizeMongoSchemaMigration();
  });

  afterAll(async () => {
    await closeMockDb();
  });

  it("uses only the 11 approved camelCase collections", async () => {
    const schema = await inspectMongoSchema();

    expect(schema.names).toEqual([...mongoSchemaCollections].sort());
  });

  it("preserves profiles, configuration, service cases, and nested jobs", async () => {
    const schema = await inspectMongoSchema();
    const state = await readDb();

    expect(schema.counts.profile).toBe(4);
    expect(schema.counts.adminProfiles).toBe(1);
    expect(schema.counts.appConfig).toBe(13);
    expect(schema.counts.serviceCases).toBe(1);
    expect(state.users).toHaveLength(5);
    expect(state.categories).toHaveLength(5);
    expect(state.districts).toHaveLength(8);
    expect(state.requests).toHaveLength(1);
    expect(state.quotes).toHaveLength(1);
    expect(state.bookings).toHaveLength(1);
    expect(state.bookingStatusEvents).toHaveLength(1);
  });
});
