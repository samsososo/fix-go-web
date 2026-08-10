"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptQuoteAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";

export function AcceptQuoteButton({
  locale,
  requestId,
  quoteId,
}: {
  locale: string;
  requestId: string;
  quoteId: string;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={!isHydrated || isPending}
        onClick={() =>
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
          })
        }
      >
        {isPending ? "..." : locale === "en" ? "Accept quote" : "接受報價"}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
