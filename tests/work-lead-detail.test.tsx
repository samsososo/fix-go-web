import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkLeadDetail } from "@/features/pro/work-lead-detail";
import type { FacebookGroupSnapshot } from "@/lib/facebook-group-snapshots";

vi.mock("@/components/shared/portal-shell", () => ({
  PortalShell: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
const number = ["6123", "4567"].join("");
const base: FacebookGroupSnapshot = {
  id: "synthetic",
  sourceName: "Private source",
  title: "安裝電燈",
  message: "工作詳情",
  contactText: "",
  location: "香港",
  categoryId: "electrical",
  sourceUrl: "https://www.facebook.com/groups/test/",
  permalink: null,
  truncated: false,
};
function render(lead: FacebookGroupSnapshot) {
  return renderToStaticMarkup(
    <WorkLeadDetail lead={lead} locale="zh-HK" categoryLabel="電力工程" />,
  );
}

describe("work contact details", () => {
  it("offers call and WhatsApp links for an explicitly provided WhatsApp contact", () => {
    const html = render({ ...base, contactText: `WhatsApp ${number}` });
    expect(html).toContain(`href="tel:+852${number}"`);
    expect(html).toContain(`href="https://wa.me/852${number}"`);
    expect(html).toContain("工作詳情");
    expect(html).not.toContain("日期未確認");
    expect(html).not.toContain("Private source");
    expect(html).not.toContain("提交報價");
  });
  it("does not assume a telephone number is available on WhatsApp", () => {
    const html = render({ ...base, contactText: `電話 ${number}` });
    expect(html).toContain(`href="tel:+852${number}"`);
    expect(html).not.toContain("wa.me");
  });
  it("uses a manual fallback when the reviewed body has no contact, ignoring raw display fallback", () => {
    const html = render({ ...base, message: `Commenter WhatsApp ${number}` });
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("wa.me");
    expect(html).toContain("帖文未提供電話");
    expect(html).toContain('href="https://www.facebook.com/groups/test/"');
  });
});
