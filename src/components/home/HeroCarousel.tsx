import { useCallback, useEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HomeCta } from "@/components/home/HomeCta";
import { HOME_COPY, HERO_SLIDES, fill, type Cta } from "@/content/home";
import { useAfterFirstPaint } from "@/hooks/useAfterFirstPaint";
import { useMouseInside, useOnScreen, usePageHidden } from "@/hooks/useCarouselSignals";
import { useVideoAllowed } from "@/hooks/useVideoAllowed";
import {
  FADE_MS,
  FIRST_SCREEN_MEDIA_DELAY_MS,
  SLIDE_INTERVAL_MS,
  isTypingTarget,
  keyDirection,
  nextSlide,
  pictureSources,
  previousSlide,
  slideState,
  slidesToPrepare,
  swipeDirection,
  videoSources,
  type HomeVideo,
} from "@/lib/homePage";
import { cn } from "@/lib/utils";

interface HeroCarouselProps {
  /** Where each kind of button goes (Ticket Studio depends on who is signed in). */
  hrefFor: (cta: Cta) => string;
}

const COUNT = HERO_SLIDES.length;

// React 18 warns about the camel-case spelling of this attribute; the lowercase one is plain HTML.
const highPriority = { fetchpriority: "high" } as Record<string, string>;

const addOnce = (list: number[], index: number) => (list.includes(index) ? list : [...list, index]);

/** A mouse click focuses a button without the ring; only keyboard focus (or an old browser that cannot tell) counts. */
const focusIsVisible = (el: Element) => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

/** The looping video behind a slide: it plays while its slide is in view (or fading out) and waits otherwise. */
function SlideVideo({
  video,
  poster,
  playing,
  ready,
  onReady,
  onFailed,
  position,
}: {
  video: HomeVideo;
  poster: string;
  playing: boolean;
  ready: boolean;
  onReady: () => void;
  onFailed: () => void;
  position?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      // React sets `muted` as a property only; autoplay needs it in place before play().
      el.muted = true;
      el.play().catch(() => {
        /* autoplay refused: the poster stays */
      });
    } else {
      el.pause();
    }
  }, [playing]);

  return (
    <video
      ref={ref}
      className={cn("home-media-fill home-video", ready && "is-ready")}
      autoPlay={playing}
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      style={{ objectPosition: position }}
      onCanPlay={onReady}
      onError={onFailed}
    >
      {/* A source that cannot load fires its own error and the browser moves on to the next one, so only the last
          one failing means there is nothing left to play. */}
      {videoSources(video).map((source, i, all) => (
        <source key={source.type} src={source.src} type={source.type} onError={i === all.length - 1 ? onFailed : undefined} />
      ))}
    </video>
  );
}

/**
 * The whole first screen of the home page: three slides, each with a full-bleed picture (or video) and one
 * sentence, that follow one another every few seconds. The new one fades in over the old one while the picture
 * zooms very slightly (Ken Burns); nothing slides sideways.
 *
 * Moving on: every SLIDE_INTERVAL_MS, with the bar under the active indicator filling over the same time; a click on
 * an indicator, the arrows (desktop), a swipe (touch) or ← → (keyboard) move at once. It pauses while a mouse is over
 * one of its controls (the indicators, the arrows, the button: not the picture, which fills the screen and would
 * keep a desktop from ever moving on), while keyboard focus is inside it, while the tab is hidden and while it is
 * scrolled out of view, and continues from where it stopped.
 *
 * It never touches the address or the browser history: no hash, no pushState. A missing picture leaves its colour
 * gradient, never a broken image.
 */
