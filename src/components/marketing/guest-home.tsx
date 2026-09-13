import Image from "next/image";
import {
  ArrowRight,
  Check,
  Droplets,
  Hammer,
  Snowflake,
  Zap,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { ProJobsCarousel } from "@/components/marketing/pro-jobs-carousel";
import type { listPublicCategories } from "@/lib/mock/repositories";
import type { PublicJobPreview } from "@/lib/facebook-group-snapshots";

const trades = [
  {
    id: "plumbing",
    icon: Droplets,
    examples: "漏水 · 通渠 · 換龍頭",
    label: "水喉",
    image: "/images/services/hong-kong-plumbing.jpg",
  },
  {
    id: "electrical",
    icon: Zap,
    examples: "跳掣 · 插蘇 · 燈掣",
    label: "電力",
    image: "/images/services/hong-kong-fuse-boxes.jpg",
  },
  {
    id: "aircon",
    icon: Snowflake,
    examples: "唔凍 · 滴水 · 清洗",
    label: "冷氣",
    image: "/images/services/hong-kong-aircon-facade.jpg",
  },
  {
    id: "renovation",
    icon: Hammer,
    examples: "油漆 · 木工 · 小型翻新",
    label: "裝修",
    image: "/images/services/hong-kong-bamboo-scaffolding.jpg",
  },
];

export function GuestHome({
  locale,
  categories,
  jobs,
}: {
  locale: string;
  categories: Awaited<ReturnType<typeof listPublicCategories>>;
  jobs: PublicJobPreview[];
}) {
  return (
    <div className="bg-[#fcfcf9]">
      <section aria-labelledby="home-hero-title">
        <div className="relative isolate h-[clamp(250px,40svh,340px)] overflow-hidden bg-[#123d36] sm:h-[450px] lg:h-[540px]">
          <Image
            src="/images/home-repair-hero-v2.webp"
            alt="香港家居廚房維修情境示意圖"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[65%_42%] lg:object-[center_45%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#092e28] via-[#092e28]/20 to-transparent lg:bg-gradient-to-r lg:from-[#092e28] lg:via-[#092e28]/65 lg:to-transparent" />
          <div className="content-wrap relative flex h-full flex-col justify-end pb-12 sm:pb-16 lg:justify-center lg:pb-8">
            <p className="mb-3 text-xs font-semibold tracking-wider text-[#e7f7d7] sm:text-sm">
              香港家居維修配對
            </p>
            <h1
              id="home-hero-title"
              className="font-display text-[clamp(1.85rem,8.7vw,2.5rem)] font-extrabold leading-[1.22] tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              屋企有嘢壞？
              <br />
              <span className="text-[#edff85]">搵師傅，唔使煩。</span>
            </h1>
            <p className="mt-3 text-sm text-white/90 sm:mt-5 sm:text-lg">
              講一次需要，比較報價，再決定。
            </p>
          </div>
        </div>
        <div className="content-wrap relative z-10 -mt-6 pb-8 sm:-mt-10 sm:pb-12">
          <div className="mx-auto max-w-4xl rounded-2xl border border-line/40 bg-white p-4 shadow-[0_12px_36px_rgba(9,46,40,0.12)] sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold sm:text-lg">想整邊樣？</h2>
              <span className="rounded-full bg-[#eff6e6] px-2.5 py-1 text-xs font-semibold text-primary">
                免費安排報價
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {trades.map((trade) => {
                const category = categories.find(
                  (item) => item.id === trade.id,
                );
                if (!category) return null;
                const Icon = trade.icon;
                return (
                  <Link
                    key={trade.id}
                    href={`/categories#${trade.id}`}
                    locale={locale}
                    aria-label={`查看${category.name["zh-HK"]}服務`}
                    className="group flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl bg-[#f4f6f1] px-1 py-3 transition hover:bg-[#edff85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:gap-3"
                  >
                    <Icon aria-hidden="true" className="h-6 w-6 text-primary" />
                    <span className="text-sm font-bold text-foreground sm:text-base">
                      {trade.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            <Link
              href="/auth/signup"
              locale={locale}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#e7fa76] px-4 py-3 text-base font-bold !text-[#143b2e] transition hover:bg-[#d8ed61] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:mt-4 sm:min-h-14"
            >
              免費搵師傅報價
              <ArrowRight aria-hidden="true" className="h-5 w-5" />
            </Link>
            <p className="mt-2 text-center text-xs text-muted">
              先建立帳戶 · 客戶毋須信用卡
            </p>
          </div>
        </div>
      </section>

      <ProJobsCarousel locale={locale} jobs={jobs} />

      <section
        className="content-wrap pb-10 sm:pb-14"
        aria-labelledby="popular-repairs-title"
      >
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-primary">
              日常小問題，搵啱人處理
            </p>
            <h2
              id="popular-repairs-title"
              className="mt-2 font-display text-2xl font-extrabold sm:text-3xl"
            >
              屋企邊度要幫手？
            </h2>
          </div>
          <Link
            href="/categories"
            locale={locale}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold !text-primary"
          >
            睇全部
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {trades.map((trade) => {
            const category = categories.find((item) => item.id === trade.id);
            if (!category) return null;
            return (
              <Link
                key={trade.id}
                href={`/categories#${trade.id}`}
                locale={locale}
                className="group overflow-hidden rounded-2xl border border-line/50 bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-tint">
                  <Image
                    src={trade.image}
                    alt={`${category.name["zh-HK"]}服務參考相片`}
                    fill
                    sizes="(min-width: 1024px) 280px, 50vw"
                    className="object-cover transition duration-300 motion-safe:group-hover:scale-105"
                  />
                </div>
                <div className="p-3 sm:p-4">
                  <h3 className="flex items-center justify-between gap-1 text-base font-bold">
                    {category.name["zh-HK"]}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-primary"
                    />
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    {trade.examples}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-y border-line/50 bg-[#eff5ef]">
        <div className="content-wrap grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-tint">
            <Image
              src="/images/services/plumber-at-work.jpg"
              alt="師傅處理家居喉管工程的參考相片"
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">
              先睇清楚，先決定
            </p>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-snug sm:text-4xl">
              搵人整屋企，
              <br />
              價錢同細節都要清楚。
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                ["費用分開列明", "人工、物料、上門費，逐項睇清楚。"],
                [
                  "一次提交，集中比較",
                  "比較師傅嘅價錢、可上門時間同工程範圍。",
                ],
                ["由你揀，由你確認", "睇過報價，接受合適嗰份先建立訂單。"],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <Check
                    aria-hidden="true"
                    className="mt-1 h-5 w-5 shrink-0 text-primary"
                  />
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="content-wrap py-12 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">簡單三步</p>
            <h2 className="mt-3 section-title">由問題，到搵啱師傅。</h2>
          </div>
          <Link
            href="/how-it-works"
            locale={locale}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            了解完整流程
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        <ol className="mt-8 grid gap-7 sm:grid-cols-3 sm:gap-8">
          {[
            ["講清楚要整咩", "建立帳戶後，填寫維修問題、地址同希望上門時間。"],
            [
              "收到報價，慢慢比較",
              "師傅按需要回覆，你可以集中睇價錢同工程細節。",
            ],
            ["揀啱師傅，確認安排", "接受合適報價，再喺帳戶內跟進訂單狀態。"],
          ].map(([title, body], index) => (
            <li key={title} className="border-t border-line pt-5">
              <span className="text-sm font-bold text-primary">
                0{index + 1}
              </span>
              <h3 className="mt-3 font-display text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
