/**
 * The decisions behind the home page that do not need React, kept here so they can be tested: how the slides are
 * laid out and moved, how a picture is described to the browser, and which language the copy is in.
 */

// ── The slider ────────────────────────────────────────────────────────────

/**
 * How long a slide stays before the next one slides in. The progress bar under the active tab runs for exactly
 * this long (--slide-ms in index.css, which a test keeps equal to this) and moving on is triggered by its end, so
 * pausing the bar pauses the slideshow.
 */
export const SLIDE_INTERVAL_MS = 6500;

export const nextSlide = (index: number, count: number): number => (index + 1) % count;
export const previousSlide = (index: number, count: number): number => (index - 1 + count) % count;

export type SlidePlace = "current" | "next" | "previous";

/**
 * Where a slide waits: the one in view; the one parked on the right, which slides in next; and the others on the
 * left, where the one that just left goes. Going forward always moves the slides the same way, from right to left.
 */
export function slidePlace(index: number, active: number, count: number): SlidePlace {
  const offset = (index - active + count) % count;
  if (offset === 0) return "current";
  return offset === 1 ? "next" : "previous";
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

/** The slide a key goes to inside the row of tabs (arrows, Home, End), or null for any other key. */
export function slideForKey(key: string, active: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return nextSlide(active, count);
    case "ArrowLeft":
      return previousSlide(active, count);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

// ── How a picture is described ────────────────────────────────────────────

export type ImageFormat = "avif" | "webp" | "jpg";

export interface HomeImage {
  /** The JPEG, always present. A same-name .webp / .avif next to it is used only when listed in `formats`. */
  src: string;
  /** Intrinsic size. The picture is cropped to fill whatever the screen is, so any proportion works. */
  width: number;
  height: number;
  formats?: ImageFormat[];
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

// ── French typography ─────────────────────────────────────────────────────

/**
 * French puts a no-break space before ? ! : ; % € and inside « »: without it a line can start with a lone "?".
 * Applied to the French copy, so the text in src/content/home.ts can be written (and edited) with plain spaces.
 */
export function frenchTypography<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/ ([?!:;%€»])/g, " $1").replace(/(«) /g, "$1 ") as T;
  }
  if (Array.isArray(value)) return value.map(frenchTypography) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, frenchTypography(v)])) as T;
  }
  return value;
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

// ── Which language the copy is in ─────────────────────────────────────────

export type HomeLanguage = "fr" | "en";

/**
 * The home page follows the site language, which is English unless the visitor picked another one (the switcher,
 * or ?lang= in the address). French has its own copy; Spanish has none yet, so a Spanish visitor gets English.
 */
export function resolveHomeLanguage(siteLanguage: string | null | undefined): HomeLanguage {
  return siteLanguage === "fr" ? "fr" : "en";
}
