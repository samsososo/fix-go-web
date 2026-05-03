import {
  BadgeCheck,
  Camera,
  Clock3,
  MapPinned,
  MessageSquareText,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";

export function HeroVisual({ locale }: { locale: "zh-HK" | "en" }) {
  const copy =
    locale === "en"
      ? {
          requestLabel: "Customer request",
          request: "Water heater repair",
          district: "Kowloon Tong",
          timing: "Today, 6:30 PM",
          address: "Estate access notes included",
          photos: "3 photos attached",
          quotes: "Quotes ready",
          quoteCount: "3 pros responded",
          compare: "Compare by price, timing, and scope before accepting.",
          verified: "Verified",
          response: "Fastest response",
          ops: "Ops can review every record when support is needed.",
          pros: [
            {
              name: "Chan Plumbing",
              meta: "4.9 rating · earliest today",
              amount: "HK$1,980",
            },
            {
              name: "Kowloon Home Fix",
              meta: "4.8 rating · tomorrow",
              amount: "HK$2,120",
            },
          ],
        }
      : {
          requestLabel: "住戶請求",
          request: "熱水爐維修",
          district: "九龍塘",
          timing: "今日晚上 6:30",
          address: "已填大廈出入備註",
          photos: "已附 3 張相片",
          quotes: "報價已準備",
          quoteCount: "3 位師傅已回覆",
          compare: "確認前可按價錢、時間及工程範圍比較。",
          verified: "已核實",
          response: "最快回覆",
          ops: "營運需要時可檢視每項記錄並協助處理。",
          pros: [
            {
              name: "陳記水喉工程",
              meta: "4.9 評分 · 最快今日",
              amount: "HK$1,980",
            },
            {
              name: "九龍家居維修",
              meta: "4.8 評分 · 明日可到",
              amount: "HK$2,120",
            },
          ],
        };

  return (
    <div className="relative overflow-hidden rounded-[40px] bg-[#10263b] p-5 text-white shadow-[0_30px_80px_rgba(16,37,58,0.24)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_0%,_rgba(217,147,45,0.24),transparent_28%),radial-gradient(circle_at_100%_30%,_rgba(103,190,173,0.16),transparent_26%)]" />
      <div className="relative grid gap-4">
        <div className="rounded-[30px] border border-white/12 bg-white/8 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/54">
                {copy.requestLabel}
              </p>
              <h3 className="mt-3 font-display text-3xl font-extrabold tracking-tight">
                {copy.request}
              </h3>
            </div>
            <span className="rounded-full bg-[#f7d392]/18 px-3 py-1.5 text-xs font-semibold text-[#ffe1a7]">
              ASAP
            </span>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-white/76 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/8 p-3">
              <MapPinned className="mb-2 h-4 w-4 text-[#ffd79b]" />
              {copy.district}
            </div>
            <div className="rounded-2xl bg-white/8 p-3">
              <Clock3 className="mb-2 h-4 w-4 text-[#a8e2d4]" />
              {copy.timing}
            </div>
            <div className="rounded-2xl bg-white/8 p-3">
              <Camera className="mb-2 h-4 w-4 text-[#c4d4ff]" />
              {copy.photos}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm text-white/70">
            <ShieldCheck className="h-4 w-4 text-[#a8e2d4]" />
            <span>{copy.address}</span>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[30px] bg-[#fff8ec] p-5 text-foreground">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/68">
              {copy.quotes}
            </p>
            <h4 className="mt-3 font-display text-2xl font-extrabold">
              {copy.quoteCount}
            </h4>
            <p className="mt-3 text-sm leading-7 text-muted">{copy.compare}</p>

            <div className="mt-5 grid gap-3">
              {copy.pros.map((pro, index) => (
                <div
                  key={pro.name}
                  className="rounded-2xl border border-line/70 bg-white/78 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{pro.name}</p>
                        {index === 0 ? (
                          <BadgeCheck className="h-4 w-4 text-success" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">{pro.meta}</p>
                    </div>
                    <p className="font-display text-xl font-extrabold">
                      {pro.amount}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[30px] border border-white/12 bg-white/8 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Wrench className="h-5 w-5 text-[#ffd79b]" />
                </span>
                <div>
                  <p className="font-semibold">{copy.response}</p>
                  <p className="text-sm text-white/62">18 min</p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/12 bg-white/8 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Star className="h-5 w-5 fill-[#ffd79b] text-[#ffd79b]" />
                </span>
                <div>
                  <p className="font-semibold">{copy.verified}</p>
                  <p className="text-sm text-white/62">
                    {locale === "en"
                      ? "Profile and service area checked"
                      : "檔案及服務地區已檢查"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/12 bg-white/8 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <MessageSquareText className="h-5 w-5 text-[#a8e2d4]" />
                </span>
                <p className="text-sm leading-7 text-white/66">{copy.ops}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
