import { describe, expect, it } from "vitest";

import { requestFormSchema } from "@/lib/validation";

const oneCharacterRequest = {
  title: "修",
  description: "漏",
  categoryId: "plumbing",
  subcategoryId: "leak",
  urgency: "asap" as const,
  scheduledDate: "",
  budgetMin: undefined,
  budgetMax: undefined,
  accessNotes: "",
  attachmentNames: [],
  address: {
    district: "南",
    area: "村",
    buildingEstate: "樓",
    block: "",
    floor: "",
    flatRoom: "",
    landmarkNotes: "",
  },
};

describe("request form validation", () => {
  it("accepts one-character required text fields", () => {
    expect(requestFormSchema.safeParse(oneCharacterRequest).success).toBe(true);
  });

  it.each([
    ["title", { title: "   " }],
    ["description", { description: "   " }],
    [
      "district",
      { address: { ...oneCharacterRequest.address, district: " " } },
    ],
    ["area", { address: { ...oneCharacterRequest.address, area: " " } }],
    [
      "buildingEstate",
      { address: { ...oneCharacterRequest.address, buildingEstate: " " } },
    ],
  ])("keeps %s required while removing length limits", (_field, override) => {
    expect(
      requestFormSchema.safeParse({
        ...oneCharacterRequest,
        ...override,
      }).success,
    ).toBe(false);
  });
});
