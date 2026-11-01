/**
 * Small, separate signals the hero carousel pauses on, each one a plain boolean.
 */
import { useEffect, useState, type RefObject } from "react";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/**
 * True while a mouse is over the element. Listens to `mouseover` on the window and asks where the pointer now is,
 * instead of trusting enter/leave pairs: those are lost when the element under the pointer is replaced. Touch
 * screens never count (a tap would otherwise leave the carousel "hovered" until the next tap elsewhere).
 */
export function useMouseInside(ref: RefObject<Element>): boolean {
  const [inside, setInside] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function" || !window.matchMedia(FINE_POINTER).matches) return;
    const onOver = (event: MouseEvent) => {
      const el = ref.current;
      setInside(!!el && event.target instanceof Node && el.contains(event.target));
    };
    const onLeaveWindow = (event: MouseEvent) => {
      if (event.relatedTarget === null) setInside(false);
    };
    window.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseleave", onLeaveWindow);
    return () => {
      window.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseleave", onLeaveWindow);
    };
  }, [ref]);

  return inside;
}

/** True while the browser tab is in the background. */
export function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return hidden;
}

/** Whether any part of the element is on screen right now. */
export function useOnScreen(ref: RefObject<Element>): boolean {
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return onScreen;
}
