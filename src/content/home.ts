/**
 * Everything the home page says and shows, in one place: edit a text, a button or a media path here without
 * touching a component. The page is src/pages/Home.tsx, the hero src/components/home/HeroCarousel.tsx, and the
 * files to drop in are listed in public/media/home/README.md.
 *
 * The site is entirely in English, so this file is too: headlines, sublines, buttons, labels, aria-labels, empty
 * states. Nothing here is translated.
 */
import type { HomeImage, HomeVideo } from "@/lib/homePage";

// ── Where the buttons go ──────────────────────────────────────────────────

export const HOME_LINKS = {
  /** The events list (/events redirects here). */
  events: "/tickets",
  /** Ticket Studio's page for people who do not have Studio yet: the pitch, then the application. */
  studio: "/organizers",
  /** Ticket Studio itself, for a signed-in organizer whose account is approved. */
  studioOpen: "/studio",
} as const;

export type CtaTarget = "events" | "studio";

export interface Cta {
  label: string;
  target: CtaTarget;
}

// ── The hero's three slides ───────────────────────────────────────────────

/** The colours shown while a picture loads, and for good when its file is missing. */
export type FallbackTone = "cobalt" | "ink" | "club";

export interface SlideMedia {
  /** The still picture: also the poster of the video, and what phones and data-saving visitors get. */
  image: HomeImage;
  /**
   * Optional looping video. List it only once its files are in public/media/home (see the README): the page does
   * not look for it, so a file that is listed but missing would only cost a failed request.
   */
  video?: HomeVideo;
  tone: FallbackTone;
  /** CSS object-position: which part of the picture stays in view when the screen crops it. */
  position?: string;
}

export interface HeroSlide {
  id: string;
  headline: string;
  subline: string;
  /** No button on a slide that has none. */
  cta?: Cta;
  media: SlideMedia;
}

const picture = (name: string): HomeImage => ({ src: `/media/home/${name}.jpg`, width: 1920, height: 1080 });

/**
 * To add a video to a slide, drop slide-N.mp4 (and slide-N.webm) next to its picture and list it:
 *   media: { image: picture("slide-1"), video: { mp4: "/media/home/slide-1.mp4", webm: "/media/home/slide-1.webm" }, ... }
 * To add a WebP or AVIF version of a picture, drop it next to the JPEG with the same name and add the format:
 *   image: { ...picture("slide-1"), formats: ["avif", "webp", "jpg"] }
 * Slide 1's headline is the page's one h1; the others are h2.
 */
export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "platform",
    headline: "The event platform for students",
    subline: "Galas, parties, trips, conferences. One link, one ticket, zero fraud.",
    cta: { label: "Browse events", target: "events" },
    media: { image: picture("slide-1"), tone: "cobalt" },
  },
  {
    id: "resale",
    headline: "Can't make it? Resell it safely.",
    subline:
      "Resale happens on TicketSafe, at a capped price. The buyer gets a real ticket, the seller gets paid, the organizer stays in control.",
    media: { image: picture("slide-2"), tone: "ink" },
  },
  {
    id: "organizers",
    headline: "Organizing an event?",
    subline: "Create it in Ticket Studio, sell in minutes, withdraw your money whenever you want.",
    cta: { label: "Open Ticket Studio", target: "studio" },
    media: { image: picture("slide-3"), tone: "club" },
  },
];

// ── The other texts of the page ───────────────────────────────────────────

export const HOME_COPY = {
  carousel: {
    /** Names the carousel for screen readers. */
    label: "TicketSafe highlights",
    /** Names the row of indicators. */
    choose: "Choose a slide",
    previous: "Previous slide",
    next: "Next slide",
    /** {n} and {total} are replaced. */
    goTo: "Go to slide {n} of {total}",
    slideOf: "Slide {n} of {total}",
  },
  events: {
    title: "Upcoming events",
    seeAll: "See all events",
    /** Shown instead of the grid while fewer than three events are published. */
    soon: {
      title: "Coming soon near you",
      body: "New events are on their way. What if the next one was yours?",
      cta: { label: "Open Ticket Studio", target: "studio" } as Cta,
    },
  },
  /** Written above the logos of src/config/partnerLogos.ts; nothing is shown while that list is empty. */
  trusted: "Trusted by student associations across Europe",
} as const;

export const fill = (template: string, n: number, total: number): string =>
  template.replace("{n}", String(n)).replace("{total}", String(total));
