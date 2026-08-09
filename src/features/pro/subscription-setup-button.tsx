"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { startProSubscriptionCheckoutAction } from "@/lib/actions";

export function SubscriptionSetupButton({ locale }: { locale: string }) {
  const isEnglish = locale === "en";
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={!isHydrated || isPending}
        aria-describedby="subscription-setup-note"
        onClick={() =>
          startTransition(async () => {
            setError(null);

            try {
              const result = await startProSubscriptionCheckoutAction({
                locale,
              });

              if (!result.ok) {
                setError(
                  result.error ??
                    (isEnglish
                      ? "Unable to open the secure card setup. Please try again."
                      : "暫時未能開啟安全綁卡頁面，請再試一次。"),
                );
                return;
              }

              window.location.assign(result.url);
            } catch {
              setError(
                isEnglish
                  ? "Unable to open the secure card setup. Please try again."
                  : "暫時未能開啟安全綁卡頁面，請再試一次。",
              );
            }
          })
        }
      >
        {isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending
          ? isEnglish
            ? "Opening Stripe…"
            : "正在開啟 Stripe…"
          : isEnglish
            ? "Set up card securely"
            : "前往 Stripe 安全綁卡"}
      </Button>

      <p id="subscription-setup-note" className="text-xs leading-6 text-muted">
        {isEnglish
          ? "No charge today. Your three-month free trial starts only after Stripe confirms your card setup."
          : "今日不會收費；Stripe 確認綁卡成功後，3 個月免費試用先會開始。"}
      </p>

      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
