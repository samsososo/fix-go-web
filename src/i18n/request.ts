import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "@/i18n/routing";
import zhHK from "@/messages/zh-HK";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const normalizedRequested =
    requested?.toLowerCase() === "zh-hk" ? "zh-HK" : requested;
  const locale = hasLocale(routing.locales, normalizedRequested)
    ? normalizedRequested
    : routing.defaultLocale;

  return {
    locale,
    messages: zhHK,
    timeZone: "Asia/Hong_Kong",
  };
});
