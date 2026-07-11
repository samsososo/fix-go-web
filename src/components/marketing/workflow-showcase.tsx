import Image from "next/image";
import {
  ClipboardCheck,
  ClipboardList,
  ReceiptText,
  ShieldCheck,
  Wrench,
} from "lucide-react";

type WorkflowCopy = {
  eyebrow: string;
  title: string;
  body: string;
  steps: {
    title: string;
    body: string;
  }[];
  roles: {
    label: string;
    title: string;
    body: string;
  }[];
  photos: {
    title: string;
    label: string;
    body: string;
    image: string;
    alt: string;
  }[];
};

const plumberPhoto = "/images/services/plumber-at-work.jpg";

const electricianPhoto = "/images/services/electrician-at-panel.jpg";

export function WorkflowShowcase({ locale }: { locale: "zh-HK" | "en" }) {
  const copy: WorkflowCopy =
    locale === "en"
      ? {
          eyebrow: "From request to booking",
          title:
            "One flow for the customer brief, the quote, and the job status.",
          body: "Customers add the useful details once. Pros reply in the same quote format. Everyone can compare price, timing, and scope before confirming.",
          steps: [
            {
              title: "Customer sends the job details",
              body: "Address, access notes, budget, and urgency are captured before pros quote.",
            },
            {
              title: "Pros quote in the same format",
              body: "Labour, parts, call-out fee, earliest time, inclusions, and exclusions stay comparable.",
            },
            {
              title: "Customer compares and confirms",
              body: "The booking moves forward only after price, timing, and scope are clear.",
            },
          ],
          roles: [
            {
              label: "Customer",
              title: "Post once, compare clearly",
              body: "Every quote is attached to the same request, so there is less back-and-forth.",
            },
            {
              label: "Professional",
              title: "Open leads, category filters",
              body: "Pros can review the full request pool and filter by trade before responding with structured pricing.",
            },
          ],
          photos: [
            {
              title: "The issue is easier to price",
              label: "Plumbing jobs",
              body: "Clear notes give pros enough context before they visit.",
              image: plumberPhoto,
              alt: "Plumber working on pipework",
            },
            {
              title: "The quote is easier to compare",
              label: "Electrical jobs",
              body: "Scope, parts, and timing are separated so the quote is not just one number.",
              image: electricianPhoto,
              alt: "Electrician working on a home's electrical panel",
            },
          ],
        }
      : {
          eyebrow: "由需求到接單",
          title: "一條流程，講清楚工程、報清楚價錢、追蹤到訂單。",
          body: "客戶一次整理地址及要求；師傅用同一格式回覆報價。確認前先比較價錢、時間及工程範圍，少啲來回追問。",
          steps: [
            {
              title: "住戶交清楚資料",
              body: "地址、大廈出入、預算、緊急程度，一次過整理好。",
            },
            {
              title: "師傅用同一格式報價",
              body: "人工、物料、上門費、最快時間、包括及不包括項目都分開列明。",
            },
            {
              title: "比較清楚先確認",
              body: "客戶按價錢、時間及工程範圍比較，再確認合適師傅。",
            },
          ],
          roles: [
            {
              label: "住戶端",
              title: "一次提交，清楚比較",
              body: "每份報價都跟住同一個需求，唔需要逐個訊息重講一次。",
            },
            {
              label: "師傅端",
              title: "開放需求，分類篩選",
              body: "先睇晒開放需求，再按工種分類篩選，用清晰價目回覆。",
            },
          ],
          photos: [
            {
              title: "問題更易估價",
              label: "水喉維修",
              body: "需求同備註先整理好，師傅未上門都知道大概範圍。",
              image: plumberPhoto,
              alt: "水喉師傅維修喉管參考相片",
            },
            {
              title: "報價更易比較",
              label: "電力工程",
              body: "人工、物料、時間同工程範圍分開列明，唔只睇一個總價。",
              image: electricianPhoto,
              alt: "電工處理住宅電箱參考相片",
            },
          ],
        };

  const stepIcons = [ClipboardList, ReceiptText, ClipboardCheck];
  const roleIcons = [ShieldCheck, Wrench];

  return (
    <section className="mt-16 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:gap-12">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 className="mt-4 max-w-3xl text-balance font-display text-3xl font-extrabold tracking-normal text-foreground sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted sm:text-lg">
          {copy.body}
        </p>

        <div className="mt-8 space-y-3">
          {copy.steps.map((step, index) => {
            const Icon = stepIcons[index];

            return (
              <div
                key={step.title}
                className="grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-line/70 bg-card/90 p-4 shadow-[0_10px_26px_rgba(24,36,51,0.04)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-primary">
                    0{index + 1}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-extrabold tracking-normal text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {step.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {copy.roles.map((role, index) => {
            const Icon = roleIcons[index];

            return (
              <div
                key={role.title}
                className="rounded-xl border border-primary/12 bg-surface-tint p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-[0_8px_18px_rgba(24,36,51,0.06)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {role.label}
                    </p>
                    <h3 className="font-display text-lg font-extrabold tracking-normal text-foreground">
                      {role.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">{role.body}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-28">
        {copy.photos.map((photo, index) => (
          <figure
            key={photo.title}
            className={`group relative overflow-hidden rounded-xl bg-surface-strong shadow-[0_18px_44px_rgba(24,36,51,0.12)] ${
              index === 1 ? "sm:mt-12" : ""
            }`}
          >
            <div className="relative aspect-[4/5] min-h-[320px]">
              <Image
                src={photo.image}
                alt={photo.alt}
                fill
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                sizes="(min-width: 1024px) 280px, (min-width: 640px) 44vw, 92vw"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,37,58,0)_30%,rgba(16,37,58,0.84)_100%)]" />
              <figcaption className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="text-sm font-semibold text-white/76">
                  {photo.label}
                </p>
                <h3 className="mt-2 font-display text-2xl font-extrabold tracking-normal">
                  {photo.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  {photo.body}
                </p>
              </figcaption>
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
