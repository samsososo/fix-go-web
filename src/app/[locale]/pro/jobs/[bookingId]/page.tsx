import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  MapPin,
  Navigation,
  Phone,
} from "lucide-react";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppContactLink } from "@/components/shared/whatsapp-contact-link";
import { Card, CardContent } from "@/components/ui/card";
import { BookingStatusForm } from "@/features/pro/booking-status-form";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDateTime,
  formatDurationMinutes,
  formatHongKongPhone,
  formatRequestWhatsAppMessage,
  formatStatusLabel,
} from "@/lib/formatters";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { env } from "@/lib/env";
import { getProJobDetail } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";
import { formatCurrency } from "@/lib/utils";

export default async function ProJobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const locale = await getLocale();
  const { bookingId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const job = await getProJobDetail(user.id, bookingId);
  if (!job) {
    redirect(`/pro/jobs`);
  }

  const address = job.request?.address;
  const addressParts = address
    ? [
        address.buildingEstate,
        address.block,
        address.floor,
        address.flatRoom,
        formatAreaName(address.area, locale),
        formatDistrictName(address.district, locale),
      ].filter(Boolean)
    : [];
  const fullAddress = addressParts.join(" · ");
  const mapUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : undefined;
  const whatsappMessage = job.request
    ? formatRequestWhatsAppMessage({
        locale,
        context: "job",
        title: job.request.title,
        area: [
          formatDistrictName(job.request.address.district, locale),
          formatAreaName(job.request.address.area, locale),
        ].join(" · "),
        visit: job.scheduledDate
          ? formatDateTime(job.scheduledDate, locale)
          : undefined,
        reference: job.request.id,
        detailUrl: new URL(
          `/customer/orders/${job.id}`,
          env.APP_URL,
        ).toString(),
      })
    : undefined;

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Job detail" : "工作詳情"}
      subtitle={job.request?.title ?? ""}
      navItems={getProNav(locale, "jobs")}
    >
      <Link
        href="/pro/jobs"
        locale={locale}
        className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {locale === "en" ? "Back to jobs" : "返回已接訂單"}
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-5">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold sm:text-2xl">
                {job.request?.title}
              </h2>
              <StatusBadge status={job.status} locale={locale} />
            </div>
            <p className="text-sm text-muted">{job.request?.description}</p>
            <div className="rounded-2xl bg-surface-strong p-4 text-white">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/60">
                <CalendarClock className="h-4 w-4 text-secondary" />
                {locale === "en" ? "Confirmed visit" : "已確認上門"}
              </p>
              <p className="mt-2 font-display text-xl font-bold">
                {formatDateTime(job.scheduledDate, locale)}
              </p>
              <p className="mt-1 inline-flex items-center gap-2 text-sm text-white/72">
                <Clock3 className="h-4 w-4" />
                {formatDurationMinutes(
                  job.estimatedDurationMinutes ??
                    job.quote?.estimatedDurationMinutes,
                  locale,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-line/80 bg-white/82 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                <MapPin className="h-4 w-4" />
                {locale === "en" ? "Service address" : "上門地址"}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6">
                {fullAddress ||
                  (locale === "en" ? "Address not set" : "未設定地址")}
              </p>
              {job.request?.accessNotes ? (
                <p className="mt-2 rounded-xl bg-paper-warm px-3 py-2 text-sm leading-6 text-muted">
                  <span className="font-semibold text-foreground">
                    {locale === "en" ? "Access note: " : "入閘備註："}
                  </span>
                  {job.request.accessNotes}
                </p>
              ) : null}
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary/20 bg-surface-tint px-4 text-sm font-bold text-primary"
                >
                  <Navigation className="h-4 w-4" />
                  {locale === "en" ? "Open directions" : "開啟地圖導航"}
                </a>
              ) : null}
            </div>

            {job.customer ? (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`tel:${job.customer.phone}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-bold text-foreground"
                >
                  <Phone className="h-4 w-4 text-primary" />
                  {locale === "en" ? "Call" : "致電"}
                </a>
                <WhatsAppContactLink
                  phone={job.customer.phone}
                  locale={locale}
                  message={whatsappMessage}
                  className="mt-0 min-h-12 justify-center"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Customer" : "客戶"}
                </p>
                <p className="mt-1 text-muted">{job.customer?.fullName}</p>
                <p className="mt-1 text-xs text-muted">
                  {job.customer ? formatHongKongPhone(job.customer.phone) : "-"}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-3 text-sm sm:p-4">
                <p className="font-semibold">
                  {locale === "en" ? "Quote total" : "報價總額"}
                </p>
                <p className="mt-1 font-display text-lg font-bold">
                  {formatCurrency(job.quote?.total ?? 0, locale)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line/80 bg-card/96 p-3 lg:border-0 lg:bg-transparent lg:p-0">
              <h2 className="mb-3 font-display text-xl font-bold">
                {locale === "en" ? "Update job status" : "更新訂單狀態"}
              </h2>
              <BookingStatusForm
                locale={locale}
                bookingId={job.id}
                currentStatus={job.status}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h2 className="font-display text-xl font-bold sm:text-2xl">
              {locale === "en" ? "Job history" : "訂單紀錄"}
            </h2>
            <div className="space-y-2 text-sm text-muted">
              {job.timeline.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-line bg-white px-3 py-2"
                >
                  {formatStatusLabel(event.status, locale)} ·{" "}
                  {formatDateTime(event.createdAt, locale)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
