import { getLocale } from "next-intl/server";
import { ArrowRight, Clock3, MapPin, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatUrgencyLabel } from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import {
  listCategoryOptions,
  listRelevantLeads,
} from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import { cn } from "@/lib/utils";

export default async function ProLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const locale = await getLocale();
  const { category } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const subscriptionSnapshot = await getProSubscriptionEntitlement(user.id);
  const canCreateQuotes = subscriptionSnapshot.entitlement.canCreateQuotes;

  const categoryOptions = await listCategoryOptions(locale as "zh-HK" | "en");
  const activeCategory = categoryOptions.some((entry) => entry.id === category)
    ? category
    : "all";
  const leads = await listRelevantLeads(
    user.id,
    activeCategory === "all" ? undefined : activeCategory,
  );

  return (
    <PortalShell
      locale={locale}
      title={
        canCreateQuotes
          ? locale === "en"
            ? "Job leads"
            : "工作機會"
          : locale === "en"
            ? "Quote records"
            : "報價紀錄"
      }
      subtitle={
        canCreateQuotes
          ? locale === "en"
            ? "Review open customer requests, filter by category, and submit a structured quote."
            : "查看開放服務需求，可按分類篩選並提交結構化報價。"
          : locale === "en"
            ? "New customer leads are hidden. You can still review quotes you previously submitted."
            : "新客戶工作機會已隱藏；你仍可查看之前提交嘅報價紀錄。"
      }
      navItems={getProNav(locale, "leads")}
    >
      <section className="mb-4 rounded-2xl border border-line/80 bg-card/90 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-semibold text-muted">
            {locale === "en" ? "Filter by category" : "按分類篩選"}
          </p>
          <p className="text-xs font-semibold text-primary">
            {locale === "en"
              ? `${leads.length} results`
              : `${leads.length} 個結果`}
          </p>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/pro/leads"
            locale={locale}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold",
              activeCategory === "all"
                ? "border-primary bg-primary !text-white"
                : "border-line bg-white text-foreground/72",
            )}
          >
            {locale === "en" ? "All" : "全部"}
          </Link>
          {categoryOptions.map((option) => (
            <Link
              key={option.id}
              href={`/pro/leads?category=${encodeURIComponent(option.id)}`}
              locale={locale}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold",
                activeCategory === option.id
                  ? "border-primary bg-primary !text-white"
                  : "border-line bg-white text-foreground/72",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:gap-5">
        {leads.length ? (
          leads.map((lead) => (
            <Link
              key={lead.id}
              href={`/pro/leads/${lead.id}`}
              locale={locale}
              className="block"
            >
              <Card>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold sm:text-2xl">
                        {lead.title}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} locale={locale} />
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-muted">
                    {lead.description}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-foreground/68">
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-primary" />
                      {formatUrgencyLabel(lead.urgency, locale)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      {formatDistrictName(lead.address.district, locale)}
                    </span>
                    <span className="rounded-full bg-surface-tint px-2.5 py-1.5">
                      {lead.category?.name[locale as "zh-HK" | "en"]}
                    </span>
                    {lead.attachmentIds.length ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-primary" />
                        {locale === "en"
                          ? `${lead.attachmentIds.length} file`
                          : `${lead.attachmentIds.length} 張相`}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-end justify-between gap-3 border-t border-line/70 pt-3">
                    <div>
                      <p className="text-xs text-muted">
                        {locale === "en" ? "Budget" : "預算"}
                      </p>
                      <p className="font-display text-lg font-bold">
                        {lead.budgetMax
                          ? `HK$${lead.budgetMin ?? 0}–${lead.budgetMax}`
                          : locale === "en"
                            ? "Flexible"
                            : "彈性處理"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                      {lead.existingQuote
                        ? locale === "en"
                          ? "View quote"
                          : "查看報價"
                        : canCreateQuotes
                          ? locale === "en"
                            ? "Quote"
                            : "報價"
                          : locale === "en"
                            ? "View"
                            : "查看"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : (
          <EmptyState
            locale={locale}
            title={
              canCreateQuotes
                ? locale === "en"
                  ? "No open leads right now"
                  : "暫時未有開放工作機會"
                : locale === "en"
                  ? "No quote records to show"
                  : "暫時未有報價紀錄"
            }
            description={
              canCreateQuotes
                ? locale === "en"
                  ? "Try another category or check back when new customer requests arrive."
                  : "可以改用其他分類，或稍後查看新的客戶需求。"
                : locale === "en"
                  ? "Existing jobs and billing remain available from the pro workspace."
                  : "你仍可喺師傅工作台處理現有訂單同管理月費。"
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
