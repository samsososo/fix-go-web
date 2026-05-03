import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getProEarningsSummary } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { formatDateTime } from "@/lib/formatters";
import { formatCurrency } from "@/lib/utils";

export default async function ProEarningsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const earnings = await getProEarningsSummary(user.id);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Earnings" : "收入"}
      subtitle={
        locale === "en"
          ? "Track quoted value, confirmed bookings, and completed work totals."
          : "查看累積報價、已確認訂單及已完成工作的總值。"
      }
      navItems={getProNav(locale, "earnings")}
    >
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard
          label={locale === "en" ? "Quoted value" : "累積報價總值"}
          value={formatCurrency(earnings.totals.lifetimeQuoted, locale)}
          hint={
            locale === "en"
              ? "All quotes sent to date"
              : "截至目前所有已送出報價"
          }
        />
        <StatCard
          label={locale === "en" ? "Confirmed value" : "已確認總值"}
          value={formatCurrency(earnings.totals.confirmedValue, locale)}
          hint={
            locale === "en"
              ? "Accepted and active bookings"
              : "已接受及進行中訂單"
          }
        />
        <StatCard
          label={locale === "en" ? "Completed value" : "已完成總值"}
          value={formatCurrency(earnings.totals.completedValue, locale)}
          hint={
            locale === "en" ? "Jobs marked completed" : "狀態為已完成的工作"
          }
        />
        <StatCard
          label={locale === "en" ? "Active jobs" : "進行中訂單"}
          value={earnings.totals.activeJobs}
          hint={
            locale === "en" ? "Currently in delivery" : "現時正在服務中的訂單"
          }
        />
      </div>

      {earnings.recentJobs.length ? (
        <Card className="mt-8">
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Recent booking value" : "最近訂單金額"}
            </h2>
            <div className="space-y-3">
              {earnings.recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-2xl border border-line bg-white p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{job.request?.title}</p>
                      <p className="text-sm text-muted">
                        {job.customer?.fullName} ·{" "}
                        {formatDateTime(job.updatedAt, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">
                        {formatCurrency(job.quote?.total ?? 0, locale)}
                      </p>
                      <StatusBadge status={job.status} locale={locale} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8">
          <EmptyState
            locale={locale}
            title={
              locale === "en" ? "No earnings history yet" : "暫未有收入記錄"
            }
            description={
              locale === "en"
                ? "Once quotes are accepted, this page will show the value of confirmed and completed work."
                : "當你的報價被接受後，此頁會顯示已確認及已完成工作的金額。"
            }
          />
        </div>
      )}
    </PortalShell>
  );
}
