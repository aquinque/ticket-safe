import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  /** Target value in EUR (or any currency — caller controls the prefix). */
  value: number;
  /** Tween duration in ms. Default 300 — feels snappy without being janky. */
  durationMs?: number;
  /** Decimal places. Default 2 for currency. */
  decimals?: number;
  /** Prefix rendered before the number (e.g. "€"). */
  prefix?: string;
  /** Optional class — tabular-nums is added automatically. */
  className?: string;
}

/**
 * Renders a number that smoothly tweens to its target when the prop changes.
 *
 * Use case: total updates on the buy / sell flow as the user changes
 * quantity. Instead of jump-cutting from EUR 42 to EUR 84 we roll the value
 * over ~300ms — feels like Stripe Checkout / Apple Pay.
 *
 * Honours prefers-reduced-motion: when set, the number snaps to the new
 * value instead of animating, so we don't trigger vestibular discomfort.
 */
export function AnimatedNumber({
  value,
  durationMs = 300,
  decimals = 2,
  prefix = "",
  className = "",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number>(value);
  const previousRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect reduced-motion: snap, no tween.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      previousRef.current = value;
      setDisplay(value);
      return;
    }

    const from = previousRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — quick at the start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        previousRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {display.toFixed(decimals)}
    </span>
  );
}
