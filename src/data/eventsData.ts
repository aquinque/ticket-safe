import galaBanner from "@/assets/events/gala-banner.jpg";

export interface EventData {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  time: string;
  endTime?: string;
  location: string;
  organizer: string;
  description: string;
  category: string;
  filterCategory: string;
  /** Real poster/banner image. `null`/`undefined` = no real affiche — the
   *  card renders a generated brand-gradient fallback instead of a stock
   *  photo (see EventCard.tsx). */
  image?: string | null;
  isPastEvent: boolean;
  /** Cheapest available price, in cents. Shown as "from €X" on the card. */
  fromPriceCents?: number;
  /** Campus/school label for the card's top badge. Falls back to `organizer`. */
  campus?: string;
  /** 0-100. Below 15, the card shows a "Dernières places" urgency badge. */
  percentRemaining?: number;
  /** When true, the card shows a "Sold out" badge instead of any urgency
   *  badge and swaps the price for "Sold out". */
  soldOut?: boolean;
}

export const eventsList: EventData[] = [
  {
    id: "turin-gala-2026",
    title: "Turin Campus Gala 2026",
    date: "2026-03-27",
    time: "20:00",
    endTime: "23:55",
    location: "Location TBA",
    organizer: "Turin Campus",
    description: "We are glad to invite you to the 2026 Turin Gran Gala. The Gala is the perfect time to celebrate the ESCP's successes over the past year and is the biggest event on the Turin Campus' social calendar!",
    category: "Galas",
    filterCategory: "galas",
    image: galaBanner,
    isPastEvent: false
  }
];
