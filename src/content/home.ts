/**
 * Everything the home page says and shows, in one place: edit a text, a call to action or a media path here
 * without touching a component. The page itself is src/pages/Home.tsx; the files to drop in are listed in
 * public/media/home/README.md.
 *
 * The French copy is the reference. The English copy is shown to visitors who pick English (or Spanish, until
 * there is Spanish copy) in the language switcher.
 */
import { STUDIO_FEE_FIXED_EUR, STUDIO_FEE_MAX_EUR, STUDIO_FEE_PERCENT } from "@/lib/studioFee";
import { frenchTypography, type HomeImage, type HomeLanguage, type HomeVideo } from "@/lib/homePage";

// ── Sections ──────────────────────────────────────────────────────────────

/** In page order. The side dots, the scroll cue and the reveal all follow this list. */
export const SECTION_IDS = [
  "hero",
  "organisateurs",
  "associatif",
  "soirees",
  "revente",
  "reunions",
  "plateforme",
  "evenements",
  "rejoindre",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

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

// ── Media ─────────────────────────────────────────────────────────────────

/** A light-blue-on-navy gradient shown while a file loads, and for good when it is missing. */
export type FallbackTone = "cobalt" | "ink" | "gala" | "club" | "calm" | "pro" | "plain";

export interface HomeMediaSpec {
  image?: HomeImage;
  video?: HomeVideo;
  tone: FallbackTone;
  /** Blur the photo (a quiet background behind cards). */
  blur?: boolean;
}

const photo = (name: string): HomeImage => ({ src: `/media/home/${name}.jpg`, width: 1920, height: 1080 });

/**
 * To add a WebP or AVIF version of a photo, drop it next to the JPEG with the same name and add the format:
 * `image: { ...photo("revente"), formats: ["avif", "webp", "jpg"] }`.
 */
export const HOME_MEDIA: Record<SectionId, HomeMediaSpec> = {
  hero: {
    image: photo("hero"),
    video: { mp4: "/media/home/hero.mp4", webm: "/media/home/hero.webm" },
    tone: "cobalt",
  },
  organisateurs: { image: photo("organisateurs"), tone: "ink" },
  associatif: { image: photo("associatif"), tone: "gala" },
  soirees: {
    image: photo("soiree"),
    video: { mp4: "/media/home/soiree.mp4", webm: "/media/home/soiree.webm" },
    tone: "club",
  },
  revente: { image: photo("revente"), tone: "calm" },
  reunions: { image: photo("reunion"), tone: "pro" },
  plateforme: { image: photo("plateforme"), tone: "plain", blur: true },
  evenements: { tone: "ink" },
  rejoindre: { tone: "cobalt" },
};

// ── Copy ──────────────────────────────────────────────────────────────────

export interface PlatformCard {
  icon: "buyer" | "organizer" | "scan";
  title: string;
  body: string;
}

export interface HomeCopy {
  /** The label of each side dot. */
  dots: Record<SectionId, string>;
  dotsLabel: string;
  /** The word above the line at the bottom of the hero, and what a screen reader says for it. */
  scrollLabel: string;
  scrollCue: string;
  hero: { title: string; subtitle: string; primary: Cta; secondary: Cta };
  organisateurs: { kicker: string; title: string; body: string; bullets: string[]; cta: Cta };
  associatif: { kicker: string; title: string; body: string; trustedTitle: string };
  soirees: { kicker: string; title: string; body: string };
  revente: { kicker: string; title: string; body: string };
  reunions: { kicker: string; title: string; body: string };
  plateforme: { kicker: string; title: string; cards: PlatformCard[]; pricing: string };
  evenements: {
    kicker: string;
    title: string;
    seeAll: string;
    /** Shown instead of the grid while fewer than three events are published. */
    soon: { title: string; body: string; cta: Cta };
  };
  final: { title: string; primary: Cta; secondary: Cta };
}

// The fee is written from the same constants as the rest of the site (src/lib/studioFee.ts), so it cannot drift.
const frNumber = (n: number) => n.toFixed(2).replace(".", ",");
const enNumber = (n: number) => n.toFixed(2);

const eventsCta = (label: string): Cta => ({ label, target: "events" });
const studioCta = (label: string): Cta => ({ label, target: "studio" });

const fr: HomeCopy = {
  dots: {
    hero: "Accueil",
    organisateurs: "Organisateurs",
    associatif: "Associatif",
    soirees: "Soirées",
    revente: "Revente",
    reunions: "Réunions & pro",
    plateforme: "Plateforme",
    evenements: "Événements",
    rejoindre: "Se lancer",
  },
  dotsLabel: "Sections de la page",
  scrollLabel: "Défiler",
  scrollCue: "Faire défiler vers le bas",
  hero: {
    title: "La billetterie des événements étudiants",
    subtitle: "Vends tes billets, revends-les en sécurité, zéro fraude.",
    primary: eventsCta("Voir les événements"),
    secondary: studioCta("Organiser un événement"),
  },
  organisateurs: {
    kicker: "Organisateurs",
    title: "Vends tes billets en 5 minutes",
    body: "Crée ton événement sur Ticket Studio, fixe tes prix, partage ton lien. Paiement Apple Pay / carte instantané, l'argent est à toi, tu le retires quand tu veux.",
    bullets: [
      "Création d'event en quelques clics",
      "Tableau de bord des ventes en temps réel",
      "Retrait des fonds à la main ou automatique en fin d'event",
    ],
    cta: studioCta("Ouvrir Ticket Studio"),
  },
  associatif: {
    kicker: "Associatif",
    title: "Pensé pour les BDE et les assos",
    body: "Galas, soirées d'intégration, week-ends ski, afterworks : une billetterie faite pour la vie associative, pas pour les stades.",
    trustedTitle: "Ils nous font confiance",
  },
  soirees: {
    kicker: "Soirées",
    title: "Les soirées, sans les arnaques",
    body: "Billets nominatifs, QR code unique, contrôle à l'entrée. Les faux billets n'entrent pas.",
  },
  revente: {
    kicker: "Revente",
    title: "Tu ne peux plus venir ? Revends en sécurité",
    body: "La revente se fait sur TicketSafe, à prix encadré. L'acheteur reçoit un vrai billet, le vendeur est remboursé, l'organisateur garde le contrôle.",
  },
  reunions: {
    kicker: "Réunions & événements pro",
    title: "Et aussi les conférences, forums, réunions",
    body: "Événement gratuit ou payant, inscription nominative, liste des participants exportable, check-in à l'entrée.",
  },
  plateforme: {
    kicker: "Plateforme",
    title: "Une plateforme, trois espaces",
    cards: [
      { icon: "buyer", title: "Acheteur", body: "Achat en 30 secondes, billet dans le téléphone." },
      { icon: "organizer", title: "Organisateur — Ticket Studio", body: "Création, ventes, retraits." },
      { icon: "scan", title: "Contrôle à l'entrée", body: "Scan QR, stats live." },
    ],
    pricing: `Frais de service payés par l'acheteur : ${STUDIO_FEE_PERCENT} % + ${frNumber(STUDIO_FEE_FIXED_EUR)} € par billet, ${frNumber(STUDIO_FEE_MAX_EUR)} € maximum. Rien à payer pour l'organisateur.`,
  },
  evenements: {
    kicker: "Événements à venir",
    title: "Les prochains événements",
    seeAll: "Voir tous les événements",
    soon: {
      title: "Bientôt près de chez toi",
      body: "De nouveaux événements arrivent. Et si le prochain, c'était le tien ?",
      cta: studioCta("Organiser un événement"),
    },
  },
  final: {
    title: "Prêt pour ton prochain event ?",
    primary: eventsCta("Voir les événements"),
    secondary: studioCta("Organiser un événement"),
  },
};

const en: HomeCopy = {
  dots: {
    hero: "Home",
    organisateurs: "Organizers",
    associatif: "Student unions",
    soirees: "Parties",
    revente: "Resale",
    reunions: "Meetings & pro",
    plateforme: "Platform",
    evenements: "Events",
    rejoindre: "Get started",
  },
  dotsLabel: "Page sections",
  scrollLabel: "Scroll",
  scrollCue: "Scroll down",
  hero: {
    title: "The ticketing platform for student events",
    subtitle: "Sell your tickets, resell them safely, zero fraud.",
    primary: eventsCta("See events"),
    secondary: studioCta("Organize an event"),
  },
  organisateurs: {
    kicker: "Organizers",
    title: "Sell your tickets in 5 minutes",
    body: "Create your event on Ticket Studio, set your prices, share your link. Instant Apple Pay / card payment, the money is yours, withdraw it whenever you want.",
    bullets: [
      "Create an event in a few clicks",
      "Real-time sales dashboard",
      "Withdraw your funds by hand, or automatically at the end of the event",
    ],
    cta: studioCta("Open Ticket Studio"),
  },
  associatif: {
    kicker: "Student unions",
    title: "Built for student unions and societies",
    body: "Galas, integration parties, ski weekends, afterworks: ticketing made for student life, not for stadiums.",
    trustedTitle: "They trust us",
  },
  soirees: {
    kicker: "Parties",
    title: "Parties, without the scams",
    body: "Named tickets, unique QR code, entry check. Fake tickets don't get in.",
  },
  revente: {
    kicker: "Resale",
    title: "Can't make it? Resell safely",
    body: "Resale happens on TicketSafe, at a capped price. The buyer gets a real ticket, the seller gets paid, the organizer stays in control.",
  },
  reunions: {
    kicker: "Meetings & business events",
    title: "And also conferences, forums, meetings",
    body: "Free or paid event, named registration, exportable attendee list, check-in at the door.",
  },
  plateforme: {
    kicker: "Platform",
    title: "One platform, three spaces",
    cards: [
      { icon: "buyer", title: "Buyer", body: "Buy in 30 seconds, ticket in your phone." },
      { icon: "organizer", title: "Organizer — Ticket Studio", body: "Creation, sales, withdrawals." },
      { icon: "scan", title: "Entry check", body: "QR scan, live stats." },
    ],
    pricing: `Service fee paid by the buyer: ${STUDIO_FEE_PERCENT}% + €${enNumber(STUDIO_FEE_FIXED_EUR)} per ticket, €${enNumber(STUDIO_FEE_MAX_EUR)} maximum. Nothing to pay for the organizer.`,
  },
  evenements: {
    kicker: "Upcoming events",
    title: "The next events",
    seeAll: "See all events",
    soon: {
      title: "Coming soon near you",
      body: "New events are on their way. What if the next one was yours?",
      cta: studioCta("Organize an event"),
    },
  },
  final: {
    title: "Ready for your next event?",
    primary: eventsCta("See events"),
    secondary: studioCta("Organize an event"),
  },
};

export const HOME_CONTENT: Record<HomeLanguage, HomeCopy> = { fr: frenchTypography(fr), en };
