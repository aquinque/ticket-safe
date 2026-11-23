import { useEffect, useRef, useState } from "react";

export interface SectionTab {
  key: string;
  label: string;
  /**
   * Ids of the elements this tab leads to. The event page mounts some blocks twice (a wide-screen copy and a
   * phone copy, one of them hidden), so a tab lists both and the one on screen is used.
   */
  targets: string[];
}

/** The first of these elements that is actually laid out (not inside a hidden tree). */
const shownTarget = (ids: string[]): HTMLElement | null => {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
};

/**
 * The row of section links on the event page (Tickets · Resale · About · …). It sticks under the header and
 * underlines the section being read. A click scrolls to the section; nothing here knows about tickets or money.
 */
export const EventSectionTabs = ({ tabs, reduceMotion }: { tabs: SectionTab[]; reduceMotion: boolean }) => {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const barRef = useRef<HTMLElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const list = tabsRef.current;
      // A section is "being read" once its top has passed just under the bar.
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 140) + 32;
      let current = list[0]?.key ?? "";
      for (const tab of list) {
        const el = shownTarget(tab.targets);
        if (el && el.getBoundingClientRect().top <= line) current = tab.key;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (tabs.length < 2) return null;

  return (
    <nav
      ref={barRef}
      aria-label="Event sections"
      className="ev-tabs sticky top-16 md:top-20 z-20 -mx-4 mt-6 flex gap-1 overflow-x-auto border-b border-border bg-background px-1 lg:mx-0 lg:mt-7 lg:px-0"
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={on ? "true" : undefined}
            onClick={() => shownTarget(tab.targets)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })}
            className={`relative shrink-0 whitespace-nowrap px-3 pb-3.5 pt-4 text-sm font-semibold transition-colors ${
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span
              aria-hidden
              className={`absolute inset-x-3 -bottom-px h-0.5 origin-left bg-cta transition-transform duration-300 ${on ? "scale-x-100" : "scale-x-0"}`}
            />
          </button>
        );
      })}
    </nav>
  );
};

export default EventSectionTabs;
