import { describe, expect, it } from "vitest";

import {
  formatRequestWhatsAppMessage,
  formatWhatsAppUrl,
} from "@/lib/formatters";

describe("formatters", () => {
  it("builds WhatsApp contact links from Hong Kong mobile numbers", () => {
    expect(formatWhatsAppUrl("91234567")).toBe("https://wa.me/85291234567");
    expect(formatWhatsAppUrl("+852 9123 4567")).toBe(
      "https://wa.me/85291234567",
    );
    expect(formatWhatsAppUrl("123")).toBeUndefined();
  });

  it("adds an encoded prefilled message to WhatsApp links", () => {
    const message = "你好，我想跟進以下工作：\n工作：水喉漏水";
    const url = formatWhatsAppUrl("91234567", message);

    expect(url).toBeTruthy();
    expect(new URL(url!).searchParams.get("text")).toBe(message);
  });

  it("formats concise request details for WhatsApp", () => {
    const message = formatRequestWhatsAppMessage({
      locale: "zh-HK",
      context: "lead",
      title: `浴室漏水${"很".repeat(200)}`,
      category: "水喉維修",
      area: "觀塘區 · 藍田",
      urgency: "盡快",
      reference: "req_123",
      detailUrl: "https://example.com/customer/requests/req_123",
    });

    expect(message).toContain("工作：浴室漏水");
    expect(message).toContain("分類：水喉維修");
    expect(message).toContain("地區：觀塘區 · 藍田");
    expect(message).toContain("緊急程度：盡快");
    expect(message).toContain("參考編號：req_123");
    expect(message).toContain(
      "詳情：https://example.com/customer/requests/req_123",
    );
    expect(message).toContain("…");
    expect(message.length).toBeLessThan(400);
  });
});
