import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pill buttons (thin outline + arrow, like the reference landing). Sizes keep a
 * ≥44px tap target: truckers use this one-handed, often in a moving cab.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/88",
        brand:
          "bg-brand text-brand-foreground shadow-[0_10px_30px_-12px] shadow-brand-strong/70 hover:bg-brand/90",
        outline:
          "border border-foreground/70 bg-transparent hover:bg-foreground hover:text-background",
        ghost: "hover:bg-accent",
        soft: "bg-secondary text-secondary-foreground hover:bg-accent",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-14 px-7 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
