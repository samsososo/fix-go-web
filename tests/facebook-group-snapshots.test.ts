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
        contentSha256: "synthetic-content-hash",
        intentReview: {
          version: 1,
          region: "HK",
          intent: "service_request",
          contentSha256: "synthetic-content-hash",
        },
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
      "intentReview.intent": { $in: ["service_request", "recruitment"] },
      "intentReview.version": 1,
      "intentReview.region": "HK",
      $expr: { $eq: ["$intentReview.contentSha256", "$contentSha256"] },
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
        contentSha256: "synthetic-content-hash",
        intentReview: {
          version: 1,
          region: "HK",
          intent: "service_request",
          contentSha256: "synthetic-content-hash",
        },
        sourceName: "Group",
        sourceMessage: "Text",
        sourceUrl: "https://www.facebook.com.example.invalid/groups/test/",
      }),
    ).toBeNull();
  });
});

describe("Facebook intent review", () => {
  it.each([
    undefined,
    {
      version: 1,
      region: "HK",
      intent: "service_ad",
      contentSha256: "current",
    },
    {
      version: 1,
      region: "HK",
      intent: "service_request",
      contentSha256: "old",
    },
    {
      version: 2,
      region: "HK",
      intent: "service_request",
      contentSha256: "current",
    },
  ])("hides unreviewed, excluded or stale decisions", (intentReview) => {
    expect(
      toFacebookGroupSnapshot({
        _id: "test",
        sourceName: "Group",
        sourceUrl: "https://www.facebook.com/groups/test/",
        sourceMessage: "想搵師傅",
        contentSha256: "current",
        intentReview,
      }),
    ).toBeNull();
  });
});

it("includes reviewed recruitment for tradespeople", () => {
  expect(
    toFacebookGroupSnapshot({
      _id: "recruit",
      sourceName: "Group",
      sourceUrl: "https://www.facebook.com/groups/test/",
      sourceMessage: "招聘電工",
      contentSha256: "current",
      intentReview: {
        version: 1,
        region: "HK",
        intent: "recruitment",
        contentSha256: "current",
      },
    }),
  ).not.toBeNull();
});

it.each([undefined, "unknown", "TW", "CN"])(
  "hides missing or non-Hong Kong locations (%s)",
  (region) => {
    expect(
      toFacebookGroupSnapshot({
        _id: "test",
        sourceName: "香港群組",
        sourceUrl: "https://www.facebook.com/groups/test/",
        sourceMessage: "想搵師傅",
        contentSha256: "current",
        intentReview: {
          version: 1,
          region,
          intent: "service_request",
          contentSha256: "current",
        },
      }),
    ).toBeNull();
  },
);

it("filters reviewed work by trade without requiring a confirmed posting date", async () => {
  state.rows.mockResolvedValue([
    {
      _id: "dated-test",
      sourceName: "Group",
      sourceUrl: "https://www.facebook.com/groups/test/",
      sourceMessage: "Raw body",
      sourceCreatedAt: null,
      needsDateReview: true,
      contentSha256: "current",
      intentReview: {
        version: 1,
        region: "HK",
        intent: "service_request",
        contentSha256: "current",
        title: "Install lights",
        displayText: "Two lights to install",
        displayLocation: "Hong Kong",
        categoryId: "electrical",
      },
    },
  ]);
  const result = await listFacebookGroupSnapshots("electrical");
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    title: "Install lights",
    message: "Two lights to install",
    location: "Hong Kong",
    categoryId: "electrical",
  });
  expect(state.find.mock.calls[0][0]["intentReview.categoryId"]).toBe(
    "electrical",
  );
  expect(state.find.mock.calls[0][0]).not.toHaveProperty("sourceCreatedAt");
  expect(state.find.mock.calls[0][0]).not.toHaveProperty("needsDateReview");
});
