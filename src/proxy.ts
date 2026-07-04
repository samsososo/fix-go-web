import { NextRequest, NextResponse } from "next/server";

import { defaultLocale } from "@/i18n/routing";

const legacyLocalePattern = /^\/(?:en|zh-HK)(?=\/|$)/;

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const legacyLocaleMatch = url.pathname.match(legacyLocalePattern);

  if (legacyLocaleMatch) {
    url.pathname = url.pathname.replace(legacyLocalePattern, "") || "/";
    return NextResponse.redirect(url);
  }

  url.pathname = `/${defaultLocale}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export default proxy;

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
