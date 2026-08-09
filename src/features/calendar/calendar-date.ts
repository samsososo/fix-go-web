export type CalendarView = "week" | "month";

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(value: CalendarDate) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
}

function fromUtcDate(value: Date): CalendarDate {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export function getHongKongDateKey(value: string | undefined) {
  if (!value) {
    return "unscheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unscheduled";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "unscheduled";
}

export function parseCalendarDate(value: string | undefined) {
  const match = value?.match(dateKeyPattern);
  if (!match) {
    return undefined;
  }

  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const normalized = fromUtcDate(toUtcDate(parsed));

  return normalized.year === parsed.year &&
    normalized.month === parsed.month &&
    normalized.day === parsed.day
    ? parsed
    : undefined;
}

export function resolveCalendarDate(
  requestedDate: string | undefined,
  referenceDate: string,
) {
  return (
    parseCalendarDate(requestedDate) ??
    parseCalendarDate(getHongKongDateKey(referenceDate)) ?? {
      year: 1970,
      month: 1,
      day: 1,
    }
  );
}

export function toCalendarDateKey(value: CalendarDate) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(
    value.day,
  ).padStart(2, "0")}`;
}

export function daysInCalendarMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

export function shiftCalendarDays(value: CalendarDate, amount: number) {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromUtcDate(date);
}

export function shiftCalendarMonths(value: CalendarDate, amount: number) {
  const targetMonth = new Date(
    Date.UTC(value.year, value.month - 1 + amount, 1, 12),
  );
  const year = targetMonth.getUTCFullYear();
  const month = targetMonth.getUTCMonth() + 1;

  return {
    year,
    month,
    day: Math.min(value.day, daysInCalendarMonth(year, month)),
  };
}

export function setCalendarMonth(value: CalendarDate, month: number) {
  return shiftCalendarMonths(value, month - value.month);
}

export function setCalendarYear(value: CalendarDate, year: number) {
  return {
    year,
    month: value.month,
    day: Math.min(value.day, daysInCalendarMonth(year, value.month)),
  };
}

export function startOfCalendarWeek(value: CalendarDate) {
  const dayOfWeek = toUtcDate(value).getUTCDay();
  const distanceFromMonday = (dayOfWeek + 6) % 7;
  return shiftCalendarDays(value, -distanceFromMonday);
}

export function buildWeekCalendar(value: CalendarDate) {
  const start = startOfCalendarWeek(value);
  return Array.from({ length: 7 }, (_, index) =>
    shiftCalendarDays(start, index),
  );
}

export function buildMonthDays(value: CalendarDate) {
  return Array.from(
    { length: daysInCalendarMonth(value.year, value.month) },
    (_, index) => ({ year: value.year, month: value.month, day: index + 1 }),
  );
}

export function buildMonthCalendar(value: CalendarDate) {
  const firstDay = { year: value.year, month: value.month, day: 1 };
  const firstDayOfWeek = toUtcDate(firstDay).getUTCDay();
  const leadingDays = (firstDayOfWeek + 6) % 7;
  const gridStart = shiftCalendarDays(firstDay, -leadingDays);

  return Array.from({ length: 42 }, (_, index) =>
    shiftCalendarDays(gridStart, index),
  );
}

export function isSameCalendarMonth(
  value: CalendarDate,
  reference: CalendarDate,
) {
  return value.year === reference.year && value.month === reference.month;
}

export function calendarDateToUtcDate(value: CalendarDate) {
  return toUtcDate(value);
}
