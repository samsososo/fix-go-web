import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProProfileForm } from "@/features/pro/pro-profile-form";
import { getCurrentUser } from "@/lib/auth";
import { getProProfile } from "@/lib/mock/repositories";
import { getProNav } from "@/lib/nav";

export default async function ProProfilePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const profile = await getProProfile(user.id);

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

      <div className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
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
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <ProProfileForm
              locale={locale}
              userId={user.id}
              profile={profile}
            />
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
