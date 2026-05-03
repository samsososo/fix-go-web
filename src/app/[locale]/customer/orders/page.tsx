import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { listCustomerRequests } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";
import { formatDateTime } from "@/lib/formatters";
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
              href={`/${locale}/customer/orders/${request.booking!.id}`}
              className="block"
            >
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-2xl font-bold">
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
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
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
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Scheduled date" : "預約時間"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatDateTime(request.booking?.scheduledDate, locale)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Order detail" : "訂單詳情"}
                      </p>
                      <p className="mt-2 text-muted">
                        {locale === "en"
                          ? "Open booking timeline and accepted quote"
                          : "查看訂單時間線及已接受報價"}
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
            title={locale === "en" ? "No bookings yet" : "未有訂單"}
            description={
              locale === "en"
                ? "Accepted quotes will appear here once a professional is confirmed."
                : "當你接受報價並確認師傅後，訂單會集中顯示於此。"
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
