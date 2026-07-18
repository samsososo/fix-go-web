import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";

describe("SEO discovery", () => {
  it("lists only the public marketing pages in the sitemap", () => {
    const entries = sitemap();

    expect(entries.map((entry) => new URL(entry.url).pathname)).toEqual([
      "/",
      "/how-it-works",
      "/categories",
      "/become-a-pro",
      "/faq",
    ]);
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
  });
});
