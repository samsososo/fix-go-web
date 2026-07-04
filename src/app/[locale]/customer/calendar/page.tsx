import { getLocale } from "next-intl/server";

import {
  BookingCalendar,
  CalendarEvent,
} from "@/features/calendar/booking-calendar";
import { PortalShell } from "@/components/shared/portal-shell";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import { listCustomerCalendarBookings } from "@/lib/mock/repositories";
import { getCustomerNav } from "@/lib/nav";

export default async function CustomerCalendarPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const bookings = await listCustomerCalendarBookings(user.id);
  const events: CalendarEvent[] = bookings.map((booking) => ({
    id: booking.id,
    href: `/customer/orders/${booking.id}`,
    title: booking.request?.title ?? booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledDate,
    district: booking.request
      ? formatDistrictName(booking.request.address.district, locale)
      : locale === "en"
        ? "District not set"
        : "未設定地區",
    counterpart: booking.pro?.fullName ?? (locale === "en" ? "Pro" : "師傅"),
    amount: booking.quote?.total,
    note:
      booking.request?.accessNotes ||
      (locale === "en"
        ? "Open the booking to review quote detail and progress."
        : "打開訂單查看報價詳情及進度。"),
  }));

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "My calendar" : "我的日程"}
      subtitle={
        locale === "en"
          ? "A practical schedule view for accepted bookings and confirmed home visits."
          : "集中查看已接受訂單及已確認上門時間，方便安排屋企有人接待。"
      }
      navItems={getCustomerNav(locale, "calendar")}
    >
      <BookingCalendar
        locale={locale}
        events={events}
        perspectiveLabel={locale === "en" ? "Customer schedule" : "客戶日程"}
        emptyTitle={locale === "en" ? "No bookings scheduled" : "未有上門日程"}
        emptyDescription={
          locale === "en"
            ? "Accepted quotes will appear here with visit dates, times, status, and professional details."
            : "當你接受報價後，上門日期、時間、狀態及師傅資料會在此顯示。"
        }
      />
    </PortalShell>
  );
}
