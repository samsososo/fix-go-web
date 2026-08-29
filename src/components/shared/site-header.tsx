import {
  BriefcaseBusiness,
  CalendarDays,
  CreditCard,
  Menu,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { roleHomePath } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { MobileMenuDetails } from "@/components/shared/mobile-menu-details";
import { LogoutButton } from "@/components/shared/logout-button";
import { buttonVariants } from "@/components/ui/button";
import { listRelevantLeads } from "@/lib/mock/repositories";
import { getProSubscriptionEntitlement } from "@/lib/pro-subscription-entitlement";
import { User } from "@/types/domain";
import { cn } from "@/lib/utils";

async function getProHeaderState(user: User | null) {
  if (user?.role !== "pro") {
    return null;
  }

  try {
    const snapshot = await getProSubscriptionEntitlement(user.id);
    if (!snapshot.entitlement.canCreateQuotes) {
      return { canCreateQuotes: false, openLeadCount: 0 };
    }

    const leads = await listRelevantLeads(user.id);
    return {
      canCreateQuotes: true,
      openLeadCount: leads.filter((lead) => !lead.existingQuote).length,
    };
  } catch {
    return { canCreateQuotes: false, openLeadCount: 0 };
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
  const proHeaderState = await getProHeaderState(user);
  const canCreateQuotes = proHeaderState?.canCreateQuotes ?? false;
  const proOpenLeadCount = proHeaderState?.openLeadCount ?? 0;
  const proLeadLabel =
    locale === "en"
      ? `Job leads${proOpenLeadCount && proOpenLeadCount > 0 ? ` · ${proOpenLeadCount}` : ""}`
      : `工作機會${proOpenLeadCount && proOpenLeadCount > 0 ? ` · ${proOpenLeadCount}` : ""}`;
  const proPrimaryLabel = canCreateQuotes
    ? proLeadLabel
    : locale === "en"
      ? "Manage billing"
      : "管理月費";

  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/categories", label: t("nav.categories") },
    { href: "/become-a-pro", label: t("nav.becomePro") },
    { href: "/faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/60 bg-[#f5efe4]/78 backdrop-blur-xl">
      <div
        className={cn(
          "content-wrap flex items-center justify-between gap-4",
          user?.role === "pro"
            ? "min-h-16 py-2 lg:min-h-20 lg:py-4"
            : "min-h-20 py-4",
        )}
      >
        <Link
          href={user?.role === "pro" ? "/pro" : "/"}
          locale={locale}
          className="flex min-h-11 min-w-0 items-center gap-3"
        >
          <BrandLogo
            className={cn(
              "max-w-[9rem] shrink sm:h-12 sm:max-w-[11rem]",
              user?.role === "pro" ? "h-8 lg:h-10" : "h-10",
            )}
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
                  href={canCreateQuotes ? "/pro/leads" : "/pro/billing"}
                  locale={locale}
                  className={buttonVariants({ size: "sm" })}
                >
                  {canCreateQuotes ? (
                    <BriefcaseBusiness className="h-4 w-4" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {proPrimaryLabel}
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
            <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white bg-card/90 p-2.5 text-foreground shadow-[0_10px_20px_rgba(24,36,51,0.05)] transition hover:border-primary/25 hover:text-primary">
              <span className="sr-only">
                {user?.role === "pro"
                  ? locale === "en"
                    ? "Open account menu"
                    : "開啟帳戶選單"
                  : locale === "en"
                    ? "Open menu"
                    : "開啟選單"}
              </span>
              {user?.role === "pro" ? (
                <UserRound className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[min(86vw,20rem)] rounded-[28px] border border-white/70 bg-[#fffdf8]/96 p-4 shadow-[0_24px_60px_rgba(18,37,58,0.18)] backdrop-blur-xl">
              {user?.role === "pro" ? (
                <div className="space-y-3">
                  <div>
                    <p className="px-3 text-xs font-semibold text-muted">
                      {locale === "en" ? "Pro account" : "師傅帳戶"}
                    </p>
                    <p className="mt-1 px-3 font-display text-lg font-bold">
                      {user.fullName}
                    </p>
                  </div>
                  <Link
                    href="/pro/profile"
                    locale={locale}
                    className="flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-white hover:text-primary"
                  >
                    <UserRound className="h-5 w-5" />
                    {locale === "en" ? "Pro profile" : "師傅檔案"}
                  </Link>
                  <div className="border-t border-line pt-3">
                    <LocaleSwitcher />
                  </div>
                  <LogoutButton locale={locale} className="w-full" />
                </div>
              ) : (
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
                    {user ? (
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
              )}
            </div>
          </MobileMenuDetails>
        </div>
      </div>
    </header>
  );
}
