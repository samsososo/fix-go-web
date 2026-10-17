"use client";

import {
  PRO_SUBSCRIPTION_PLANS,
  type SaleableProSubscriptionPlanCode,
} from "@/lib/subscription-policy";
import { cn } from "@/lib/utils";

export function SubscriptionPlanOptions({
  value,
  onChange,
  disabled = false,
  locale = "zh-HK",
}: {
  value?: SaleableProSubscriptionPlanCode;
  onChange?: (value: SaleableProSubscriptionPlanCode) => void;
  disabled?: boolean;
  locale?: string;
}) {
  const english = locale === "en";
  const monthlyPlan = PRO_SUBSCRIPTION_PLANS.find(
    (plan) => plan.intervalCount === 1,
  );

  if (!monthlyPlan) {
    throw new Error("Monthly subscription plan is required");
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {PRO_SUBSCRIPTION_PLANS.map((plan) => {
        const price = plan.amountMinor / 100;
        const regularAmountMinor = plan.intervalCount * monthlyPlan.amountMinor;
        const saving = (regularAmountMinor - plan.amountMinor) / 100;
        return (
          <label
            key={plan.code}
            className={cn(
              "flex flex-col rounded-2xl border-2 p-4",
              onChange &&
                !disabled &&
                "cursor-pointer focus-within:ring-2 focus-within:ring-primary/40",
              value === plan.code
                ? "border-primary bg-surface-tint"
                : "border-line/70 bg-white",
            )}
          >
            <span className="flex items-center justify-between gap-2 font-bold">
              {plan.intervalCount} {english ? "months" : "個月"}
              {onChange ? (
                <input
                  type="radio"
                  name="subscription-plan"
                  checked={value === plan.code}
                  disabled={disabled}
                  onChange={() => onChange(plan.code)}
                  className="h-5 w-5 accent-primary"
                />
              ) : null}
            </span>
            <span className="mt-3 font-display text-3xl font-extrabold">
              <span className="mr-1 text-sm">HK$</span>
              {price}
            </span>
            <span className="mt-2 text-xs text-muted">
              {english
                ? `Billed in full every ${plan.intervalCount} month(s)`
                : `每 ${plan.intervalCount} 個月一次過收取`}
            </span>
            <span className="mt-3 text-sm font-semibold text-primary">
              {english ? "Average" : "平均"} HK$
              {(price / plan.intervalCount).toLocaleString("en-HK", {
                maximumFractionDigits: 2,
              })}
              ／{english ? "month" : "月"}
            </span>
            {saving > 0 ? (
              <span className="mt-2 text-xs font-semibold text-primary">
                {english ? "Save" : "慳"} HK${saving} ·{" "}
                {english ? "about" : "約"}{" "}
                {Math.round(
                  ((regularAmountMinor - plan.amountMinor) /
                    regularAmountMinor) *
                    100,
                )}
                %
              </span>
            ) : null}
            {plan.intervalCount === 12 ? (
              <span className="mt-2 text-xs font-bold text-primary">
                {english ? "Best value" : "最抵之選"}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
