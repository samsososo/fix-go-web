import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  env: {
    MONGODB_DATABASE: "hotfix_dev",
    MONGODB_URI: "mongodb://localhost/hotfix_dev",
  },
  user: vi.fn(),
  entitlement: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  find: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.user }));
vi.mock("@/lib/pro-subscription-entitlement", () => ({
  getProSubscriptionEntitlement: state.entitlement,
}));
vi.mock("mongodb", () => ({
  MongoClient: class {
    connect = state.connect;
    close = state.close;
    db() {
      return { collection: () => ({ find: state.find }) };
    }
  },
}));
import {
  listFacebookGroupSnapshots,
  toFacebookGroupSnapshot,
} from "@/lib/facebook-group-snapshots";

beforeEach(() => {
  vi.clearAllMocks();
  state.env.MONGODB_DATABASE = "hotfix_dev";
  state.env.MONGODB_URI = "mongodb://localhost/hotfix_dev";
  state.user.mockResolvedValue({ id: "synthetic-pro", role: "pro" });
  state.entitlement.mockResolvedValue({
    policyDataValid: true,
    entitlement: { canCreateQuotes: true, canAcceptNewWork: true },
  });
  state.rows.mockResolvedValue([]);
  state.find.mockReturnValue({
    sort: () => ({ limit: () => ({ toArray: state.rows }) }),
  });
});

describe("DEV Facebook snapshot access", () => {
  it.each([null, { id: "synthetic-customer", role: "customer" }])(
    "does not query private data for a non-pro",
    async (user) => {
      state.user.mockResolvedValue(user);
      expect(await listFacebookGroupSnapshots()).toEqual([]);
      expect(state.connect).not.toHaveBeenCalled();
    },
  );
  it.each([
    {
      policyDataValid: false,
      entitlement: { canCreateQuotes: true, canAcceptNewWork: true },
    },
    {
      policyDataValid: true,
      entitlement: { canCreateQuotes: false, canAcceptNewWork: false },
    },
    {
      policyDataValid: true,
      entitlement: { canCreateQuotes: true, canAcceptNewWork: false },
    },
  ])(
    "hides raw contacts when new-work access is unavailable",
    async (entitlement) => {
      state.entitlement.mockResolvedValue(entitlement);
      expect(await listFacebookGroupSnapshots()).toEqual([]);
      expect(state.connect).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["hotfix_prod", "mongodb://localhost/hotfix_prod"],
    ["hotfix_dev", "mongodb://localhost/hotfix_prod"],
    ["hotfix_dev", "mongodb://localhost/hotfix_dev?authSource=hotfix_prod"],
  ])(
    "never reads a production or mismatched database",
    async (database, uri) => {
      state.env.MONGODB_DATABASE = database;
      state.env.MONGODB_URI = uri;
      expect(await listFacebookGroupSnapshots()).toEqual([]);
      expect(state.connect).not.toHaveBeenCalled();
    },
  );
  it("returns only display fields and excludes expired/deleted snapshots in the query", async () => {
    state.rows.mockResolvedValue([
      {
        _id: "synthetic",
        sourceName: "Synthetic Group",
        sourceMessage: "Synthetic visible work description",
        sourceUrl: "https://www.facebook.com/groups/synthetic/",
        sourcePermalink: "javascript:alert(1)",
        inputSha256: "private-metadata",
      },
    ]);
    const result = await listFacebookGroupSnapshots();
    expect(result).toHaveLength(1);
    expect(result[0].permalink).toBeNull();
    expect(result[0]).not.toHaveProperty("inputSha256");
    expect(state.find.mock.calls[0][0]).toMatchObject({
      retentionState: { $nin: ["deleted", "deletion_requested", "expired"] },
    });
    expect(state.find.mock.calls[0][0].$or[1].expiresAt.$gt).toBeInstanceOf(
      Date,
    );
    expect(state.close).toHaveBeenCalled();
  });
  it("rejects external hosts and unsafe source URLs", () => {
    expect(
      toFacebookGroupSnapshot({
        _id: "synthetic",
        sourceName: "Group",
        sourceMessage: "Text",
        sourceUrl: "https://www.facebook.com.example.invalid/groups/test/",
      }),
    ).toBeNull();
  });
});
