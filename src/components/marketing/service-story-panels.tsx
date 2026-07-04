import Image from "next/image";

const panels = {
  en: [
    {
      image: "/images/customer-request-ai.png",
      title: "Show the problem before pros quote",
      label: "Customer",
      body: "Add photos, urgency, budget, and building access notes so professionals know what they are pricing.",
    },
    {
      image: "/images/pro-quote-ai.png",
      title: "Compare more than a single number",
      label: "Professional",
      body: "Quotes break down labour, parts, call-out fee, availability, included work, and exclusions.",
    },
  ],
  "zh-HK": [
    {
      image: "/images/customer-request-ai.png",
      title: "報價前先講清楚問題",
      label: "客戶",
      body: "先整理相片、緊急程度、預算、香港地址及大廈出入備註，師傅才更容易準確報價。",
    },
    {
      image: "/images/pro-quote-ai.png",
      title: "唔只睇一個總價",
      label: "師傅",
      body: "每份報價可拆分人工、物料、上門費、最早時間、包含項目及不包含項目。",
    },
  ],
} satisfies Record<
  "zh-HK" | "en",
  { image: string; title: string; label: string; body: string }[]
>;

export function ServiceStoryPanels({ locale }: { locale: "zh-HK" | "en" }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {panels[locale].map((panel) => (
        <article
          key={panel.title}
          className="overflow-hidden rounded-[24px] border border-line/70 bg-card/90 shadow-[0_12px_34px_rgba(24,36,51,0.06)]"
        >
          <div className="relative aspect-[16/10] bg-paper-warm">
            <Image
              src={panel.image}
              alt={panel.title}
              fill
              className="pointer-events-none object-cover"
              sizes="(min-width: 1024px) 33vw, 100vw"
            />
          </div>
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/62">
              {panel.label}
            </p>
            <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">
              {panel.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted">{panel.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
