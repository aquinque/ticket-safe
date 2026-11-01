/**
 * The scroll behaviour of the immersive home page, with no library: IntersectionObserver for what comes into
 * view, one shared scroll listener for the parallax, a class on <html> for the snapping (see index.css).
 */
import { useEffect, useState, type RefObject } from "react";

/** True from the first time the element comes within `rootMargin` of the screen, and stays true. */
export function useNearViewport(ref: RefObject<Element>, rootMargin = "100% 0px"): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return near;
}

/**
 * False until the page has painted once and `delayMs` more have passed. What the first screen does not need in
 * order to paint (the hero photo and video) waits for it, instead of its download competing with the scripts
 * that draw the page.
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

/** Whether any part of the element is on screen right now, to stop what nobody is looking at. */
export function useOnScreen(ref: RefObject<Element>): boolean {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return onScreen;
}

/** The id of the section that crosses the middle of the screen. */
export function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // A thin band across the middle of the screen: the section with most of it inside is the active one.
    const inBand = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inBand.set(e.target.id, e.isIntersecting ? e.intersectionRect.height : 0);
        let best = "";
        let bestHeight = 0;
        for (const [id, height] of inBand) {
          if (height > bestHeight) {
            best = id;
            bestHeight = height;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);

  return active;
}

/**
 * Fades the `[data-reveal]` elements of `root` in as they enter the screen, by giving them a `data-in`
 * attribute (an attribute, not a class: React rewrites `class` whenever a component re-renders with a new one).
 * Elements added later, such as the events once their data arrives, are picked up too. The hidden starting state
 * is only applied once this has run (class `home-reveal-on` on `root`) and only when the visitor accepts motion
 * (see index.css), so with no script, or with reduced motion, everything is simply visible.
 */
export function useRevealOnScroll(root: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.classList.add("home-reveal-on");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-in", "");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    const watch = (node: Element) => {
      if (node.matches("[data-reveal]") && !node.hasAttribute("data-in")) io.observe(node);
    };
    el.querySelectorAll("[data-reveal]").forEach(watch);

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          watch(node);
          node.querySelectorAll("[data-reveal]").forEach(watch);
        });
      }
    });
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      el.classList.remove("home-reveal-on");
      el.querySelectorAll("[data-in]").forEach((node) => node.removeAttribute("data-in"));
    };
  }, [root]);
}

/** Turns on the vertical scroll snapping for as long as the home page is shown. */
export function useSnapScroll(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("home-snap");
    return () => root.classList.remove("home-snap");
  }, []);
}

// ── Parallax ──────────────────────────────────────────────────────────────
// One scroll listener for every background layer. Each frame it reads where every section sits, then writes a
// single CSS variable (--p, about -1 to 1) on its layer; the transform itself lives in index.css.

interface ParallaxItem {
  section: Element;
  layer: HTMLElement;
}

const items = new Set<ParallaxItem>();
let scheduled = false;

function frame() {
  scheduled = false;
  const vh = window.innerHeight;
  const reads = Array.from(items, (item) => [item, item.section.getBoundingClientRect()] as const);
  for (const [item, rect] of reads) {
    if (rect.bottom < -vh || rect.top > 2 * vh) continue;
    const p = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - vh / 2) / vh));
    item.layer.style.setProperty("--p", p.toFixed(3));
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(frame);
}

function register(item: ParallaxItem): () => void {
  items.add(item);
  if (items.size === 1) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  }
  schedule();
  return () => {
    items.delete(item);
    item.layer.style.removeProperty("--p");
    if (items.size === 0) {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    }
  };
}

/** Moves `layer` slightly against the scroll while `section` crosses the screen. */
export function useParallax(section: RefObject<Element>, layer: RefObject<HTMLElement>, enabled: boolean): void {
  useEffect(() => {
    const s = section.current;
    const l = layer.current;
    if (!enabled || !s || !l) return;
    return register({ section: s, layer: l });
  }, [section, layer, enabled]);
}
