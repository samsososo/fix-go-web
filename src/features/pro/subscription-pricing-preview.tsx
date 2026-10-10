"use client";

import {
  ArrowRight,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PRO_SUBSCRIPTION_PLANS } from "@/lib/subscription-policy";
import { SubscriptionPlanOptions } from "@/features/pro/subscription-plan-options";

const plans = PRO_SUBSCRIPTION_PLANS.map((plan) => ({
  code: plan.code,
  months: plan.intervalCount,
  price: plan.amountMinor / 100,
}));

export function SubscriptionPricingPreview() {
  const [months, setMonths] = useState<number>(1);
  const [returning, setReturning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const plan = plans.find((item) => item.months === months)!;
  const monthly = (plan.price / plan.months).toLocaleString("en-HK", {
    maximumFractionDigits: 2,
  });
  const period = plan.months === 1 ? "每月" : `每 ${plan.months} 個月`;

  return (
    <div className="bg-[#fcfcf9]">
      <div className="content-wrap py-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/25 bg-surface-tint px-4 py-3 text-sm">
          <p className="font-semibold text-primary">
            Dev 介面預覽 · 不會綁卡或扣款
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-muted">
            <input
              type="checkbox"
              checked={returning}
              onChange={(event) => {
                setReturning(event.target.checked);
                setConfirmed(false);
              }}
              className="h-4 w-4 accent-primary"
            />
            模擬已用過免費試用
          </label>
        </div>

        <div className="mb-8 max-w-2xl sm:mb-10">
          <p className="text-sm font-semibold text-primary">
            快修24 · 師傅訂閱
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            揀個啱你嘅套餐，
            <br />
            專心接工作。
          </h1>
          <p className="mt-4 text-base leading-7 text-muted">
            所有套餐享有相同功能。訂得越長，平均月費越抵。
          </p>
        </div>

        {!returning ? (
          <div className="mb-7 flex items-start gap-3 rounded-2xl border border-primary/15 bg-[#e9f2e9] p-5">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-primary">
                先免費試 14 日，試完先收費
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                成功綁卡後開始計算，每位師傅只享一次。試用期內取消，唔收首期套餐費。
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-7 rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-muted">
            你已享用過免費試用。重新訂閱會即時收取所選套餐費用，付款確認後恢復新工作功能。
          </div>
        )}

        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div>
            <fieldset>
              <legend className="mb-4 text-lg font-bold">選擇訂閱期</legend>
              <SubscriptionPlanOptions
                value={plan.code}
                onChange={(code) => {
                  setMonths(plans.find((item) => item.code === code)!.months);
                  setConfirmed(false);
                }}
              />
            </fieldset>

            <div className="mt-6 rounded-2xl border border-line/70 bg-white p-5 sm:p-6">
              <h2 className="font-bold">每個套餐都包括</h2>
              <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  "完整工作內容及聯絡資料",
                  "向客戶提交報價",
                  "接受及管理工作訂單",
                  "個人檔案及工作日程",
                ].map((text) => (
                  <li key={text} className="flex items-center gap-2">
                    <Check
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside
            className="rounded-3xl border border-primary/15 bg-white p-5 shadow-[0_12px_36px_rgba(24,36,51,0.05)] sm:p-6 lg:sticky lg:top-6"
            aria-label="訂閱摘要"
          >
            <h2 className="text-lg font-bold">你嘅訂閱</h2>
            <div className="mt-5 flex items-baseline justify-between gap-3">
              <p className="font-semibold">{plan.months} 個月套餐</p>
              <p className="text-xl font-extrabold">HK${plan.price}</p>
            </div>
            <p className="mt-2 text-sm text-muted">平均 HK${monthly}／月</p>
            <dl
              className="mt-5 space-y-4 border-y border-line/70 py-5 text-sm"
              aria-live="polite"
            >
              <div className="flex justify-between gap-3">
                <dt className="text-muted">今日需付</dt>
                <dd className="font-bold text-primary">
                  HK${returning ? plan.price : 0}
                </dd>
              </div>
              {!returning ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">免費試用</dt>
                  <dd className="font-semibold">14 日 · 只限一次</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted">
                  {returning ? "之後續費" : "試用完結後"}
                </dt>
                <dd className="text-right font-semibold">
                  {period} HK${plan.price}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-muted">
              {returning
                ? "即時支付所選套餐全額，之後"
                : "今日只綁卡，唔收費。14 日試用完結後，"}
              {period}自動收取 HK${plan.price}。
            </p>
            <Button className="mt-5 w-full" onClick={() => setConfirmed(true)}>
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {returning ? "重新訂閱" : "綁卡開始 14 日免費試用"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            {confirmed ? (
              <p
                role="status"
                className="mt-3 rounded-xl bg-surface-tint p-3 text-sm leading-6 text-primary"
              >
                預覽：已選 {plan.months} 個月套餐（HK${plan.price}
                ）。正式流程會前往 Stripe 安全{returning ? "付款" : "綁卡"}
                ，本頁不會扣款。
              </p>
            ) : null}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              付款卡由 Stripe 安全處理
            </p>
            <p className="mt-5 text-xs leading-6 text-muted">
              可隨時取消下期續費，使用權保留至當期完結。已收取套餐費不作按比例退款。換卡、取消後重開或重新訂閱，均不會再送免費試用。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
