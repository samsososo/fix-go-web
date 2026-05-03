import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { listPublicCategories } from "@/lib/mock/repositories";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/categories");
}

export default async function CategoriesPage() {
  const locale = (await getLocale()) as "zh-HK" | "en";
  const categories = await listPublicCategories();

  return (
    <div className="content-wrap py-10">
      <div className="max-w-3xl space-y-4">
        <p className="eyebrow">{locale === "en" ? "Categories" : "服務分類"}</p>
        <h1 className="section-title">
          {locale === "en"
            ? "Choose the right home service category"
            : "按需要選擇家居維修及清潔分類"}
        </h1>
        <p className="text-lg leading-8 text-muted">
          {locale === "en"
            ? "Start with the trade that best matches the problem: plumbing leaks, electrical faults, aircon cleaning or repair, and home cleaning."
            : "由問題對應工種開始：水喉漏水、電力故障、冷氣清洗維修、家居清潔，都可以用同一流程提交需求。"}
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <Card key={category.id}>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold">
                  {category.name[locale]}
                </h2>
                <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-semibold text-primary">
                  {category.id}
                </span>
              </div>
              <p className="text-sm leading-7 text-muted">
                {category.description[locale]}
              </p>
              <div className="flex flex-wrap gap-2">
                {category.subcategories.map((subcategory) => (
                  <span
                    key={subcategory.id}
                    className="rounded-full border border-line bg-white px-3 py-1 text-xs"
                  >
                    {subcategory.name[locale]}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
