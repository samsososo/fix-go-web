import { Languages, Mail, Phone, UserRound } from "lucide-react";
import { getLocale } from "next-intl/server";

import { LogoutButton } from "@/components/shared/logout-button";
import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatHongKongPhone } from "@/lib/formatters";
import { getCustomerNav } from "@/lib/nav";

export default async function CustomerProfilePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const details = [
    {
      icon: UserRound,
      label: locale === "en" ? "Full name" : "姓名",
      value: user.fullName,
    },
    {
      icon: Phone,
      label: locale === "en" ? "WhatsApp phone" : "WhatsApp 聯絡電話",
      value: formatHongKongPhone(user.phone),
    },
    {
      icon: Mail,
      label: locale === "en" ? "Email" : "電郵",
      value: user.email || (locale === "en" ? "Not provided" : "未有提供"),
    },
    {
      icon: Languages,
      label: locale === "en" ? "Language" : "介面語言",
      value: locale === "en" ? "English" : "繁體中文（香港）",
    },
  ];

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "Account details" : "帳戶資料"}
      subtitle={
        locale === "en"
          ? "Check the contact details used for service requests and professional follow-up."
          : "查看服務請求及師傅跟進時使用嘅聯絡資料。"
      }
      navItems={getCustomerNav(locale, "profile")}
    >
      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {details.map((detail) => {
              const Icon = detail.icon;
              return (
                <div
                  key={detail.label}
                  className="rounded-2xl border border-line/70 bg-white/72 p-4"
                >
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {detail.label}
                  </p>
                  <p className="mt-2 break-words font-semibold">
                    {detail.value}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-primary/15 bg-surface-tint/72 p-4 text-sm leading-6 text-muted">
            {locale === "en"
              ? "Professionals may use this phone number to contact you on WhatsApp after you submit a request."
              : "提交服務請求後，師傅可以用以上電話透過 WhatsApp 聯絡你。"}
          </div>

          <div className="border-t border-line/70 pt-5 lg:hidden">
            <LogoutButton locale={locale} className="w-full" />
          </div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
