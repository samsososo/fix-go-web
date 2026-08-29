import { getLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { listCustomerRequests } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";
import { formatDateTime, formatDurationMinutes } from "@/lib/formatters";
import { formatCurrency } from "@/lib/utils";

export default async function OrdersPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const requests = await listCustomerRequests(user.id);
  const bookings = requests.filter((request) => request.booking);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Booking history" : "訂單紀錄"}
      subtitle={
        locale === "en"
          ? "Accepted quotes and booking status live here."
          : "已接受的報價及訂單進度會集中顯示於此。"
      }
      navItems={getCustomerNav(locale, "orders")}
    >
      <div className="grid gap-5">
        {bookings.length ? (
          bookings.map((request) => (
            <a
              key={request.id}
              href={`/customer/orders/${request.booking!.id}`}
              className="block"
            >
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold sm:text-2xl">
                        {request.title}
                      </p>
                      <p className="text-sm text-muted">
                        {formatDistrictName(request.address.district, locale)} ·{" "}
                        {request.category?.name[locale as "zh-HK" | "en"]}
                      </p>
                    </div>
                    <StatusBadge
                      status={request.booking!.status}
                      locale={locale}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                    <div className="order-2 rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4 md:order-1">
                      <p className="font-semibold">
                        {locale === "en" ? "Accepted quote" : "已接受報價"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatCurrency(
                          request.quotes.find(
                            (quote) => quote.id === request.acceptedQuoteId,
                          )?.total ?? 0,
                          locale,
                        )}
                      </p>
                    </div>
                    <div className="order-1 col-span-2 rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4 md:order-2 md:col-span-1">
                      <p className="font-semibold">
                        {locale === "en" ? "Scheduled date" : "預約時間"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatDateTime(request.booking?.scheduledDate, locale)}
                      </p>
                    </div>
                    <div className="order-3 rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4">
                      <p className="font-semibold">
                        {locale === "en" ? "Estimated duration" : "預計需時"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatDurationMinutes(
                          request.booking?.estimatedDurationMinutes ??
                            request.quotes.find(
                              (quote) => quote.id === request.acceptedQuoteId,
                            )?.estimatedDurationMinutes,
                          locale,
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {locale === "en" ? "View order" : "查看訂單"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </p>
                </CardContent>
              </Card>
            </a>
          ))
        ) : (
          <EmptyState
            locale={locale}
            title={locale === "en" ? "No bookings yet" : "未有訂單"}
            description={
              locale === "en"
                ? "Accepted quotes will appear here once a professional is confirmed."
                : "當你接受報價並確認師傅後，訂單會集中顯示於此。"
            }
            actionHref="/customer/requests/new"
            actionLabel={locale === "en" ? "Create a request" : "建立服務請求"}
            compact
          />
        )}
      </div>
    </PortalShell>
  );
}
