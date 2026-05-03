import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProProfileForm } from "@/features/pro/pro-profile-form";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictList } from "@/lib/hk-locale";
import {
  listCategoryOptions,
  listDistricts,
  getProProfile,
} from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProProfilePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [profile, categoryOptions, districts] = await Promise.all([
    getProProfile(user.id),
    listCategoryOptions(locale as "zh-HK" | "en"),
    listDistricts(),
  ]);

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Complete your pro profile" : "完善師傅檔案"}
      subtitle={
        locale === "en"
          ? "This profile controls lead relevance and future trust indicators."
          : "此檔案直接影響工作機會配對及信任訊號。"
      }
      navItems={getProNav(locale, "profile")}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <StatCard
          label={locale === "en" ? "Completed jobs" : "已完成工作"}
          value={profile.completedJobs}
          hint={
            locale === "en"
              ? "Used to build trust with customers"
              : "有助建立住戶信任"
          }
        />
        <StatCard
          label={locale === "en" ? "Avg response" : "平均回覆"}
          value={`${profile.avgResponseHours}h`}
          hint={locale === "en" ? "Lead response speed" : "回應工作機會的速度"}
        />
        <StatCard
          label={locale === "en" ? "Service districts" : "服務地區"}
          value={profile.serviceAreaDistricts.length}
          hint={
            locale === "en"
              ? "Districts currently covered"
              : "現時已覆蓋地區數量"
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {profile.displayName}
            </h2>
            <div className="flex items-center gap-3">
              <StatusBadge
                status={profile.verificationStatus as never}
                locale={locale}
              />
              <span className="text-sm text-muted">
                {profile.verificationLevel}
              </span>
            </div>
            <p className="text-sm text-muted">
              {profile.introduction ||
                (locale === "en" ? "No introduction yet." : "尚未填寫介紹。")}
            </p>
            <div className="grid gap-3 text-sm text-muted">
              <div className="rounded-2xl bg-soft-accent/45 p-4">
                {locale === "en" ? "Categories" : "服務分類"}:{" "}
                {profile.serviceCategoryIds.join(", ") || "-"}
              </div>
              <div className="rounded-2xl bg-soft-accent/45 p-4">
                {locale === "en" ? "Districts" : "服務地區"}:{" "}
                {formatDistrictList(profile.serviceAreaDistricts, locale).join(
                  ", ",
                ) || "-"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <ProProfileForm
              locale={locale}
              userId={user.id}
              profile={profile}
              categoryOptions={categoryOptions.map((item) => ({
                id: item.id,
                label: item.label,
              }))}
              districts={districts}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
