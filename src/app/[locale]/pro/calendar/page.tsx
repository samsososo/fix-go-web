import { getLocale } from "next-intl/server";

import {
  BookingCalendar,
  CalendarEvent,
} from "@/features/calendar/booking-calendar";
import { PortalShell } from "@/components/shared/portal-shell";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { listProCalendarBookings } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const locale = await getLocale();
  const { view: viewParam, date } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const view = viewParam === "week" ? "week" : "month";
  const referenceDate = new Date().toISOString();
  const bookings = await listProCalendarBookings(user.id);
  const events: CalendarEvent[] = bookings.map((booking) => ({
    id: booking.id,
    href: `/pro/jobs/${booking.id}`,
    title: booking.request?.title ?? booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledDate,
    durationMinutes:
      booking.estimatedDurationMinutes ??
      booking.quote?.estimatedDurationMinutes,
    district: booking.request
      ? formatDistrictName(booking.request.address.district, locale)
      : locale === "en"
        ? "District not set"
        : "未設定地區",
    counterpart:
      booking.customer?.fullName ?? (locale === "en" ? "Customer" : "客戶"),
    amount: booking.quote?.total,
    note:
      booking.request?.accessNotes ||
      (locale === "en"
        ? "Open the booking to update the job status."
        : "打開訂單可更新工作進度。"),
  }));

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Schedule" : "日程"}
      subtitle={
        locale === "en"
          ? "Confirmed jobs are arranged by visit time so you can see where to go next."
          : "已確認訂單會按上門時間排好，登入即可睇到幾時要去邊。"
      }
      navItems={getProNav(locale, "calendar")}
    >
      <BookingCalendar
        locale={locale}
        events={events}
        view={view}
        preferMobileAgenda={!viewParam}
        initialDate={date}
        referenceDate={referenceDate}
        perspectiveLabel={locale === "en" ? "My timetable" : "我的日程"}
        emptyTitle={locale === "en" ? "No scheduled jobs yet" : "未有日程"}
        emptyDescription={
          locale === "en"
            ? "Accepted jobs with visit times will appear here."
            : "已接受並有上門時間的訂單會出現在這裡。"
        }
      />
    </PortalShell>
  );
}
