"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { routing } from "@/i18n/routing";
import { localizePathname } from "@/lib/routing-utils";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectRef = useRef<HTMLSelectElement>(null);

  function navigateToLocale(nextLocale: string) {
    if (
      !routing.locales.includes(nextLocale as (typeof routing.locales)[number])
    ) {
      return;
    }

    const nextPath = localizePathname(
      pathname,
      nextLocale as (typeof routing.locales)[number],
    );
    const nextSearch = searchParams.toString();
    const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;

    if (
      nextUrl ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ) {
      return;
    }

    window.location.replace(nextUrl);
  }

  useEffect(() => {
    const selectedLocale = selectRef.current?.value;
    if (selectedLocale && selectedLocale !== locale) {
      navigateToLocale(selectedLocale);
    }
  });

  return (
    <select
      aria-label="Switch locale"
      className="h-10 rounded-full border border-white bg-card/90 px-4 text-sm shadow-[0_10px_20px_rgba(24,36,51,0.05)]"
      defaultValue={locale}
      ref={selectRef}
      onChange={(event) => navigateToLocale(event.currentTarget.value)}
    >
      <option value="zh-HK">繁體中文</option>
      <option value="en">English</option>
    </select>
  );
}
