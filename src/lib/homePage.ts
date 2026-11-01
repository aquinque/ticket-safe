/**
 * The decisions behind the home page that do not need React, kept here so they can be tested: how the hero's
 * slides follow one another, what a swipe or a key means, which media may load, and how a picture and a video are
 * described to the browser.
 */

// ── The carousel ──────────────────────────────────────────────────────────

/** How long a slide stays before the next one fades in. The progress bar under its indicator runs for as long (--slide-ms in index.css). */
export const SLIDE_INTERVAL_MS = 6000;

/** How long one slide takes to fade over the other (--fade-ms in index.css). */
export const FADE_MS = 800;

export const nextSlide = (index: number, count: number): number => (index + 1) % count;
export const previousSlide = (index: number, count: number): number => (index - 1 + count) % count;

export type SlideState = "current" | "leaving" | "idle";

/**
 * What a slide is doing: "current" is in view and on top; "leaving" is the one that was in view a moment ago and
 * stays fully opaque underneath until the new one has covered it (so there is no dip to black between two
 * half-faded pictures); the others are "idle" and invisible.
 */
export function slideState(index: number, active: number, leaving: number | null): SlideState {
  if (index === active) return "current";
  return index === leaving ? "leaving" : "idle";
}

/** The slides whose video may be loaded: the one in view and the one that comes next. */
export function slidesToPrepare(active: number, count: number): number[] {
  return count <= 1 ? [active] : [active, nextSlide(active, count)];
}

/** How far a finger must travel sideways before it counts as a swipe, in pixels. */
export const SWIPE_MIN_PX = 48;

/**
 * What a touch gesture means: a swipe left shows the next slide, a swipe right the previous one. A gesture that
 * is short, or more up and down than sideways (someone scrolling the page), means nothing.
 */
export function swipeDirection(dx: number, dy: number): "next" | "previous" | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "previous";
}

/** What an arrow key means for the carousel: -1 previous, +1 next, null for any other key (or one with a modifier). */
export function keyDirection(key: string, modified = false): -1 | 1 | null {
  if (modified) return null;
  if (key === "ArrowLeft") return -1;
  if (key === "ArrowRight") return 1;
  return null;
}

/** Keys typed into a field are the field's, not the carousel's. */
export const isTypingTarget = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable === true;
};

// ── Which media may load ──────────────────────────────────────────────────

export interface VideoPolicyInput {
  /** Phone-sized screen (under 768px, like useIsMobile). */
  isMobile: boolean;
  reducedMotion: boolean;
  /** navigator.connection.saveData */
  saveData: boolean;
  /** navigator.connection.effectiveType: "slow-2g" | "2g" | "3g" | "4g" */
  effectiveType?: string | null;
}

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

/**
 * Whether the background videos may load and play. Phones, a saved-data setting, a 2G/3G connection and
 * reduced motion all get the still picture only: the page then costs a few hundred kB instead of several MB.
 */
export function canPlayVideo(input: VideoPolicyInput): boolean {
  if (input.isMobile || input.reducedMotion || input.saveData) return false;
  return !(input.effectiveType && SLOW_CONNECTIONS.has(input.effectiveType));
}

// ── How media is described ────────────────────────────────────────────────

export type ImageFormat = "avif" | "webp" | "jpg";

export interface HomeImage {
  /** The JPEG, always present. A same-name .webp / .avif next to it is used only when listed in `formats`. */
  src: string;
  /** Intrinsic size. The picture is cropped to fill whatever the screen is, so any proportion works. */
  width: number;
  height: number;
  formats?: ImageFormat[];
}

export interface HomeVideo {
  mp4: string;
  /** Smaller than the MP4; the browser takes it first when it exists, and falls back to the MP4 when it does not. */
  webm?: string;
}

/** The <source> list of a <video>: WebM first, MP4 as the one every browser plays. */
export function videoSources(video: HomeVideo): { src: string; type: string }[] {
  return [
    ...(video.webm ? [{ src: video.webm, type: "video/webm" }] : []),
    { src: video.mp4, type: "video/mp4" },
  ];
}

const withExtension = (src: string, ext: string) => src.replace(/\.[a-z0-9]+$/i, `.${ext}`);

/** The modern-format <source> entries of a <picture>, best first. Empty when only the JPEG is listed. */
export function pictureSources(image: HomeImage): { srcSet: string; type: string }[] {
  const formats = image.formats ?? ["jpg"];
  const out: { srcSet: string; type: string }[] = [];
  if (formats.includes("avif")) out.push({ srcSet: withExtension(image.src, "avif"), type: "image/avif" });
  if (formats.includes("webp")) out.push({ srcSet: withExtension(image.src, "webp"), type: "image/webp" });
  return out;
}

// ── When the first picture starts ─────────────────────────────────────────

/**
 * How long after the first paint the first picture starts loading. The words and the colour behind them come
 * first and the picture fades in, so its weight never competes with the scripts that draw the page: on a slow
 * connection the page is readable sooner, and a 300 kB picture no longer costs the first screen anything. The
 * picture fades in from transparent, so it does not count as the page's largest paint either. The next slide's
 * picture is only requested once the current one has arrived.
 */
export const FIRST_SCREEN_MEDIA_DELAY_MS = 700;

// ── Upcoming events ───────────────────────────────────────────────────────

/** Every published event is shown as soon as there is one; only with none does the grid give way to a "coming soon" block. */
export const MIN_EVENTS_FOR_GRID = 1;
/** One row of four on a desktop, two rows of two on a phone. */
export const MAX_EVENTS_SHOWN = 4;

export const hasEnoughEvents = (count: number): boolean => count >= MIN_EVENTS_FOR_GRID;
