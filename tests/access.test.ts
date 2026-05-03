import { describe, expect, it } from "vitest";

import { canAccessPortal } from "@/lib/access";

describe("role access", () => {
  it("allows matching roles into their own portal", () => {
    expect(canAccessPortal("customer", "customer")).toBe(true);
    expect(canAccessPortal("pro", "pro")).toBe(true);
    expect(canAccessPortal("admin", "admin")).toBe(true);
  });

  it("blocks mismatched roles from protected portals", () => {
    expect(canAccessPortal("customer", "pro")).toBe(false);
    expect(canAccessPortal("pro", "admin")).toBe(false);
    expect(canAccessPortal("customer", ["customer", "admin"])).toBe(true);
    expect(canAccessPortal("pro", ["customer", "admin"])).toBe(false);
  });
});
