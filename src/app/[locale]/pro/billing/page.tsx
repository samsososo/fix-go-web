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
import { evaluateProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import {
  getProSubscriptionPlan,
  formatProSubscriptionPlan,
  hasConsumedLifetimeTrial,
} from "@/lib/subscription-policy";

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProBillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout?: string | string[];
    billing?: string | string[];
  }>;
}) {
  const locale = await getLocale();
  const user = await requireRole("pro", locale);
  const [subscription, query] = await Promise.all([
    ensureProSubscription(user.id),
    searchParams,
  ]);
  const checkoutState = firstQueryValue(query.checkout);
  const billingState = firstQueryValue(query.billing);
  const isEnglish = locale === "en";
  const accessStatus = evaluateProSubscriptionEntitlement(
    subscription,
    new Date().toISOString(),
  ).entitlement.status;
  const plan = getProSubscriptionPlan(subscription.planCode);
  const billing = formatProSubscriptionPlan(subscription.planCode, locale);
  const pendingPrice =
    getProSubscriptionPlan(
      subscription.reactivationPlanCode ?? subscription.planCode,
    ).amountMinor / 100;
  const isActivationPending =
    subscription.accessStatus === "setup_required" &&
    hasConsumedLifetimeTrial(subscription) &&
    !subscription.stripeSubscriptionId;
  const isPaidReactivationPending =
    checkoutState === "reactivated" &&
    Boolean(subscription.reactivationCheckoutSessionId) &&
    accessStatus === "terminated";
  const isPaidReactivationConfirmed =
    checkoutState === "reactivated" &&
    accessStatus === "active" &&
    subscription.stripeStatus === "active" &&
    subscription.stripeSubscriptionHasTrial === false &&
    Boolean(subscription.lastPaymentSucceededAt) &&
    !subscription.reactivationCheckoutSessionId;
  const isCheckoutPending =
    (subscription.accessStatus === "setup_required" &&
      Boolean(subscription.checkoutSessionId) &&
      (checkoutState === "success" || isActivationPending)) ||
    isPaidReactivationPending;
  const showCheckoutSuccess =
    (checkoutState === "success" &&
      (isCheckoutPending || subscription.accessStatus !== "setup_required")) ||
    isPaidReactivationPending ||
    isPaidReactivationConfirmed;

  return (
    <PortalShell
      locale={locale}
      title={isEnglish ? "Subscription and card" : "訂閱及付款卡"}
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
                : isPaidReactivationPending
                  ? isEnglish
                    ? `Confirming your HK$${pendingPrice} payment`
                    : `正在確認 HK$${pendingPrice} 付款`
                  : isPaidReactivationConfirmed
                    ? isEnglish
                      ? "Subscription reactivated"
                      : "訂閱已重新啟用"
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
                  ? "Your card is confirmed. Your subscription is being activated and will update automatically. You do not need to add your card again."
                  : "付款卡已確認，正在啟用訂閱，完成後會自動更新，毋須再次綁卡。"
                : isPaidReactivationPending
                  ? isEnglish
                    ? "We are confirming your payment. Your subscription will update automatically once payment is confirmed, restoring access to new work."
                    : "正在確認付款。確認成功後，訂閱狀態會自動更新，並恢復新工作功能。"
                  : isPaidReactivationConfirmed
                    ? isEnglish
                      ? `Stripe confirmed the HK$${pendingPrice} payment. New-work access is active again, with no additional free trial.`
                      : `Stripe 已確認 HK$${pendingPrice} 付款；新工作功能已恢復，而且冇再次獲得免費期。`
                    : subscription.accessStatus === "setup_required"
                      ? isEnglish
                        ? "We are confirming your card setup. Your free trial starts once setup is confirmed, and your subscription status will update automatically."
                        : "正在確認綁卡結果。確認成功後，免費試用先會開始，訂閱狀態會自動更新。"
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
              {hasConsumedLifetimeTrial(subscription)
                ? isEnglish
                  ? "Re-subscription not completed"
                  : "尚未完成重新訂閱"
                : isEnglish
                  ? "Card setup not completed"
                  : "尚未完成綁卡"}
            </p>
            <p className="mt-1 text-muted">
              {hasConsumedLifetimeTrial(subscription)
                ? isEnglish
                  ? "No new subscription was started. You can restart the secure package checkout whenever you are ready."
                  : "今次冇建立新訂閱；準備好之後可以重新開啟 套餐安全付款流程。"
                : isEnglish
                  ? "Nothing was charged. You can restart the secure Stripe setup whenever you are ready."
                  : "今次冇收取任何費用；準備好之後可以隨時重新開啟 Stripe 安全綁卡。"}
            </p>
          </div>
        ) : null}

        {billingState === "updated" ? (
          <div
            className="rounded-2xl border border-primary/22 bg-surface-tint px-4 py-3 text-sm leading-6"
            role="status"
          >
            <p className="font-semibold text-primary">
              {isEnglish ? "Card update submitted" : "已提交付款卡更新"}
            </p>
            <p className="mt-1 text-muted">
              {isEnglish
                ? "Updating your card does not settle an outstanding payment. Retry the payment below; access to new work resumes once payment is confirmed."
                : "更新付款卡唔代表欠款已繳清。如有欠款，請喺下面重新付款；確認成功後，先會恢復新工作功能。"}
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
              <div>
                <p className="text-sm font-semibold text-primary">
                  {isEnglish ? "Your selected package" : "目前選定套餐"}
                </p>
                <p className="mt-2 text-3xl font-extrabold">
                  HK${plan.amountMinor / 100}
                  <span className="ml-2 text-base font-semibold text-muted">
                    ／{plan.intervalCount} {isEnglish ? "months" : "個月"}
                  </span>
                </p>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {isEnglish
                    ? `${billing}, billed in full with automatic renewal. Existing subscriptions and recorded trial dates are preserved.`
                    : `${billing}，每期一次過收取全額並自動續費。現有訂閱及已記錄嘅免費試用到期日會保留。`}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <PlanPoint
                  icon={<CalendarRange className="h-5 w-5" />}
                  title={isEnglish ? "14-day trial" : "14 日免費試用"}
                  description={
                    isEnglish
                      ? "New trials start after successful card setup; existing trial dates stay unchanged."
                      : "新試用由成功綁卡起計；已開始試用嘅帳戶保留原到期日。"
                  }
                />
                <PlanPoint
                  icon={<CreditCard className="h-5 w-5" />}
                  title={isEnglish ? "Full package payment" : "按套餐全額收費"}
                  description={
                    isEnglish
                      ? "No charge during a new trial. Afterwards, the full package renews every 1, 3, 6 or 12 months."
                      : "新試用期內不收費；完結後按套餐每 1／3／6／12 個月收取全額。"
                  }
                />
                <PlanPoint
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title={isEnglish ? "One trial per pro" : "每人一次試用"}
                  description={
                    isEnglish
                      ? "Changing a card, package or rejoining does not restart the trial."
                      : "換卡、換套餐或重新訂閱，都唔會重設免費期。"
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
    <div className="rounded-2xl border border-line/70 bg-white/66 p-3 sm:p-4">
      <span className="text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="mt-2 text-sm font-semibold sm:mt-3 sm:text-base">
        {title}
      </h2>
      <p className="mt-1 hidden text-xs leading-6 text-muted sm:block">
        {description}
      </p>
    </div>
  );
}
