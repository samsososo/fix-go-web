import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppContactLink } from "@/components/shared/whatsapp-contact-link";
import { Card, CardContent } from "@/components/ui/card";
import { BookingStatusForm } from "@/features/pro/booking-status-form";
import { getCurrentUser } from "@/lib/auth";
import {
  formatDateTime,
  formatDurationMinutes,
  formatHongKongPhone,
  formatStatusLabel,
} from "@/lib/formatters";
import { formatDistrictName } from "@/lib/hk-locale";
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

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Job detail" : "工作詳情"}
      subtitle={job.request?.title ?? ""}
      navItems={getProNav(locale, "jobs")}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-bold">
                {job.request?.title}
              </h2>
              <StatusBadge status={job.status} locale={locale} />
            </div>
            <p className="text-sm text-muted">{job.request?.description}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Customer" : "客戶"}
                </p>
                <p className="mt-2 text-muted">{job.customer?.fullName}</p>
                {job.customer ? (
                  <>
                    <p className="mt-1 text-muted">
                      {formatHongKongPhone(job.customer.phone)}
                    </p>
                    <WhatsAppContactLink
                      phone={job.customer.phone}
                      locale={locale}
                      className="mt-3"
                    />
                  </>
                ) : null}
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Quote total" : "報價總額"}
                </p>
                <p className="mt-2 text-muted">
                  {formatCurrency(job.quote?.total ?? 0, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Scheduled date" : "預約時間"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDateTime(job.scheduledDate, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm">
                <p className="font-semibold">
                  {locale === "en" ? "Estimated duration" : "預計需時"}
                </p>
                <p className="mt-2 text-muted">
                  {formatDurationMinutes(
                    job.estimatedDurationMinutes ??
                      job.quote?.estimatedDurationMinutes,
                    locale,
                  )}
                </p>
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4 text-sm md:col-span-2">
                <p className="font-semibold">
                  {locale === "en" ? "Service district" : "服務地區"}
                </p>
                <p className="mt-2 text-muted">
                  {job.request
                    ? formatDistrictName(job.request.address.district, locale)
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Update booking status" : "更新訂單狀態"}
            </h2>
            <BookingStatusForm
              locale={locale}
              proId={user.id}
              bookingId={job.id}
              currentStatus={job.status}
            />
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
