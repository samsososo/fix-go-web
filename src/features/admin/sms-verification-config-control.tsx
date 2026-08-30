"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { updateSmsVerificationConfigAction } from "@/lib/actions";

export function SmsVerificationConfigControl({
  locale,
  enabled,
}: {
  locale: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={enabled ? "danger" : "default"}
        disabled={!isHydrated || isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateSmsVerificationConfigAction({
              locale,
              enabled: !enabled,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {isPending
          ? locale === "en"
            ? "Saving..."
            : "儲存中⋯"
          : enabled
            ? locale === "en"
              ? "Turn config off"
              : "關閉設定"
            : locale === "en"
              ? "Turn config on"
              : "開啟設定"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
