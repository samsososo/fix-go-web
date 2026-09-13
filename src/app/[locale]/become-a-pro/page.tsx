import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import {
  ArrowRight,
  Check,
  ClipboardList,
  ReceiptText,
  CalendarDays,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_TRIAL_MONTHS,
} from "@/lib/subscription-policy";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/become-a-pro");
}

export default async function BecomeAProPage() {
  const locale = await getLocale();
  return (
    <div className="bg-[#fcfcf9]">
      <section className="content-wrap grid gap-10 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div className="lg:py-6">
          <p className="text-sm font-semibold text-primary">
            快修24 · 師傅招募
          </p>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight text-primary sm:text-5xl lg:text-6xl">
            你有手藝，
            <br />
            我哋幫你連繫
            <br className="hidden lg:block" />
            有需要嘅街坊。
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            水喉、電力、冷氣、裝修雜項。先睇清楚工作需要，再決定報唔報價，接返適合你嘅工作。
          </p>
          <ul className="mt-8 space-y-4">
            {[
              "按工種搵工作，需求集中睇",
              "人工、物料、上門費分開報，減少誤會",
              "已接訂單同工作日程，一處跟進",
            ].map((text) => (
              <li key={text} className="flex gap-3 text-sm leading-7">
                <Check
                  aria-hidden="true"
                  className="mt-1 h-5 w-5 shrink-0 text-primary"
                />
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-muted">
            已經有帳戶？{" "}
            <Link
              href="/auth/login"
              locale={locale}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            >
              登入搵工作
            </Link>
          </p>
        </div>
        <div className="self-start overflow-hidden rounded-3xl border border-primary/20 bg-white">
          <div className="bg-[#e9f2e9] px-6 py-4 text-sm font-semibold text-primary sm:px-8">
            新師傅首 {PRO_SUBSCRIPTION_TRIAL_MONTHS} 個月免費試用
          </div>
          <div className="space-y-6 p-6 sm:p-8">
            <div>
              <h2 className="text-sm font-semibold text-muted">師傅月費計劃</h2>
              <p className="mt-3 flex items-baseline gap-2 text-primary">
                <span className="text-lg font-semibold">HK$</span>
                <span className="font-display text-6xl font-extrabold">
                  {PRO_SUBSCRIPTION_AMOUNT_MINOR / 100}
                </span>
                <span className="text-base text-muted">／月</span>
              </p>
              <p className="mt-4 text-sm leading-7 text-muted">
                成功綁卡當日開始免費試用。試用期內不收月費，完結後每月自動續費
                HK${PRO_SUBSCRIPTION_AMOUNT_MINOR / 100}。
              </p>
            </div>
            <ul className="space-y-3 border-y border-line/70 py-5 text-sm">
              {[
                "查看完整工作內容及聯絡資料",
                "向客戶提交報價",
                "管理訂單、個人檔案及日程",
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  />
                  {text}
                </li>
              ))}
            </ul>
            <div>
              <Link
                href="/auth/signup?role=pro"
                locale={locale}
                className={`${buttonVariants({ size: "lg" })} w-full`}
              >
                加入成為師傅
                <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </Link>
              <p className="mt-3 text-center text-xs text-muted">
                建立帳戶 → 綁定付款卡 → 開始免費試用
              </p>
            </div>
            <p className="text-sm leading-7 text-muted">
              可隨時取消下期續費，使用權保留至本期完結。免費期內取消，不收首期月費；已收月費不作按比例退款。每位師傅只享一次免費試用。
            </p>
          </div>
        </div>
      </section>
      <section className="border-t border-line/60 bg-[#eff5ef]">
        <div className="content-wrap py-10 sm:py-14">
          <h2 className="section-title">點樣開始接工作？</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: ClipboardList,
                title: "01 選擇你嘅專長",
                body: "建立師傅帳戶，選擇工種及填寫聯絡資料。未綁卡都可以預覽工作標題、地區及工種。",
              },
              {
                icon: ReceiptText,
                title: "02 綁卡開始免費期",
                body: "註冊後進入綁卡流程，成功綁卡先開始首月免費試用，開放完整工作資料及報價功能。",
              },
              {
                icon: CalendarDays,
                title: "03 報價，跟進工作",
                body: "向合適客戶報價，獲接受後管理訂單同日程。接唔接、點報價，由你決定。",
              },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Icon aria-hidden="true" className="h-7 w-7 text-primary" />
                <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
