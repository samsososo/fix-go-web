import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { normalizeDuplicatedLocalePath } from "@/lib/routing-utils";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const normalizedPath = normalizeDuplicatedLocalePath(
    request.nextUrl.pathname,
  );
  if (normalizedPath && normalizedPath !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = normalizedPath;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
