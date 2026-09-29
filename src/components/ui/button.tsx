import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft hover:shadow-card",
        // Alias of `default`, named explicitly per the design-system spec
        // ("primary (brand-500)") so new code can reach for the semantic
        // name without needing to know `default` already means that.
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft hover:shadow-card",
        // The purchase action. Light-blue CTA, reserved for this — never a
        // large background fill elsewhere. Dark text for AA contrast.
        buy: "bg-cta text-cta-foreground hover:bg-cta/90 font-bold shadow-soft hover:shadow-card",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-background hover:bg-muted hover:border-primary/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-soft hover:shadow-card",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "bg-gradient-hero text-white shadow-card hover:shadow-hover font-semibold",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90 shadow-soft hover:shadow-card",
        "outline-primary": "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground",
        marketplace: "bg-gradient-hero text-white font-semibold shadow-card hover:shadow-hover",
      },
      size: {
        // Every size guarantees a >=44px tap target on mobile (spec: "taille
        // min 44px de haut sur mobile"), then relaxes to the previous,
        // denser desktop heights from `md:` up.
        default: "h-11 md:h-10 px-4 py-2",
        sm: "h-11 md:h-9 rounded-md px-3",
        lg: "h-12 md:h-11 rounded-md px-8",
        icon: "h-11 w-11 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
