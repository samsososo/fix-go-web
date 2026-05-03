import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDateTime,
  formatHongKongPhone,
  formatStatusLabel,
} from "@/lib/formatters";
import { formatDistrictList } from "@/lib/hk-locale";
import { getAdminNav } from "@/lib/nav";
import { getAdminProDetail } from "@/lib/mock/repositories";
import { formatCurrency } from "@/lib/utils";

export default async function AdminProDetailPage({
  params,
}: {
  params: Promise<{ locale: string; proId: string }>;
}) {
  const locale = await getLocale();
  const { proId } = await params;
  const detail = await getAdminProDetail(proId);
  if (!detail) {
    redirect(`/${locale}/admin/pros`);
  }

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Pro detail" : "師傅詳情"}
      subtitle={detail.profile?.displayName ?? detail.pro.fullName}
      navItems={getAdminNav(locale, "pros")}
    >
      <div className="grid gap-5 lg:grid-cols-4">
        <StatCard
          label={locale === "en" ? "Quotes sent" : "已送出報價"}
          value={detail.quotes.length}
          hint={locale === "en" ? "All-time quote volume" : "累積報價數量"}
        />
        <StatCard
          label={locale === "en" ? "Jobs" : "訂單"}
          value={detail.jobs.length}
          hint={locale === "en" ? "Accepted bookings" : "已接受訂單"}
        />
        <StatCard
          label={locale === "en" ? "Verification" : "驗證狀態"}
          value={
            detail.profile?.verificationStatus
              ? formatStatusLabel(detail.profile.verificationStatus, locale)
              : "-"
          }
          hint={
            locale === "en"
              ? "Current profile trust status"
              : "現時檔案信任狀態"
          }
        />
        <StatCard
          label={locale === "en" ? "Notifications" : "通知"}
          value={detail.notifications.length}
          hint={
            locale === "en" ? "Operational updates delivered" : "已送出營運更新"
          }
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-display text-2xl font-bold">
              {detail.profile?.displayName ?? detail.pro.fullName}
            </h2>
            <div className="flex items-center gap-3">
              {detail.profile ? (
                <StatusBadge
                  status={detail.profile.verificationStatus as never}
                  locale={locale}
                />
              ) : null}
              <span className="text-sm text-muted">
                {detail.profile?.verificationLevel ?? "-"}
              </span>
            </div>
            <p className="text-sm text-muted">{detail.pro.email ?? "-"}</p>
            <p className="text-sm text-muted">
              {formatHongKongPhone(detail.pro.phone)}
            </p>
            <p className="text-sm text-muted">
              {detail.profile
                ? formatDistrictList(
                    detail.profile.serviceAreaDistricts,
                    locale,
                  ).join(", ")
                : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Recent quotes" : "最近報價"}
            </h2>
            {detail.quotes.length ? (
              <div className="space-y-3">
                {detail.quotes.map((quote) => (
                  <a
                    key={quote.id}
                    href={`/${locale}/admin/quotes/${quote.id}`}
                    className="block rounded-2xl border border-line bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {quote.request?.title ?? quote.id}
                        </p>
                        <p className="text-sm text-muted">
                          {formatDateTime(quote.updatedAt, locale)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatCurrency(quote.total, locale)}
                        </p>
                        <p className="text-xs text-muted">
                          {formatStatusLabel(quote.status, locale)}
                        </p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                locale={locale}
                title={locale === "en" ? "No quotes yet" : "未有報價"}
                description={
                  locale === "en"
                    ? "Quote submissions from this pro will be shown here for review."
                    : "此師傅提交的報價會在此顯示，方便營運檢查。"
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
