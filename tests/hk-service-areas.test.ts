import { describe, expect, it } from "vitest";

import {
  createHongKongServiceAreas,
  hongKongAreaNamesZh,
  hongKongDistrictNamesZh,
} from "@/lib/hk-service-areas";

const officialDistricts = [
  "Central and Western",
  "Eastern",
  "Southern",
  "Wan Chai",
  "Kowloon City",
  "Yau Tsim Mong",
  "Sham Shui Po",
  "Wong Tai Sin",
  "Kwun Tong",
  "Tai Po",
  "Yuen Long",
  "Tuen Mun",
  "North",
  "Sai Kung",
  "Sha Tin",
  "Tsuen Wan",
  "Kwai Tsing",
  "Islands",
];

describe("Hong Kong service areas", () => {
  it("contains all 18 official districts once", () => {
    const districts = createHongKongServiceAreas();

    expect(districts.map((entry) => entry.district)).toEqual(officialDistricts);
    expect(new Set(districts.map((entry) => entry.district)).size).toBe(18);
    expect(districts.every((entry) => entry.areas.length >= 5)).toBe(true);
  });

  it("assigns Kwai Fong and Tsing Yi to Kwai Tsing instead of Tsuen Wan", () => {
    const districts = createHongKongServiceAreas();
    const tsuenWan = districts.find((entry) => entry.district === "Tsuen Wan");
    const kwaiTsing = districts.find(
      (entry) => entry.district === "Kwai Tsing",
    );

    expect(tsuenWan?.areas).not.toEqual(
      expect.arrayContaining(["Kwai Fong", "Tsing Yi"]),
    );
    expect(kwaiTsing?.areas).toEqual(
      expect.arrayContaining(["Kwai Fong", "Tsing Yi"]),
    );
  });

  it("provides Traditional Chinese labels for every configured option", () => {
    const districts = createHongKongServiceAreas();

    districts.forEach((district) => {
      expect(hongKongDistrictNamesZh[district.district]).toBeTruthy();
      district.areas.forEach((area) => {
        expect(hongKongAreaNamesZh[area]).toBeTruthy();
      });
    });
  });

  it("returns fresh arrays so request state cannot mutate the shared config", () => {
    const first = createHongKongServiceAreas();
    first[0].areas.push("Test only");

    expect(createHongKongServiceAreas()[0].areas).not.toContain("Test only");
  });
});
