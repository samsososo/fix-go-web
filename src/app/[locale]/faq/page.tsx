import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { JsonLd } from "@/components/seo/json-ld";
import { getMarketingContent } from "@/lib/content";
import { Card, CardContent } from "@/components/ui/card";
import { buildFaqStructuredData, createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/faq");
}

export default async function FaqPage() {
  const locale = (await getLocale()) as "zh-HK" | "en";
  const content = getMarketingContent(locale);

  return (
    <div className="content-wrap py-10">
      <JsonLd data={buildFaqStructuredData(locale, content.faq)} />
      <div className="max-w-3xl space-y-4">
        <p className="eyebrow">
          {locale === "en" ? "Trust & Safety" : "保障與常見問題"}
        </p>
        <h1 className="section-title">
          {locale === "en"
            ? "Common questions before requesting or quoting a job"
            : "提交需求或報價前，常見問題一次看清"}
        </h1>
        <p className="text-lg leading-8 text-muted">
          {locale === "en"
            ? "Clear expectations help customers and professionals trust the process before a booking is accepted."
            : "客戶同師傅在確認訂單前，最需要知道報價、驗證、訊息及營運覆核點樣處理。"}
        </p>
      </div>
      <div className="mt-10 grid gap-5">
        {content.faq.map((item) => (
          <Card key={item.q}>
            <CardContent className="space-y-2">
              <h2 className="font-display text-2xl font-bold">{item.q}</h2>
              <p className="text-sm leading-7 text-muted">{item.a}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
