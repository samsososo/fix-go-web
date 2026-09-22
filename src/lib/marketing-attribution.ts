import type { MarketingAttribution } from "@/types/domain";

export type { MarketingAttribution } from "@/types/domain";

export const MARKETING_ATTRIBUTION_COOKIE = "hotfix_attribution";

const KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
] as const;

function clean(value: string | null | undefined) {
  const result = value?.trim();
  return result ? result.slice(0, 120) : undefined;
}

export function readMarketingAttribution(
  value: string | undefined,
): MarketingAttribution | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Record<
      string,
      unknown
    >;
    const attribution: MarketingAttribution = {};
    for (const key of KEYS) {
      if (typeof parsed[key] === "string")
        attribution[key] = clean(parsed[key]);
    }
    return Object.keys(attribution).length ? attribution : undefined;
  } catch {
    return undefined;
  }
}

export function getMarketingAttribution(
  searchParams: URLSearchParams,
): MarketingAttribution | undefined {
  const attribution: MarketingAttribution = {};
  for (const key of KEYS) {
    const value = clean(searchParams.get(key));
    if (value) attribution[key] = value;
  }
  return Object.keys(attribution).length ? attribution : undefined;
}

export function encodeMarketingAttribution(attribution: MarketingAttribution) {
  return encodeURIComponent(JSON.stringify(attribution));
}
