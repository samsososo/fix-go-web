import { getLocale } from "next-intl/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleProVerificationButton } from "@/features/admin/toggle-pro-verification-button";
import { formatStatusLabel } from "@/lib/formatters";
import { formatDistrictList } from "@/lib/hk-locale";
import { getAdminNav } from "@/lib/nav";
import { listAdminPros } from "@/lib/mock/repositories";

export default async function AdminProsPage() {
  const locale = await getLocale();
  const pros = await listAdminPros();

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Pros" : "師傅"}
      subtitle={
        locale === "en"
          ? "Inspect verification status, service areas, and quoting activity."
          : "檢查驗證狀態、服務地區及報價活動。"
      }
      navItems={getAdminNav(locale, "pros")}
    >
      <div className="grid gap-5">
        {pros.length ? (
          pros.map((pro) => (
            <Card key={pro.id}>
              <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <a
                    href={`/admin/pros/${pro.id}`}
                    className="font-display text-2xl font-bold text-primary"
                  >
                    {pro.profile?.displayName ?? pro.fullName}
                  </a>
                  <p className="text-sm text-muted">
                    {pro.profile
                      ? formatDistrictList(
                          pro.profile.serviceAreaDistricts,
                          locale,
                        ).join(", ")
                      : "-"}{" "}
                    ·{" "}
                    {pro.profile?.verificationStatus
                      ? formatStatusLabel(
                          pro.profile.verificationStatus,
                          locale,
                        )
                      : "-"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted">
                    {pro.quotesSent} quotes · {pro.activeJobs} active jobs
                  </p>
                  <ToggleProVerificationButton
                    locale={locale}
                    userId={pro.id}
                    verified={pro.profile?.verificationStatus === "verified"}
                  />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState
            locale={locale}
            title={locale === "en" ? "No pros yet" : "未有師傅"}
            description={
              locale === "en"
                ? "Professional accounts will appear here for verification and ops review."
                : "當有師傅註冊後，資料會在此顯示，方便營運檢視及驗證。"
            }
          />
        )}
      </div>
    </PortalShell>
  );
}
