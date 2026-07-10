import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatDurationMinutes } from "@/lib/formatters";
import { cn, formatCurrency } from "@/lib/utils";
import { BookingStatus } from "@/types/domain";

const hkTimeZone = "Asia/Hong_Kong";
const dayMs = 24 * 60 * 60 * 1000;

export interface CalendarEvent {
  id: string;
  href: string;
  title: string;
  status: BookingStatus;
  scheduledAt?: string;
  durationMinutes?: number;
  district: string;
  counterpart: string;
  amount?: number;
  note: string;
}

function getDateKey(value: string | undefined) {
  if (!value) {
    return "unscheduled";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: hkTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "unscheduled";
}

function formatDayLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: hkTimeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDayNumber(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: hkTimeZone,
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | undefined, locale: string) {
  if (!value) {
    return locale === "en" ? "Time TBC" : "時間待定";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: hkTimeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function addMinutes(value: string | undefined, minutes: number | undefined) {
  if (!value || !minutes) {
    return undefined;
  }

  return new Date(
    new Date(value).getTime() + minutes * 60 * 1000,
  ).toISOString();
}

function formatTimeRange(event: CalendarEvent, locale: string) {
  if (!event.scheduledAt) {
    return locale === "en" ? "Time TBC" : "時間待定";
  }

  const endAt = addMinutes(event.scheduledAt, event.durationMinutes);
  if (!endAt) {
    return formatTime(event.scheduledAt, locale);
  }

  return `${formatTime(event.scheduledAt, locale)} - ${formatTime(endAt, locale)}`;
}

function buildWeek(events: CalendarEvent[]) {
  const firstScheduled = events.find((event) => event.scheduledAt)?.scheduledAt;
  const start = new Date(firstScheduled ?? new Date().toISOString());

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start.getTime() + index * dayMs).toISOString();
    return {
      key: getDateKey(value),
      value,
    };
  });
}

function buildMonth(events: CalendarEvent[]) {
  const firstScheduled = events.find((event) => event.scheduledAt)?.scheduledAt;
  const baseKey = getDateKey(firstScheduled ?? new Date().toISOString());
  const [yearValue, monthValue] = baseKey.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const value = new Date(
      Date.UTC(year, month - 1, index + 1, 4),
    ).toISOString();
    return {
      key: getDateKey(value),
      value,
    };
  });
}

