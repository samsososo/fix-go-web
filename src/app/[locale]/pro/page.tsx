import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  CreditCard,
  MapPin,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDateTime,
  formatDurationMinutes,
  formatUrgencyLabel,
} from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
import {
  listProCalendarBookings,
  listProJobs,
  listRelevantLeads,
} from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import { cn, formatCurrency } from "@/lib/utils";
import { BookingStatus, RequestUrgency } from "@/types/domain";

const activeBookingStatuses: BookingStatus[] = [
  "accepted",
  "scheduled",
  "in_progress",
];

const urgentLeadStatuses: RequestUrgency[] = ["asap", "today"];

function hongKongDateKey(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default async function ProDashboardPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const subscriptionSnapshot = await getProSubscriptionEntitlement(user.id);
  const canCreateQuotes = subscriptionSnapshot.entitlement.canCreateQuotes;
  const [leads, calendarBookings, jobs] = await Promise.all([
    canCreateQuotes ? listRelevantLeads(user.id) : Promise.resolve([]),
    listProCalendarBookings(user.id),
    listProJobs(user.id),
  ]);

  const openLeads = leads.filter((lead) => !lead.existingQuote);
  const urgentLeads = openLeads.filter((lead) =>
    urgentLeadStatuses.includes(lead.urgency),
  );
  const todayKey = hongKongDateKey(new Date().toISOString());
  const todayBookings = calendarBookings.filter(
    (booking) => hongKongDateKey(booking.scheduledDate) === todayKey,
  );
  const activeJobs = jobs.filter((job) =>
    activeBookingStatuses.includes(job.status),
  );
  const recommendedLeads = [
    ...urgentLeads,
    ...openLeads.filter((lead) => !urgentLeads.includes(lead)),
  ].slice(0, 3);
  const nextBookings = (todayBookings.length ? todayBookings : calendarBookings)
    .slice()
    .sort((a, b) =>
      (a.scheduledDate ?? a.updatedAt).localeCompare(
        b.scheduledDate ?? b.updatedAt,
      ),
    )
    .slice(0, 3);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Pro overview" : "師傅總覽"}
      subtitle={
        locale === "en"
          ? "Start with open job leads, then check today's visits and accepted bookings."
          : "先睇可接工作，再處理今日上門安排同已接訂單。"
      }
      navItems={getProNav(locale, "dashboard", openLeads.length)}
    >
      <section className="grid gap-5">
        <Card className="border-primary/20 bg-gradient-to-br from-white/88 via-card/92 to-surface-tint/82">
          <CardContent className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/16 bg-white/70 px-3 py-1 text-xs font-semibold text-primary">
                {canCreateQuotes ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {canCreateQuotes
                  ? locale === "en"
                    ? "Recommended next step"
                    : "建議先處理"
                  : locale === "en"
                    ? "Existing work remains available"
                    : "現有工作繼續保留"}
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-extrabold tracking-normal text-foreground sm:text-4xl">
                  {canCreateQuotes
                    ? openLeads.length > 0
                      ? locale === "en"
                        ? `${openLeads.length} open jobs are waiting for quotes`
                        : `有 ${openLeads.length} 張工作機會等緊你報價`
                      : locale === "en"
                        ? "No open jobs waiting for quotes right now"
                        : "暫時未有等緊你報價嘅工作"
                    : locale === "en"
                      ? "New quotes are paused, but accepted jobs are not"
                      : "新報價暫停，但已接訂單可以繼續處理"}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted">
                  {canCreateQuotes
                    ? locale === "en"
                      ? "This overview keeps work discovery in front, so an empty schedule no longer feels like there is nothing to do."
                      : "呢版會將搵工作放喺最前，就算日程暫時未有安排，師傅都會知道下一步係去睇工作機會。"
                    : locale === "en"
                      ? "Use jobs and schedule as normal. Manage billing whenever you are ready to restore new-work access."
                      : "你可以照常使用訂單同日程；準備好後到月費頁恢復新工作功能。"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link
                href={canCreateQuotes ? "/pro/leads" : "/pro/billing"}
                locale={locale}
                className={buttonVariants({ size: "sm" })}
              >
                {canCreateQuotes ? (
                  <BriefcaseBusiness className="h-4 w-4" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {canCreateQuotes
                  ? locale === "en"
                    ? "View job leads"
                    : "查看工作機會"
                  : locale === "en"
                    ? "Manage billing"
                    : "管理月費"}
              </Link>
              <Link
                href="/pro/calendar"
                locale={locale}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <CalendarDays className="h-4 w-4" />
                {locale === "en" ? "Open schedule" : "查看日程"}
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardStat
            label={
              canCreateQuotes
                ? locale === "en"
                  ? "Open leads"
                  : "等待報價"
                : locale === "en"
                  ? "New leads"
                  : "新工作機會"
            }
            value={openLeads.length}
            hint={
              canCreateQuotes
                ? locale === "en"
                  ? "Ready to quote"
                  : "可即時處理"
                : locale === "en"
                  ? "Temporarily paused"
                  : "暫時停用"
            }
            icon={<BriefcaseBusiness className="h-5 w-5" />}
          />
          <DashboardStat
            label={locale === "en" ? "Urgent leads" : "緊急工作"}
            value={urgentLeads.length}
            hint={locale === "en" ? "ASAP or today" : "盡快或今日"}
            icon={<Clock3 className="h-5 w-5" />}
          />
          <DashboardStat
            label={locale === "en" ? "Today's visits" : "今日行程"}
            value={todayBookings.length}
            hint={
              todayBookings[0]?.scheduledDate
                ? formatDateTime(todayBookings[0].scheduledDate, locale)
                : locale === "en"
                  ? "No visit today"
                  : "今日未有上門"
            }
            icon={<CalendarDays className="h-5 w-5" />}
          />
          <DashboardStat
            label={locale === "en" ? "Active jobs" : "進行中訂單"}
            value={activeJobs.length}
            hint={locale === "en" ? "Accepted or scheduled" : "已接或已安排"}
            icon={<MessageCircle className="h-5 w-5" />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardContent>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl font-extrabold">
                    {canCreateQuotes
                      ? locale === "en"
                        ? "Recommended job leads"
                        : "推薦工作機會"
                      : locale === "en"
                        ? "New-work access"
                        : "新工作功能"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {canCreateQuotes
                      ? locale === "en"
                        ? "Urgent and unquoted jobs appear first."
                        : "緊急同未報價需求會排喺最前。"
                      : locale === "en"
                        ? "No new customer details are shown while new work is paused."
                        : "新工作暫停期間，呢度唔會顯示新客戶資料。"}
                  </p>
                </div>
                <Link
                  href={canCreateQuotes ? "/pro/leads" : "/pro/billing"}
                  locale={locale}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0",
                  )}
                >
                  {canCreateQuotes
                    ? locale === "en"
                      ? "All leads"
                      : "全部"
                    : locale === "en"
                      ? "Manage billing"
                      : "管理月費"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {recommendedLeads.length ? (
                <div className="grid gap-3">
                  {recommendedLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/pro/leads/${lead.id}`}
                      locale={locale}
                      className={cn(
                        "grid gap-4 rounded-2xl border border-line/70 bg-white/72 p-4 transition hover:border-primary/25 hover:bg-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                        urgentLeadStatuses.includes(lead.urgency) &&
                          "border-primary/24 bg-surface-tint/60",
                      )}
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-xl font-bold">
                            {lead.title}
                          </h3>
                          {urgentLeadStatuses.includes(lead.urgency) ? (
                            <span className="rounded-full bg-secondary/16 px-2.5 py-1 text-xs font-semibold text-warning">
                              {formatUrgencyLabel(lead.urgency, locale)}
                            </span>
                          ) : null}
                          <StatusBadge status={lead.status} locale={locale} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {formatDistrictName(lead.address.district, locale)}
                          </span>
                          <span>{lead.customer.fullName}</span>
                          {lead.category ? (
                            <span>
                              {lead.category.name[locale as "zh-HK" | "en"]}
                            </span>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-foreground/72">
                          {lead.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                        <div className="text-left sm:text-right">
                          <p className="font-display text-xl font-extrabold">
                            {lead.budgetMax
                              ? `${formatCurrency(lead.budgetMin ?? 0, locale)}-${formatCurrency(lead.budgetMax, locale)}`
                              : locale === "en"
                                ? "Flexible"
                                : "彈性"}
                          </p>
                          <p className="text-xs text-muted">
                            {locale === "en" ? "Budget" : "預算"}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                          {locale === "en" ? "Quote" : "報價"}
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white/58 px-5 py-8 text-center">
                  <p className="font-display text-xl font-bold">
                    {canCreateQuotes
                      ? locale === "en"
                        ? "No recommended leads right now"
                        : "暫時未有推薦工作"
                      : locale === "en"
                        ? "New customer leads are hidden"
                        : "新客戶工作機會已隱藏"}
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-muted">
                    {canCreateQuotes
                      ? locale === "en"
                        ? "New matched customer requests will appear here and in the leads list."
                        : "新配對嘅客戶需求會出現在呢度同工作機會清單。"
                      : locale === "en"
                        ? "Existing jobs, schedules, and your own quote records remain available."
                        : "現有訂單、日程同你自己嘅報價紀錄仍然可以查看。"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-extrabold">
                    {locale === "en" ? "Schedule cue" : "今日/下一個日程"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {todayBookings.length
                      ? locale === "en"
                        ? "Today's accepted visits."
                        : "今日已確認上門安排。"
                      : locale === "en"
                        ? "Showing the next accepted visits."
                        : "今日無行程時，顯示下一批已接訂單。"}
                  </p>
                </div>
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>

              {nextBookings.length ? (
                <div className="grid gap-3">
                  {nextBookings.map((booking, index) => (
                    <Link
                      key={booking.id}
                      href={`/pro/jobs/${booking.id}`}
                      locale={locale}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-2xl bg-surface-tint/62 p-3 transition hover:bg-surface-tint"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-bold text-primary">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">
                          {formatDateTime(booking.scheduledDate, locale)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted">
                          {booking.request?.title ?? booking.id}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatDurationMinutes(
                            booking.estimatedDurationMinutes ??
                              booking.quote?.estimatedDurationMinutes,
                            locale,
                          )}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white/58 px-4 py-6 text-sm leading-7 text-muted">
                  {locale === "en"
                    ? "No accepted visits yet. Start from job leads to fill your timetable."
                    : "暫時未有已接上門安排，可以先由工作機會開始報價。"}
                </div>
              )}

              <Link
                href="/pro/calendar"
                locale={locale}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-5 w-full",
                )}
              >
                <CalendarDays className="h-4 w-4" />
                {locale === "en" ? "Open calendar" : "打開日程"}
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </PortalShell>
  );
}

function DashboardStat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="mt-1 font-display text-3xl font-extrabold sm:mt-2 sm:text-4xl">
            {value}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{hint}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-tint text-primary sm:h-11 sm:w-11 sm:rounded-2xl">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}
