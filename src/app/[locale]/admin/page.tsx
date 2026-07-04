import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/mock/repositories";
import { getAdminNav } from "@/lib/nav";

export default async function AdminDashboardPage() {
  const locale = await getLocale();
  const overview = await getAdminOverview();

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Ops overview" : "營運總覽"}
      subtitle={
        locale === "en"
          ? "A lightweight back office for monitoring customers, pros, requests and quotes."
          : "以最輕量方式查看客戶、師傅、請求及報價。"
      }
      navItems={getAdminNav(locale, "dashboard")}
    >
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard
          label={locale === "en" ? "Customers" : "客戶"}
          value={overview.totals.customers}
          hint={locale === "en" ? "Registered accounts" : "已註冊帳戶"}
        />
        <StatCard
          label={locale === "en" ? "Pros" : "師傅"}
          value={overview.totals.pros}
          hint={
            locale === "en" ? "Active professional profiles" : "活躍師傅檔案"
          }
        />
        <StatCard
          label={locale === "en" ? "Requests" : "請求"}
          value={overview.totals.requests}
          hint={
            locale === "en" ? "Open and historical demand" : "現有及歷史需求"
          }
        />
        <StatCard
          label={locale === "en" ? "Quotes" : "報價"}
          value={overview.totals.quotes}
          hint={
            locale === "en" ? "Responses from professionals" : "師傅提交的回覆"
          }
        />
      </div>
      <Card className="mt-8">
        <CardContent className="space-y-4">
          <h2 className="font-display text-2xl font-bold">
            {locale === "en" ? "Recent requests" : "最近請求"}
          </h2>
          <div className="space-y-3">
            {overview.recentRequests.map((request) => (
              <a
                key={request.id}
                href={`/admin/requests/${request.id}`}
                className="block rounded-2xl border border-line bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{request.title}</p>
                    <p className="text-sm text-muted">
                      {request.customer?.fullName}
                    </p>
                  </div>
                  <StatusBadge status={request.status} locale={locale} />
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
