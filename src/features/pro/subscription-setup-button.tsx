"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { SubscriptionPlanOptions } from "@/features/pro/subscription-plan-options";
import {
  formatProSubscriptionPlan,
  getCurrentProSubscriptionPlanCode,
  getSaleableProSubscriptionPlan,
  PRO_SUBSCRIPTION_PLAN_CODE,
  type ProSubscriptionPlanCode,
  type SaleableProSubscriptionPlanCode,
} from "@/lib/subscription-policy";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { startProSubscriptionCheckoutAction } from "@/lib/actions";

export function SubscriptionSetupButton({
  locale,
  mode = "setup",
  initialPlanCode = PRO_SUBSCRIPTION_PLAN_CODE,
  checkoutLocked = false,
}: {
  locale: string;
  mode?: "setup" | "reactivate";
  initialPlanCode?: ProSubscriptionPlanCode;
  checkoutLocked?: boolean;
}) {
  const [planCode, setPlanCode] = useState<SaleableProSubscriptionPlanCode>(
    () => getCurrentProSubscriptionPlanCode(initialPlanCode),
  );
  const plan = getSaleableProSubscriptionPlan(planCode);
  const price = plan.amountMinor / 100;
  const billing = formatProSubscriptionPlan(planCode, locale);
  const isEnglish = locale === "en";
  const isReactivation = mode === "reactivate";
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-3 font-semibold">
          {isEnglish ? "Choose a subscription period" : "選擇訂閱期"}
        </legend>
        <SubscriptionPlanOptions
          value={planCode}
          onChange={setPlanCode}
          disabled={isPending || checkoutLocked}
          locale={locale}
        />
      </fieldset>
      <p className="text-sm leading-6 text-muted">
        {isEnglish
          ? `${billing}, charged in full. Today: HK$${isReactivation ? price : 0}.`
          : `${billing}，每期一次過收取全額。今日需付：HK$${isReactivation ? price : 0}。`}
      </p>
      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={!isHydrated || isPending}
        aria-describedby="subscription-setup-note"
        onClick={() =>
          startTransition(async () => {
            setError(null);

            try {
              const result = await startProSubscriptionCheckoutAction({
                locale,
                planCode,
              });

              if (!result.ok) {
                setError(
                  result.error ??
                    (isEnglish
                      ? "Unable to open the secure card setup. Please try again."
                      : "暫時未能開啟安全綁卡頁面，請再試一次。"),
                );
                return;
              }

              window.location.assign(result.url);
            } catch {
              setError(
                isEnglish
                  ? "Unable to open the secure card setup. Please try again."
                  : "暫時未能開啟安全綁卡頁面，請再試一次。",
              );
            }
          })
        }
      >
        {isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending
          ? isEnglish
            ? "Opening Stripe…"
            : "正在開啟 Stripe…"
          : isEnglish
            ? isReactivation
              ? `Re-subscribe for HK$${price}`
              : "Start your one-time 14-day trial"
            : isReactivation
              ? `重新訂閱並支付 HK$${price}`
              : "綁卡開始 14 日免費試用"}
      </Button>

      <p id="subscription-setup-note" className="text-xs leading-6 text-muted">
        {isEnglish
          ? isReactivation
            ? `Stripe charges HK$${price} now, then ${billing}. Access returns after payment is confirmed; no second trial.`
            : "No charge today. Your one-time 14-day free trial starts only after Stripe confirms your card setup."
          : isReactivation
            ? `Stripe 會即時收取 HK$${price}，之後${billing}自動續費；確認付款後恢復功能，不會再次獲得免費試用。`
            : `今日不會收費；Stripe 確認綁卡成功後開始每人一次嘅 14 日免費試用。試用完結後${billing}自動收費。`}
      </p>

      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
