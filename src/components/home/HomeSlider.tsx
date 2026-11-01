import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { HomeCta } from "@/components/home/HomeCta";
import { HOME_SLIDE_MEDIA, SLIDE_IDS, type Cta, type HomeCopy } from "@/content/home";
import { useAfterFirstPaint } from "@/hooks/useAfterFirstPaint";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  FIRST_SCREEN_MEDIA_DELAY_MS,
  nextSlide,
  pictureSources,
  previousSlide,
  slideForKey,
  slidePlace,
  swipeDirection,
} from "@/lib/homePage";
import { cn } from "@/lib/utils";

interface HomeSliderProps {
  copy: HomeCopy;
  hrefFor: (cta: Cta) => string;
}

// React 18 warns about the camel-case spelling of this attribute; the lowercase one is plain HTML.
const highPriority = { fetchpriority: "high" } as Record<string, string>;

const COUNT = SLIDE_IDS.length;
const addOnce = (list: number[], index: number) => (list.includes(index) ? list : [...list, index]);

/** A mouse click focuses a button without the ring; only keyboard focus (or an old browser that cannot tell) counts. */
const focusIsVisible = (el: Element) => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * The whole first screen of the home page: the three main functions of the site as three slides, each with a
 * picture behind and a few words in front, that slide in from the right by themselves. Under them, a tab per slide
 * with a bar that fills while the slide is shown: when the bar is full the next slide comes. That keeps the
 * progress and the timing the same thing, so pausing (the button, keyboard focus in it, and a mouse over it, which is
 * plain CSS :hover in index.css) stops both.
 *
 * Touch: swipe sideways. Keyboard: arrows, Home and End on the tabs. Reduced motion: nothing moves by itself, the
 * slides change without sliding. A missing picture file leaves its colour gradient, never a broken image.
 */
export function HomeSlider({ copy, hrefFor }: HomeSliderProps) {
  const [active, setActive] = useState(0);
  const [pausedByVisitor, setPausedByVisitor] = useState(false);
  const [keyboardInside, setKeyboardInside] = useState(false);
  const reducedMotion = useReducedMotion();
  const painted = useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS);
  const paused = pausedByVisitor || keyboardInside;

  // Pictures: the first one is requested shortly after the first paint, the next one once the current has arrived.
  const [wanted, setWanted] = useState<number[]>([]);
  const [loaded, setLoaded] = useState<number[]>([]);
  const [missing, setMissing] = useState<number[]>([]);

  useEffect(() => {
    if (!painted) return;
    setWanted((list) => {
      let next = addOnce(list, active);
      if (loaded.includes(active) || missing.includes(active)) next = addOnce(next, nextSlide(active, COUNT));
      return next;
    });
  }, [painted, active, loaded, missing]);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const advance = () => setActive((i) => nextSlide(i, COUNT));

  // Swipe. Only touch and pen: with a mouse there are the tabs. `touch-action: pan-y` (index.css) leaves the
  // up-and-down scroll of the page to the browser.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse") return;
    touchStart.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y);
    if (!direction) return;
    swiped.current = true;
    setActive((i) => (direction === "next" ? nextSlide(i, COUNT) : previousSlide(i, COUNT)));
  };
  // The tap that ends a swipe on a button or link must not also follow it.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = slideForKey(e.key, active, COUNT);
    if (target === null) return;
    e.preventDefault();
    setActive(target);
    tabRefs.current[target]?.focus();
  };

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (focusIsVisible(e.target)) setKeyboardInside(true);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardInside(false);
  };

  return (
    <section
      id="hero"
      aria-roledescription="carousel"
      aria-labelledby="hero-title"
      data-paused={paused}
      className="home-hero home-grain relative isolate text-white"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (touchStart.current = null)}
      onClickCapture={onClickCapture}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* The pictures. Decorative: the words say everything. */}
      <div className="absolute inset-0" aria-hidden="true">
        {SLIDE_IDS.map((id, i) => {
          const media = HOME_SLIDE_MEDIA[id];
          const showPicture = painted && wanted.includes(i) && !missing.includes(i);
          return (
            <div key={id} className="home-pic" data-place={slidePlace(i, active, COUNT)}>
              <div className={`home-fallback home-fallback-${media.tone}`} />
              {showPicture && (
                <picture>
                  {pictureSources(media.image).map((source) => (
                    <source key={source.type} srcSet={source.srcSet} type={source.type} />
                  ))}
                  <img
                    className={cn("home-media-fill home-pic-img", loaded.includes(i) && "is-loaded")}
                    src={media.image.src}
                    width={media.image.width}
                    height={media.image.height}
                    alt=""
                    decoding="async"
                    loading="eager"
                    {...(i === 0 ? highPriority : {})}
                    style={{ objectPosition: media.position }}
                    onLoad={() => setLoaded((list) => addOnce(list, i))}
                    onError={() => setMissing((list) => addOnce(list, i))}
                  />
                </picture>
              )}
            </div>
          );
        })}
      </div>
      <div className="home-shade" data-media={loaded.includes(active) ? "on" : "off"} aria-hidden="true" />

      <div className="home-hero-inner relative z-10 container mx-auto flex flex-col justify-end px-4 pb-8 pt-28 md:pb-12">
        <h1
          id="hero-title"
          className="home-text-shadow text-balance text-6xl font-bold leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl xl:text-[7rem]"
        >
          {copy.title}
        </h1>

        {/* The three functions stack in one grid cell, so the block is as tall as the tallest and never jumps. */}
        <div className="mt-6 grid max-w-2xl md:mt-8" aria-live={paused ? "polite" : "off"}>
          {SLIDE_IDS.map((id, i) => {
            const slide = copy.slides[id];
            return (
              <div
                key={id}
                id={`slide-panel-${id}`}
                role="tabpanel"
                aria-roledescription="slide"
                aria-labelledby={`slide-tab-${id}`}
                data-place={slidePlace(i, active, COUNT)}
                className="home-panel"
              >
                <h2 className="home-text-shadow text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{slide.title}</h2>
                <p className="home-text-shadow mt-3 max-w-xl text-pretty text-base text-white/90 sm:text-lg lg:text-xl">{slide.body}</p>
                <div className="mt-6">
                  <HomeCta cta={slide.cta} href={hrefFor(slide.cta)} tone={slide.cta.target === "events" ? "buy" : "brand"} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex items-center gap-3 sm:gap-5 md:mt-10">
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPausedByVisitor((p) => !p)}
              aria-label={pausedByVisitor ? copy.play : copy.pause}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/40 bg-black/30 text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {pausedByVisitor ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          <div
            role="tablist"
            aria-label={copy.sliderLabel}
            onKeyDown={onTabKeyDown}
            className="grid flex-1 grid-cols-3 gap-2 sm:max-w-xl sm:gap-4"
          >
            {SLIDE_IDS.map((id, i) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`slide-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls={`slide-panel-${id}`}
                aria-label={`${copy.slides[id].tab} — ${copy.slideOf.replace("{n}", String(i + 1)).replace("{total}", String(COUNT))}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className="home-tab pb-2 pt-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="home-progress" aria-hidden="true">
                  <span className="home-progress-fill" onAnimationEnd={i === active ? advance : undefined} />
                </span>
                <span className="home-tab-label mt-2 block text-[11px] font-semibold uppercase tracking-[0.22em] sm:text-xs" aria-hidden="true">
                  <span className="mr-2 opacity-60">0{i + 1}</span>
                  {copy.slides[id].tab}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
