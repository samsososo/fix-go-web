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
  findOne: vi.fn(),
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
      return {
        collection: () => ({ find: state.find, findOne: state.findOne }),
      };
    }
  },
}));
import {
  getFacebookGroupSnapshot,
  listFacebookGroupSnapshots,
  toFacebookGroupSnapshot,
} from "@/lib/facebook-group-snapshots";

const snapshotId = "a".repeat(64);

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
  state.findOne.mockResolvedValue(null);
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
      expect(await getFacebookGroupSnapshot(snapshotId)).toBeNull();
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
    {
      policyDataValid: true,
      entitlement: { canCreateQuotes: false, canAcceptNewWork: true },
    },
  ])(
    "hides raw contacts when new-work access is unavailable",
    async (entitlement) => {
      state.entitlement.mockResolvedValue(entitlement);
      expect(await listFacebookGroupSnapshots()).toEqual([]);
      expect(await getFacebookGroupSnapshot(snapshotId)).toBeNull();
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
      expect(await getFacebookGroupSnapshot(snapshotId)).toBeNull();
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
    contactText: "Two lights to install",
    location: "Hong Kong",
    categoryId: "electrical",
  });
  expect(state.find.mock.calls[0][0]["intentReview.categoryId"]).toBe(
    "electrical",
  );
  expect(state.find.mock.calls[0][0]).not.toHaveProperty("sourceCreatedAt");
  expect(state.find.mock.calls[0][0]).not.toHaveProperty("needsDateReview");
});

describe("single Facebook snapshot access", () => {
  const reviewedRow = {
    _id: snapshotId,
    sourceName: "Synthetic Group",
    sourceUrl: "https://www.facebook.com/groups/test/",
    sourceMessage: "Post text followed by a comment-only contact",
    contentSha256: "current",
    intentReview: {
      version: 1,
      region: "HK",
      intent: "service_request",
      contentSha256: "current",
      displayText: "Reviewed post body",
    },
  };

  it.each(["", "not-an-id", "a".repeat(63), "$where", "g".repeat(64)])(
    "rejects an invalid snapshot identity before reading private data",
    async (id) => {
      expect(await getFacebookGroupSnapshot(id)).toBeNull();
      expect(state.connect).not.toHaveBeenCalled();
      expect(state.findOne).not.toHaveBeenCalled();
    },
  );

  it("queries the selected identity directly with all list eligibility restrictions", async () => {
    await listFacebookGroupSnapshots();
    const [listQuery, listOptions] = state.find.mock.calls[0];
    state.find.mockClear();
    state.findOne.mockResolvedValue(reviewedRow);

    const result = await getFacebookGroupSnapshot(snapshotId);

    expect(result).toMatchObject({
      id: snapshotId,
      message: "Reviewed post body",
      contactText: "Reviewed post body",
    });
    expect(state.find).not.toHaveBeenCalled();
    const [query, options] = state.findOne.mock.calls[0];
    expect({ ...query, $or: listQuery.$or }).toEqual({
      _id: snapshotId,
      ...listQuery,
    });
    expect(options).toEqual(listOptions);
    expect(query).toMatchObject({
      _id: snapshotId,
      sourceKind: "group_browser_snapshot",
      "intentReview.version": 1,
      "intentReview.region": "HK",
      "intentReview.intent": { $in: ["service_request", "recruitment"] },
      $expr: { $eq: ["$intentReview.contentSha256", "$contentSha256"] },
      verificationState: "pending_human_review",
      retentionState: { $nin: ["deleted", "deletion_requested", "expired"] },
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: expect.any(Date) } },
      ],
    });
    expect(options.projection).not.toHaveProperty("sourceLinks");
    expect(state.close).toHaveBeenCalledTimes(2);
  });

  it("returns null for an unknown or no-longer-eligible identity", async () => {
    expect(await getFacebookGroupSnapshot(snapshotId)).toBeNull();
    expect(state.close).toHaveBeenCalled();
  });

  it("rejects stale reviewed content even if the database returns it", async () => {
    state.findOne.mockResolvedValue({
      ...reviewedRow,
      contentSha256: "updated",
    });
    expect(await getFacebookGroupSnapshot(snapshotId)).toBeNull();
  });

  it("never uses an unreviewed feed body as direct-contact text", () => {
    const result = toFacebookGroupSnapshot({
      ...reviewedRow,
      intentReview: { ...reviewedRow.intentReview, displayText: undefined },
    });
    expect(result?.message).toContain("comment-only contact");
    expect(result?.contactText).toBe("");
  });

  it("closes the private database connection when detail lookup fails", async () => {
    state.findOne.mockRejectedValue(new Error("Synthetic database failure"));
    await expect(getFacebookGroupSnapshot(snapshotId)).rejects.toThrow(
      "Synthetic database failure",
    );
    expect(state.close).toHaveBeenCalled();
  });
});
