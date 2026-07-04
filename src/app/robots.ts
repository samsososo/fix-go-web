import type { MetadataRoute } from "next";

import { getBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/customer/",
        "/pro/",
        "/admin/",
        "/zh-HK/",
        "/en/",
      ],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
