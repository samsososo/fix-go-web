import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { listPublicCategories } from "@/lib/mock/repositories";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as "zh-HK" | "en";
  return createPageMetadata(locale, "/categories");
}

type CategoryMedia = {
  image: string;
  objectPosition?: string;
  alt: Record<"zh-HK" | "en", string>;
  useCases: Record<"zh-HK" | "en", string[]>;
};

const categoryMedia: Record<string, CategoryMedia> = {
  plumbing: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Exterior_Plumbing_-_Hong_Kong.jpg/960px-Exterior_Plumbing_-_Hong_Kong.jpg",
    alt: {
      "zh-HK": "香港住宅外牆水管及排水管",
      en: "Exterior plumbing pipes on a Hong Kong residential building",
    },
    useCases: {
      "zh-HK": ["漏水", "去水慢", "更換龍頭"],
      en: ["Leaks", "Slow drainage", "Tap replacement"],
    },
  },
  electrical: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/HK_KTD_Sau_Mau_Ping_%E5%AE%89%E6%B3%B0%E9%82%A8_On_Tai_Estate_%E9%9B%BB%E5%99%A8%E7%B8%BD%E5%88%B6_Fuse_boxes_January_2023_Px3_01.jpg/960px-HK_KTD_Sau_Mau_Ping_%E5%AE%89%E6%B3%B0%E9%82%A8_On_Tai_Estate_%E9%9B%BB%E5%99%A8%E7%B8%BD%E5%88%B6_Fuse_boxes_January_2023_Px3_01.jpg",
    alt: {
      "zh-HK": "香港住宅電器總制及漏電斷路器",
      en: "Fuse boxes and circuit breakers in a Hong Kong residence",
    },
    useCases: {
      "zh-HK": ["燈掣故障", "插蘇問題", "跳掣檢查"],
      en: ["Switch faults", "Socket issues", "Circuit trips"],
    },
  },
  aircon: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Dense_city_living%2C_Hong_Kong_%2848429963527%29.jpg/960px-Dense_city_living%2C_Hong_Kong_%2848429963527%29.jpg",
    alt: {
      "zh-HK": "香港住宅外牆密集冷氣機",
      en: "Air-conditioning units on a Hong Kong residential facade",
    },
    useCases: {
      "zh-HK": ["冷氣滴水", "唔夠凍", "清洗保養"],
      en: ["Water dripping", "Not cooling", "Cleaning"],
    },
  },
  renovation: {
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Construction_worker_building_a_bamboo_scaffolding_in_Hong_Kong_%281%29.JPG/960px-Construction_worker_building_a_bamboo_scaffolding_in_Hong_Kong_%281%29.JPG",
    objectPosition: "50% 42%",
    alt: {
      "zh-HK": "香港師傅搭建竹棚進行樓宇維修",
      en: "A worker building bamboo scaffolding for repair work in Hong Kong",
    },
    useCases: {
      "zh-HK": ["油漆", "木工", "小型翻新"],
      en: ["Painting", "Carpentry", "Minor refresh"],
    },
  },
};

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
            : "按需要選擇家居維修分類"}
        </h1>
        <p className="text-lg leading-8 text-muted">
          {locale === "en"
            ? "Start with the trade that best matches the problem: plumbing leaks, electrical faults, aircon cleaning or repair, and minor renovation work."
            : "由問題對應工種開始：水喉漏水、電力故障、冷氣清洗維修、裝修雜項，都可以用同一流程提交需求。"}
        </p>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {categories.map((category) => {
          const media = categoryMedia[category.id] ?? categoryMedia.renovation;

          return (
            <Card key={category.id} className="overflow-hidden">
              <div className="relative aspect-[16/9] bg-paper-warm">
                <Image
                  src={media.image}
                  alt={media.alt[locale]}
                  className="h-full w-full object-cover"
                  fill
                  loading="lazy"
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  style={{ objectPosition: media.objectPosition }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/74 via-black/24 to-transparent p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                    {category.id}
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                    {category.name[locale]}
                  </h2>
                </div>
              </div>
              <CardContent className="space-y-5">
                <p className="text-sm leading-7 text-muted">
                  {category.description[locale]}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-surface-tint p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
                      {locale === "en" ? "Common jobs" : "常見需求"}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-foreground">
                      {media.useCases[locale].map((item) => (
                        <li key={item} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl bg-soft-accent/55 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">
                      {locale === "en" ? "Services" : "服務項目"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {category.subcategories.map((subcategory) => (
                        <span
                          key={subcategory.id}
                          className="rounded-full border border-white/80 bg-white/86 px-3 py-1 text-xs font-medium"
                        >
                          {subcategory.name[locale]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t border-line/70 pt-5">
                  <Link
                    href="/auth/signup"
                    locale={locale}
                    className={`${buttonVariants({ size: "sm" })} !text-white`}
                  >
                    {locale === "en" ? "Create request" : "建立請求"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
