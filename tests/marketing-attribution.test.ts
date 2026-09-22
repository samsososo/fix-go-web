import {
  encodeMarketingAttribution,
  getMarketingAttribution,
  readMarketingAttribution,
} from "@/lib/marketing-attribution";
import { describe, expect, it } from "vitest";

describe("marketing attribution", () => {
  it("keeps only supported, bounded campaign fields", () => {
    const result = getMarketingAttribution(
      new URLSearchParams(
        "utm_source=meta&utm_campaign=hk+launch&unknown=ignore&utm_content=" +
          "x".repeat(200),
      ),
    );

    expect(result).toEqual({
      utm_source: "meta",
      utm_campaign: "hk launch",
      utm_content: "x".repeat(120),
    });
  });

  it("round trips the cookie and rejects malformed values", () => {
    const value = encodeMarketingAttribution({
      utm_source: "google",
      gclid: "abc",
    });
    expect(readMarketingAttribution(value)).toEqual({
      utm_source: "google",
      gclid: "abc",
    });
    expect(readMarketingAttribution("bad")).toBeUndefined();
  });
});
