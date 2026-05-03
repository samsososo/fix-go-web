import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function DashboardShell({
  title,
  subtitle,
  navItems,
  children,
}: {
  title: string;
  subtitle: string;
  navItems: { href: string; label: string; active?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <div className="content-wrap py-8">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 rounded-full border border-line bg-card p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium",
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/72",
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
