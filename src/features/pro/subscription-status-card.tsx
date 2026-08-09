import { CalendarClock, CheckCircle2, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionSetupButton } from "@/features/pro/subscription-setup-button";
import {
  hasConsumedLifetimeTrial,
  type ProSubscription,
} from "@/lib/subscription-policy";

function formatHongKongDate(value: string | undefined, locale: string) {
  if (!value) {
    return locale === "en" ? "Pending confirmation" : "等待確認";
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-HK" : "zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function SubscriptionStatusCard({
  locale,
  subscription,
  checkoutPending = false,
}: {
  locale: string;
  subscription: ProSubscription;
  checkoutPending?: boolean;
}) {
  const isEnglish = locale === "en";
  const status = subscription.accessStatus;
  const isTrialing = status === "trialing";
  const isActive = status === "active";
  const activationPending =
    status === "setup_required" &&
    hasConsumedLifetimeTrial(subscription) &&
    !subscription.stripeSubscriptionId;
  const needsSetup = status === "setup_required" && !activationPending;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-white/94 via-card/94 to-surface-tint/82">
      <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              {needsSetup || activationPending ? (
                <CircleAlert className="h-5 w-5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                {isEnglish ? "Subscription status" : "訂閱狀態"}
              </p>
              <h2 className="font-display text-2xl font-extrabold">
                {activationPending
                  ? isEnglish
                    ? "Activating your free trial"
                    : "正在啟用免費試用"
                  : needsSetup
                    ? isEnglish
                      ? "Card setup required"
                      : "尚未綁定付款卡"
                    : isTrialing
                      ? isEnglish
                        ? "Free trial active"
                        : "免費試用中"
                      : isActive
                        ? isEnglish
                          ? "Subscription active"
                          : "月費訂閱已生效"
                        : isEnglish
                          ? "Subscription update in progress"
                          : "訂閱狀態更新中"}
              </h2>
            </div>
            <Badge
              variant={
                needsSetup
                  ? "warning"
                  : isTrialing || isActive
                    ? "success"
                    : "neutral"
              }
            >
              {activationPending
                ? isEnglish
                  ? "Activating"
                  : "啟用中"
                : needsSetup
                  ? isEnglish
                    ? "Setup required"
                    : "需要綁卡"
                  : isTrialing
                    ? isEnglish
                      ? "Trialing"
                      : "試用中"
                    : isActive
                      ? isEnglish
                        ? "Active"
                        : "生效中"
                      : isEnglish
                        ? "Updating"
                        : "更新中"}
            </Badge>
          </div>

          <p className="max-w-2xl text-sm leading-7 text-muted">
            {activationPending
              ? isEnglish
                ? "Your card is confirmed. Stripe is finishing the monthly plan setup; no second card setup is needed."
                : "付款卡已確認，Stripe 正在完成月費計劃設定，唔需要再次綁卡。"
              : needsSetup
                ? isEnglish
                  ? "Add a card through Stripe to begin your one-time, three-calendar-month free trial."
                  : "透過 Stripe 綁定付款卡，即可開始每位師傅一生一次、為期 3 個香港日曆月嘅免費試用。"
                : isTrialing
                  ? isEnglish
                    ? `Your free trial ends on ${formatHongKongDate(subscription.trialEndsAt, locale)}. The first HK$100 monthly charge is due after the trial.`
                    : `免費試用期至 ${formatHongKongDate(subscription.trialEndsAt, locale)}；試用完結後先會開始每月收取 HK$100。`
                  : isActive
                    ? isEnglish
                      ? `Your HK$100 monthly subscription is active. The current period runs until ${formatHongKongDate(subscription.currentPeriodEndsAt, locale)}.`
                      : `每月 HK$100 訂閱現正生效，本期使用權至 ${formatHongKongDate(subscription.currentPeriodEndsAt, locale)}。`
                    : isEnglish
                      ? "Stripe is updating your subscription status. Refresh this page shortly to see the latest confirmed state."
                      : "Stripe 正在更新訂閱狀態，請稍後重新整理頁面查看最新確認結果。"}
          </p>

          {needsSetup && !checkoutPending ? (
            <SubscriptionSetupButton locale={locale} />
          ) : null}
        </div>

        <div className="rounded-2xl border border-primary/14 bg-white/72 p-4 text-sm lg:min-w-56">
          <p className="inline-flex items-center gap-2 font-semibold text-primary">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {activationPending
              ? isEnglish
                ? "Activation status"
                : "啟用狀態"
              : isTrialing
                ? isEnglish
                  ? "Trial ends"
                  : "免費期完結"
                : isActive
                  ? isEnglish
                    ? "Current period ends"
                    : "本期完結"
                  : isEnglish
                    ? "Trial starts"
                    : "免費期開始"}
          </p>
          <p className="mt-2 font-display text-xl font-extrabold">
            {activationPending
              ? isEnglish
                ? "Confirming"
                : "正在確認"
              : isTrialing
                ? formatHongKongDate(subscription.trialEndsAt, locale)
                : isActive
                  ? formatHongKongDate(subscription.currentPeriodEndsAt, locale)
                  : isEnglish
                    ? "After card confirmation"
                    : "成功綁卡當日"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
