import { getLocale } from "next-intl/server";
import { ArrowRight, Clock3, MapPin } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
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
      <div className="grid gap-3 sm:gap-5">
        {jobs.length ? (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/pro/jobs/${job.id}`}
              locale={locale}
              className="block"
            >
              <Card>
                <CardContent className="space-y-3 p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl font-bold sm:text-2xl">
                        {job.request?.title}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {job.customer?.fullName}
                      </p>
                    </div>
                    <StatusBadge status={job.status} locale={locale} />
                  </div>
                  <div className="rounded-2xl bg-surface-tint/72 p-3">
                    <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                      <Clock3 className="h-4 w-4" />
                      {formatDateTime(job.scheduledDate, locale)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.request
                          ? formatDistrictName(
                              job.request.address.district,
                              locale,
                            )
                          : "-"}
                      </span>
                      <span>
                        {formatDurationMinutes(
                          job.estimatedDurationMinutes ??
                            job.quote?.estimatedDurationMinutes,
                          locale,
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-line/70 pt-3">
                    <p className="font-display text-lg font-bold">
                      {formatCurrency(job.quote?.total ?? 0, locale)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                      {locale === "en" ? "Job detail" : "工作詳情"}
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
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
