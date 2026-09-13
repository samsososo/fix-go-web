"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Droplets,
  Hammer,
  MapPin,
  Pause,
  Play,
  Snowflake,
  Zap,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import {
  PRO_SUBSCRIPTION_AMOUNT_MINOR,
  PRO_SUBSCRIPTION_TRIAL_MONTHS,
} from "@/lib/subscription-policy";

import type { PublicJobPreview } from "@/lib/facebook-group-snapshots";

const trades: Record<string, { label: string; icon: typeof Hammer }> = {
  plumbing: { label: "水喉維修", icon: Droplets },
  electrical: { label: "電力工程", icon: Zap },
  aircon: { label: "冷氣工程", icon: Snowflake },
  renovation: { label: "裝修雜項", icon: Hammer },
};

export function ProJobsCarousel({
  locale,
  jobs,
}: {
  locale: string;
  jobs: PublicJobPreview[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);

  const move = useCallback((direction: number) => {
    const track = trackRef.current;
    if (!track?.firstElementChild) return;
    const max = track.scrollWidth - track.clientWidth;
    const step = track.firstElementChild.getBoundingClientRect().width + 16;
    const left =
      direction > 0 && track.scrollLeft >= max - 2
        ? 0
        : direction < 0 && track.scrollLeft <= 2
          ? max
          : Math.min(max, Math.max(0, track.scrollLeft + direction * step));
    track.scrollTo({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, []);

  useEffect(() => {
    if (!playing || hovered || jobs.length < 2) return;
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (
        !track ||
        document.hidden ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const rect = track.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) move(1);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [playing, hovered, move, jobs.length]);

  return (
    <section
      id="pro-jobs-preview"
      aria-labelledby="pro-jobs-title"
      aria-roledescription="輪播"
      className="content-wrap scroll-mt-20 pb-10 sm:pb-14"
    >
      <div className="overflow-hidden rounded-2xl bg-[#123d36] px-4 py-6 text-white sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wide text-[#edff85]">
            師傅專區 · 工作機會
          </p>
          {jobs.length > 1 && (
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "暫停工作輪播" : "開始工作輪播"}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs text-white/85 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hidden"
            >
              {playing ? (
                <Pause aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Play aria-hidden="true" className="h-4 w-4" />
              )}
              {playing ? "暫停" : "播放"}
            </button>
          )}
        </div>
        <h2
          id="pro-jobs-title"
          className="mt-1 font-display text-2xl font-extrabold leading-snug sm:text-3xl"
        >
          睇下有咩工，<span className="text-[#edff85]">啱你做。</span>
        </h2>
        <p className="mt-2 text-xs leading-6 text-white/75">
          註冊睇更多工作。工作詳情及接洽安排，以發帖人確認為準。
        </p>

        {jobs.length === 0 ? (
          <p className="mt-5 rounded-xl border border-white/20 p-5 text-sm text-white/85">
            暫時未有可顯示嘅工作線索，請稍後再睇。
          </p>
        ) : (
          <ul
            ref={trackRef}
            tabIndex={0}
            aria-label="工作機會列表，可左右滑動"
            aria-live="off"
            onPointerDown={() => setPlaying(false)}
            onFocus={() => setPlaying(false)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="relative mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-xl pb-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#edff85] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {jobs.map(({ id, location, categoryId, title }) => {
              const { label: trade, icon: Icon } = trades[categoryId ?? ""] ?? {
                label: "其他工程",
                icon: Hammer,
              };
              return (
                <li
                  key={id}
                  className="w-[85%] shrink-0 snap-start rounded-xl bg-[#f8faf4] p-5 text-foreground sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7eee0] text-primary">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-primary">
                    {trade}
                  </p>
                  <h3 className="mt-2 min-h-14 text-lg font-bold leading-7">
                    {title}
                  </h3>
                  <p className="mt-4 flex items-center gap-1.5 border-t border-line/60 pt-3 text-sm text-muted">
                    <MapPin aria-hidden="true" className="h-4 w-4" />
                    {location}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {jobs.length > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-white/75">左右滑動，睇其他工種</p>
            <div className="flex gap-2">
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-label={direction === -1 ? "上一張工作" : "下一張工作"}
                  onClick={() => {
                    setPlaying(false);
                    move(direction);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {direction === -1 ? (
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/auth/signup?role=pro"
            locale={locale}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#edff85] px-5 py-3 text-sm font-bold !text-[#143b2e] hover:bg-[#d8ed61] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            我係師傅，註冊睇工作
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href="/become-a-pro"
            locale={locale}
            className="inline-flex min-h-11 items-center justify-center text-sm font-semibold !text-white underline underline-offset-4"
          >
            了解月費及免費試用
          </Link>
        </div>
        <p className="mt-3 text-xs leading-6 text-white/75">
          註冊可預覽工作；綁卡起首 {PRO_SUBSCRIPTION_TRIAL_MONTHS}{" "}
          個月免費，之後 HK${PRO_SUBSCRIPTION_AMOUNT_MINOR / 100}
          ／月自動續費。完整資料及報價須有效訂閱。
        </p>
      </div>
    </section>
  );
}
