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
    ).toEqual([
      "/customer",
      "/customer/requests/new",
      "/customer/orders",
      "/customer/messages",
      "/customer/profile",
    ]);

    expect(getProNav("zh-HK", "dashboard").map((item) => item.href)).toEqual([
      "/pro",
      "/pro/profile",
      "/pro/leads",
      "/pro/jobs",
      "/pro/earnings",
    ]);

    expect(getAdminNav("zh-HK", "dashboard").map((item) => item.href)).toEqual([
      "/admin",
      "/admin/customers",
      "/admin/pros",
      "/admin/requests",
      "/admin/quotes",
    ]);
  });

  it("separates locale-free and localized role home paths", () => {
    expect(roleHomePath("customer")).toBe("/customer");
    expect(roleHomePath("pro")).toBe("/pro");
    expect(roleHomePath("admin")).toBe("/admin");

    expect(localizedRoleHomePath("customer", "zh-HK")).toBe("/zh-HK/customer");
    expect(localizedRoleHomePath("pro", "en")).toBe("/en/pro");
  });

  it("normalizes repeated locale segments", () => {
    expect(
      normalizeDuplicatedLocalePath("/zh-HK/zh-HK/customer/requests/new"),
    ).toBe("/zh-HK/customer/requests/new");
    expect(normalizeDuplicatedLocalePath("/en/en/pro")).toBe("/en/pro");
    expect(normalizeDuplicatedLocalePath("/zh-HK/en/customer")).toBe(
      "/en/customer",
    );
    expect(normalizeDuplicatedLocalePath("/zh-HK/customer")).toBeNull();
  });

  it("rebuilds the current pathname for a new locale without duplication", () => {
    expect(localizePathname("/zh-HK", "en")).toBe("/en");
    expect(localizePathname("/en/customer/orders", "zh-HK")).toBe(
      "/zh-HK/customer/orders",
    );
    expect(localizePathname("/customer/orders", "zh-HK")).toBe(
      "/zh-HK/customer/orders",
    );
  });
});
