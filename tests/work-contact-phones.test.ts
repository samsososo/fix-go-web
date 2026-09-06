import { describe, expect, it } from "vitest";

import { extractWorkContactPhones } from "@/lib/work-contact-phones";

// Synthetic fixtures; these are not contact values copied from source posts.
const mobile = ["6123", "4567"].join("");
const other = ["9876", "5432"].join("");
const landline = ["2345", "6789"].join("");
const expected = (number: string, whatsapp: boolean) => ({
  phone: `+852${number}`,
  label: `${number.slice(0, 4)} ${number.slice(4)}`,
  whatsapp,
});

describe("reviewed work post contacts", () => {
  it.each(["WhatsApp", "what app聯繫：", "Wst", "wts", "WS", "WA"])(
    "recognizes explicit %s contact wording",
    (cue) => {
      expect(extractWorkContactPhones(`${cue} ${mobile}`)).toEqual([
        expected(mobile, true),
      ]);
    },
  );

  it("normalizes local, country-code and full-width phone formats", () => {
    expect(
      extractWorkContactPhones(
        `電話: (${landline.slice(0, 4)}) ${landline.slice(4)}`,
      ),
    ).toEqual([expected(landline, false)]);
    expect(
      extractWorkContactPhones(
        `Tel: (+852) ${mobile.slice(0, 4)}-${mobile.slice(4)}`,
      ),
    ).toEqual([expected(mobile, false)]);
    expect(extractWorkContactPhones(`聯絡：００８５２ ${mobile}`)).toEqual([
      expected(mobile, false),
    ]);
  });

  it("does not assume a telephone contact uses WhatsApp", () => {
    expect(
      extractWorkContactPhones(`致電 ${mobile}。WhatsApp 請另行查詢`),
    ).toEqual([expected(mobile, false)]);
  });

  it("accepts a WhatsApp abbreviation directly before the number", () => {
    expect(extractWorkContactPhones(`招聘師傅 Wst${mobile}`)).toEqual([
      expected(mobile, true),
    ]);
  });

  it("deduplicates repeated routes and preserves explicitly listed contacts", () => {
    expect(
      extractWorkContactPhones(
        `電話 ${mobile} / ${other}\nWhatsApp: +852 ${mobile}`,
      ),
    ).toEqual([expected(mobile, true), expected(other, false)]);
  });

  it("supports a contact cue on the next line or after the number", () => {
    expect(
      extractWorkContactPhones(`請聯絡：\n${mobile}\n${other} (WhatsApp)`),
    ).toEqual([expected(mobile, false), expected(other, true)]);
  });

  it.each([
    `https://wa.me/852${mobile}`,
    `wa.me/852${mobile}`,
    `https://api.whatsapp.com/send?phone=852${mobile}&text=hello`,
    `whatsapp://send?phone=%2B852${mobile}`,
  ])("extracts only the HK number from a valid WhatsApp route", (url) => {
    expect(extractWorkContactPhones(url)).toEqual([expected(mobile, true)]);
  });

  it("rejects wages, dates, foreign phones, identifiers and unrelated URLs", () => {
    expect(
      extractWorkContactPhones(
        [
          "月薪6000-9000；工程預算23456789",
          "WhatsApp 查詢，人工6000-9000",
          "聯絡日期 2026-09-06",
          `Phone: +44 ${mobile}`,
          `電話: +86 ${other}`,
          `工作編號 ${mobile}`,
          `https://example.invalid/phone/${mobile}`,
          `https://wa.me.evil.invalid/852${mobile}`,
          `https://wa.me/44${mobile}`,
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("does not extract contacts after an explicit comment section boundary", () => {
    expect(
      extractWorkContactPhones(
        `搵師傅安裝燈具\nComments\n留言者電話 ${mobile}`,
      ),
    ).toEqual([]);
  });
});
