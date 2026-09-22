import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  encodeMarketingAttribution,
  getMarketingAttribution,
  MARKETING_ATTRIBUTION_COOKIE,
} from "@/lib/marketing-attribution";

const handleI18nRouting = createMiddleware(routing);
const legacyEnglishPattern = /^\/en(?=\/|$)/;

export default function proxy(request: NextRequest) {
  const attribution = getMarketingAttribution(request.nextUrl.searchParams);
  const applyAttribution = (response: NextResponse) => {
    if (attribution) {
      response.cookies.set(
        MARKETING_ATTRIBUTION_COOKIE,
        encodeMarketingAttribution(attribution),
        {
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 90,
          path: "/",
        },
      );
    }
    return response;
  };

  if (legacyEnglishPattern.test(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace(legacyEnglishPattern, "") || "/";
    return applyAttribution(NextResponse.redirect(url));
  }

  return applyAttribution(handleI18nRouting(request));
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
