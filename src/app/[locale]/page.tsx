import {
  ArrowRight,
  BadgeCheck,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getMarketingContent } from "@/lib/content";
import { listPublicCategories } from "@/lib/mock/repositories";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { WorkflowShowcase } from "@/components/marketing/workflow-showcase";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/");
}

export default async function HomePage() {
  const locale = (await getLocale()) as "zh-HK" | "en";
  const content = getMarketingContent(locale);
  const categories = (await listPublicCategories()).slice(0, 4);

  const trustPoints =
    locale === "en"
      ? [
          "Structured Hong Kong addresses with district and area fields",
          "Role-based workspaces for households and professionals",
          "Quote comparison built around labour, parts, and call-out fees",
        ]
      : [
          "香港地址欄位完整支援地區、分區與大廈資訊",
          "客戶與師傅採用清晰分工的工作台",
          "報價清楚拆分人工、物料與上門費用",
        ];

  return (
    <div className="content-wrap py-10 sm:py-14">
      <section className="grid gap-10 lg:grid-cols-[0.9fr_1fr] lg:items-center lg:gap-14">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className="eyebrow">{content.hero.eyebrow}</span>
            <span className="match-chip">
              {locale === "en"
                ? "Plumbing, electrical, aircon, renovation"
                : "水喉、電力、冷氣、裝修雜項"}
            </span>
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-balance font-display text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              {content.hero.title}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              {content.hero.description}
            </p>
          </div>

          <div className="grid max-w-2xl gap-2 rounded-xl border border-primary/16 bg-surface-tint px-4 py-4 text-sm font-semibold text-foreground shadow-[0_12px_28px_rgba(24,36,51,0.05)] sm:grid-cols-3">
            {(locale === "en"
              ? [
                  "$0 quote arrangement",
                  "Multiple pros can respond",
                  "Compare before booking",
                ]
              : [
                  "$0 免費安排報價",
                  "可比較多位師傅",
                  "確認前先睇清楚",
                ]
            ).map((item) => (
              <div key={item} className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/signup"
              locale={locale}
              className={buttonVariants({ size: "lg" })}
            >
              {locale === "en" ? "Arrange a free quote" : "免費安排報價"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/categories"
              locale={locale}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              {locale === "en" ? "Browse service categories" : "瀏覽服務分類"}
            </Link>
          </div>

          <ul className="grid gap-3 text-sm text-muted sm:grid-cols-3">
            {content.valuePoints.map((point) => (
              <li
                key={point}
                className="rounded-xl border border-line/70 bg-card/90 px-4 py-4 shadow-[0_10px_26px_rgba(24,36,51,0.05)]"
              >
                <div className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-success" />
                  <span>{point}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual locale={locale} />
      </section>

      <WorkflowShowcase locale={locale} />

      <section className="mt-16 grid gap-8 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="surface-panel p-6 sm:p-8">
          <p className="eyebrow">
            {locale === "en" ? "Trust & clarity" : "信任與透明度"}
          </p>
          <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight">
            {locale === "en"
              ? "Built for real Hong Kong homes, buildings, and service visits."
              : "按香港住宅、大廈出入及上門維修流程而設。"}
          </h2>
          <ul className="mt-6 space-y-4">
            {trustPoints.map((point) => (
              <li
                key={point}
                className="flex gap-3 rounded-2xl bg-surface-tint px-4 py-4 text-sm leading-7 text-foreground"
              >
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                {locale === "en" ? "Popular trades" : "熱門工種"}
              </p>
              <h2 className="mt-4 section-title">
                {locale === "en"
                  ? "Start from the right category"
                  : "由正確工種開始建立請求"}
              </h2>
            </div>
            <Link
              href="/categories"
              locale={locale}
              className="text-sm font-semibold text-primary"
            >
              {locale === "en" ? "View all categories" : "查看全部分類"}
            </Link>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {categories.map((category) => (
              <Card key={category.id}>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                        {category.id}
                      </p>
                      <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
                        {category.name[locale]}
                      </h3>
                    </div>
                    <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-semibold text-primary">
                      {category.subcategories.length}{" "}
                      {locale === "en" ? "services" : "項服務"}
                    </span>
                  </div>
                  <p className="text-sm leading-7 text-muted">
                    {category.description[locale]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {category.subcategories.slice(0, 3).map((subcategory) => (
                      <span
                        key={subcategory.id}
                        className="rounded-full border border-line bg-white/90 px-3 py-1 text-xs"
                      >
                        {subcategory.name[locale]}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
