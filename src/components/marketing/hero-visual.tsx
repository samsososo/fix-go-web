import Image from "next/image";

type HeroVisualCopy = {
  photoCards: {
    title: string;
    body: string;
    image: string;
    alt: string;
  }[];
  stats: {
    label: string;
    body: string;
  }[];
};

const plumbingPhoto = "/images/services/hong-kong-plumbing.jpg";

const electricalPhoto = "/images/services/hong-kong-fuse-boxes.jpg";

export function HeroVisual({ locale }: { locale: "zh-HK" | "en" }) {
  const copy: HeroVisualCopy =
    locale === "en"
      ? {
          photoCards: [
            {
              title: "Plumbing repairs",
              body: "Share photos, location, urgency, and access notes before pros quote.",
              image: plumbingPhoto,
              alt: "Hong Kong residential exterior plumbing",
            },
            {
              title: "Electrical work",
              body: "Switches, sockets, and fuse boxes stay organised by service type.",
              image: electricalPhoto,
              alt: "Hong Kong residential electrical distribution box",
            },
          ],
          stats: [
            {
              label: "Free quote arrangement",
              body: "Share the request first, then compare responses before booking.",
            },
            {
              label: "Multiple pros can respond",
              body: "Compare price, earliest time, and work scope before confirming.",
            },
            {
              label: "Clear quote details",
              body: "Labour, parts, and call-out fees are listed separately.",
            },
          ],
        }
      : {
          photoCards: [
            {
              title: "水喉維修",
              body: "先交位置、緊急程度及工程內容，再等師傅用同一格式報價。",
              image: plumbingPhoto,
              alt: "香港住宅外牆水喉維修參考相片",
            },
            {
              title: "電力工程",
              body: "燈掣、插蘇、配電箱，用清楚分類減少來回問答。",
              image: electricalPhoto,
              alt: "香港住宅配電箱參考相片",
            },
          ],
          stats: [
            {
              label: "免費安排報價",
              body: "先提交需求，再比較師傅回覆。",
            },
            {
              label: "多位師傅可回覆",
              body: "確認前比較價錢、最快時間、工程範圍。",
            },
            {
              label: "報價資料清楚",
              body: "人工、物料、上門費分開列明。",
            },
          ],
        };

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-surface-strong p-4 text-white shadow-[0_24px_54px_rgba(16,37,58,0.2)] sm:p-5 lg:rounded-[32px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {copy.photoCards.map((card) => (
          <figure
            key={card.title}
            className="relative min-h-[280px] overflow-hidden rounded-xl bg-surface-strong sm:min-h-[332px]"
          >
            <Image
              src={card.image}
              alt={card.alt}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 46vw, 92vw"
              priority
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,37,58,0)_34%,rgba(16,37,58,0.78)_100%)]" />
            <figcaption className="absolute inset-x-0 bottom-0 z-10 p-5">
              <h3 className="font-display text-2xl font-extrabold tracking-normal">
                {card.title}
              </h3>
              <p className="mt-2 max-w-[17rem] text-sm leading-6 text-white/84">
                {card.body}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-3 grid overflow-hidden rounded-xl border border-line/70 bg-paper-warm text-foreground shadow-[0_16px_34px_rgba(24,36,51,0.08)] sm:grid-cols-3">
        {copy.stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`p-5 ${index > 0 ? "border-t border-line/70 sm:border-l sm:border-t-0" : ""}`}
          >
            <p className="font-display text-xl font-extrabold tracking-normal text-foreground">
              {stat.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">{stat.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
