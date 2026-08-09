import { describe, expect, it } from "vitest";

import {
  buildMonthCalendar,
  buildWeekCalendar,
  daysInCalendarMonth,
  getHongKongDateKey,
  resolveCalendarDate,
  shiftCalendarMonths,
  toCalendarDateKey,
} from "@/features/calendar/calendar-date";

describe("calendar date helpers", () => {
  it("navigates months across year boundaries", () => {
    expect(shiftCalendarMonths({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 31,
    });
    expect(shiftCalendarMonths({ year: 2027, month: 1, day: 31 }, -1)).toEqual({
      year: 2026,
      month: 12,
      day: 31,
    });
  });

  it("builds a Monday-aligned grid for a leap-year February", () => {
    expect(daysInCalendarMonth(2028, 2)).toBe(29);

    const grid = buildMonthCalendar({ year: 2028, month: 2, day: 15 });
    const keys = grid.map(toCalendarDateKey);

    expect(grid).toHaveLength(42);
    expect(keys[0]).toBe("2028-01-31");
    expect(keys.indexOf("2028-02-01")).toBe(1);
    expect(keys.indexOf("2028-02-29")).toBe(29);
    expect(keys.at(-1)).toBe("2028-03-12");
  });

  it("starts each week on Monday and ends it on Sunday", () => {
    const week = buildWeekCalendar({ year: 2026, month: 5, day: 3 });

    expect(week.map(toCalendarDateKey)).toEqual([
      "2026-04-27",
      "2026-04-28",
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("groups timestamps on the correct side of Hong Kong midnight", () => {
    expect(getHongKongDateKey("2026-05-31T15:59:59.999Z")).toBe("2026-05-31");
    expect(getHongKongDateKey("2026-05-31T16:00:00.000Z")).toBe("2026-06-01");
  });

  it.each(["2026-02-30", "2026-13-01", "not-a-date", undefined])(
    "falls back to the Hong Kong reference date for invalid query value %s",
    (requestedDate) => {
      expect(
        resolveCalendarDate(requestedDate, "2027-12-31T16:30:00.000Z"),
      ).toEqual({ year: 2028, month: 1, day: 1 });
    },
  );
});
