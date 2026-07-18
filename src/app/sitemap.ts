import type { MetadataRoute } from "next";

import { publicLocales } from "@/i18n/routing";
import {
  getAbsoluteUrl,
  getLanguageAlternates,
  sitemapRoutes,
} from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicLocales.flatMap((locale) =>
    sitemapRoutes.map((route) => ({
      url: getAbsoluteUrl(locale, route),
      changeFrequency: route === "/" ? "daily" : "weekly",
      priority:
        route === "/"
          ? 1
          : route === "/categories" || route === "/become-a-pro"
            ? 0.85
            : 0.7,
      alternates: {
        languages: getLanguageAlternates(route),
      },
    })),
  );
}
