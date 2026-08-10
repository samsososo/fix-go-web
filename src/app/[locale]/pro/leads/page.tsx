import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { getCurrentUser } from "@/lib/auth";
import { formatUrgencyLabel } from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import {
  listCategoryOptions,
  listRelevantLeads,
} from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

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
      <form
        action="/pro/leads"
        className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-card/90 p-4 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="lead-category-filter"
            className="text-sm font-semibold text-muted"
          >
            {locale === "en" ? "Category filter" : "分類篩選"}
          </label>
          <Select
            id="lead-category-filter"
            name="category"
            defaultValue={activeCategory}
            className="mt-2"
          >
            <option value="all">
              {locale === "en" ? "All categories" : "全部分類"}
            </option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" className="sm:w-auto">
          {locale === "en" ? "Apply" : "套用"}
        </Button>
      </form>
      <div className="grid gap-5">
        {leads.length ? (
          leads.map((lead) => (
            <a key={lead.id} href={`/pro/leads/${lead.id}`} className="block">
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-2xl font-bold">
                        {lead.title}
                      </p>
                      <p className="text-sm text-muted">
                        {lead.customer.fullName} ·{" "}
                        {formatDistrictName(lead.address.district, locale)} ·{" "}
                        {lead.category?.name[locale as "zh-HK" | "en"]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {lead.existingQuote ? (
                        <span className="text-xs text-muted">
                          {locale === "en"
                            ? "Quote already sent"
                            : "已提交報價"}
                        </span>
                      ) : null}
                      <StatusBadge status={lead.status} locale={locale} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Urgency" : "緊急程度"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatUrgencyLabel(lead.urgency, locale)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Budget" : "預算"}
                      </p>
                      <p className="mt-2 text-muted">
                        {lead.budgetMax
                          ? `HK$${lead.budgetMin ?? 0} - HK$${lead.budgetMax}`
                          : locale === "en"
                            ? "Flexible"
                            : "彈性處理"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {canCreateQuotes
                          ? locale === "en"
                            ? "Open lead"
                            : "查看詳情"
                          : locale === "en"
                            ? "Quote record"
                            : "報價紀錄"}
                      </p>
                      <p className="mt-2 text-muted">
                        {canCreateQuotes
                          ? locale === "en"
                            ? "Review scope and send quote"
                            : "查看工作範圍及提交報價"
                          : locale === "en"
                            ? "Review your submitted quote"
                            : "查看你已提交嘅報價"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
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
