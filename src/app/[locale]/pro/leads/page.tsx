import { getLocale } from "next-intl/server";
import { Clock3, LockKeyhole, MapPin, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkOpportunityCard } from "@/components/shared/work-opportunity-card";
import { Link } from "@/i18n/navigation";
import { FacebookGroupLeads } from "@/features/pro/facebook-group-leads";
import { listFacebookGroupSnapshots } from "@/lib/facebook-group-snapshots";
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
  const isSetupRequired =
    subscriptionSnapshot.entitlement.status === "setup_required";

  const categoryOptions = await listCategoryOptions(locale as "zh-HK" | "en");
  const activeCategory = categoryOptions.some((entry) => entry.id === category)
    ? category
    : "all";
  const leads = await listRelevantLeads(
    user.id,
    activeCategory === "all" ? undefined : activeCategory,
  );

  const facebookLeads = await listFacebookGroupSnapshots(
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
          : isSetupRequired
            ? locale === "en"
              ? "Job lead preview"
              : "工作機會預覽"
            : locale === "en"
              ? "Quote records"
              : "報價紀錄"
      }
      subtitle={
        canCreateQuotes
          ? locale === "en"
            ? "Browse work opportunities and recruitment, filter by category, and open the details to follow up."
            : "睇工程需求同師傅招聘，按工種篩選，再開啟詳情跟進。"
          : isSetupRequired
            ? locale === "en"
              ? "Preview matching work. Set up your card to open details and submit quotes."
              : "預覽符合專長嘅工作；綁定付款卡後先可以開啟詳情及報價。"
            : locale === "en"
              ? "New customer leads are hidden. You can still review quotes you previously submitted."
              : "新客戶工作機會已隱藏；你仍可查看之前提交嘅報價紀錄。"
      }
      navItems={getProNav(locale, "leads")}
    >
      {isSetupRequired ? (
        <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-warning/25 bg-warning/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warning/12 text-warning">
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">
                {locale === "en"
                  ? "Job details are locked"
                  : "工作詳情尚未解鎖"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {locale === "en"
                  ? "You can browse matching summaries now. Card setup unlocks customer details and quoting."
                  : "你而家可以瀏覽符合專長嘅工作摘要；綁卡後先會顯示客戶資料及開放報價。"}
              </p>
            </div>
          </div>
          <Link
            href="/pro/billing"
            locale={locale}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold !text-white"
          >
            {locale === "en" ? "Set up card" : "前往綁卡"}
          </Link>
        </section>
      ) : null}
      <section className="mb-4 rounded-2xl border border-line/80 bg-card/90 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-semibold text-muted">
            {locale === "en" ? "Filter by category" : "按分類篩選"}
          </p>
          <p className="text-xs font-semibold text-primary">
            {locale === "en"
              ? `${leads.length + facebookLeads.length} results`
              : `${leads.length + facebookLeads.length} 個結果`}
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
          leads.map((lead) => {
            const canOpenDetail =
              canCreateQuotes || Boolean(lead.existingQuote);
            const card = (
              <WorkOpportunityCard
                title={lead.title}
                status={<StatusBadge status={lead.status} locale={locale} />}
                locked={!canOpenDetail}
                description={
                  canOpenDetail
                    ? lead.description
                    : locale === "en"
                      ? "Set up your card to view the full job description, customer information and site details."
                      : "綁定付款卡後即可查看完整工作描述、客戶資料及現場詳情。"
                }
                metadata={
                  <>
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
                    {canOpenDetail && lead.attachmentIds.length ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-primary" />
                        {locale === "en"
                          ? `${lead.attachmentIds.length} file`
                          : `${lead.attachmentIds.length} 張相`}
                      </span>
                    ) : null}
                  </>
                }
                amountLabel={locale === "en" ? "Budget" : "預算"}
                amount={
                  lead.budgetMax
                    ? `HK$${lead.budgetMin ?? 0}–${lead.budgetMax}`
                    : locale === "en"
                      ? "Flexible"
                      : "彈性處理"
                }
                action={
                  lead.existingQuote
                    ? locale === "en"
                      ? "View quote"
                      : "查看報價"
                    : canCreateQuotes
                      ? locale === "en"
                        ? "Quote"
                        : "報價"
                      : locale === "en"
                        ? "Set up card to view details"
                        : "綁卡後查看詳情"
                }
              />
            );

            return canOpenDetail ? (
              <Link
                key={lead.id}
                href={`/pro/leads/${lead.id}`}
                locale={locale}
                className="block"
              >
                {card}
              </Link>
            ) : (
              <div key={lead.id} aria-disabled="true">
                {card}
              </div>
            );
          })
        ) : facebookLeads.length ? null : (
          <EmptyState
            locale={locale}
            title={
              canCreateQuotes
                ? locale === "en"
                  ? "No open leads right now"
                  : "暫時未有開放工作機會"
                : isSetupRequired
                  ? locale === "en"
                    ? "No matching job previews right now"
                    : "暫時未有符合專長嘅工作預覽"
                  : locale === "en"
                    ? "No quote records to show"
                    : "暫時未有報價紀錄"
            }
            description={
              canCreateQuotes
                ? locale === "en"
                  ? "Try another category or check back when new customer requests arrive."
                  : "可以改用其他分類，或稍後查看新的客戶需求。"
                : isSetupRequired
                  ? locale === "en"
                    ? "Try another specialty category or check back when customers add new work."
                    : "可以試下其他專長分類，或稍後再睇客戶新增嘅工作。"
                  : locale === "en"
                    ? "Existing jobs and billing remain available from the pro workspace."
                    : "你仍可喺師傅工作台處理現有訂單同管理月費。"
            }
          />
        )}
        <FacebookGroupLeads
          leads={facebookLeads}
          locale={locale}
          categoryOptions={categoryOptions}
        />
      </div>
    </PortalShell>
  );
}
