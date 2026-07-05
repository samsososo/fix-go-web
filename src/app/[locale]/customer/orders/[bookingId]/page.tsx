import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDateTime,
  formatDurationMinutes,
  formatStatusLabel,
} from "@/lib/formatters";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { getCustomerBookingDetail } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";
import { formatCurrency } from "@/lib/utils";

export default async function CustomerBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const locale = await getLocale();
  const { bookingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const booking = await getCustomerBookingDetail(user.id, bookingId);
  if (!booking) {
    redirect(`/customer/orders`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Booking detail" : "訂單詳情"}
      subtitle={booking.request?.title ?? ""}
      navItems={getCustomerNav(locale, "orders")}
    >
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {booking.request?.title}
                </h2>
                <p className="text-sm text-muted">{booking.pro?.fullName}</p>
              </div>
              <StatusBadge status={booking.status} locale={locale} />
            </div>
            <p className="text-sm leading-7 text-muted">
              {booking.request?.description}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Accepted total" : "已確認總額"}
                </p>
                <p className="mt-2 text-muted">
                  {formatCurrency(booking.quote?.total ?? 0, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Estimated duration" : "預計需時"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDurationMinutes(
                    booking.estimatedDurationMinutes ??
                      booking.quote?.estimatedDurationMinutes,
                    locale,
                  )}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
              <p className="font-semibold">
                {locale === "en" ? "Scheduled date" : "預約時間"}
              </p>
              <p className="mt-2 text-muted">
                {formatDateTime(booking.scheduledDate, locale)}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">
              <p className="font-semibold text-foreground">
                {locale === "en" ? "Address" : "地址"}
              </p>
              <p className="mt-2">
                {booking.request
                  ? formatDistrictName(booking.request.address.district, locale)
                  : "-"}{" "}
                ·{" "}
                {booking.request
                  ? formatAreaName(booking.request.address.area, locale)
                  : "-"}{" "}
                · {booking.request?.address.buildingEstate}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Booking timeline" : "訂單時間線"}
            </h2>
            <div className="space-y-3">
              {booking.timeline.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-line bg-white p-4 text-sm"
                >
                  <p className="font-semibold">
                    {formatStatusLabel(event.status, locale)}
                  </p>
                  <p className="mt-1 text-muted">{event.note}</p>
                  <p className="mt-2 text-xs text-muted">
                    {formatDateTime(event.createdAt, locale)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
