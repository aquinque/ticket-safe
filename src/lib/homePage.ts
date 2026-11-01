/**
 * The decisions behind the immersive home page that do not need React, kept here so they can be tested:
 * which background media may load, how a video and an image are described to the browser, and which language
 * the page copy is written in.
 */
import type { CSSProperties } from "react";

/** The position of an element in the staggered fade-in of its section: 0 first, then 90ms later each (index.css). */
export const revealDelay = (index: number): CSSProperties => ({ "--i": index }) as CSSProperties;

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
 * reduced motion all get the poster only: the page then costs a few hundred kB instead of several MB.
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
  /** Intrinsic size, so the browser can reserve the space. The image is cropped to fill whatever the screen is. */
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

// ── French typography ─────────────────────────────────────────────────────

/**
 * French puts a no-break space before ? ! : ; % € and inside « »: without it a line can start with a lone "?".
 * Applied to the French copy, so the text in src/content/home.ts can be written (and edited) with plain spaces.
 */
export function frenchTypography<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/ ([?!:;%€»])/g, "\u00A0$1").replace(/(«) /g, "$1\u00A0") as T;
  }
  if (Array.isArray(value)) return value.map(frenchTypography) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, frenchTypography(v)])) as T;
  }
  return value;
}

// ── When the first screen's media starts ──────────────────────────────────

/**
 * How long after the first paint the hero photo and video start loading. The words and the colour behind them
 * come first and the photo fades in, so its weight never competes with the scripts that draw the page: on a slow
 * connection the page is readable sooner, and a 300 kB photo no longer costs the first screen anything. The photo
 * fades in from transparent, so it does not count as the page's largest paint either.
 */
export const FIRST_SCREEN_MEDIA_DELAY_MS = 700;

// ── Which language the copy is in ─────────────────────────────────────────

export type HomeLanguage = "fr" | "en";

const SUPPORTED = new Set(["fr", "en", "es"]);

/** The language a visitor picked on purpose (?lang= in the address, or the switcher's saved choice), if any. */
export function chosenLanguage(search: string, stored: string | null): string | null {
  const fromUrl = new URLSearchParams(search).get("lang");
  if (fromUrl && SUPPORTED.has(fromUrl)) return fromUrl;
  if (stored && SUPPORTED.has(stored)) return stored;
  return null;
}

/**
 * The home page is written in French. A visitor who picked English or Spanish gets the English version (there
 * is no Spanish copy yet); a visitor who picked nothing gets French, whatever the site-wide default is.
 */
export function resolveHomeLanguage(chosen: string | null): HomeLanguage {
  return chosen === "en" || chosen === "es" ? "en" : "fr";
}

// ── Upcoming events ───────────────────────────────────────────────────────

/** Below this many published events the grid gives way to a "coming soon" block, so it never looks empty. */
export const MIN_EVENTS_FOR_GRID = 3;
/** One row of four on a desktop, two rows of two on a phone. */
export const MAX_EVENTS_SHOWN = 4;

export const hasEnoughEvents = (count: number): boolean => count >= MIN_EVENTS_FOR_GRID;
