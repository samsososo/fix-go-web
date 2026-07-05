import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime, formatDurationMinutes } from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import { listProJobs } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { formatCurrency } from "@/lib/utils";

export default async function ProJobsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const jobs = await listProJobs(user.id);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Accepted jobs" : "已接訂單"}
      subtitle={
        locale === "en"
          ? "Track accepted bookings and update job progress."
          : "查看已接受訂單並更新工作進度。"
      }
      navItems={getProNav(locale, "jobs")}
    >
      <div className="grid gap-5">
        {jobs.length ? (
          jobs.map((job) => (
            <a key={job.id} href={`/pro/jobs/${job.id}`} className="block">
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-display text-2xl font-bold">
                        {job.request?.title}
                      </p>
                      <p className="text-sm text-muted">
                        {job.customer?.fullName}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-semibold">
                        {formatCurrency(job.quote?.total ?? 0, locale)}
                      </p>
                      <StatusBadge status={job.status} locale={locale} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Scheduled date" : "預約時間"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatDateTime(job.scheduledDate, locale)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "District" : "地區"}
                      </p>
                      <p className="mt-2 text-muted">
                        {job.request
                          ? formatDistrictName(
                              job.request.address.district,
                              locale,
                            )
                          : "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                      <p className="font-semibold">
                        {locale === "en" ? "Estimated duration" : "預計需時"}
                      </p>
                      <p className="mt-2 text-muted">
                        {formatDurationMinutes(
                          job.estimatedDurationMinutes ??
                            job.quote?.estimatedDurationMinutes,
                          locale,
                        )}
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
            title={locale === "en" ? "No accepted jobs yet" : "未有已接訂單"}
            description={
              locale === "en"
                ? "Accepted quotes will become active jobs here, together with scheduling and progress updates."
                : "當你的報價被接受後，訂單會在此顯示，方便安排時間及更新進度。"
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
