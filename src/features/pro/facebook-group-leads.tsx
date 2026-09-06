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
            ? `Hong Kong Facebook work opportunities (${leads.length})`
            : `香港 Facebook 搵師傅／招聘（${leads.length}）`}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {en
            ? "Hong Kong posts seeking tradespeople, quotes for specific work or recruiting tradespeople. Dates and availability still need checking. These are not platform bookings."
            : "只顯示地點可判斷為香港的搵師傅、工程詢價及招聘帖文；發帖日期及需求是否仍然有效有待確認，並非平台訂單。"}
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
                {lead.message ||
                  (en
                    ? "Post text unavailable. Open the source to review."
                    : "未能擷取正文，請前往來源查看。")}
              </p>
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
