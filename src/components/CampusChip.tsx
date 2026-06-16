import { cn } from "@/lib/utils";

/**
 * Unified campus chip — navy text on a soft navy tint, with a 2-letter
 * monogram in front. Replaces the 5 unrelated Tailwind palettes (blue-100 /
 * rose-100 / slate-100 / orange-100 / violet-100) that were making ESCP
 * Paris / Madrid / Turin / Berlin / London read as 5 different products.
 *
 * `featured` variant uses the action accent (same hue, more saturation)
 * for the user's own campus — small peer-trust cue.
 */

const MONOGRAMS: Record<string, string> = {
  paris:  "PA",
  madrid: "MA",
  turin:  "TO",
  berlin: "BE",
  london: "LO",
};

function monogramFor(campus: string): string {
  const key = campus.toLowerCase().trim();
  for (const [k, mono] of Object.entries(MONOGRAMS)) {
    if (key.includes(k)) return mono;
  }
  // Generic fallback: take the first two letters, uppercased.
  return key.slice(0, 2).toUpperCase();
}

interface CampusChipProps {
  campus: string;
  /** Show the campus's full label (e.g. "Paris") next to the monogram. Default true. */
  showLabel?: boolean;
  /** Highlight as the user's own campus. */
  featured?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function CampusChip({
  campus,
  showLabel = true,
  featured = false,
  size = "sm",
  className,
}: CampusChipProps) {
  const mono = monogramFor(campus);
  const label = showLabel
    ? campus.charAt(0).toUpperCase() + campus.slice(1).toLowerCase()
    : null;
  const isMd = size === "md";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold rounded-full",
        isMd ? "px-3 py-1 text-sm" : "px-2.5 py-1 text-xs",
        featured
          ? "bg-primary text-primary-foreground"
          : "bg-primary/8 text-primary border border-primary/10",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded font-mono font-semibold tabular-nums tracking-tight",
          isMd ? "w-5 h-5 text-[10px]" : "w-4 h-4 text-[9px]",
          featured ? "bg-white/20 text-white" : "bg-primary/15 text-primary",
        )}
      >
        {mono}
      </span>
      {label}
    </span>
  );
}
