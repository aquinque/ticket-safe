import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value to the new one (ease-out cubic).
 * Starts from 0 on mount, so a freshly loaded figure counts up once; later
 * changes (a live sale) tick from the old value to the new one. Respects
 * prefers-reduced-motion by jumping straight to the target.
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
