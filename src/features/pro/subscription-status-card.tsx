import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  PaymentMethodUpdateButton,
  RetryOutstandingPaymentButton,
  SubscriptionRenewalButton,
} from "@/features/pro/subscription-lifecycle-actions";
import { SubscriptionSetupButton } from "@/features/pro/subscription-setup-button";
import { evaluateProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import {
  hasConsumedLifetimeTrial,
  type ProSubscription,
  type SubscriptionAccessStatus,
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

function statusTitle(status: SubscriptionAccessStatus, isEnglish: boolean) {
  const labels = {
    setup_required: isEnglish ? "Card setup required" : "尚未綁定付款卡",
    trialing: isEnglish ? "Free trial active" : "免費試用中",
    active: isEnglish ? "Subscription active" : "月費訂閱已生效",
    grace_period: isEnglish ? "Payment overdue" : "付款逾期寬限期",
    cancel_at_period_end: isEnglish
      ? "Cancellation scheduled"
      : "已安排期末取消",
    suspended: isEnglish ? "Subscription suspended" : "訂閱功能已暫停",
    terminated: isEnglish ? "Subscription ended" : "訂閱已終止",
  } satisfies Record<SubscriptionAccessStatus, string>;
  return labels[status];
}

function statusBadge(status: SubscriptionAccessStatus, isEnglish: boolean) {
  const labels = {
    setup_required: isEnglish ? "Setup required" : "需要綁卡",
    trialing: isEnglish ? "Trialing" : "試用中",
    active: isEnglish ? "Active" : "生效中",
    grace_period: isEnglish ? "14-day grace" : "14 日寬限期",
    cancel_at_period_end: isEnglish ? "Ending soon" : "即將完結",
    suspended: isEnglish ? "Suspended" : "已暫停",
    terminated: isEnglish ? "Ended" : "已終止",
  } satisfies Record<SubscriptionAccessStatus, string>;
  return labels[status];
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
  const status = evaluateProSubscriptionEntitlement(
    subscription,
    new Date().toISOString(),
  ).entitlement.status;
  const activationPending =
    subscription.accessStatus === "setup_required" &&
    hasConsumedLifetimeTrial(subscription) &&
    !subscription.stripeSubscriptionId;
  const needsSetup = status === "setup_required" && !activationPending;
  const canReactivate =
    status === "terminated" &&
    subscription.stripeStatus === "canceled" &&
    hasConsumedLifetimeTrial(subscription) &&
    !subscription.pastDueInvoiceId;
  const isHealthy = status === "trialing" || status === "active";
  const isPastDue = status === "grace_period" || status === "suspended";
  const accessEndsAt =
    subscription.stripeStatus === "trialing"
      ? subscription.trialEndsAt
      : subscription.currentPeriodEndsAt;
  const badgeVariant = needsSetup
    ? "warning"
    : isHealthy
      ? "success"
      : status === "suspended" || status === "terminated"
        ? "danger"
        : status === "grace_period"
          ? "warning"
          : "neutral";

  const description = activationPending
    ? isEnglish
      ? "Your card is confirmed. Stripe is finishing the monthly plan setup; no second card setup is needed."
      : "付款卡已確認，Stripe 正在完成月費計劃設定，唔需要再次綁卡。"
    : needsSetup
      ? isEnglish
        ? "Add a card through Stripe to begin your one-time, one-month free trial."
        : "透過 Stripe 綁定付款卡，即可開始每位師傅一生一次、為期 1 個月嘅免費試用。"
      : status === "trialing"
        ? isEnglish
          ? `Your free trial ends on ${formatHongKongDate(subscription.trialEndsAt, locale)}. The first HK$100 monthly charge is due after the trial.`
          : `免費試用期至 ${formatHongKongDate(subscription.trialEndsAt, locale)}；試用完結後先會開始每月收取 HK$100。`
        : status === "active"
          ? isEnglish
            ? `Your HK$100 monthly subscription is active. The current period runs until ${formatHongKongDate(subscription.currentPeriodEndsAt, locale)}.`
            : `每月 HK$100 訂閱現正生效，本期使用權至 ${formatHongKongDate(subscription.currentPeriodEndsAt, locale)}。`
          : status === "grace_period"
            ? isEnglish
              ? `Stripe could not collect your monthly fee. Access remains available until ${formatHongKongDate(subscription.gracePeriodEndsAt, locale)}; update your card and retry payment before then.`
              : `Stripe 未能收取月費；使用權會保留至 ${formatHongKongDate(subscription.gracePeriodEndsAt, locale)}，請喺限期前更新付款卡並重新繳款。`
            : status === "cancel_at_period_end"
              ? isEnglish
                ? `Automatic renewal is off. You retain access until ${formatHongKongDate(accessEndsAt, locale)} and no prorated refund is issued for a paid period.`
                : `自動續訂已關閉；你可繼續使用至 ${formatHongKongDate(accessEndsAt, locale)}，已收取嘅當期月費不作按比例退款。`
              : status === "suspended"
                ? isEnglish
                  ? "New-work features are suspended. You can still sign in, manage existing work and billing; update your card and settle any outstanding invoice to restore access."
                  : "新工作功能已暫停；你仍可登入、處理現有工作及付款設定。請更新付款卡並繳清欠款以恢復功能。"
                : isEnglish
                  ? "This subscription has ended. You can still sign in and view existing records, or re-subscribe for HK$100 with no second trial."
                  : "呢個訂閱已經終止；你仍可登入及查看現有紀錄，亦可支付 HK$100 重新訂閱，但不會再有免費期。";

  const sideLabel = activationPending
    ? isEnglish
      ? "Activation status"
      : "啟用狀態"
    : status === "trialing"
      ? isEnglish
        ? "Trial ends"
        : "免費期完結"
      : status === "grace_period"
        ? isEnglish
          ? "Pay by"
          : "最遲處理日期"
        : status === "cancel_at_period_end"
          ? isEnglish
            ? "Access ends"
            : "使用權完結"
          : status === "active"
            ? isEnglish
              ? "Current period ends"
              : "本期完結"
            : isEnglish
              ? "Billing status"
              : "付款狀態";
  const sideValue = activationPending
    ? isEnglish
      ? "Confirming"
      : "正在確認"
    : status === "trialing"
      ? formatHongKongDate(subscription.trialEndsAt, locale)
      : status === "grace_period"
        ? formatHongKongDate(subscription.gracePeriodEndsAt, locale)
        : status === "cancel_at_period_end" || status === "active"
          ? formatHongKongDate(accessEndsAt, locale)
          : status === "suspended"
            ? isEnglish
              ? "Action required"
              : "需要處理"
            : status === "terminated"
              ? isEnglish
                ? "Ended"
                : "已終止"
              : isEnglish
                ? "After card confirmation"
                : "成功綁卡當日";

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-white/94 via-card/94 to-surface-tint/82">
      <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              {needsSetup || activationPending ? (
                <CircleAlert className="h-5 w-5" aria-hidden="true" />
              ) : isHealthy ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
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
                  : statusTitle(status, isEnglish)}
              </h2>
            </div>
            <Badge variant={activationPending ? "neutral" : badgeVariant}>
              {activationPending
                ? isEnglish
                  ? "Activating"
                  : "啟用中"
                : statusBadge(status, isEnglish)}
            </Badge>
          </div>

          <p className="max-w-2xl text-sm leading-7 text-muted">
            {description}
          </p>

          {needsSetup && !checkoutPending ? (
            <SubscriptionSetupButton locale={locale} />
          ) : null}

          {canReactivate && !checkoutPending ? (
            <SubscriptionSetupButton locale={locale} mode="reactivate" />
          ) : null}

          {subscription.stripeSubscriptionId &&
          (status !== "terminated" || subscription.pastDueInvoiceId) ? (
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-start sm:gap-3">
              <PaymentMethodUpdateButton locale={locale} />
              {isPastDue && subscription.pastDueInvoiceId ? (
                <RetryOutstandingPaymentButton locale={locale} />
              ) : null}
              {[
                "trialing",
                "active",
                "grace_period",
                "cancel_at_period_end",
                "suspended",
              ].includes(status) ? (
                subscription.cancelAtPeriodEnd ? (
                  <SubscriptionRenewalButton
                    locale={locale}
                    cancelAtPeriodEnd
                  />
                ) : (
                  <details className="group w-full sm:w-auto">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-full px-4 text-sm font-semibold text-muted transition hover:bg-white/72 hover:text-foreground [&::-webkit-details-marker]:hidden">
                      {isEnglish ? "Manage renewal" : "管理自動續訂"}
                    </summary>
                    <div className="mt-2">
                      <SubscriptionRenewalButton
                        locale={locale}
                        cancelAtPeriodEnd={false}
                      />
                    </div>
                  </details>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-primary/14 bg-white/72 p-4 text-sm lg:min-w-56">
          <p className="inline-flex items-center gap-2 font-semibold text-primary">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {sideLabel}
          </p>
          <p className="mt-2 font-display text-xl font-extrabold">
            {sideValue}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
