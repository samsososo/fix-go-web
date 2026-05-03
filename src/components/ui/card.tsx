import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-line/70 bg-card/90 shadow-[0_12px_34px_rgba(24,36,51,0.06)] backdrop-blur transition duration-200 hover:shadow-[0_18px_46px_rgba(24,36,51,0.09)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("relative z-10 p-6", className)}>{children}</div>;
}
