import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { FacebookGroupSnapshot } from "@/lib/facebook-group-snapshots";

export function FacebookGroupLeads({
  leads,
  locale,
}: {
  leads: FacebookGroupSnapshot[];
  locale: string;
}) {
  if (!leads.length) return null;
  const en = locale === "en";
  return (
    <section
      className="mt-6 space-y-4"
      aria-labelledby="facebook-leads-heading"
    >
      <div>
        <h2
          id="facebook-leads-heading"
          className="font-display text-xl font-bold"
        >
          {en
            ? `Facebook posts (${leads.length})`
            : `Facebook 外部帖文（${leads.length}）`}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {en
            ? "Unverified posts from followed groups. Dates and availability need checking; some posts may be adverts or discussions. These are not platform bookings."
            : "來自已加入群組，未核實發帖日期及工作是否仍然有效，可能包含廣告或討論。呢啲帖文並非平台訂單。"}
        </p>
      </div>
      <div className="grid gap-3 sm:gap-5">
        {leads.map((lead) => (
          <Card key={lead.id}>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                  Facebook
                </span>
                <span className="rounded-full bg-warning/10 px-2.5 py-1 text-warning">
                  {en ? "Unverified · date unknown" : "待核實 · 日期未確認"}
                </span>
                {lead.truncated ? (
                  <span className="text-muted">
                    {en ? "Incomplete text" : "內容未完整"}
                  </span>
                ) : null}
              </div>
              <h3 className="font-semibold">{lead.sourceName}</h3>
              <p className="line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted">
                {lead.message}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-primary">
                  {en
                    ? "Show captured text and contacts"
                    : "查看已收集內容及聯絡資料"}
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words leading-6">
                  {lead.message}
                </p>
              </details>
              <a
                href={lead.permalink ?? lead.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"
              >
                {lead.permalink
                  ? en
                    ? "View original post"
                    : "查看原帖"
                  : en
                    ? "Open source group"
                    : "前往來源群組"}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
