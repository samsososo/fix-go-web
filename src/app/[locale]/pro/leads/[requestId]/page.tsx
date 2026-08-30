import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock3, MapPin, Paperclip, Tag } from "lucide-react";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppContactLink } from "@/components/shared/whatsapp-contact-link";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteForm } from "@/features/pro/quote-form";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDateTime,
  formatDurationMinutes,
  formatHongKongPhone,
  formatRequestWhatsAppMessage,
  formatUrgencyLabel,
} from "@/lib/formatters";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { env } from "@/lib/env";
import { getLeadDetail } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";

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

  const [lead, subscriptionSnapshot] = await Promise.all([
    getLeadDetail(user.id, requestId),
    getProSubscriptionEntitlement(user.id),
  ]);
  if (!lead) {
    redirect(`/pro/leads`);
  }
  const canCreateQuotes = subscriptionSnapshot.entitlement.canCreateQuotes;
  const whatsappMessage = formatRequestWhatsAppMessage({
    locale,
    context: "lead",
    title: lead.title,
    category: lead.category?.name[locale as "zh-HK" | "en"],
    area: [
      formatDistrictName(lead.address.district, locale),
      formatAreaName(lead.address.area, locale),
    ].join(" · "),
    urgency: formatUrgencyLabel(lead.urgency, locale),
    reference: lead.id,
    detailUrl: new URL(`/customer/requests/${lead.id}`, env.APP_URL).toString(),
  });

  return (
    <PortalShell
      locale={locale}
      title={
        canCreateQuotes
          ? locale === "en"
            ? "Lead detail"
            : "工作機會詳情"
          : locale === "en"
            ? "Quote record"
            : "報價紀錄"
      }
      subtitle={lead.title}
      navItems={getProNav(locale, "leads")}
    >
      <Link
        href="/pro/leads"
        locale={locale}
        className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {locale === "en" ? "Back to job leads" : "返回工作機會"}
      </Link>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:gap-5">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-bold sm:text-2xl">
                {lead.title}
              </h2>
              <StatusBadge status={lead.status} locale={locale} />
            </div>
            <p className="text-sm leading-7 text-muted">{lead.description}</p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-foreground/68">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                {formatUrgencyLabel(lead.urgency, locale)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {formatDistrictName(lead.address.district, locale)}
              </span>
              {lead.category ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                  <Tag className="h-3.5 w-3.5 text-primary" />
                  {lead.category.name[locale as "zh-HK" | "en"]}
                </span>
              ) : null}
              {lead.attachments.length ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-tint px-2.5 py-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                  {locale === "en"
                    ? `${lead.attachments.length} attachment`
                    : `${lead.attachments.length} 個附件`}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-paper-warm p-3 text-sm sm:p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Budget" : "預算"}
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {lead.budgetMax
                    ? `HK$${lead.budgetMin ?? 0}–${lead.budgetMax}`
                    : locale === "en"
                      ? "Flexible"
                      : "彈性處理"}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Customer" : "客戶"}
                </p>
                <p className="mt-1 text-muted">{lead.customer.fullName}</p>
                <p className="mt-1 text-muted">
                  {formatHongKongPhone(lead.customer.phone)}
                </p>
              </div>
            </div>
            <WhatsAppContactLink
              phone={lead.customer.phone}
              locale={locale}
              message={whatsappMessage}
              className="min-h-12 w-full justify-center"
            />
            {lead.attachments.length ? (
              <div className="rounded-2xl border border-line/80 bg-white/72 p-3">
                <p className="text-sm font-semibold">
                  {locale === "en" ? "Customer attachments" : "客戶附件"}
                </p>
                <div className="mt-2 space-y-1">
                  {lead.attachments.map((attachment) => (
                    <p
                      key={attachment.id}
                      className="flex items-center gap-2 text-sm text-muted"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{attachment.fileName}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
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
                      :{" "}
                      {formatDateTime(
                        lead.existingQuote.earliestAvailability,
                        locale,
                      )}
                    </p>
                    <p>
                      {locale === "en" ? "Estimated duration" : "預計需時"}:{" "}
                      {formatDurationMinutes(
                        lead.existingQuote.estimatedDurationMinutes,
                        locale,
                      )}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            {canCreateQuotes ? (
              <QuoteForm
                key={lead.existingQuote?.id ?? "new"}
                locale={locale}
                requestId={lead.id}
                initialValues={lead.existingQuote ?? undefined}
              />
            ) : (
              <div className="rounded-2xl border border-line bg-surface-tint/60 p-4 text-sm leading-7 text-muted">
                {locale === "en"
                  ? "This is a read-only record. Creating or updating a quote is unavailable until new-work access is restored."
                  : "呢個係唯讀紀錄；新工作功能恢復之前，暫時唔可以建立或更新報價。"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