export function BookingCalendar({
  locale,
  events,
  view = "week",
  emptyTitle,
  emptyDescription,
  perspectiveLabel,
}: {
  locale: string;
  events: CalendarEvent[];
  view?: "week" | "month";
  emptyTitle: string;
  emptyDescription: string;
  perspectiveLabel: string;
}) {
  const scheduledEvents = events.filter((event) => event.scheduledAt);
  const unscheduledEvents = events.filter((event) => !event.scheduledAt);
  const visibleDays = view === "month" ? buildMonth(events) : buildWeek(events);
  const visibleKeys = new Set(visibleDays.map((day) => day.key));
  const outsideVisibleEvents = scheduledEvents.filter(
    (event) => !visibleKeys.has(getDateKey(event.scheduledAt)),
  );
  const groupedEvents = scheduledEvents.reduce<Record<string, CalendarEvent[]>>(
    (grouped, event) => {
      const key = getDateKey(event.scheduledAt);
      grouped[key] = [...(grouped[key] ?? []), event];
      return grouped;
    },
    {},
  );

  const nextEvent = scheduledEvents[0];
  const visibleEventCount = scheduledEvents.filter((event) =>
    visibleKeys.has(getDateKey(event.scheduledAt)),
  ).length;

  if (!events.length) {
    return (
      <EmptyState
        locale={locale}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden bg-primary text-white">
          <CardContent className="space-y-4">
            <Badge className="bg-white/16 text-white" variant="muted">
              {perspectiveLabel}
            </Badge>
            <div>
              <p className="text-sm text-white/70">
                {locale === "en" ? "Next confirmed visit" : "下一個已確認上門"}
              </p>
              <h2 className="mt-2 font-display text-3xl font-extrabold">
                {nextEvent
                  ? formatDayLabel(nextEvent.scheduledAt!, locale)
                  : locale === "en"
                    ? "No time set"
                    : "未設定時間"}
              </h2>
              <p className="mt-2 text-sm text-white/72">
                {nextEvent
                  ? `${formatTimeRange(nextEvent, locale)} · ${nextEvent.title}`
                  : locale === "en"
                    ? "Accepted bookings without a time are listed below."
                    : "未設定時間的訂單會列在下方。"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-sm font-semibold text-muted">
              {locale === "en" ? "This schedule window" : "本排程視窗"}
            </p>
            <p className="mt-3 font-display text-4xl font-extrabold">
              {visibleEventCount}
            </p>
            <p className="mt-2 text-sm text-muted">
              {view === "month"
                ? locale === "en"
                  ? "Bookings shown in this month."
                  : "個訂單顯示於本月日程。"
                : locale === "en"
                  ? "Bookings shown in the 7-day calendar."
                  : "個訂單顯示於 7 日日程。"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-sm font-semibold text-muted">
              {locale === "en" ? "Needs scheduling" : "需要補時間"}
            </p>
            <p className="mt-3 font-display text-4xl font-extrabold">
              {unscheduledEvents.length}
            </p>
            <p className="mt-2 text-sm text-muted">
              {locale === "en"
                ? "Accepted bookings without a confirmed visit time."
                : "個已接受訂單仍未有確定上門時間。"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        {visibleDays.map((day, index) => {
          const dayEvents = groupedEvents[day.key] ?? [];
          return (
            <Card
              key={day.key}
              className={cn(
                "bg-white/82",
                view === "month" ? "min-h-[170px]" : "min-h-[210px]",
                index === 0 && view === "week"
                  ? "border-primary/35 bg-primary/5"
                  : "",
              )}
            >
              <CardContent className="space-y-4 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    {formatDayLabel(day.value, locale)}
                  </p>
                  <p className="mt-1 font-display text-3xl font-extrabold">
                    {formatDayNumber(day.value, locale)}
                  </p>
                </div>
                {dayEvents.length ? (
                  <div className="space-y-3">
                    {dayEvents.map((event) => (
                      <a
                        key={event.id}
                        href={event.href}
                        className="block rounded-2xl border border-line bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/35"
                      >
                        <p className="text-xs font-semibold text-primary">
                          {formatTimeRange(event, locale)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold">
                          {event.title}
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
                    {locale === "en" ? "No visit planned" : "未有上門安排"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">
                {locale === "en" ? "Schedule detail" : "日程詳情"}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold">
                {locale === "en"
                  ? "Confirmed and pending visit times"
                  : "已確認及待補時間的上門安排"}
              </h2>
            </div>
            <p className="text-sm text-muted">
              {locale === "en"
                ? "Displayed in Hong Kong time."
                : "全部以香港時間顯示。"}
            </p>
          </div>

          <div className="space-y-3">
            {[...scheduledEvents, ...outsideVisibleEvents, ...unscheduledEvents]
              .filter(
                (event, index, list) =>
                  list.findIndex((entry) => entry.id === event.id) === index,
              )
              .map((event) => (
                <a
                  key={event.id}
                  href={event.href}
                  className="grid gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-primary/35 md:grid-cols-[0.9fr_1.5fr_0.8fr]"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {formatTimeRange(event, locale)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(event.scheduledAt, locale)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {locale === "en" ? "Duration" : "需時"}:{" "}
                      {formatDurationMinutes(event.durationMinutes, locale)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">{event.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {event.counterpart} · {event.district}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {event.note}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-3 md:items-end">
                    <StatusBadge status={event.status} locale={locale} />
                    {typeof event.amount === "number" ? (
                      <p className="font-semibold">
                        {formatCurrency(event.amount, locale)}
                      </p>
                    ) : null}
                  </div>
                </a>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
