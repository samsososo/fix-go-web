import { defineRouting } from "next-intl/routing";

export const locales = ["zh-HK"] as const;
export const defaultLocale = "zh-HK";
export const publicLocales = ["zh-HK"] as const;

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
});
