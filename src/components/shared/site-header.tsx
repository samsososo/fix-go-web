import { BriefcaseBusiness, CalendarDays, Menu } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { roleHomePath } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MobileMenuDetails } from "@/components/shared/mobile-menu-details";
import { buttonVariants } from "@/components/ui/button";
import { listRelevantLeads } from "@/lib/mock/repositories";
import { User } from "@/types/domain";

async function getProOpenLeadCount(user: User | null) {
  if (user?.role !== "pro") {
    return null;
  }

  try {
    const leads = await listRelevantLeads(user.id);
    return leads.filter((lead) => !lead.existingQuote).length;
  } catch {
    return null;
  }
}

export async function SiteHeader({
  locale,
  user,
}: {
  locale: string;
  user: User | null;
}) {
  const t = await getTranslations("common");
  const proOpenLeadCount = await getProOpenLeadCount(user);
  const proLeadLabel =
    locale === "en"
      ? `Job leads${proOpenLeadCount && proOpenLeadCount > 0 ? ` · ${proOpenLeadCount}` : ""}`
      : `工作機會${proOpenLeadCount && proOpenLeadCount > 0 ? ` · ${proOpenLeadCount}` : ""}`;

  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/categories", label: t("nav.categories") },
    { href: "/become-a-pro", label: t("nav.becomePro") },
    { href: "/faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-[#f5efe4]/78 backdrop-blur-xl">
      <div className="content-wrap flex min-h-20 items-center justify-between gap-4 py-4">
        <Link
          href="/"
          locale={locale}
          className="flex min-w-0 items-center gap-3"
        >
          <BrandLogo
            className="h-10 max-w-[9rem] shrink sm:h-12 sm:max-w-[11rem]"
            priority
          />
          <span className="hidden text-[11px] uppercase tracking-[0.2em] text-muted sm:block">
            {locale === "en" ? "Hong Kong Home Services" : "香港家居服務"}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-foreground/72 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              locale={locale}
              className="transition hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 lg:flex">
            <LocaleSwitcher />
            {user?.role === "pro" ? (
              <>
                <Link
                  href="/pro/leads"
                  locale={locale}
                  className={buttonVariants({ size: "sm" })}
                >
                  <BriefcaseBusiness className="h-4 w-4" />
                  {proLeadLabel}
                </Link>
                <Link
                  href="/pro/calendar"
                  locale={locale}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  <CalendarDays className="h-4 w-4" />
                  {locale === "en" ? "Schedule" : "日程"}
                </Link>
              </>
            ) : user ? (
              <Link
                href={roleHomePath(user.role)}
                locale={locale}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {user.role === "customer" ? t("nav.customer") : t("nav.admin")}
              </Link>
            ) : (
              <>
                <Link
                  href="/auth"
                  locale={locale}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  {t("nav.login")}
                </Link>
                <Link
                  href="/auth/signup"
                  locale={locale}
                  className={buttonVariants({ size: "sm" })}
                >
                  {locale === "en" ? "Free quote" : "免費安排報價"}
                </Link>
              </>
            )}
          </div>

          <MobileMenuDetails className="group relative lg:hidden [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-center rounded-full border border-white bg-card/90 p-3 text-foreground shadow-[0_10px_20px_rgba(24,36,51,0.05)] transition hover:border-primary/25 hover:text-primary">
              <span className="sr-only">
                {locale === "en" ? "Open menu" : "開啟選單"}
              </span>
              <Menu className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(86vw,20rem)] rounded-[28px] border border-white/70 bg-[#fffdf8]/96 p-4 shadow-[0_24px_60px_rgba(18,37,58,0.18)] backdrop-blur-xl">
              <div className="space-y-2">
                <div className="pb-2">
                  <LocaleSwitcher />
                </div>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    locale={locale}
                    className="block rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition hover:bg-white hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-2 border-t border-line pt-3">
                  {user?.role === "pro" ? (
                    <div className="space-y-2">
                      <Link
                        href="/pro/leads"
                        locale={locale}
                        className={`${buttonVariants({ size: "sm" })} w-full`}
                      >
                        <BriefcaseBusiness className="h-4 w-4" />
                        {proLeadLabel}
                      </Link>
                      <Link
                        href="/pro/calendar"
                        locale={locale}
                        className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}
                      >
                        <CalendarDays className="h-4 w-4" />
                        {locale === "en" ? "Schedule" : "日程"}
                      </Link>
                    </div>
                  ) : user ? (
                    <Link
                      href={roleHomePath(user.role)}
                      locale={locale}
                      className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}
                    >
                      {user.role === "customer"
                        ? t("nav.customer")
                        : t("nav.admin")}
                    </Link>
                  ) : (
                    <div className="space-y-2">
                      <Link
                        href="/auth"
                        locale={locale}
                        className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-full`}
                      >
                        {t("nav.login")}
                      </Link>
                      <Link
                        href="/auth/signup"
                        locale={locale}
                        className={`${buttonVariants({ size: "sm" })} w-full`}
                      >
                        {locale === "en" ? "Free quote" : "免費安排報價"}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </MobileMenuDetails>
        </div>
      </div>
    </header>
  );
}
