import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatAreaName, formatDistrictName } from "@/lib/hk-locale";
import { readDb } from "@/lib/mock/db";
import { getCustomerNav } from "@/lib/nav";
import { formatHongKongPhone } from "@/lib/formatters";

export default async function CustomerProfilePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const db = await readDb();
  const profile = db.customerProfiles.find((entry) => entry.userId === user.id);
  const requests = db.requests.filter((entry) => entry.customerId === user.id);

  return (
    <PortalShell
      locale={locale}
      title={
        locale === "en" ? "Profile & saved addresses" : "個人資料與儲存地址"
      }
      subtitle={
        locale === "en"
          ? "Keep customer contact and address details visible for repeat requests."
          : "方便重複使用聯絡方式及地址資訊。"
      }
      navItems={getCustomerNav(locale, "profile")}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <StatCard
          label={locale === "en" ? "Saved addresses" : "已儲存地址"}
          value={profile?.savedAddresses.length ?? 0}
          hint={
            locale === "en"
              ? "Quick reuse for future requests"
              : "方便下次快速重用"
          }
        />
        <StatCard
          label={locale === "en" ? "Requests created" : "已建立請求"}
          value={requests.length}
          hint={
            locale === "en" ? "All-time submission history" : "所有歷史提交記錄"
          }
        />
        <StatCard
          label={locale === "en" ? "Preferred language" : "偏好語言"}
          value={profile?.preferredLanguage ?? user.locale}
          hint={
            locale === "en"
              ? "Used to localise customer flows"
              : "用於顯示客戶介面語言"
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">{user.fullName}</h2>
            <p className="text-sm text-muted">{user.email}</p>
            <p className="text-sm text-muted">
              {formatHongKongPhone(user.phone)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <h2 className="font-display text-2xl font-bold">
              {locale === "en" ? "Saved addresses" : "儲存地址"}
            </h2>
            {profile?.savedAddresses.length ? (
              <div className="space-y-3">
                {profile.savedAddresses.map((address) => (
                  <div
                    key={address.id}
                    className="rounded-2xl border border-line bg-white p-4 text-sm text-muted"
                  >
                    {formatDistrictName(address.district, locale)} ·{" "}
                    {formatAreaName(address.area, locale)} ·{" "}
                    {address.buildingEstate} {address.block} {address.floor}{" "}
                    {address.flatRoom}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                locale={locale}
                title={
                  locale === "en" ? "No saved addresses yet" : "未有已儲存地址"
                }
                description={
                  locale === "en"
                    ? "Addresses from completed requests can be kept here for faster repeat bookings."
                    : "完成請求後可將地址保留於此，方便之後重複預約。"
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