export function HeroCarousel({ hrefFor }: HeroCarouselProps) {
  const [view, setView] = useState<{ active: number; leaving: number | null }>({ active: 0, leaving: null });
  const [keyboardInside, setKeyboardInside] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const videoAllowed = useVideoAllowed();
  const painted = useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS);
  // A mouse pauses the slideshow only over the controls: the hero fills the screen, so a pointer simply resting on
  // the picture must not stop it (on a desktop it would then never move on).
  const mouseInside = useMouseInside(rootRef, ".home-bar, .home-arrow, .home-copy a");
  const pageHidden = usePageHidden();
  const onScreen = useOnScreen(rootRef);
  const paused = mouseInside || keyboardInside || pageHidden || !onScreen;
  const { active } = view;

  const goTo = useCallback((to: number) => {
    setView((v) => (to === v.active ? v : { active: to, leaving: v.active }));
  }, []);
  const step = useCallback((direction: -1 | 1) => {
    setView((v) => {
      const to = direction === 1 ? nextSlide(v.active, COUNT) : previousSlide(v.active, COUNT);
      return to === v.active ? v : { active: to, leaving: v.active };
    });
  }, []);

  // The slide that has just left stays opaque under the new one until it is covered, then goes.
  useEffect(() => {
    if (view.leaving === null) return;
    const id = window.setTimeout(() => setView((v) => (v.leaving === null ? v : { ...v, leaving: null })), FADE_MS + 60);
    return () => window.clearTimeout(id);
  }, [view.active, view.leaving]);

  // Autoplay. The time left on the current slide survives a pause, so it carries on instead of starting over.
  // (Declared in this order on purpose: on a slide change the reset runs before the timer starts.)
  const remaining = useRef(SLIDE_INTERVAL_MS);
  const startedAt = useRef(0);
  useEffect(() => {
    remaining.current = SLIDE_INTERVAL_MS;
  }, [active]);
  useEffect(() => {
    if (paused) return;
    startedAt.current = performance.now();
    const id = window.setTimeout(() => step(1), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, active, step]);

  // ← and → move the slides while the carousel is on screen (never while typing in a field).
  useEffect(() => {
    if (!onScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(document.activeElement)) return;
      const direction = keyDirection(event.key, event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
      if (direction !== null) step(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onScreen, step]);

  // Swipe: only touch and pen (with a mouse there are the arrows and the indicators). `touch-action: pan-y`
  // (index.css) leaves the up-and-down scroll of the page to the browser.
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
    step(direction === "next" ? 1 : -1);
  };
  // The tap that ends a swipe on a button or link must not also follow it.
  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (focusIsVisible(e.target)) setKeyboardInside(true);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardInside(false);
  };

  // Pictures: the first one is requested shortly after the first paint, the next one once the current one has arrived.
  const [wanted, setWanted] = useState<number[]>([]);
  const [loaded, setLoaded] = useState<number[]>([]);
  const [missing, setMissing] = useState<number[]>([]);
  const [videoReady, setVideoReady] = useState<number[]>([]);
  const [videoFailed, setVideoFailed] = useState<number[]>([]);
  useEffect(() => {
    if (!painted) return;
    setWanted((list) => {
      let next = addOnce(list, active);
      if (loaded.includes(active) || missing.includes(active)) next = addOnce(next, nextSlide(active, COUNT));
      return next;
    });
  }, [painted, active, loaded, missing]);
  const videosToPrepare = slidesToPrepare(active, COUNT);

  return (
    <section
      ref={rootRef}
      id="hero"
      lang="en"
      aria-roledescription="carousel"
      aria-label={HOME_COPY.carousel.label}
      data-paused={paused}
      className="home-hero home-grain group relative isolate text-white"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (touchStart.current = null)}
      onClickCapture={onClickCapture}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {/* The pictures and videos. Decorative: the words say everything. */}
      <div className="absolute inset-0" aria-hidden="true">
        {HERO_SLIDES.map((slide, i) => {
          const { media } = slide;
          const state = slideState(i, active, view.leaving);
          const showPicture = painted && wanted.includes(i) && !missing.includes(i);
          const showVideo =
            !!media.video && videoAllowed && painted && videosToPrepare.includes(i) && !videoFailed.includes(i);
          return (
            <div key={slide.id} className="home-slide" data-state={state}>
              <div className={`home-fallback home-fallback-${media.tone}`} />
              <div className="home-zoom">
                {showPicture && (
                  <picture>
                    {pictureSources(media.image).map((source) => (
                      <source key={source.type} srcSet={source.srcSet} type={source.type} />
                    ))}
                    <img
                      className={cn("home-media-fill home-photo", loaded.includes(i) && "is-loaded")}
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
                {showVideo && media.video && (
                  <SlideVideo
                    video={media.video}
                    poster={media.image.src}
                    playing={state !== "idle"}
                    ready={videoReady.includes(i)}
                    onReady={() => setVideoReady((list) => addOnce(list, i))}
                    onFailed={() => setVideoFailed((list) => addOnce(list, i))}
                    position={media.position}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="home-shade" data-media={loaded.includes(active) || videoReady.includes(active) ? "on" : "off"} aria-hidden="true" />

      <div className="home-hero-inner relative z-10 container mx-auto flex flex-col justify-end px-4 pb-7 pt-28 md:pb-12">
        {/* The three slides' words share one grid cell, so the block is as tall as the tallest and never jumps. */}
        <div className="grid" aria-live={paused ? "polite" : "off"}>
          {HERO_SLIDES.map((slide, i) => {
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <div
                key={slide.id}
                role="group"
                aria-roledescription="slide"
                aria-label={fill(HOME_COPY.carousel.slideOf, i + 1, COUNT)}
                data-state={slideState(i, active, view.leaving)}
                className="home-copy flex flex-col items-center justify-end text-center md:items-start md:text-left"
              >
                <Heading
                  id={i === 0 ? "hero-title" : undefined}
                  className="home-text-shadow max-w-4xl text-balance text-[clamp(2.5rem,7vw,5rem)] font-bold leading-[1.04] tracking-tight"
                >
                  {slide.headline}
                </Heading>
                <p className="home-text-shadow mt-4 max-w-2xl text-pretty text-[15px] leading-snug text-white/90 sm:text-base md:text-xl">
                  {slide.subline}
                </p>
                {slide.cta && (
                  <div className="mt-7">
                    <HomeCta cta={slide.cta} href={hrefFor(slide.cta)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* One bar per slide; the active one fills over the time the slide stays. */}
        <div className="mt-6 flex items-center justify-center gap-2 md:mt-8 md:justify-start" role="group" aria-label={HOME_COPY.carousel.choose}>
          {HERO_SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={fill(HOME_COPY.carousel.goTo, i + 1, COUNT)}
              aria-current={i === active ? "true" : undefined}
              onClick={() => goTo(i)}
              className="home-bar focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span className="home-bar-track" aria-hidden="true">
                <span className="home-bar-fill" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Arrows: desktop only, and only while the pointer is over the hero (or a key focuses them). */}
      <button
        type="button"
        aria-label={HOME_COPY.carousel.previous}
        onClick={() => step(-1)}
        className="home-arrow left-4 lg:left-8"
      >
        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={HOME_COPY.carousel.next}
        onClick={() => step(1)}
        className="home-arrow right-4 lg:right-8"
      >
        <ChevronRight className="h-6 w-6" aria-hidden="true" />
      </button>
    </section>
  );
}
