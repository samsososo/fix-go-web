import { Link } from "@/i18n/navigation";
import { LogoutButton } from "@/components/shared/logout-button";
import { cn } from "@/lib/utils";

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
  navItems: { href: string; label: string; active?: boolean }[];
  children: React.ReactNode;
}) {
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
                  ? "bg-primary text-primary-foreground"
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
