import {
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  Grid2X2,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { LogoutButton } from "@/components/shared/logout-button";
import { cn } from "@/lib/utils";

type PortalNavItem = { href: string; label: string; active?: boolean };

function isProWorkspace(navItems: PortalNavItem[]) {
  return navItems.some((item) => item.href === "/pro");
}

function NavIcon({ href, className }: { href: string; className?: string }) {
  const iconClass = cn("h-4 w-4", className);

  if (href === "/pro") {
    return <Grid2X2 className={iconClass} aria-hidden="true" />;
  }

  if (href === "/pro/leads") {
    return <BriefcaseBusiness className={iconClass} aria-hidden="true" />;
  }

  if (href === "/pro/calendar") {
    return <CalendarDays className={iconClass} aria-hidden="true" />;
  }

  if (href === "/pro/jobs") {
    return <CheckSquare className={iconClass} aria-hidden="true" />;
  }

  return null;
}

export function PortalShell({
  locale,
  title,
  subtitle,
  navItems,
  children,
}: {
  locale: string;
  title: string;
  subtitle: string;
  navItems: PortalNavItem[];
  children: React.ReactNode;
}) {
  if (isProWorkspace(navItems)) {
    return (
      <div className="content-wrap py-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="surface-panel sticky top-20 z-40 flex flex-col gap-5 p-4 lg:top-24 lg:min-h-[calc(100vh-7rem)]">
            <Link
              href="/pro"
              locale={locale}
              className="flex items-center gap-3"
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-strong text-xs font-display font-extrabold text-white shadow-[0_12px_30px_rgba(18,37,58,0.18)]">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,_rgba(217,147,45,0.64),transparent_42%)]" />
                <span className="relative">HF</span>
              </span>
              <span className="min-w-0">
                <span className="block font-display text-xl font-extrabold text-primary">
                  Hotfix
                </span>
                <span className="block text-xs font-semibold text-muted">
                  {locale === "en" ? "Pro workbench" : "師傅工作台"}
                </span>
              </span>
            </Link>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  locale={locale}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition lg:w-full",
                    item.active
                      ? "bg-primary !text-white shadow-[0_12px_24px_rgba(15,99,95,0.18)]"
                      : item.href === "/pro/leads"
                        ? "border border-primary/18 bg-surface-tint/72 text-primary hover:bg-surface-tint"
                        : "text-foreground/72 hover:bg-white/74 hover:text-primary",
                  )}
                >
                  <NavIcon href={item.href} />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto hidden rounded-2xl border border-primary/16 bg-surface-tint/70 p-4 text-sm lg:block">
              <p className="font-semibold text-foreground">
                {locale === "en" ? "Work discovery first" : "先睇工作機會"}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted">
                {locale === "en"
                  ? "Open leads stay one click away from every pro page."
                  : "每一版都可以即刻返去工作機會，唔會淨係見到日程。"}
              </p>
            </div>
          </aside>

          <main className="min-w-0">
            <div className="surface-panel mb-5 p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    <NavIcon
                      href={
                        navItems.find((item) => item.active)?.href ?? "/pro"
                      }
                    />
                    {locale === "en" ? "Pro workspace" : "師傅工作台"}
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-extrabold tracking-normal sm:text-4xl">
                    {title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                    {subtitle}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <LogoutButton locale={locale} />
                </div>
              </div>
            </div>

            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrap py-8">
      <div className="surface-panel mb-8 p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
          <div>
            <p className="text-sm font-semibold text-primary">
              {locale === "en" ? "Workspace" : "工作台"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {subtitle}
            </p>
          </div>
          <div className="flex items-center justify-start xl:justify-end">
            <LogoutButton locale={locale} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-line/70 pt-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                item.active
                  ? "bg-primary !text-white"
                  : "text-foreground/72 hover:bg-surface-tint hover:text-primary",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
