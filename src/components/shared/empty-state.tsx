import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  locale,
}: {
  title: string;
  description: string;
  locale?: string;
}) {
  return (
    <Card className="border-dashed border-line bg-white/62">
      <CardContent className="space-y-3 py-10 text-center">
        <span className="text-sm font-semibold text-primary">
          {locale === "en" ? "Empty for now" : "暫時未有資料"}
        </span>
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="mx-auto max-w-xl text-sm leading-7 text-muted">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
