import type { Metadata } from "next";

import { defaultLocale, publicLocales } from "@/i18n/routing";
import { env } from "@/lib/env";

export type PublicLocale = "zh-HK";

export const publicRoutes = [
  "/",
  "/how-it-works",
  "/categories",
  "/become-a-pro",
  "/faq",
  "/auth",
  "/auth/login",
  "/auth/signup",
] as const;

export const sitemapRoutes = [
  "/",
  "/how-it-works",
  "/categories",
  "/become-a-pro",
  "/faq",
] as const satisfies readonly (typeof publicRoutes)[number][];

const siteName = "快修24";
const logoPath = "/hotfix24_chinese_logo.png";

const pageSeo = {
  "zh-HK": {
    "/": {
      title: "快修24 | 香港家居維修報價平台",
      description:
        "快修24 幫香港住戶免費安排家居維修報價，提交地址及需求後比較師傅報價，涵蓋水喉、電力、冷氣及裝修雜項。",
    },
    "/how-it-works": {
      title: "快修24 如何運作 | 由家居維修需求到確認報價",
      description:
        "了解快修24如何讓住戶提交維修需求、師傅接收合適工作機會、客戶比較報價並追蹤訂單狀態。",
    },
    "/categories": {
      title: "香港家居服務分類 | 水喉、電力、冷氣、裝修",
      description:
        "瀏覽快修24支援的香港家居服務分類，包括水喉維修、電力工程、冷氣清洗維修及裝修雜項。",
    },
    "/become-a-pro": {
      title: "成為快修24師傅 | 接收香港家居維修工作機會",
      description:
        "師傅可在快修24查看開放家居維修需求、按分類篩選工作機會，並向客戶提交清晰報價。",
    },
    "/faq": {
      title: "快修24常見問題 | 家居維修報價與師傅驗證",
      description:
        "了解快修24家居維修平台的報價、訂單狀態、師傅驗證、訊息中心及營運覆核安排。",
    },
    "/auth": {
      title: "登入或註冊快修24 | 客戶及師傅入口",
      description: "使用同一快修24帳戶系統，按身份進入客戶或師傅工作台。",
    },
    "/auth/login": {
      title: "登入快修24 | 香港家居服務平台",
      description: "登入快修24客戶或師傅帳戶，管理家居維修請求、報價及訂單。",
    },
    "/auth/signup": {
      title: "註冊快修24 | 建立客戶或師傅帳戶",
      description:
        "註冊快修24，客戶可提交家居維修需求，師傅可查看開放需求並提交報價。",
    },
  },
} satisfies Record<
  PublicLocale,
  Record<(typeof publicRoutes)[number], { title: string; description: string }>
>;

export function getBaseUrl() {
  return new URL(env.APP_URL).origin;
}

function normalizePublicLocale(locale: string): PublicLocale {
  return publicLocales.includes(locale as PublicLocale)
    ? (locale as PublicLocale)
    : defaultLocale;
}

export function getLocalizedPath(_locale: PublicLocale, path: string) {
  return path;
}

export function getAbsoluteUrl(locale: PublicLocale, path: string) {
  return `${getBaseUrl()}${getLocalizedPath(locale, path)}`;
}

export function getLanguageAlternates(path: (typeof publicRoutes)[number]) {
  return {
    ...Object.fromEntries(
      publicLocales.map((locale) => [locale, getAbsoluteUrl(locale, path)]),
    ),
    "x-default": getAbsoluteUrl(defaultLocale, path),
  };
}

export function createPageMetadata(
  locale: string,
  path: (typeof publicRoutes)[number],
): Metadata {
  const publicLocale = normalizePublicLocale(locale);
  const seo = pageSeo[publicLocale][path];
  const logoUrl = `${getBaseUrl()}${logoPath}`;

  return {
    title: seo.title,
    description: seo.description,
    keywords: [
      "香港家居維修",
      "香港搵師傅",
      "水喉維修",
      "冷氣清洗",
      "電力工程",
      "比較師傅報價",
    ],
    alternates: {
      canonical: getAbsoluteUrl(publicLocale, path),
      languages: getLanguageAlternates(path),
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: getAbsoluteUrl(publicLocale, path),
      siteName,
      locale: publicLocale,
      type: "website",
      images: [
        {
          url: logoUrl,
          width: 1254,
          height: 1254,
          alt: `${siteName} logo`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [{ url: logoUrl, alt: `${siteName} logo` }],
    },
  };
}

export function buildSiteStructuredData(locale: string) {
  const baseUrl = getBaseUrl();
  const publicLocale = normalizePublicLocale(locale);
  const description = pageSeo[publicLocale]["/"].description;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: siteName,
        url: baseUrl,
        logo: `${baseUrl}${logoPath}`,
        description,
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Hong Kong",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${baseUrl}/#website`,
        name: siteName,
        url: baseUrl,
        inLanguage: publicLocale,
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
      },
      {
        "@type": "Service",
        "@id": `${baseUrl}/#home-services-marketplace`,
        name: "香港家居維修報價平台",
        provider: {
          "@id": `${baseUrl}/#organization`,
        },
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Hong Kong",
        },
        serviceType: [
          "家居維修報價比較",
          "水喉維修",
          "電力工程",
          "冷氣清洗及維修",
          "裝修雜項",
        ],
      },
    ],
  };
}

export function buildFaqStructuredData(
  locale: string,
  items: { q: string; a: string }[],
) {
  const publicLocale = normalizePublicLocale(locale);

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: publicLocale,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}
