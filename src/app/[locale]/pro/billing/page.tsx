import {
  CalendarRange,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { getLocale } from "next-intl/server";

import { PortalShell } from "@/components/shared/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionStatusCard } from "@/features/pro/subscription-status-card";
import { SubscriptionStatusRefresh } from "@/features/pro/subscription-status-refresh";
import { requireRole } from "@/lib/auth";
import { ensureProSubscription } from "@/lib/mock/db";
import { getProNav } from "@/lib/nav";
import { hasConsumedLifetimeTrial } from "@/lib/subscription-policy";

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const locale = await getLocale();
  const user = await requireRole("pro", locale);
  const [subscription, query] = await Promise.all([
    ensureProSubscription(user.id),
    searchParams,
  ]);
  const checkoutState = firstQueryValue(query.checkout);
  const isEnglish = locale === "en";
  const isTrialing = subscription.accessStatus === "trialing";
  const isActive = subscription.accessStatus === "active";
  const isActivationPending =
    subscription.accessStatus === "setup_required" &&
    hasConsumedLifetimeTrial(subscription) &&
    !subscription.stripeSubscriptionId;
  const isCheckoutPending =
    subscription.accessStatus === "setup_required" &&
    Boolean(subscription.checkoutSessionId) &&
    (checkoutState === "success" || isActivationPending);
  const showCheckoutSuccess =
    checkoutState === "success" &&
    (isCheckoutPending || subscription.accessStatus !== "setup_required");

  return (
    <PortalShell
      locale={locale}
      title={isEnglish ? "Monthly plan and card" : "月費及付款卡"}
      subtitle={
        isEnglish
          ? "Set up your card securely with Stripe and review your confirmed subscription status."
          : "透過 Stripe 安全綁定付款卡，並查看已確認嘅訂閱狀態。"
      }
      navItems={getProNav(locale, "billing")}
    >
      <div className="grid gap-5">
        {showCheckoutSuccess ? (
          <div
            className="rounded-2xl border border-primary/22 bg-surface-tint px-4 py-3 text-sm leading-6 text-foreground"
            role="status"
          >
            <p className="font-semibold text-primary">
              {isActivationPending
                ? isEnglish
                  ? "Activating your free trial"
                  : "正在啟用免費試用"
                : subscription.accessStatus === "setup_required"
                  ? isEnglish
                    ? "Checking your card setup"
                    : "正在確認綁卡結果"
                  : isEnglish
                    ? "Card setup confirmed"
                    : "綁卡已經完成"}
            </p>
            <p className="mt-1 text-muted">
              {isActivationPending
                ? isEnglish
                  ? "Your card is confirmed. Stripe is finishing the monthly plan setup; no second card setup is needed."
                  : "付款卡已確認，Stripe 正在完成月費計劃設定，唔需要再次綁卡。"
                : subscription.accessStatus === "setup_required"
                  ? isEnglish
                    ? "Stripe has returned you to this page, but that redirect is not final confirmation. Your trial starts only after the secure Stripe notification is processed."
                    : "Stripe 已帶你返到呢一頁，但返回頁面本身唔代表綁卡已完成；系統收到並處理 Stripe 安全通知後，免費期先會正式開始。"
                  : isEnglish
                    ? "Stripe has securely confirmed your card. Your subscription status below is now up to date."
                    : "Stripe 已安全確認付款卡，下面顯示嘅訂閱狀態已經更新。"}
            </p>
          </div>
        ) : null}
        {isCheckoutPending ? <SubscriptionStatusRefresh /> : null}

        {checkoutState === "cancelled" ? (
          <div
            className="rounded-2xl border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-6"
            role="status"
          >
            <p className="font-semibold text-warning">
              {isEnglish ? "Card setup not completed" : "尚未完成綁卡"}
            </p>
            <p className="mt-1 text-muted">
              {isEnglish
                ? "Nothing was charged. You can restart the secure Stripe setup whenever you are ready."
                : "今次冇收取任何費用；準備好之後可以隨時重新開啟 Stripe 安全綁卡。"}
            </p>
          </div>
        ) : null}

        <SubscriptionStatusCard
          locale={locale}
          subscription={subscription}
          checkoutPending={isCheckoutPending}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <Card>
            <CardContent className="space-y-6 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">
                    {isEnglish ? "FastFix24 Pro plan" : "快修24 師傅月費"}
                  </p>
                  <p className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                    HK$100
                    <span className="ml-2 font-sans text-base font-semibold tracking-normal text-muted">
                      {isEnglish ? "/ month" : "/ 月"}
                    </span>
                  </p>
                </div>
                <span className="w-fit rounded-full bg-secondary/14 px-3 py-1.5 text-sm font-semibold text-warning">
                  {isActivationPending
                    ? isEnglish
                      ? "Activating"
                      : "啟用中"
                    : isTrialing
                      ? isEnglish
                        ? "Free trial active"
                        : "免費試用中"
                      : isActive
                        ? isEnglish
                          ? "HK$100 monthly"
                          : "每月 HK$100"
                        : isEnglish
                          ? "First 3 months free"
                          : "首 3 個月免費"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <PlanPoint
                  icon={<CalendarRange className="h-5 w-5" />}
                  title={
                    isActive
                      ? isEnglish
                        ? "Subscription active"
                        : "訂閱已生效"
                      : isEnglish
                        ? "Three calendar months"
                        : "3 個日曆月"
                  }
                  description={
                    isActive
                      ? isEnglish
                        ? "Your HK$100 monthly plan renews automatically."
                        : "每月 HK$100 計劃會自動續訂。"
                      : isEnglish
                        ? "Calculated in Hong Kong time from successful card setup."
                        : "由成功綁卡當日起，按香港時間計算。"
                  }
                />
                <PlanPoint
                  icon={<CreditCard className="h-5 w-5" />}
                  title={
                    isActive
                      ? isEnglish
                        ? "HK$100 each month"
                        : "每月收取 HK$100"
                      : isTrialing
                        ? isEnglish
                          ? "No charge during trial"
                          : "試用期內不收費"
                        : isEnglish
                          ? "No charge today"
                          : "今日不收費"
                  }
                  description={
                    isActive
                      ? isEnglish
                        ? "Stripe charges the saved card each billing period."
                        : "Stripe 會喺每個帳單週期從已綁定付款卡收費。"
                      : isEnglish
                        ? "HK$100 monthly billing starts only after the trial."
                        : "免費期完結後，先開始每月收取 HK$100。"
                  }
                />
                <PlanPoint
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title={isEnglish ? "One trial per pro" : "每人一次試用"}
                  description={
                    isEnglish
                      ? "Changing a card or rejoining does not restart the trial."
                      : "換卡或重新訂閱都唔會重設免費期。"
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/16 bg-surface-strong text-white">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-extrabold">
                  {isEnglish
                    ? "Stripe handles your card"
                    : "付款卡由 Stripe 處理"}
                </h2>
                <p className="mt-2 text-sm leading-7 text-white/72">
                  {isEnglish
                    ? "You will enter card details on Stripe's hosted page. FastFix24 does not store your full card number or CVC."
                    : "你會喺 Stripe 託管嘅安全頁面輸入卡資料；快修24唔會儲存完整卡號或 CVC。"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}

function PlanPoint({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-line/70 bg-white/66 p-4">
      <span className="text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-6 text-muted">{description}</p>
    </div>
  );
}
