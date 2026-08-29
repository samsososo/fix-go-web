import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  locale,
  actionHref,
  actionLabel,
  compact = false,
}: {
  title: string;
  description: string;
  locale?: string;
  actionHref?: string;
  actionLabel?: string;
  compact?: boolean;
}) {
  return (
    <Card className="border-dashed border-line bg-white/62">
      <CardContent
        className={cn(
          "space-y-3 py-10 text-center",
          compact && "p-5 py-7 sm:p-6 sm:py-8",
        )}
      >
        <span className="text-sm font-semibold text-primary">
          {locale === "en" ? "Empty for now" : "暫時未有資料"}
        </span>
        <h3 className="font-display text-xl font-bold sm:text-2xl">{title}</h3>
        <p className="mx-auto max-w-xl text-sm leading-7 text-muted">
          {description}
        </p>
        {actionHref && actionLabel ? (
          <div className="pt-2">
            <Link
              href={actionHref}
              locale={locale}
              className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-auto")}
            >
              {actionLabel}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
