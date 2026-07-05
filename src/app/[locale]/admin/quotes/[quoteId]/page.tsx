import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatDurationMinutes } from "@/lib/formatters";
import { getAdminNav } from "@/lib/nav";
import { getAdminQuoteDetail } from "@/lib/mock/repositories";
import { formatCurrency } from "@/lib/utils";

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: Promise<{ locale: string; quoteId: string }>;
}) {
  const locale = await getLocale();
  const { quoteId } = await params;
  const detail = await getAdminQuoteDetail(quoteId);
  if (!detail) {
    redirect(`/admin/quotes`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Quote detail" : "報價詳情"}
      subtitle={detail.request?.title ?? detail.id}
      navItems={getAdminNav(locale, "quotes")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-bold">
                {detail.pro?.fullName}
              </h2>
              <StatusBadge status={detail.status} locale={locale} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Total" : "總額"}
                </p>
                <p className="mt-2 text-muted">
                  {formatCurrency(detail.total, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Availability" : "最早可安排時間"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDateTime(detail.earliestAvailability, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm md:col-span-2">
                <p className="font-semibold">
                  {locale === "en" ? "Estimated duration" : "預計需時"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDurationMinutes(
                    detail.estimatedDurationMinutes,
                    locale,
                  )}
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Included work" : "包含項目"}
                </p>
                <p className="mt-2 text-muted">{detail.includedWork}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Exclusions" : "不包括項目"}
                </p>
                <p className="mt-2 text-muted">{detail.exclusions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Linked request" : "對應請求"}
            </h2>
            {detail.request ? (
              <div className="space-y-3">
                <a
                  href={`/admin/requests/${detail.request.id}`}
                  className="block rounded-2xl border border-line bg-white p-4"
                >
                  <p className="font-semibold">{detail.request.title}</p>
                  <p className="mt-2 text-sm text-muted">
                    {detail.request.customer?.fullName}
                  </p>
                </a>
                <div className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">
                  {detail.booking
                    ? locale === "en"
                      ? "This quote has already been converted into a booking."
                      : "此報價已轉為訂單。"
                    : locale === "en"
                      ? "This quote has not been accepted yet."
                      : "此報價尚未被接受。"}
                </div>
              </div>
            ) : (
              <EmptyState
                locale={locale}
                title={
                  locale === "en"
                    ? "Request data unavailable"
                    : "未能找到對應請求"
                }
                description={
                  locale === "en"
                    ? "The quote record exists, but the linked request is no longer available in the current dataset."
                    : "此報價仍存在，但目前資料集中未能找到對應請求。"
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
