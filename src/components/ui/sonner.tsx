import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Branded Sonner Toaster.
 *
 * Defaults to:
 *   - position bottom-right (less intrusive than top-right on mobile)
 *   - richColors disabled — we control success/error colour ourselves so
 *     "success" stays brand-blue instead of green
 *   - icons on by default, lucide-style
 *   - 3.5s duration, swipe-to-dismiss
 *
 * Visual model per toast:
 *   • rounded-xl
 *   • bg-card, border-border, soft shadow
 *   • 3px left accent bar in brand-blue (or destructive for errors)
 *   • text in foreground / muted-foreground for hierarchy
 *
 * The accent bar is applied via Tailwind's group-[.toast]:before:* utility
 * in the classNames map below. Each variant (default / success / error /
 * warning / info) keeps the same body styling but swaps the accent colour.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      duration={3500}
      closeButton={false}
      toastOptions={{
        unstyled: false,
        classNames: {
          // Common shell: card bg, border, big shadow, and a 3px left accent
          // bar drawn with the ::before pseudo (left-0 inset-y-0). Variants
          // override the accent colour via the per-variant maps below.
          toast: [
            "group toast",
            "group-[.toaster]:bg-card group-[.toaster]:text-foreground",
            "group-[.toaster]:border group-[.toaster]:border-border",
            "group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg",
            "group-[.toaster]:px-4 group-[.toaster]:py-3.5",
            "group-[.toaster]:relative group-[.toaster]:overflow-hidden",
            "group-[.toaster]:font-medium",
            // Accent bar — 3px on the left, brand primary by default
            "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
            "before:bg-primary",
            "before:content-['']",
          ].join(" "),
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold",
          description: "group-[.toast]:text-xs group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1 group-[.toast]:text-xs group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1 group-[.toast]:text-xs",
          // Variant overrides — recolour just the accent bar + the icon.
          // "Success" stays brand-blue (NOT green) per the user's
          // colour-discipline rule.
          success: "before:!bg-primary",
          error: "before:!bg-destructive",
          warning: "before:!bg-foreground/40",
          info: "before:!bg-primary",
          // Icon colours follow the accent bar
          icon: "group-[.toast]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
