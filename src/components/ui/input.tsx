import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "min-h-14 w-full rounded-2xl border border-white bg-white/95 px-5 text-base text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
