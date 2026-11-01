import { useCountUp } from "@/hooks/useCountUp";
import { fmtMoney } from "@/lib/studioFormat";

/**
 * One figure with a small label: the Studio's unit of "a number that
 * matters". Counts up on load and ticks when it changes, so a live update
 * is seen, not just rendered.
 */
export const StatFigure = ({
  label,
  value,
  money = false,
  currency = "EUR",
  decimals = 0,
  hint,
  tone = "default",
  size = "md",
}: {
  label: string;
  value: number;
  money?: boolean;
  /** With `money`: the amount's currency ('EUR' | 'GBP'). Defaults to euros. */
  currency?: string | null;
  decimals?: number;
  hint?: string;
  tone?: "default" | "good" | "muted";
  size?: "md" | "lg";
}) => {
  const shown = useCountUp(value);
  const text = money ? fmtMoney(shown, currency, decimals) : shown.toLocaleString("en-GB");
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
