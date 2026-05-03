import type { Metadata } from "next";

import { env } from "@/lib/env";

export type PublicLocale = "zh-HK" | "en";

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

const siteName = "Hotfix";
const ogImagePath = "/images/customer-request-ai.png";

const pageSeo = {
  "zh-HK": {
    "/": {
      title: "Hotfix | 香港家居維修報價平台",
      description:
        "Hotfix 幫香港住戶提交家居維修需求、比較師傅報價，涵蓋水喉、電力、冷氣、清潔等服務，讓客戶、師傅及營運在同一平台完成流程。",
    },
    "/how-it-works": {
      title: "Hotfix 如何運作 | 由家居維修需求到確認報價",
      description:
        "了解 Hotfix 如何讓住戶提交維修需求、師傅接收合適工作機會、客戶比較報價並追蹤訂單狀態。",
    },
    "/categories": {
      title: "香港家居服務分類 | 水喉、電力、冷氣、清潔",
      description:
        "瀏覽 Hotfix 支援的香港家居服務分類，包括水喉維修、電力工程、冷氣清洗維修及家居清潔。",
    },
    "/become-a-pro": {
      title: "成為 Hotfix 師傅 | 接收香港家居維修工作機會",
      description:
        "師傅可在 Hotfix 建立工種檔案、設定服務地區、查看合適工作機會，並向客戶提交清晰報價。",
    },
    "/faq": {
      title: "Hotfix 常見問題 | 家居維修報價與師傅驗證",
      description:
        "了解 Hotfix 家居維修平台的報價、訂單狀態、師傅驗證、訊息中心及營運覆核安排。",
    },
    "/auth": {
      title: "登入或註冊 Hotfix | 客戶、師傅及營運入口",
      description:
        "使用同一 Hotfix 帳戶系統，按身份進入客戶、師傅或營運工作台。",
    },
    "/auth/login": {
      title: "登入 Hotfix | 香港家居服務平台",
      description: "登入 Hotfix 客戶或師傅帳戶，管理家居維修請求、報價及訂單。",
    },
    "/auth/signup": {
      title: "註冊 Hotfix | 建立客戶或師傅帳戶",
      description:
        "註冊 Hotfix，客戶可提交家居維修需求，師傅可設定工種及服務地區接收工作機會。",
    },
  },
  en: {
    "/": {
      title: "Hotfix | Hong Kong Home Repair Quote Platform",
      description:
        "Hotfix helps Hong Kong households submit home repair requests, compare professional quotes, and manage bookings for plumbing, electrical, air conditioning, and cleaning services.",
    },
    "/how-it-works": {
      title: "How Hotfix Works | From Home Repair Request to Booking",
      description:
        "See how Hotfix connects customer repair requests, matched professional leads, structured quotes, and booking status tracking in one platform.",
    },
    "/categories": {
      title: "Hong Kong Home Service Categories | Plumbing, Electrical, Aircon",
      description:
        "Browse Hotfix service categories for Hong Kong households, including plumbing repair, electrical work, aircon cleaning and repair, and home cleaning.",
    },
    "/become-a-pro": {
      title: "Become a Hotfix Pro | Receive Hong Kong Home Service Leads",
      description:
        "Create a professional profile, set trade categories and service areas, review matched leads, and send clear quotes to customers.",
    },
    "/faq": {
      title: "Hotfix FAQ | Home Repair Quotes, Verification, and Bookings",
      description:
        "Learn about Hotfix quotes, booking status, professional verification, message centre placeholders, and operations review.",
    },
    "/auth": {
      title: "Login or Sign Up for Hotfix | Customer, Pro, and Ops Access",
      description:
        "Use one Hotfix account system to access customer, professional, or operations workspaces.",
    },
    "/auth/login": {
      title: "Log In to Hotfix | Hong Kong Home Services Platform",
      description:
        "Log in to manage home repair requests, professional quotes, and bookings on Hotfix.",
    },
    "/auth/signup": {
      title: "Sign Up for Hotfix | Customer and Professional Accounts",
      description:
        "Create a Hotfix account to submit home repair requests as a customer or receive matched leads as a professional.",
    },
  },
} satisfies Record<
  PublicLocale,
  Record<(typeof publicRoutes)[number], { title: string; description: string }>
>;

export function getBaseUrl() {
  return env.APP_URL.replace(/\/$/, "");
}

export function getLocalizedPath(locale: PublicLocale, path: string) {
  return `/${locale}${path === "/" ? "" : path}`;
}

export function getAbsoluteUrl(locale: PublicLocale, path: string) {
  return `${getBaseUrl()}${getLocalizedPath(locale, path)}`;
}

export function createPageMetadata(
  locale: PublicLocale,
  path: (typeof publicRoutes)[number],
): Metadata {
  const seo = pageSeo[locale][path];
  const images = [`${getBaseUrl()}${ogImagePath}`];

  return {
    title: seo.title,
    description: seo.description,
    keywords:
      locale === "en"
        ? [
            "Hong Kong home services",
            "home repair Hong Kong",
            "plumbing repair",
            "aircon cleaning",
            "compare repair quotes",
            "service marketplace",
          ]
        : [
            "香港家居維修",
            "香港搵師傅",
            "水喉維修",
            "冷氣清洗",
            "電力工程",
            "比較師傅報價",
          ],
    alternates: {
      canonical: getAbsoluteUrl(locale, path),
      languages: {
        "zh-HK": getAbsoluteUrl("zh-HK", path),
        en: getAbsoluteUrl("en", path),
        "x-default": getAbsoluteUrl("zh-HK", path),
      },
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: getAbsoluteUrl(locale, path),
      siteName,
      locale,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images,
    },
  };
}

export function buildSiteStructuredData(locale: PublicLocale) {
  const baseUrl = getBaseUrl();
  const description = pageSeo[locale]["/"].description;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: siteName,
        url: baseUrl,
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
        inLanguage: locale,
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
      },
      {
        "@type": "Service",
        "@id": `${baseUrl}/#home-services-marketplace`,
        name:
          locale === "en"
            ? "Hong Kong home repair quote marketplace"
            : "香港家居維修報價平台",
        provider: {
          "@id": `${baseUrl}/#organization`,
        },
        areaServed: {
          "@type": "AdministrativeArea",
          name: "Hong Kong",
        },
        serviceType:
          locale === "en"
            ? [
                "Home repair quote comparison",
                "Plumbing repair",
                "Electrical work",
                "Air conditioning cleaning and repair",
                "Home cleaning",
              ]
            : [
                "家居維修報價比較",
                "水喉維修",
                "電力工程",
                "冷氣清洗及維修",
                "家居清潔",
              ],
      },
    ],
  };
}

export function buildFaqStructuredData(
  locale: PublicLocale,
  items: { q: string; a: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
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
