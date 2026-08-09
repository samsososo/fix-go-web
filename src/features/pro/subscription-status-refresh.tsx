"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 2_000;
const MAX_REFRESHES = 15;

export function SubscriptionStatusRefresh() {
  const router = useRouter();

  useEffect(() => {
    let refreshCount = 0;
    const interval = window.setInterval(() => {
      refreshCount += 1;
      router.refresh();
      if (refreshCount >= MAX_REFRESHES) {
        window.clearInterval(interval);
      }
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
