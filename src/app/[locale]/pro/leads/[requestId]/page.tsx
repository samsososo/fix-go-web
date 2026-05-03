import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteForm } from "@/features/pro/quote-form";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { getLeadDetail } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProLeadDetailPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const locale = await getLocale();
  const { requestId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const lead = await getLeadDetail(user.id, requestId);
  if (!lead) {
    redirect(`/${locale}/pro/leads`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Lead detail" : "工作機會詳情"}
      subtitle={lead.title}
      navItems={getProNav(locale, "leads")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">{lead.title}</h2>
              <StatusBadge status={lead.status} locale={locale} />
            </div>
            <p className="text-sm leading-7 text-muted">{lead.description}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Customer" : "客戶"}
                </p>
                <p className="mt-2 text-muted">{lead.customer.fullName}</p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "District" : "地區"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDistrictName(lead.address.district, locale)}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">
              <p className="font-semibold text-foreground">
                {locale === "en" ? "Attachments" : "附件"}
              </p>
              <ul className="mt-2 space-y-1">
                {lead.attachments.map((attachment) => (
                  <li key={attachment.id}>{attachment.fileName}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h2 className="font-display text-2xl font-bold">
                {lead.existingQuote
                  ? locale === "en"
                    ? "Quote sent"
                    : "已送出報價"
                  : locale === "en"
                    ? "Send quote"
                    : "提交報價"}
              </h2>
              {lead.existingQuote ? (
                <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-foreground">
                  <p className="font-semibold">
                    {locale === "en"
                      ? "Your quote has been sent and is now visible to the customer."
                      : "你的報價已送出，客戶現可直接查看。"}
                  </p>
                  <div className="mt-3 grid gap-3 text-muted md:grid-cols-2">
                    <p>
                      {locale === "en" ? "Total" : "總額"}: HK$
                      {lead.existingQuote.total}
                    </p>
                    <p>
                      {locale === "en"
                        ? "Earliest availability"
                        : "最早可上門時間"}
                      : {lead.existingQuote.earliestAvailability || "-"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            <QuoteForm
              key={lead.existingQuote?.id ?? "new"}
              locale={locale}
              proId={user.id}
              requestId={lead.id}
              initialValues={lead.existingQuote ?? undefined}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
