import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const legacyEnglishPattern = /^\/en(?=\/|$)/;

export default function proxy(request: NextRequest) {
  if (legacyEnglishPattern.test(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace(legacyEnglishPattern, "") || "/";
    return NextResponse.redirect(url);
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
