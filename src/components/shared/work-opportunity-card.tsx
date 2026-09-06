import type { ReactNode } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WorkOpportunityCard({
  title,
  description,
  status,
  metadata,
  amountLabel,
  amount,
  action,
  locked = false,
}: {
  title: string;
  description: string;
  status?: ReactNode;
  metadata: ReactNode;
  amountLabel?: string;
  amount?: string;
  action: string;
  locked?: boolean;
}) {
  return (
    <Card className={cn(locked && "border-warning/20")}>
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-xl font-bold sm:text-2xl">
            {title}
          </h3>
          {status}
        </div>
        <p className="line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted">
          {description}
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-foreground/68">
          {metadata}
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-line/70 pt-3">
          <div>
            {amountLabel ? (
              <p className="text-xs text-muted">{amountLabel}</p>
            ) : null}
            {amount ? (
              <p className="font-display text-lg font-bold">{amount}</p>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
            {action}
            {locked ? (
              <LockKeyhole className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
