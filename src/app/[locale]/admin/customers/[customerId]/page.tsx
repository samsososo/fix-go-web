import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatHongKongPhone } from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import { getAdminCustomerDetail } from "@/lib/mock/repositories";
import { getAdminNav } from "@/lib/nav";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; customerId: string }>;
}) {
  const locale = await getLocale();
  const { customerId } = await params;
  const detail = await getAdminCustomerDetail(customerId);
  if (!detail) {
    redirect(`/${locale}/admin/customers`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Customer detail" : "客戶詳情"}
      subtitle={detail.customer.fullName}
      navItems={getAdminNav(locale, "customers")}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <StatCard
          label={locale === "en" ? "Requests" : "請求數量"}
          value={detail.requests.length}
          hint={
            locale === "en" ? "All customer submissions" : "客戶所有提交記錄"
          }
        />
        <StatCard
          label={locale === "en" ? "Saved addresses" : "已儲存地址"}
          value={detail.profile?.savedAddresses.length ?? 0}
          hint={
            locale === "en"
              ? "Reusable customer locations"
              : "可重複使用的地址資料"
          }
        />
        <StatCard
          label={locale === "en" ? "Notifications" : "通知"}
          value={detail.notifications.length}
          hint={locale === "en" ? "System updates delivered" : "已傳送系統更新"}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-display text-2xl font-bold">
              {detail.customer.fullName}
            </h2>
            <p className="text-sm text-muted">{detail.customer.email ?? "-"}</p>
            <p className="text-sm text-muted">
              {formatHongKongPhone(detail.customer.phone)}
            </p>
            <p className="text-sm text-muted">
              {formatDateTime(detail.customer.createdAt, locale)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Recent requests" : "最近請求"}
            </h2>
            {detail.requests.length ? (
              <div className="space-y-3">
                {detail.requests.map((request) => (
                  <a
                    key={request.id}
                    href={`/${locale}/admin/requests/${request.id}`}
                    className="block rounded-2xl border border-line bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">{request.title}</p>
                        <p className="text-sm text-muted">
                          {formatDistrictName(request.address.district, locale)}
                        </p>
                      </div>
                      <StatusBadge status={request.status} locale={locale} />
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                locale={locale}
                title={
                  locale === "en"
                    ? "No requests from this customer"
                    : "此客戶未有請求"
                }
                description={
                  locale === "en"
                    ? "Customer submissions will appear here once they create their first job request."
                    : "當此客戶建立第一張請求後，記錄會顯示於此。"
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
