/**
 * Everything the home page says and shows, in one place: edit a text, a call to action or a picture path here
 * without touching a component. The page itself is src/pages/Home.tsx and the slider src/components/home/HomeSlider.tsx;
 * the files to drop in are listed in public/media/home/README.md.
 *
 * The page is in English, like the rest of the site. The French copy is shown to visitors who pick French in the
 * language switcher (or arrive with ?lang=fr); Spanish visitors get English until there is Spanish copy.
 *
 * House rules for these texts: the word "safe" is only part of the name TicketSafe, so no sentence promises that
 * tickets are sold or resold "safely"; and no sentence talks about scams, fraud or fake tickets.
 */
import { frenchTypography, type HomeImage, type HomeLanguage } from "@/lib/homePage";

// ── The three main functions ──────────────────────────────────────────────

/** In slide order. Each one has a text below, a picture behind and a tab with its own progress bar. */
export const SLIDE_IDS = ["buy", "sell", "scan"] as const;

export type SlideId = (typeof SLIDE_IDS)[number];

// ── Where the calls to action go ──────────────────────────────────────────

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

// ── Pictures ──────────────────────────────────────────────────────────────

/** The colours shown while a picture loads, and for good when its file is missing. */
export type FallbackTone = "cobalt" | "ink" | "club";

export interface HomeSlideMedia {
  image: HomeImage;
  tone: FallbackTone;
  /** CSS object-position: which part of the picture stays in view when the screen crops it (a wide screen shows a band). */
  position: string;
}

const picture = (name: string): HomeImage => ({ src: `/media/home/${name}.jpg`, width: 1080, height: 1920 });

/**
 * To add a WebP or AVIF version of a picture, drop it next to the JPEG with the same name and add the format:
 * `image: { ...picture("buy"), formats: ["avif", "webp", "jpg"] }`.
 */
export const HOME_SLIDE_MEDIA: Record<SlideId, HomeSlideMedia> = {
  buy: { image: picture("buy"), tone: "cobalt", position: "50% 70%" },
  sell: { image: picture("sell"), tone: "ink", position: "50% 62%" },
  scan: { image: picture("scan"), tone: "club", position: "50% 66%" },
};

// ── Copy ──────────────────────────────────────────────────────────────────

export interface HomeSlideCopy {
  /** The word on the tab, under its progress bar. */
  tab: string;
  title: string;
  body: string;
  cta: Cta;
}

export interface HomeCopy {
  /** The one h1 of the page. */
  title: string;
  /** Names the slideshow, and its row of tabs, for screen readers. */
  sliderLabel: string;
  pause: string;
  play: string;
  /** Read out for each slide: {n} and {total} are replaced. */
  slideOf: string;
  slides: Record<SlideId, HomeSlideCopy>;
}

const eventsCta = (label: string): Cta => ({ label, target: "events" });
const studioCta = (label: string): Cta => ({ label, target: "studio" });

const fr: HomeCopy = {
  title: "Plateforme de billetterie",
  sliderLabel: "Ce que fait TicketSafe",
  pause: "Mettre le diaporama en pause",
  play: "Relancer le diaporama",
  slideOf: "Diapositive {n} sur {total}",
  slides: {
    buy: {
      tab: "Acheter",
      title: "Achète en 30 secondes",
      body: "Ton billet est dans ton téléphone. Tu ne peux plus venir ? Revends rapidement.",
      cta: eventsCta("Voir les événements"),
    },
    sell: {
      tab: "Vendre",
      title: "Vends en 5 minutes",
      body: "Crée ton événement sur Ticket Studio, fixe tes prix, partage ton lien.",
      cta: studioCta("Ouvrir Ticket Studio"),
    },
    scan: {
      tab: "Scanner",
      title: "Scanne à l'entrée",
      body: "Contrôle chaque QR code à la porte, avec les stats en direct.",
      cta: studioCta("Ouvrir Ticket Studio"),
    },
  },
};

const en: HomeCopy = {
  title: "Ticketing platform",
  sliderLabel: "What TicketSafe does",
  pause: "Pause the slideshow",
  play: "Play the slideshow",
  slideOf: "Slide {n} of {total}",
  slides: {
    buy: {
      tab: "Buy",
      title: "Buy in 30 seconds",
      body: "Your ticket lives in your phone. Can't make it? Resell quickly.",
      cta: eventsCta("See events"),
    },
    sell: {
      tab: "Sell",
      title: "Sell in 5 minutes",
      body: "Create your event on Ticket Studio, set your prices, share your link.",
      cta: studioCta("Open Ticket Studio"),
    },
    scan: {
      tab: "Scan",
      title: "Scan at the entrance",
      body: "Check every QR code at the door, with live stats.",
      cta: studioCta("Open Ticket Studio"),
    },
  },
};

export const HOME_CONTENT: Record<HomeLanguage, HomeCopy> = { fr: frenchTypography(fr), en };
