import { useCountUp } from "@/hooks/useCountUp";
import { eur } from "@/lib/studioFormat";

/**
 * One figure with a small label: the Studio's unit of "a number that
 * matters". Counts up on load and ticks when it changes, so a live update
 * is seen, not just rendered.
 */
export const StatFigure = ({
  label,
  value,
  money = false,
  decimals = 0,
  hint,
  tone = "default",
  size = "md",
}: {
  label: string;
  value: number;
  money?: boolean;
  decimals?: number;
  hint?: string;
  tone?: "default" | "good" | "muted";
  size?: "md" | "lg";
}) => {
  const shown = useCountUp(value);
  const text = money ? eur(shown, decimals) : shown.toLocaleString("en-GB");
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div
        className={`font-display font-bold tabular-nums leading-tight mt-0.5 ${size === "lg" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} ${
          tone === "good" ? "text-emerald-700" : tone === "muted" ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {text}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
};
