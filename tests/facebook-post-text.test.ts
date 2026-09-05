import { describe, expect, it } from "vitest";
import { cleanFacebookPostText } from "@/lib/facebook-post-text";

describe("Facebook visible post text", () => {
  it("removes duplicated branding, obfuscated timestamp and composer from a captured card", () => {
    const body = "#訂製工具箱\n可訂製大小、隔板及輪子… See more";
    const raw = [
      ...Array(33).fill("Facebook"),
      "Synthetic Author",
      ..."Spotnerdosu6ic3tf308504fc".split("").map((x) => x + "\u034f"),
      "&#x20;",
      "·",
      body,
      "See translation",
      "+5",
      "Comment as Test User",
      ...Array(11).fill("Facebook"),
    ].join("\n");
    expect(cleanFacebookPostText(raw)).toBe(
      "#訂製工具箱\n可訂製大小、隔板及輪子…",
    );
  });
  it("preserves contact routes, prices, units, hashtags and ordinary single-character lines", () => {
    const phone = ["6123", "4567"].join("");
    const email = ["jobs", "example.invalid"].join("@");
    const body = `#水喉維修\nWhatsApp https://wa.me/852${phone}\n電話 ${phone}\n電郵 ${email}\n日薪 HK$1,200\n厚度1.5MM\n1\n2\nFacebook 廣告製作`;
    expect(cleanFacebookPostText(body)).toBe(body);
  });
  it("removes single-line obfuscation but keeps Chinese text with invisible marks", () => {
    expect(
      cleanFacebookPostText(
        "S\u034fp\u034fo\u034fn\u034fs\u034f\n搵\u034f水喉師傅",
      ),
    ).toBe("搵水喉師傅");
  });
  it("returns empty text for a container with no usable body", () => {
    expect(
      cleanFacebookPostText(
        "Facebook\nFacebook\n·\nSee translation\n+5\nComment as Test User",
      ),
    ).toBe("");
  });
});
