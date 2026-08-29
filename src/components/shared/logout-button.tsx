"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LogoutButton({
  locale,
  className,
}: {
  locale: string;
  className?: string;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(className)}
      disabled={!isHydrated || isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await logoutAction({ locale });
          router.push(result.target);
        })
      }
    >
      {isPending ? "..." : locale === "en" ? "Sign out" : "登出"}
    </Button>
  );
}
