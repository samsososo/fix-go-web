import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { getCustomerDashboard } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";

export default async function CustomerDashboardPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const dashboard = await getCustomerDashboard(user.id);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Customer dashboard" : "客戶中心"}
      subtitle={
        locale === "en"
          ? "Track live requests, compare incoming quotes and keep bookings moving."
          : "集中查看請求、比較報價與追蹤訂單進度。"
      }
      navItems={getCustomerNav(locale, "dashboard")}
    >
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard
          label={locale === "en" ? "Active requests" : "進行中請求"}
          value={dashboard.stats.active}
          hint={
            locale === "en" ? "Open marketplace demand" : "仍在撮合中的需求"
          }
        />
        <StatCard
          label={locale === "en" ? "Awaiting quotes" : "等待報價"}
          value={dashboard.stats.awaitingQuotes}
          hint={locale === "en" ? "Need pro responses" : "仍需師傅回覆"}
        />
        <StatCard
          label={locale === "en" ? "Accepted bookings" : "已確認訂單"}
          value={dashboard.stats.acceptedBookings}
          hint={locale === "en" ? "Ready for scheduling" : "待安排或進行中"}
        />
        <StatCard
          label={locale === "en" ? "Completed jobs" : "已完成工作"}
          value={dashboard.stats.completed}
          hint={locale === "en" ? "Finished successfully" : "已完結項目"}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                {locale === "en" ? "Recent requests" : "最近請求"}
              </h2>
            </div>
            {dashboard.requests.length ? (
              <div className="space-y-3">
                {dashboard.requests.map((request) => (
                  <a
                    key={request.id}
                    href={`/customer/requests/${request.id}`}
                    className="block rounded-2xl border border-line bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
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
                title={locale === "en" ? "No requests yet" : "未有請求"}
                description={
                  locale === "en"
                    ? "Create your first request to begin collecting quotes from professionals."
                    : "建立第一張服務請求後，即可開始收集師傅報價。"
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Recent activity" : "最近動態"}
            </h2>
            <div className="space-y-3">
              {dashboard.activity.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
