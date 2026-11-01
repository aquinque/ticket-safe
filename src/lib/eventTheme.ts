/**
 * The organizer's design, turned into CSS variables for the public event page.
 *
 * What exists in the database today is `events.primary_color` (one hex). Background and text colours are not
 * stored yet, so they default to the night theme; the moment those columns exist they can be passed in here and
 * nothing else on the page has to change. Everything is emitted twice: as `--event-*` (plain hex, for inline
 * styles) and as the theme tokens Tailwind already reads (`--primary`, `--background`… as HSL triplets), so the
 * page's existing `bg-primary` / `text-foreground` / `border-border` classes follow the organizer's colours.
 *
 * Contrast: the organizer's dominant colours are kept. Only what sits *on top of* them is adjusted — the label
 * colour on a primary button, the body text on the background — when the pair would fall under WCAG AA (4.5:1
 * for text, 3:1 for a filled control against the page).
 */

export interface EventDesign {
  /** events.primary_color — the one colour the organizer picks today. */
  primary: string | null | undefined;
  /** Not stored yet; falls back to the night theme. */
  background?: string | null;
  /** Not stored yet; falls back to the night theme. */
  text?: string | null;
}

/** The night theme (src/index.css `.theme-night`), as hex, for the defaults. */
export const NIGHT = {
  background: "#1A2744",
  text: "#EEF2F8",
  primary: "#3A5FE6",
} as const;

const DARK_INK = "#0B1024";
const WHITE = "#FFFFFF";

export const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

type RGB = [number, number, number];

const toRgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const toHex = ([r, g, b]: RGB): string =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** "h s% l%" — the shape Tailwind's `hsl(var(--token))` expects. */
export function hexToHslTriplet(hex: string): string {
  const [h, s, l] = rgbToHsl(toRgb(hex));
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function rgbToHsl([r255, g255, b255]: RGB): [number, number, number] {
  const r = r255 / 255, g = g255 / 255, b = b255 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100, lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  let rgb: RGB;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return toHex(rgb.map((v) => (v + m) * 255) as RGB);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export const readableOn = (bg: string): string => (contrast(WHITE, bg) >= contrast(DARK_INK, bg) ? WHITE : DARK_INK);

/** Mixes `hex` toward white (positive) or black (negative) by `amount` in 0..1. */
export function shade(hex: string, amount: number): string {
  const target: RGB = amount >= 0 ? [255, 255, 255] : [0, 0, 0];
  const t = Math.abs(amount);
  return toHex(toRgb(hex).map((v, i) => v + (target[i] - v) * t) as RGB);
}

/**
 * Nudges `color`'s lightness, keeping its hue and saturation, until it reaches `min` contrast against `bg`.
 * Used for text-sized accents only; filled buttons keep the organizer's exact colour.
 */
export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return color;
  const [h, s, l] = rgbToHsl(toRgb(color));
  const lighten = luminance(bg) < 0.5;
  let lig = l;
  for (let i = 0; i < 20; i++) {
    lig = lighten ? Math.min(100, lig + 5) : Math.max(0, lig - 5);
    const next = hslToHex(h, s, lig);
    if (contrast(next, bg) >= min) return next;
  }
  return readableOn(bg);
}

export interface EventThemeVars extends Record<string, string> {
  "--event-primary": string;
  "--event-primary-hover": string;
  "--event-primary-fg": string;
  "--event-bg": string;
  "--event-text": string;
}

/** CSS variables for the event page root. Pass the result as `style`. */
export function eventThemeVars(design: EventDesign): EventThemeVars {
  const primary = isHex(design.primary) ? design.primary.toUpperCase() : NIGHT.primary;
  const bg = isHex(design.background) ? design.background.toUpperCase() : NIGHT.background;
  const dark = luminance(bg) < 0.5;

  // Body text: the organizer's choice, unless it does not read on their background.
  const wantedText = isHex(design.text) ? design.text.toUpperCase() : NIGHT.text;
  const text = contrast(wantedText, bg) >= 4.5 ? wantedText : readableOn(bg);

  // Surfaces one step off the background, in the background's own direction (lighter on dark, darker on light).
  const card = shade(bg, dark ? 0.08 : -0.04);
  const accentSurface = shade(bg, dark ? 0.12 : -0.07);
  const border = shade(bg, dark ? 0.16 : -0.14);
  const muted = shade(text, dark ? -0.3 : 0.35);

  // The button label must read on the button; the accent used as text must read on the page.
  const primaryFg = readableOn(primary);
  const primaryHover = shade(primary, dark ? 0.12 : -0.12);
  const primaryText = ensureContrast(primary, bg, 3);

  return {
    "--event-primary": primary,
    "--event-primary-hover": primaryHover,
    "--event-primary-fg": primaryFg,
    "--event-primary-text": primaryText,
    "--event-bg": bg,
    "--event-text": text,
    "--event-muted": muted,
    "--event-card": card,
    "--event-border": border,

    // Theme tokens the page's Tailwind classes already read.
    "--primary": hexToHslTriplet(primary),
    "--primary-hover": hexToHslTriplet(primaryHover),
    "--primary-foreground": hexToHslTriplet(primaryFg),
    "--ring": hexToHslTriplet(primary),
    "--background": hexToHslTriplet(bg),
    "--foreground": hexToHslTriplet(text),
    "--card": hexToHslTriplet(card),
    "--card-foreground": hexToHslTriplet(text),
    "--popover": hexToHslTriplet(card),
    "--popover-foreground": hexToHslTriplet(text),
    "--secondary": hexToHslTriplet(card),
    "--secondary-foreground": hexToHslTriplet(text),
    "--accent": hexToHslTriplet(accentSurface),
    "--accent-foreground": hexToHslTriplet(text),
    "--muted": hexToHslTriplet(card),
    "--muted-foreground": hexToHslTriplet(muted),
    "--border": hexToHslTriplet(border),
    "--input": hexToHslTriplet(card),
  };
}
