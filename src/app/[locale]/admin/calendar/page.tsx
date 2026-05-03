import { getLocale } from "next-intl/server";

import {
  BookingCalendar,
  CalendarEvent,
} from "@/features/calendar/booking-calendar";
import { PortalShell } from "@/components/shared/portal-shell";
import { formatDistrictName } from "@/lib/hk-locale";
import { listAdminCalendarBookings } from "@/lib/mock/repositories";
import { getAdminNav } from "@/lib/nav";

export default async function AdminCalendarPage() {
  const locale = await getLocale();
  const bookings = await listAdminCalendarBookings();
  const events: CalendarEvent[] = bookings.map((booking) => ({
    id: booking.id,
    href: `/${locale}/admin/requests/${booking.requestId}`,
    title: booking.request?.title ?? booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledDate,
    district: booking.request
      ? formatDistrictName(booking.request.address.district, locale)
      : locale === "en"
        ? "District not set"
        : "未設定地區",
    counterpart:
      locale === "en"
        ? `${booking.customer?.fullName ?? "Customer"} / ${booking.pro?.fullName ?? "Pro"}`
        : `${booking.customer?.fullName ?? "客戶"} / ${booking.pro?.fullName ?? "師傅"}`,
    amount: booking.quote?.total,
    note:
      booking.request?.accessNotes ||
      (locale === "en"
        ? "Open the request to inspect the customer, pro, quote, and manual status controls."
        : "打開服務請求可檢查客戶、師傅、報價及手動狀態控制。"),
  }));

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Operations calendar" : "營運排程"}
      subtitle={
        locale === "en"
          ? "A single operational view of accepted bookings across customers and professionals."
          : "集中查看全平台已接受訂單，方便營運跟進上門時間及狀態。"
      }
      navItems={getAdminNav(locale, "calendar")}
    >
      <BookingCalendar
        locale={locale}
        events={events}
        perspectiveLabel={locale === "en" ? "Ops schedule" : "營運排程"}
        emptyTitle={
          locale === "en" ? "No bookings to schedule" : "未有需排程訂單"
        }
        emptyDescription={
          locale === "en"
            ? "Accepted bookings will appear here after customers choose a quote."
            : "當客戶接受報價後，相關訂單會出現在此供營運跟進。"
        }
      />
    </PortalShell>
  );
}
