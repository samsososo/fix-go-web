import { Menu } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { roleHomePath } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { User } from "@/types/domain";

export async function SiteHeader({
  locale,
  user,
}: {
  locale: string;
  user: User | null;
}) {
  const t = await getTranslations("common");

  const navItems = [
    { href: "/", label: t("nav.home") },
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/categories", label: t("nav.categories") },
    { href: "/become-a-pro", label: t("nav.becomePro") },
    { href: "/faq", label: t("nav.faq") },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-[#f5efe4]/78 backdrop-blur-xl">
      <div className="content-wrap flex min-h-20 items-center justify-between gap-4 py-4">
        <Link href="/" locale={locale} className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-surface-strong text-sm font-display font-extrabold text-white shadow-[0_12px_30px_rgba(18,37,58,0.22)]">
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,_rgba(217,147,45,0.64),transparent_42%)]" />
            <span className="relative">HF</span>
          </span>
          <span className="flex flex-col">
            <span className="font-display text-2xl font-extrabold tracking-tight text-primary">
              {t("brand")}
            </span>
            <span className="text-[11px] uppercase tracking-[0.25em] text-muted">
              {locale === "en" ? "Hong Kong Home Services" : "香港家居服務"}
            </span>
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
            {user ? (
              <Link
                href={roleHomePath(user.role)}
                locale={locale}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {user.role === "customer"
                  ? t("nav.customer")
                  : user.role === "pro"
                    ? t("nav.pro")
                    : t("nav.admin")}
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
                  {t("nav.signup")}
                </Link>
              </>
            )}
          </div>

          <details className="group relative lg:hidden [&_summary::-webkit-details-marker]:hidden">
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
                  {user ? (
                    <Link
                      href={roleHomePath(user.role)}
                      locale={locale}
                      className={`${buttonVariants({ variant: "outline", size: "sm" })} w-full`}
                    >
                      {user.role === "customer"
                        ? t("nav.customer")
                        : user.role === "pro"
                          ? t("nav.pro")
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
                        {t("nav.signup")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
