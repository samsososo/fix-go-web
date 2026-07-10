import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMarketingContent } from "@/lib/content";
import {
  listPublicCategories,
  listRelevantLeads,
} from "@/lib/mock/repositories";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { WorkflowShowcase } from "@/components/marketing/workflow-showcase";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";
import { formatDistrictName } from "@/lib/hk-locale";
import { cn, formatCurrency } from "@/lib/utils";
import { User } from "@/types/domain";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/");
}

type ProLead = Awaited<ReturnType<typeof listRelevantLeads>>[number];

async function getHomeProLeads(user: User | null) {
  if (user?.role !== "pro") {
    return [];
  }

  try {
    const leads = await listRelevantLeads(user.id);
    return leads.filter((lead) => !lead.existingQuote).slice(0, 2);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const locale = (await getLocale()) as "zh-HK" | "en";
  const user = await getCurrentUser();
  const content = getMarketingContent(locale);
  const [categories, proLeads] = await Promise.all([
    listPublicCategories().then((items) => items.slice(0, 4)),
    getHomeProLeads(user),
  ]);
  const isLoggedInPro = user?.role === "pro";

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
            <span className="eyebrow">
              {isLoggedInPro
                ? locale === "en"
                  ? "Signed in as a pro"
                  : "你已登入師傅帳戶"
                : content.hero.eyebrow}
            </span>
            {!isLoggedInPro ? (
              <span className="match-chip">
                {locale === "en"
                  ? "Plumbing, electrical, aircon, renovation"
                  : "水喉、電力、冷氣、裝修雜項"}
              </span>
            ) : null}
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-balance font-display text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              {isLoggedInPro
                ? locale === "en"
                  ? "New home repair requests are waiting for your quote."
                  : "有新家居維修需求等緊你報價。"
                : content.hero.title}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              {isLoggedInPro
                ? locale === "en"
                  ? "You can still browse the public site, but your work actions stay visible so you never lose the path back to leads."
                  : "首頁仍然可以睇品牌同客戶內容，但師傅登入後第一眼要有返工作入口，唔會離開咗工作台咁。"
                : content.hero.description}
            </p>
          </div>

          {!isLoggedInPro ? (
            <div className="grid max-w-2xl gap-2 rounded-xl border border-primary/16 bg-surface-tint px-4 py-4 text-sm font-semibold text-foreground shadow-[0_12px_28px_rgba(24,36,51,0.05)] sm:grid-cols-3">
              {(locale === "en"
                ? [
                    "$0 quote arrangement",
                    "Multiple pros can respond",
                    "Compare before booking",
                  ]
                : ["$0 免費安排報價", "可比較多位師傅", "確認前先睇清楚"]
              ).map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={isLoggedInPro ? "/pro/leads" : "/auth/signup"}
              locale={locale}
              className={buttonVariants({ size: "lg" })}
            >
              {isLoggedInPro
                ? locale === "en"
                  ? "View job leads"
                  : "查看工作機會"
                : locale === "en"
                  ? "Arrange a free quote"
                  : "免費安排報價"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={isLoggedInPro ? "/pro" : "/categories"}
              locale={locale}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              {isLoggedInPro
                ? locale === "en"
                  ? "Back to overview"
                  : "返回師傅總覽"
                : locale === "en"
                  ? "Browse service categories"
                  : "瀏覽服務分類"}
            </Link>
          </div>

          {!isLoggedInPro ? (
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
          ) : null}
        </div>

        {isLoggedInPro ? (
          <ProHomeWidget locale={locale} leads={proLeads} />
        ) : (
          <HeroVisual locale={locale} />
        )}
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

function ProHomeWidget({
  locale,
  leads,
}: {
  locale: "zh-HK" | "en";
  leads: ProLead[];
}) {
  const urgentCount = leads.filter((lead) =>
    ["asap", "today"].includes(lead.urgency),
  ).length;

  return (
    <Card className="border-primary/24 bg-white/88 shadow-[0_18px_48px_rgba(24,36,51,0.11)]">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              {locale === "en" ? "Your job leads" : "你的工作機會"}
            </p>
            <h2 className="mt-2 font-display text-3xl font-extrabold">
              {locale === "en" ? "Ready to quote" : "可即時報價"}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              {locale === "en"
                ? "Matched requests stay visible even when you return to the public home page."
                : "就算返到首頁，配對到嘅需求都會繼續喺你眼前。"}
            </p>
          </div>
          <BriefcaseBusiness className="h-6 w-6 shrink-0 text-primary" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: locale === "en" ? "Unquoted" : "未報價",
              value: leads.length,
            },
            {
              label: locale === "en" ? "Urgent" : "急單",
              value: urgentCount,
            },
            {
              label: locale === "en" ? "Actions" : "入口",
              value: 2,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-surface-tint p-4">
              <p className="font-display text-3xl font-extrabold">
                {item.value}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted">
                {item.label}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3">
          {leads.length ? (
            leads.map((lead) => (
              <Link
                key={lead.id}
                href={`/pro/leads/${lead.id}`}
                locale={locale}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-2xl bg-surface-tint/65 p-3 transition hover:bg-surface-tint"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-primary">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    {formatDistrictName(lead.address.district, locale)} ·{" "}
                    {lead.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">
                    {lead.budgetMax
                      ? `${formatCurrency(lead.budgetMin ?? 0, locale)}-${formatCurrency(lead.budgetMax, locale)}`
                      : locale === "en"
                        ? "Flexible budget"
                        : "預算彈性"}
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white/58 px-4 py-5 text-sm leading-7 text-muted">
              {locale === "en"
                ? "No matched leads right now. Check the leads page for filters."
                : "暫時未有配對需求，可以去工作機會頁篩選其他分類。"}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/pro/leads"
            locale={locale}
            className={cn(buttonVariants({ size: "sm" }), "w-full")}
          >
            <BriefcaseBusiness className="h-4 w-4" />
            {locale === "en" ? "Job leads" : "工作機會"}
          </Link>
          <Link
            href="/pro/calendar"
            locale={locale}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full",
            )}
          >
            <CalendarDays className="h-4 w-4" />
            {locale === "en" ? "Schedule" : "日程"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
