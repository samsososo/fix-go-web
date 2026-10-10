import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SubscriptionPricingPreview } from "@/features/pro/subscription-pricing-preview";

export const metadata: Metadata = {
  title: "師傅套餐預覽 | 快修24",
  robots: { index: false, follow: false },
};

export default function SubscriptionPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SubscriptionPricingPreview />;
}
