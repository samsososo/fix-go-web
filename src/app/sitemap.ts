import type { MetadataRoute } from "next";

import { getAbsoluteUrl, PublicLocale, publicRoutes } from "@/lib/seo";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.flatMap((locale) =>
    publicRoutes.map((route) => ({
      url: getAbsoluteUrl(locale as PublicLocale, route),
      lastModified: new Date(),
      changeFrequency: route === "/" ? "daily" : "weekly",
      priority:
        route === "/"
          ? 1
          : route === "/categories" || route === "/become-a-pro"
            ? 0.85
            : 0.7,
      alternates: {
        languages: {
          "zh-HK": getAbsoluteUrl("zh-HK", route),
          en: getAbsoluteUrl("en", route),
        },
      },
    })),
  );
}
