"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutAction } from "@/lib/actions";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";

export function LogoutButton({ locale }: { locale: string }) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
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
