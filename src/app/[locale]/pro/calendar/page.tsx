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

export default async function ProCalendarPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const bookings = await listProCalendarBookings(user.id);
  const events: CalendarEvent[] = bookings.map((booking) => ({
    id: booking.id,
    href: `/${locale}/pro/jobs/${booking.id}`,
    title: booking.request?.title ?? booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledDate,
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
        ? "Open the job to update progress or review the accepted quote."
        : "打開工作可更新進度或查看已接受報價。"),
  }));

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Work calendar" : "工作日程"}
      subtitle={
        locale === "en"
          ? "Plan accepted jobs by visit time, customer, district, and booking status."
          : "按上門時間、客戶、地區及訂單狀態安排已接工作。"
      }
      navItems={getProNav(locale, "calendar")}
    >
      <BookingCalendar
        locale={locale}
        events={events}
        perspectiveLabel={locale === "en" ? "Pro schedule" : "師傅日程"}
        emptyTitle={locale === "en" ? "No jobs scheduled" : "未有工作日程"}
        emptyDescription={
          locale === "en"
            ? "Accepted quotes will become scheduled jobs here, with direct links to update progress."
            : "當報價被接受後，工作會在此顯示，並可直接進入訂單更新進度。"
        }
      />
    </PortalShell>
  );
}
