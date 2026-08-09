import { describe, expect, it } from "vitest";

import { localizedRoleHomePath, roleHomePath } from "@/lib/auth";
import { getAdminNav, getCustomerNav, getProNav } from "@/lib/nav";
import {
  localizePathname,
  normalizeDuplicatedLocalePath,
} from "@/lib/routing-utils";

describe("routing helpers", () => {
  it("keeps portal nav hrefs locale-free so next-intl can prefix them once", () => {
    expect(
      getCustomerNav("zh-HK", "dashboard").map((item) => item.href),
    ).toEqual(["/customer", "/customer/requests/new", "/customer/orders"]);

    expect(getProNav("zh-HK", "dashboard").map((item) => item.href)).toEqual([
      "/pro",
      "/pro/leads",
      "/pro/calendar",
      "/pro/jobs",
      "/pro/billing",
    ]);

    expect(getAdminNav("zh-HK", "dashboard").map((item) => item.href)).toEqual([
      "/admin",
      "/admin/customers",
      "/admin/pros",
      "/admin/requests",
      "/admin/quotes",
      "/admin/calendar",
    ]);
  });

  it("separates locale-free and localized role home paths", () => {
    expect(roleHomePath("customer")).toBe("/customer");
    expect(roleHomePath("pro")).toBe("/pro");
    expect(roleHomePath("admin")).toBe("/admin");

    expect(localizedRoleHomePath("customer", "zh-HK")).toBe("/customer");
    expect(localizedRoleHomePath("pro", "zh-HK")).toBe("/pro");
  });

  it("normalizes repeated locale segments", () => {
    expect(
      normalizeDuplicatedLocalePath("/zh-HK/zh-HK/customer/requests/new"),
    ).toBe("/zh-HK/customer/requests/new");
    expect(normalizeDuplicatedLocalePath("/zh-HK/en/customer")).toBeNull();
    expect(normalizeDuplicatedLocalePath("/zh-HK/customer")).toBeNull();
  });

  it("rebuilds the current pathname for a new locale without duplication", () => {
    expect(localizePathname("/zh-HK", "zh-HK")).toBe("/");
    expect(localizePathname("/zh-HK/customer/orders", "zh-HK")).toBe(
      "/customer/orders",
    );
    expect(localizePathname("/customer/orders", "zh-HK")).toBe(
      "/customer/orders",
    );
  });
});
