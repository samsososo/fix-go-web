import { describe, expect, it } from "vitest";

import { formatWhatsAppUrl } from "@/lib/formatters";

describe("formatters", () => {
  it("builds WhatsApp contact links from Hong Kong mobile numbers", () => {
    expect(formatWhatsAppUrl("91234567")).toBe("https://wa.me/85291234567");
    expect(formatWhatsAppUrl("+852 9123 4567")).toBe(
      "https://wa.me/85291234567",
    );
    expect(formatWhatsAppUrl("123")).toBeUndefined();
  });
});
