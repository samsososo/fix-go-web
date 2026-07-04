import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { LiveQuotesPanel } from "@/features/customer/live-quotes-panel";
import { getCurrentUser } from "@/lib/auth";
import { formatStatusLabel } from "@/lib/formatters";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { getCustomerRequestDetail } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";

export default async function CustomerRequestDetailPage({
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

  const request = await getCustomerRequestDetail(user.id, requestId);
  if (!request) {
    redirect(`/customer`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Request detail" : "請求詳情"}
      subtitle={request.title}
      navItems={getCustomerNav(locale, "dashboard")}
    >
      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                {request.title}
              </h2>
              <StatusBadge status={request.status} locale={locale} />
            </div>
            <p className="text-sm leading-7 text-muted">
              {request.description}
            </p>
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Address" : "地址"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDistrictName(request.address.district, locale)} ·{" "}
                  {formatAreaName(request.address.area, locale)} ·{" "}
                  {request.address.buildingEstate}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Access notes" : "出入備註"}
                </p>
                <p className="mt-2 text-muted">{request.accessNotes || "-"}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="font-semibold">
                {locale === "en" ? "Booking status timeline" : "狀態時間線"}
              </p>
              <div className="mt-3 space-y-2 text-sm text-muted">
                {request.timeline.length ? (
                  request.timeline.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2"
                    >
                      <span>{formatStatusLabel(event.status, locale)}</span>
                      <span>
                        {new Date(event.createdAt).toLocaleString(locale)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>
                    {locale === "en"
                      ? "No booking events yet."
                      : "暫未有訂單狀態更新。"}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Incoming quotes" : "收到的報價"}
            </h2>
            <LiveQuotesPanel
              requestId={request.id}
              locale={locale}
              customerId={user.id}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
