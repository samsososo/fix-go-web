"use client";

import { useQuery } from "@tanstack/react-query";

import { AcceptQuoteButton } from "@/features/customer/accept-quote-button";
import { formatDateTime, formatDurationMinutes } from "@/lib/formatters";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

type QuoteView = {
  id: string;
  total: number;
  includedWork: string;
  exclusions: string;
  earliestAvailability: string;
  estimatedDurationMinutes: number;
  noteToCustomer: string;
  status: string;
  proName: string;
  canAccept: boolean;
};

export function LiveQuotesPanel({
  requestId,
  locale,
}: {
  requestId: string;
  locale: string;
}) {
  const quotesQuery = useQuery({
    queryKey: ["request-quotes", requestId],
    queryFn: async () => {
      const response = await fetch(`/api/requests/${requestId}/quotes`);
      if (!response.ok) {
        throw new Error("Failed to load quotes");
      }
      return (await response.json()) as QuoteView[];
    },
    refetchInterval: 4000,
  });

  if (quotesQuery.isLoading) {
    return (
      <p className="text-sm text-muted">
        {locale === "en" ? "Loading quotes..." : "載入報價中..."}
      </p>
    );
  }

  if (!quotesQuery.data?.length) {
    return (
      <p className="text-sm text-muted">
        {locale === "en" ? "No quotes yet." : "暫時未有報價。"}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {quotesQuery.data.map((quote) => (
        <Card key={quote.id}>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-2xl font-bold">
                  {quote.proName}
                </p>
                <p className="text-sm text-muted">{quote.noteToCustomer}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={quote.status as never} locale={locale} />
                <p className="font-display text-2xl font-bold">
                  {formatCurrency(quote.total, locale)}
                </p>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
              <div>
                <p className="font-semibold text-foreground">
                  {locale === "en" ? "Earliest visit" : "最早可上門"}
                </p>
                <p>{formatDateTime(quote.earliestAvailability, locale)}</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {locale === "en" ? "Estimated duration" : "預計需時"}
                </p>
                <p>
                  {formatDurationMinutes(
                    quote.estimatedDurationMinutes,
                    locale,
                  )}
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {locale === "en" ? "Included work" : "包含項目"}
                </p>
                <p>{quote.includedWork}</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {locale === "en" ? "Exclusions" : "不包括"}
                </p>
                <p>{quote.exclusions}</p>
              </div>
            </div>
            {quote.status === "sent" && quote.canAccept ? (
              <AcceptQuoteButton
                locale={locale}
                requestId={requestId}
                quoteId={quote.id}
              />
            ) : quote.status === "sent" ? (
              <p className="rounded-xl border border-warning/20 bg-warning/8 px-3 py-2 text-sm leading-6 text-warning">
                {locale === "en"
                  ? "This pro is temporarily unavailable for new work. You can review another quote or check again later."
                  : "呢位師傅暫時未能接受新工作；你可以查看其他報價，或者稍後再試。"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
