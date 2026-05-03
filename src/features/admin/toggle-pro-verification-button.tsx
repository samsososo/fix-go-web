"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toggleProVerificationAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";

export function ToggleProVerificationButton({
  locale,
  userId,
  verified,
}: {
  locale: string;
  userId: string;
  verified: boolean;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant={verified ? "outline" : "secondary"}
      disabled={!isHydrated || isPending}
      onClick={() =>
        startTransition(async () => {
          await toggleProVerificationAction({
            locale,
            userId,
            verified: !verified,
          });
          router.refresh();
        })
      }
    >
      {isPending
        ? "..."
        : verified
          ? locale === "en"
            ? "Unverify"
            : "取消驗證"
          : locale === "en"
            ? "Verify"
            : "標記已驗證"}
    </Button>
  );
}
