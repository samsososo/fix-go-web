import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FacebookGroupLeads } from "@/features/pro/facebook-group-leads";
import { WorkOpportunityCard } from "@/components/shared/work-opportunity-card";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => createElement("a", { href, className }, children),
}));

describe("unified work cards", () => {
  it("shows reviewed work without source sections or date warnings", () => {
    const html = renderToStaticMarkup(
      <FacebookGroupLeads
        locale="zh-HK"
        categoryOptions={[{ id: "electrical", label: "電力工程" }]}
        leads={[
          {
            id: "synthetic",
            sourceName: "Private Source Group",
            title: "搵師傅裝燈",
            message: "安裝兩盞燈",
            contactText: "",
            location: "香港",
            categoryId: "electrical",
            sourceUrl: "https://www.facebook.com/groups/test/",
            permalink: null,
            truncated: true,
          },
        ]}
      />,
    );
    expect(html).toContain("搵師傅裝燈");
    expect(html).toContain("電力工程");
    expect(html).toContain("查看詳情");
    expect(html).toContain('href="/pro/leads/work-synthetic"');
    expect(html).not.toContain('href="https://www.facebook.com/');
    expect(html).not.toContain("Private Source Group");
    expect(html).not.toContain("Facebook");
    expect(html).not.toContain("日期未確認");
    expect(html).not.toContain("<section");
    expect(html).not.toContain("<details");
  });
  it("keeps locked native cards visibly locked", () => {
    const html = renderToStaticMarkup(
      <WorkOpportunityCard
        title="維修"
        description="綁卡後查看"
        metadata={null}
        action="綁卡後查看詳情"
        locked
      />,
    );
    expect(html).toContain("綁卡後查看詳情");
    expect(html).toContain("lucide-lock-keyhole");
  });
});
