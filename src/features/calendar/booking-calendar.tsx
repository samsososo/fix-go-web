"use client";

import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  buildMonthCalendar,
  buildMonthDays,
  buildWeekCalendar,
  calendarDateToUtcDate,
  CalendarDate,
  CalendarView,
  getHongKongDateKey,
  isSameCalendarMonth,
  parseCalendarDate,
  resolveCalendarDate,
  setCalendarMonth,
  setCalendarYear,
  shiftCalendarDays,
  shiftCalendarMonths,
  toCalendarDateKey,
} from "@/features/calendar/calendar-date";
import { formatDurationMinutes } from "@/lib/formatters";
import { cn, formatCurrency } from "@/lib/utils";
import { BookingStatus } from "@/types/domain";

const hkTimeZone = "Asia/Hong_Kong";

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

function formatEventDay(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: hkTimeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
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
    hour12: locale === "en",
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
  return endAt
    ? `${formatTime(event.scheduledAt, locale)} – ${formatTime(endAt, locale)}`
    : formatTime(event.scheduledAt, locale);
}

function formatCalendarDate(
  value: CalendarDate,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(calendarDateToUtcDate(value));
}

function formatPeriodHeading(
  view: CalendarView,
  cursor: CalendarDate,
  days: CalendarDate[],
  locale: string,
) {
  if (view === "month") {
    return formatCalendarDate(cursor, locale, {
      year: "numeric",
      month: "long",
    });
  }

  const start = days[0] ?? cursor;
  const end = days.at(-1) ?? cursor;
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(calendarDateToUtcDate(start))} – ${formatter.format(
    calendarDateToUtcDate(end),
  )}`;
}

function eventTone(status: BookingStatus) {
  if (status === "completed") {
    return "border-success/30 border-l-success bg-success/8 text-success";
  }

  if (status === "in_progress") {
    return "border-primary/30 border-l-primary bg-primary/8 text-primary";
  }

  if (status === "scheduled") {
    return "border-secondary/35 border-l-secondary bg-secondary/10 text-warning";
  }

  return "border-primary/20 border-l-primary bg-surface-tint text-primary";
}

function CalendarEventChip({
  event,
  locale,
}: {
  event: CalendarEvent;
  locale: string;
}) {
  return (
    <a
      href={event.href}
      className={cn(
        "block rounded-lg border border-l-[3px] px-2 py-1.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 motion-reduce:transform-none",
        eventTone(event.status),
      )}
      title={`${formatTimeRange(event, locale)} · ${event.title}`}
    >
      <span className="block text-[11px] font-bold leading-4">
        {formatTime(event.scheduledAt, locale)}
      </span>
      <span className="block truncate text-xs font-semibold text-foreground">
        {event.title}
      </span>
    </a>
  );
}

function AgendaEvent({
  event,
  locale,
  compact = false,
}: {
  event: CalendarEvent;
  locale: string;
  compact?: boolean;
}) {
  return (
    <a
      href={event.href}
      className={cn(
        "group grid gap-3 rounded-2xl border border-line/80 bg-white/88 p-4 transition hover:border-primary/35 hover:shadow-[0_12px_28px_rgba(24,36,51,0.07)] focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none",
        compact
          ? "sm:grid-cols-[0.85fr_1.4fr_auto] sm:items-center"
          : "md:grid-cols-[0.9fr_1.5fr_0.8fr]",
      )}
    >
      <div>
        <p className="text-sm font-bold text-primary">
          {formatTimeRange(event, locale)}
        </p>
        {event.scheduledAt ? (
          <p className="mt-1 text-xs font-medium text-muted">
            {formatEventDay(event.scheduledAt, locale)}
          </p>
        ) : (
          <p className="mt-1 text-xs font-medium text-warning">
            {locale === "en" ? "Visit time not set" : "尚未設定上門時間"}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          {locale === "en" ? "Duration" : "需時"}:{" "}
          {formatDurationMinutes(event.durationMinutes, locale)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="font-semibold text-foreground">{event.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {event.counterpart} · {event.district}
          </span>
        </p>
        {!compact ? (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
            {event.note}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end md:flex-col md:items-end">
        <StatusBadge status={event.status} locale={locale} />
        <div className="flex items-center gap-2">
          {typeof event.amount === "number" ? (
            <p className="text-sm font-semibold">
              {formatCurrency(event.amount, locale)}
            </p>
          ) : null}
          <ArrowUpRight
            className="h-4 w-4 text-muted transition group-hover:text-primary"
            aria-hidden="true"
          />
        </div>
      </div>
    </a>
  );
}

export function BookingCalendar({
  locale,
  events,
  view: initialView = "month",
  preferMobileAgenda = false,
  initialDate,
  referenceDate,
  emptyTitle,
  emptyDescription,
  perspectiveLabel,
}: {
  locale: string;
  events: CalendarEvent[];
  view?: CalendarView;
  preferMobileAgenda?: boolean;
  initialDate?: string;
  referenceDate: string;
  emptyTitle: string;
  emptyDescription: string;
  perspectiveLabel: string;
}) {
  const today = useMemo(
    () => resolveCalendarDate(undefined, referenceDate),
    [referenceDate],
  );
  const [view, setView] = useState<CalendarView>(initialView);
  const [cursor, setCursor] = useState<CalendarDate>(() =>
    resolveCalendarDate(initialDate, referenceDate),
  );

  const activeEvents = useMemo(
    () => events.filter((event) => event.status !== "cancelled"),
    [events],
  );
  const scheduledEvents = useMemo(
    () =>
      activeEvents
        .filter((event) => event.scheduledAt)
        .sort(
          (left, right) =>
            new Date(left.scheduledAt!).getTime() -
            new Date(right.scheduledAt!).getTime(),
        ),
    [activeEvents],
  );
  const unscheduledEvents = useMemo(
    () => activeEvents.filter((event) => !event.scheduledAt),
    [activeEvents],
  );
  const groupedEvents = useMemo(
    () =>
      scheduledEvents.reduce<Record<string, CalendarEvent[]>>(
        (grouped, event) => {
          const key = getHongKongDateKey(event.scheduledAt);
          grouped[key] = [...(grouped[key] ?? []), event];
          return grouped;
        },
        {},
      ),
    [scheduledEvents],
  );

  const periodDays = useMemo(
    () =>
      view === "month" ? buildMonthDays(cursor) : buildWeekCalendar(cursor),
    [cursor, view],
  );
  const gridDays = useMemo(
    () =>
      view === "month" ? buildMonthCalendar(cursor) : buildWeekCalendar(cursor),
    [cursor, view],
  );
  const visibleKeys = useMemo(
    () => new Set(periodDays.map(toCalendarDateKey)),
    [periodDays],
  );
  const visibleEvents = useMemo(
    () =>
      scheduledEvents.filter((event) =>
        visibleKeys.has(getHongKongDateKey(event.scheduledAt)),
      ),
    [scheduledEvents, visibleKeys],
  );
  const selectedDayEvents = groupedEvents[toCalendarDateKey(cursor)] ?? [];
  const nextEvent = useMemo(
    () =>
      scheduledEvents.find(
        (event) =>
          event.status !== "completed" &&
          new Date(event.scheduledAt!).getTime() >=
            new Date(referenceDate).getTime(),
      ),
    [referenceDate, scheduledEvents],
  );

  const yearOptions = useMemo(() => {
    const eventYears = scheduledEvents
      .map((event) => parseCalendarDate(getHongKongDateKey(event.scheduledAt)))
      .filter((date): date is CalendarDate => Boolean(date))
      .map((date) => date.year);
    const start = Math.min(today.year, cursor.year, ...eventYears) - 2;
    const end = Math.max(today.year, cursor.year, ...eventYears) + 3;

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [cursor.year, scheduledEvents, today.year]);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: index + 1,
        label: formatCalendarDate(
          { year: cursor.year, month: index + 1, day: 1 },
          locale,
          { month: "long" },
        ),
      })),
    [cursor.year, locale],
  );
  const weekdayLabels = useMemo(
    () =>
      buildWeekCalendar({ year: 2024, month: 1, day: 1 }).map((day) =>
        formatCalendarDate(day, locale, {
          weekday: "short",
        }),
      ),
    [locale],
  );

  const heading = formatPeriodHeading(view, cursor, periodDays, locale);
  const cursorKey = toCalendarDateKey(cursor);
  const todayKey = toCalendarDateKey(today);
  const rows = Array.from(
    { length: Math.ceil(gridDays.length / 7) },
    (_, index) => gridDays.slice(index * 7, index * 7 + 7),
  );

  useEffect(() => {
    if (
      preferMobileAgenda &&
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      const timeoutId = window.setTimeout(() => setView("week"), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [preferMobileAgenda]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.location.protocol === "about:"
    ) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("date", cursorKey);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [cursorKey, view]);

  function movePeriod(direction: -1 | 1) {
    setCursor((current) =>
      view === "month"
        ? shiftCalendarMonths(current, direction)
        : shiftCalendarDays(current, direction * 7),
    );
  }

  function showEventDate(event: CalendarEvent) {
    const date = parseCalendarDate(getHongKongDateKey(event.scheduledAt));
    if (date) {
      setCursor(date);
    }
  }

  const previousLabel =
    view === "month"
      ? locale === "en"
        ? "Previous month"
        : "上一個月"
      : locale === "en"
        ? "Previous week"
        : "上一星期";
  const nextLabel =
    view === "month"
      ? locale === "en"
        ? "Next month"
        : "下一個月"
      : locale === "en"
        ? "Next week"
        : "下一星期";

  return (
    <div className="space-y-5">
      {nextEvent ? (
        <Card className="overflow-hidden border-surface-strong/15 bg-surface-strong text-white">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-secondary">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/58">
                  {locale === "en"
                    ? "Next confirmed visit"
                    : "下一個已確認上門"}
                </p>
                <p className="mt-1 truncate font-display text-xl font-bold">
                  {nextEvent.title}
                </p>
                <p className="mt-1 text-sm text-white/68">
                  {formatEventDay(nextEvent.scheduledAt!, locale)} ·{" "}
                  {formatTimeRange(nextEvent, locale)} · {nextEvent.district}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => showEventDate(nextEvent)}
                className="min-h-10 rounded-full border border-white/18 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/14 focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {locale === "en" ? "Show in calendar" : "喺日曆顯示"}
              </button>
              <a
                href={nextEvent.href}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-bold text-secondary-foreground transition hover:bg-secondary/90 focus-visible:ring-2 focus-visible:ring-secondary/60"
              >
                {locale === "en" ? "Open booking" : "打開訂單"}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="-mx-3 overflow-hidden bg-card/95 sm:mx-0">
        <CardContent className="p-0">
          <div className="border-b border-line/70 bg-white/55 p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{perspectiveLabel}</Badge>
                  <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-bold text-primary">
                    {view === "month"
                      ? locale === "en"
                        ? `${visibleEvents.length} this month`
                        : `本月 ${visibleEvents.length} 項`
                      : locale === "en"
                        ? `${visibleEvents.length} this week`
                        : `本星期 ${visibleEvents.length} 項`}
                  </span>
                  {unscheduledEvents.length ? (
                    <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
                      {locale === "en"
                        ? `${unscheduledEvents.length} need scheduling`
                        : `${unscheduledEvents.length} 項待安排`}
                    </span>
                  ) : null}
                </div>
                <h2
                  className="mt-2 font-display text-2xl font-extrabold sm:text-3xl"
                  aria-live="polite"
                >
                  {heading}
                </h2>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="grid grid-cols-[44px_1fr_44px] rounded-xl border border-line/80 bg-card p-1 sm:flex">
                  <button
                    type="button"
                    onClick={() => movePeriod(-1)}
                    aria-label={previousLabel}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground/72 transition hover:bg-surface-tint hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor(today)}
                    className="min-h-11 rounded-lg px-3 text-sm font-bold text-foreground transition hover:bg-surface-tint hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    {locale === "en" ? "Today" : "今天"}
                  </button>
                  <button
                    type="button"
                    onClick={() => movePeriod(1)}
                    aria-label={nextLabel}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground/72 transition hover:bg-surface-tint hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div
                  className={cn(
                    "grid grid-cols-2 gap-2",
                    view === "week" && "hidden md:grid",
                  )}
                >
                  <label>
                    <span className="sr-only">
                      {locale === "en" ? "Choose month" : "選擇月份"}
                    </span>
                    <Select
                      aria-label={locale === "en" ? "Choose month" : "選擇月份"}
                      value={cursor.month}
                      onChange={(event) =>
                        setCursor((current) =>
                          setCalendarMonth(current, Number(event.target.value)),
                        )
                      }
                      className="min-h-12 rounded-xl border-line/80 bg-card px-3 text-sm font-semibold shadow-none"
                    >
                      {monthOptions.map((month) => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    <span className="sr-only">
                      {locale === "en" ? "Choose year" : "選擇年份"}
                    </span>
                    <Select
                      aria-label={locale === "en" ? "Choose year" : "選擇年份"}
                      value={cursor.year}
                      onChange={(event) =>
                        setCursor((current) =>
                          setCalendarYear(current, Number(event.target.value)),
                        )
                      }
                      className="min-h-12 rounded-xl border-line/80 bg-card px-3 text-sm font-semibold shadow-none"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>

                <div className="grid grid-cols-2 rounded-xl bg-foreground/6 p-1">
                  {(["week", "month"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                      className={cn(
                        "min-h-11 rounded-lg px-3 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-primary/35",
                        view === option
                          ? "bg-white text-primary shadow-sm"
                          : "text-muted hover:text-primary",
                      )}
                    >
                      {option === "week"
                        ? locale === "en"
                          ? "Week"
                          : "星期"
                        : locale === "en"
                          ? "Month"
                          : "月份"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] table-fixed border-collapse">
              <caption className="sr-only">
                {locale === "en"
                  ? `${heading} booking calendar`
                  : `${heading}預約日曆`}
              </caption>
              <thead>
                <tr>
                  {weekdayLabels.map((label, index) => (
                    <th
                      key={`${label}-${index}`}
                      scope="col"
                      className="border-b border-r border-line/60 bg-paper-warm/55 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-[0.1em] text-muted last:border-r-0"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={toCalendarDateKey(row[0])}>
                    {row.map((day, columnIndex) => {
                      const key = toCalendarDateKey(day);
                      const inSelectedMonth =
                        view === "week" || isSameCalendarMonth(day, cursor);
                      const dayEvents = inSelectedMonth
                        ? (groupedEvents[key] ?? [])
                        : [];
                      const isToday = key === todayKey;
                      const isSelected = key === cursorKey;

                      return (
                        <td
                          key={key}
                          className={cn(
                            "h-[118px] border-b border-r border-line/60 p-2 align-top last:border-r-0",
                            rowIndex === rows.length - 1 && "border-b-0",
                            !inSelectedMonth && "bg-foreground/[0.025]",
                            isSelected && "bg-surface-tint/55",
                            (columnIndex === 5 || columnIndex === 6) &&
                              inSelectedMonth &&
                              "bg-paper-warm/38",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setCursor(day)}
                            aria-pressed={isSelected}
                            aria-label={formatCalendarDate(day, locale, {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                            className={cn(
                              "mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-primary/40",
                              isToday
                                ? "bg-primary text-white shadow-[0_4px_12px_rgba(15,99,95,0.24)]"
                                : inSelectedMonth
                                  ? "text-foreground hover:bg-soft-accent hover:text-primary"
                                  : "text-muted/55 hover:bg-white",
                            )}
                          >
                            <time
                              dateTime={key}
                              aria-current={isToday ? "date" : undefined}
                            >
                              {day.day}
                            </time>
                          </button>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 2).map((event) => (
                              <CalendarEventChip
                                key={event.id}
                                event={event}
                                locale={locale}
                              />
                            ))}
                            {dayEvents.length > 2 ? (
                              <button
                                type="button"
                                onClick={() => setCursor(day)}
                                className="px-1 text-[11px] font-bold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/35"
                              >
                                +{dayEvents.length - 2}{" "}
                                {locale === "en" ? "more" : "項"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            <div className="grid grid-cols-7 border-b border-line/60 bg-paper-warm/45">
              {weekdayLabels.map((label, index) => (
                <div
                  key={`${label}-mobile-${index}`}
                  className="py-2 text-center text-[11px] font-bold text-muted"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((day) => {
                const key = toCalendarDateKey(day);
                const inSelectedMonth =
                  view === "week" || isSameCalendarMonth(day, cursor);
                const dayEvents = inSelectedMonth
                  ? (groupedEvents[key] ?? [])
                  : [];
                const isToday = key === todayKey;
                const isSelected = key === cursorKey;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCursor(day)}
                    aria-pressed={isSelected}
                    aria-label={formatCalendarDate(day, locale, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    className={cn(
                      "relative flex min-h-14 flex-col items-center justify-center border-b border-r border-line/50 text-sm font-bold transition focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                      !inSelectedMonth && "bg-foreground/[0.025] text-muted/45",
                      isSelected && "bg-surface-tint text-primary",
                    )}
                  >
                    <time
                      dateTime={key}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full",
                        isToday && "bg-primary text-white",
                      )}
                    >
                      {day.day}
                    </time>
                    {dayEvents.length ? (
                      <span
                        className="mt-0.5 flex items-center gap-0.5"
                        aria-hidden="true"
                      >
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            className="h-1 w-1 rounded-full bg-secondary"
                          />
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-line/60 bg-white/42 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-primary">
                    {locale === "en" ? "Selected day" : "已選日期"}
                  </p>
                  <h3 className="mt-0.5 font-display text-lg font-bold">
                    {formatCalendarDate(cursor, locale, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </h3>
                </div>
                <span className="rounded-full bg-foreground/6 px-3 py-1 text-xs font-bold text-muted">
                  {selectedDayEvents.length} {locale === "en" ? "visits" : "項"}
                </span>
              </div>
              {selectedDayEvents.length ? (
                <div className="space-y-2">
                  {selectedDayEvents.map((event) => (
                    <AgendaEvent
                      key={event.id}
                      event={event}
                      locale={locale}
                      compact
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-card/65 px-4 py-5 text-center text-sm text-muted">
                  {locale === "en"
                    ? "No visit planned for this day."
                    : "呢一日暫時未有上門安排。"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="hidden md:block">
        {activeEvents.length === 0 ? (
          <EmptyState
            locale={locale}
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {view === "month"
                      ? locale === "en"
                        ? "This month"
                        : "本月安排"
                      : locale === "en"
                        ? "This week"
                        : "本星期安排"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold">
                    {locale === "en" ? "Schedule detail" : "日程詳情"}
                  </h2>
                </div>
                <p className="text-sm text-muted">
                  {locale === "en"
                    ? "All times are shown in Hong Kong time."
                    : "全部時間以香港時間顯示。"}
                </p>
              </div>

              {visibleEvents.length ? (
                <div className="space-y-3">
                  {visibleEvents.map((event) => (
                    <AgendaEvent key={event.id} event={event} locale={locale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-white/55 px-6 py-9 text-center">
                  <CalendarDays
                    className="mx-auto h-7 w-7 text-primary/55"
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-semibold">
                    {locale === "en"
                      ? "No scheduled visits in this period"
                      : "呢段時間未有已安排上門"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {locale === "en"
                      ? "Use the month or year controls above to check another period."
                      : "可以用上面嘅月份或年份選擇器查看其他日程。"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {unscheduledEvents.length ? (
        <Card className="border-warning/20 bg-paper-warm/88">
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-warning">
                  {locale === "en" ? "Needs scheduling" : "需要補時間"}
                </p>
                <h2 className="mt-0.5 font-display text-xl font-bold">
                  {locale === "en"
                    ? `${unscheduledEvents.length} bookings need a visit time`
                    : `${unscheduledEvents.length} 個訂單仍未設定上門時間`}
                </h2>
              </div>
            </div>
            <div className="space-y-3">
              {unscheduledEvents.map((event) => (
                <AgendaEvent
                  key={event.id}
                  event={event}
                  locale={locale}
                  compact
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
