import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AppProviders } from "@/components/providers/app-providers";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { getCurrentUser } from "@/lib/auth";
import { routing } from "@/i18n/routing";
import {
  buildSiteStructuredData,
  createPageMetadata,
  PublicLocale,
} from "@/lib/seo";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    return {};
  }

  return createPageMetadata(locale as PublicLocale, "/");
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const user = await getCurrentUser();
  const publicLocale = locale as PublicLocale;

  return (
    <NextIntlClientProvider>
      <AppProviders>
        <div className="page-shell flex min-h-screen flex-col">
          <SiteHeader locale={locale} user={user} />
          <JsonLd data={buildSiteStructuredData(publicLocale)} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale} />
        </div>
      </AppProviders>
    </NextIntlClientProvider>
  );
}
