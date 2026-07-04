import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatUrgencyLabel } from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import { listRelevantLeads } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProLeadsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const leads = await listRelevantLeads(user.id);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Job leads" : "工作機會"}
      subtitle={
        locale === "en"
          ? "Open matched requests and submit a structured quote."
          : "查看已配對的服務請求，並提交結構化報價。"
      }
      navItems={getProNav(locale, "leads")}
    >
      <div className="grid gap-5">
        {leads.length ? (
          leads.map((lead) => (
            <a
              key={lead.id}
              href={`/pro/leads/${lead.id}`}
              className="block"
            >
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
                        {locale === "en" ? "Open lead" : "查看詳情"}
                      </p>
                      <p className="mt-2 text-muted">
                        {locale === "en"
                          ? "Review attachments, scope, and send quote"
                          : "查看附件、工作範圍及提交報價"}
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
              locale === "en"
                ? "No matched leads right now"
                : "暫時未有配對工作機會"
            }
            description={
              locale === "en"
                ? "As new requests match your trades and service areas, they will appear here automatically."
                : "當新請求符合你的工種及服務地區時，系統會自動在此顯示。"
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
