import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-base font-semibold transition duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary px-6 py-3.5 !text-white shadow-[0_14px_30px_rgba(15,99,95,0.2)] hover:-translate-y-0.5 hover:bg-primary/94",
        secondary:
          "bg-secondary px-6 py-3.5 text-secondary-foreground shadow-[0_14px_30px_rgba(217,147,45,0.2)] hover:-translate-y-0.5 hover:bg-secondary/92",
        outline:
          "border border-white/80 bg-card/92 px-6 py-3.5 text-foreground shadow-[0_10px_24px_rgba(24,36,51,0.06)] hover:-translate-y-0.5 hover:bg-white",
        ghost: "px-5 py-2.5 text-foreground hover:bg-white/72",
        danger:
          "bg-danger px-6 py-3.5 !text-white shadow-[0_12px_28px_rgba(179,75,62,0.16)] hover:bg-danger/90",
      },
      size: {
        default: "min-h-12",
        sm: "min-h-11 px-5 text-sm",
        lg: "min-h-14 px-7 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
