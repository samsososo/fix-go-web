import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProProfileForm } from "@/features/pro/pro-profile-form";
import { getCurrentUser } from "@/lib/auth";
import { formatDistrictName } from "@/lib/hk-locale";
import {
  getProProfile,
  listCategoryOptions,
  listDistricts,
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
  const verificationLevelLabel =
    locale === "en"
      ? { none: "Standard", basic: "Basic", enhanced: "Enhanced" }[
          profile.verificationLevel
        ]
      : { none: "標準", basic: "基本", enhanced: "進階" }[
          profile.verificationLevel
        ];

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Complete your pro profile" : "完善師傅檔案"}
      subtitle={
        locale === "en"
          ? "Keep your business details clear so customers can understand who is quoting."
          : "保持師傅資料清楚，方便客戶了解報價由誰提供。"
      }
      navItems={getProNav(locale, "profile")}
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-5">
        <StatCard
          compact
          label={locale === "en" ? "Completed jobs" : "已完成工作"}
          value={profile.completedJobs}
          hint={
            locale === "en"
              ? "Used to build trust with customers"
              : "有助建立住戶信任"
          }
        />
        <StatCard
          compact
          label={locale === "en" ? "Avg response" : "平均回覆"}
          value={`${profile.avgResponseHours}h`}
          hint={locale === "en" ? "Lead response speed" : "回應工作機會的速度"}
        />
        <StatCard
          compact
          label={locale === "en" ? "Emergency jobs" : "緊急工作"}
          value={
            profile.emergencyAvailability
              ? locale === "en"
                ? "Yes"
                : "可接"
              : locale === "en"
                ? "No"
                : "暫不接"
          }
          hint={
            locale === "en"
              ? "Shown as an availability signal"
              : "作為可接工作訊號"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 sm:mt-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-5">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h2 className="font-display text-2xl font-bold">
              {profile.displayName}
            </h2>
            <div className="flex items-center gap-3">
              <StatusBadge
                status={profile.verificationStatus as never}
                locale={locale}
              />
              <span className="text-sm text-muted">
                {verificationLevelLabel}
              </span>
            </div>
            <p className="text-sm text-muted">
              {profile.introduction ||
                (locale === "en" ? "No introduction yet." : "尚未填寫介紹。")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ProProfileForm
              locale={locale}
              profile={profile}
              categoryOptions={categoryOptions}
              districtOptions={districts.map((entry) => ({
                value: entry.district,
                label: formatDistrictName(entry.district, locale),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
