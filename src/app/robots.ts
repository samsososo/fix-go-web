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
        "/zh-HK/customer/",
        "/zh-HK/pro/",
        "/zh-HK/admin/",
        "/en/customer/",
        "/en/pro/",
        "/en/admin/",
      ],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
