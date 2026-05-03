import { routing } from "@/i18n/routing";

function isSupportedLocale(
  value: string,
): value is (typeof routing.locales)[number] {
  return routing.locales.includes(value as (typeof routing.locales)[number]);
}

export function localizePathname(
  pathname: string,
  locale: (typeof routing.locales)[number],
) {
  const segments = pathname.split("/").filter(Boolean);
  const rest = isSupportedLocale(segments[0] ?? "")
    ? segments.slice(1)
    : segments;

  return `/${[locale, ...rest].join("/")}`;
}

export function normalizeDuplicatedLocalePath(pathname: string) {
  const segments = pathname.split("/");
  const first = segments[1];
  const second = segments[2];

  if (!first || !second) {
    return null;
  }

  if (!isSupportedLocale(first) || !isSupportedLocale(second)) {
    return null;
  }

  return `/${[second, ...segments.slice(3)].join("/")}`;
}
