"use client";

import { useQuery } from "@tanstack/react-query";

import { AcceptQuoteButton } from "@/features/customer/accept-quote-button";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

type QuoteView = {
  id: string;
  total: number;
  includedWork: string;
  exclusions: string;
  earliestAvailability: string;
  noteToCustomer: string;
  status: string;
  proName: string;
};

export function LiveQuotesPanel({
  requestId,
  locale,
  customerId,
}: {
  requestId: string;
  locale: string;
  customerId: string;
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
            {quote.status === "sent" ? (
              <AcceptQuoteButton
                locale={locale}
                customerId={customerId}
                requestId={requestId}
                quoteId={quote.id}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
