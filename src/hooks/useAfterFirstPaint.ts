import { useEffect, useState } from "react";

/**
 * False until the page has painted once and `delayMs` more have passed. What the first screen does not need in
 * order to paint (its pictures) waits for it, instead of its download competing with the scripts that draw the
 * page.
 */
export function useAfterFirstPaint(delayMs = 0): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPainted(true), delayMs);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [delayMs]);

  return painted;
}
