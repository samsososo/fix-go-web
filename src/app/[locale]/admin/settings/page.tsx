import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { SmsVerificationConfigControl } from "@/features/admin/sms-verification-config-control";
import { formatDateTime } from "@/lib/formatters";
import { getSmsVerificationConfig } from "@/lib/mock/db";
import { getAdminNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export default async function AdminSettingsPage() {
  const locale = await getLocale();
  const config = await getSmsVerificationConfig();

  return (
    <PortalShell
      locale={locale}
      title={locale === "en" ? "System settings" : "系統設定"}
      subtitle={
        locale === "en"
          ? "Control rollout settings stored in the application database."
          : "管理儲存在應用程式資料庫內嘅功能推出設定。"
      }
      navItems={getAdminNav(locale, "settings")}
    >
      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-2xl font-bold">
                  {locale === "en"
                    ? "Signup SMS verification"
                    : "註冊 SMS 驗證"}
                </h2>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    config.enabled
                      ? "bg-primary/12 text-primary"
                      : "bg-foreground/8 text-muted",
                  )}
                >
                  {config.enabled ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                {locale === "en"
                  ? "The signup verification UI and server gate are active. Development currently uses the console POC code; a real SMS provider is not connected yet."
                  : "註冊驗證 UI 同 server gate 已接駁；development 暫時使用 console POC 測試碼，真 SMS 供應商尚未接駁。"}
              </p>
            </div>
            <SmsVerificationConfigControl
              locale={locale}
              enabled={config.enabled}
            />
          </div>

          {config.forceOff ? (
            <div className="rounded-2xl border border-secondary/30 bg-secondary/10 p-4 text-sm leading-6">
              {locale === "en"
                ? "The environment emergency switch is forcing SMS verification off. The database value is saved, but it cannot become effective until the override is removed."
                : "環境緊急停止開關正強制關閉 SMS 驗證。DB 設定仍會保存，但移除 override 前唔會生效。"}
            </div>
          ) : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <ConfigItem
              label={locale === "en" ? "Effective state" : "實際狀態"}
              value={config.effectiveEnabled ? "ON" : "OFF"}
            />
            <ConfigItem
              label={locale === "en" ? "POC provider" : "POC 供應方式"}
              value={config.provider}
            />
            <ConfigItem
              label={locale === "en" ? "Code lifetime" : "驗證碼有效時間"}
              value={`${config.otpTtlSeconds / 60} ${locale === "en" ? "minutes" : "分鐘"}`}
            />
            <ConfigItem
              label={locale === "en" ? "Resend cooldown" : "重發等候時間"}
              value={`${config.resendCooldownSeconds} ${locale === "en" ? "seconds" : "秒"}`}
            />
            <ConfigItem
              label={locale === "en" ? "Maximum attempts" : "最多輸入次數"}
              value={String(config.maxAttempts)}
            />
            <ConfigItem
              label={locale === "en" ? "Hourly send limit" : "每小時發送上限"}
              value={String(config.maxSendsPerHour)}
            />
          </dl>

          <p className="text-xs leading-5 text-muted">
            {config.updatedAt
              ? `${locale === "en" ? "Last updated" : "最後更新"}: ${formatDateTime(config.updatedAt, locale)} · ${config.updatedBy ?? "system"}`
              : locale === "en"
                ? "Using safe defaults."
                : "目前使用安全預設值。"}
          </p>
        </CardContent>
      </Card>
    </PortalShell>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-white/70 p-4">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}
