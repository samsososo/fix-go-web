import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { getMarketingContent } from "@/lib/content";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/how-it-works");
}

export default async function HowItWorksPage() {
  const locale = (await getLocale()) as "zh-HK" | "en";
  const content = getMarketingContent(locale);

  return (
    <div className="content-wrap py-10">
      <div className="max-w-3xl space-y-4">
        <p className="eyebrow">{locale === "en" ? "Process" : "流程"}</p>
        <h1 className="section-title">
          {locale === "en"
            ? "How 快修24 turns repair requests into clear quotes"
            : "快修24 點樣將維修需求變成清楚報價"}
        </h1>
        <p className="text-lg leading-8 text-muted">
          {locale === "en"
            ? "Instead of calling different tradespeople one by one, customers create one detailed request and compare structured responses in the same place."
            : "唔需要逐個師傅打電話問價。住戶建立一個完整需求，再在同一地方比較結構化回覆。"}
        </p>
      </div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {content.steps.map((step, index) => (
          <Card key={step.title}>
            <CardContent className="space-y-4">
              <p className="text-sm font-semibold text-primary">
                {locale === "en" ? `Step ${index + 1}` : `第 ${index + 1} 步`}
              </p>
              <h2 className="font-display text-2xl font-bold">{step.title}</h2>
              <p className="text-sm leading-7 text-muted">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
