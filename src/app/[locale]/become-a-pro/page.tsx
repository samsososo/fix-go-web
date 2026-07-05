import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/become-a-pro");
}

export default async function BecomeAProPage() {
  const locale = (await getLocale()) as "zh-HK" | "en";

  const bullets =
    locale === "en"
      ? [
          "Show customers your experience, availability, and business profile",
          "Review open jobs and filter by category before quoting",
          "Send clearer quotes with labour, parts, call-out fee, timing, and scope",
        ]
      : [
          "展示你的經驗、可接工作狀態及商業資料",
          "先查看開放工作機會，再按分類篩選是否報價",
          "提交更清楚的報價，包括人工、物料、上門費、時間及工程範圍",
        ];

  return (
    <div className="content-wrap py-10">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <p className="eyebrow">
            {locale === "en" ? "For professionals" : "師傅招募"}
          </p>
          <h1 className="section-title">
            {locale === "en"
              ? "Win better home-service jobs with clearer customer briefs"
              : "用更清楚的客戶需求，接更合適的家居維修工作"}
          </h1>
          <p className="text-lg leading-8 text-muted">
            {locale === "en"
              ? "Hotfix helps tradespeople spend less time chasing vague enquiries and more time quoting clear customer requests."
              : "Hotfix 幫師傅減少處理模糊查詢，把時間集中在清楚列明的客戶需求。"}
          </p>
          <ul className="space-y-3 text-sm text-muted">
            {bullets.map((bullet) => (
              <li
                key={bullet}
                className="rounded-2xl border border-white/70 bg-white/60 px-4 py-4"
              >
                {bullet}
              </li>
            ))}
          </ul>
        </div>
        <Card className="bg-[#0f5c5a] text-white">
          <CardContent className="space-y-5 p-8">
            <h2 className="font-display text-3xl font-bold">
              {locale === "en"
                ? "What professionals can do today"
                : "師傅現時可使用的功能"}
            </h2>
            <ul className="space-y-4 text-sm text-white/80">
              <li>
                {locale === "en"
                  ? "Business profile and availability setup"
                  : "完善個人檔案及可接工作狀態"}
              </li>
              <li>
                {locale === "en"
                  ? "Lead list, lead detail and quote submission"
                  : "查看工作機會清單、工作詳情及提交報價"}
              </li>
              <li>
                {locale === "en"
                  ? "Accepted jobs and booking status updates"
                  : "管理已接訂單及更新服務狀態"}
              </li>
              <li>
                {locale === "en"
                  ? "Verification status visibility and admin review"
                  : "查看驗證狀態及配合營運覆核"}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
