"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { acceptQuoteAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";

export function AcceptQuoteButton({
  locale,
  requestId,
  quoteId,
  quoteSummary,
}: {
  locale: string;
  requestId: string;
  quoteId: string;
  quoteSummary: string;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const confirmationTitleId = useId();
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptQuote = () => {
    startTransition(async () => {
      setError(null);
      const result = await acceptQuoteAction({
        locale,
        requestId,
        quoteId,
      });
      if (!result.ok) {
        setError(result.error ?? "Unable to accept quote.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {isConfirming ? (
        <div
          className="rounded-2xl border border-primary/20 bg-surface-tint/78 p-4"
          role="group"
          aria-labelledby={confirmationTitleId}
        >
          <p id={confirmationTitleId} className="font-semibold">
            {locale === "en" ? "Confirm this quote?" : "確認接受呢份報價？"}
          </p>
          <p className="mt-1 text-sm font-semibold text-primary">
            {quoteSummary}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {locale === "en"
              ? "Accepting creates an order with this professional. No customer payment is required at this stage."
              : "接受後會同呢位師傅建立訂單；現階段客戶毋須付款。"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
            >
              {locale === "en" ? "Back" : "返回"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!isHydrated || isPending}
              onClick={acceptQuote}
            >
              {isPending
                ? locale === "en"
                  ? "Confirming..."
                  : "確認中..."
                : locale === "en"
                  ? "Confirm"
                  : "確認接受"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          className="w-full sm:w-auto"
          size="sm"
          disabled={!isHydrated || isPending}
          onClick={() => {
            setError(null);
            setIsConfirming(true);
          }}
        >
          {locale === "en" ? "Accept quote" : "接受報價"}
        </Button>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
