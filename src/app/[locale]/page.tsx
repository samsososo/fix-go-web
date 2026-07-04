import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  House,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getMarketingContent } from "@/lib/content";
import { listPublicCategories } from "@/lib/mock/repositories";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { ServiceStoryPanels } from "@/components/marketing/service-story-panels";
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

  const roleCards =
    locale === "en"
      ? [
          {
            icon: House,
            title: "For households",
            metric: "Post once, compare clearly",
            body: "Create a detailed request, add photos, collect structured quotes, and confirm a booking in one place.",
          },
          {
            icon: BriefcaseBusiness,
            title: "For professionals",
            metric: "Matched leads, less noise",
            body: "Set trade categories and service districts, review matched leads, and respond with clear pricing.",
          },
        ]
      : [
          {
            icon: House,
            title: "住戶端",
            metric: "一次提交，清楚比較",
            body: "以完整地址、相片與需求描述建立請求，集中比較結構化報價並確認訂單。",
          },
          {
            icon: BriefcaseBusiness,
            title: "師傅端",
            metric: "配對線索，減少雜訊",
            body: "設定工種與服務地區，查看配對工作機會，再以清晰價目提交報價。",
          },
        ];

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
      <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
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
            <h1 className="max-w-3xl font-display text-4xl font-extrabold tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl">
              {content.hero.title}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              {content.hero.description}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/signup"
              locale={locale}
              className={buttonVariants({ size: "lg" })}
            >
              {locale === "en" ? "Create an account" : "建立帳戶"}
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
              <li key={point} className="market-card px-4 py-4">
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

      <section className="mt-16">
        <div className="mb-7 max-w-3xl">
          <p className="eyebrow">
            {locale === "en" ? "From brief to booking" : "由需求到訂單"}
          </p>
          <h2 className="mt-4 section-title">
            {locale === "en"
              ? "A clearer way to explain the job, quote the work, and track the booking"
              : "講清楚工程、報清楚價錢、追蹤到訂單"}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted sm:text-base">
            {locale === "en"
              ? "Home repairs usually become messy when the request is vague, the price is unclear, or nobody knows the status. Hotfix keeps those details visible before anyone commits."
              : "家居維修最容易亂，通常係需求講唔清、報價唔透明、狀態冇人知。Hotfix 會在確認前把重點整理好。"}
          </p>
        </div>
        <ServiceStoryPanels locale={locale} />
      </section>

      <section className="mt-14 grid gap-5 lg:grid-cols-2">
        {roleCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="h-full">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft-accent text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/62">
                    {card.metric}
                  </p>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight">
                    {card.title}
                  </h2>
                </div>
                <p className="text-sm leading-7 text-muted">{card.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

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

      <section className="mt-16">
        <div className="max-w-3xl">
          <p className="eyebrow">
            {locale === "en" ? "How it works" : "使用流程"}
          </p>
          <h2 className="mt-4 section-title">
            {locale === "en"
              ? "Three clear steps from request to booking"
              : "由請求到接單，三步完成"}
          </h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {content.steps.map((step, index) => (
            <Card key={step.title} className="h-full">
              <CardContent className="space-y-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
                  0{index + 1}
                </span>
                <h3 className="font-display text-2xl font-extrabold tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm leading-7 text-muted">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
