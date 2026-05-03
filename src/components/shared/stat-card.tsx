import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <p className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          {value}
        </p>
        <p className="text-sm leading-6 text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}
