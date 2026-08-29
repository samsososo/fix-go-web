import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className={cn("space-y-2", compact && "p-3 sm:p-5")}>
        <p className="text-sm font-semibold text-muted">{label}</p>
        <p
          className={cn(
            "font-display text-3xl font-extrabold tracking-tight text-foreground",
            compact && "text-2xl sm:text-3xl",
          )}
        >
          {value}
        </p>
        <p
          className={cn(
            "text-sm leading-6 text-muted",
            compact && "hidden sm:block",
          )}
        >
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}
