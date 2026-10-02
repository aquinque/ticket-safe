import { supabase } from "@/integrations/supabase/client";
import { detectCampus } from "@/lib/campus";
import type { EventData } from "@/data/eventsData";

export type Campus = "paris" | "madrid" | "turin" | "berlin" | "london";
export type Category = "gala" | "party" | "conference" | "sports";

export interface PublishedEvent {
  id: string;
  slug: string;
  title: string;
  organizer: string;
  date: string;
  time: string;
  venue: string;
  campus: Campus;
  category: Category;
  priceFrom: number;
  tiersCount: number;
  capacity: number;
  sold: number;
  bannerUrl: string | null;
  logoUrl: string | null;
}

/**
 * Hydrate a flat list of published events with their tier aggregates
 * (price floor, total capacity, total sold, tier count). Campus is read
 * from events.campus first; if the row is missing one, we derive it on
 * the fly from the organizer's identity so older rows still classify.
 *
 * This is THE source of truth for "which events currently have tickets
 * for sale" — it reads event_tiers (Studio's real inventory), not the
 * legacy resale `tickets` table or the old ESCP ICS calendar sync. Any
 * page listing live events (browse, homepage carousel) should pull from
 * here so they never drift out of sync with each other again.
 */
export async function fetchPublishedEvents(): Promise<PublishedEvent[]> {
  const { data: evRows, error } = await supabase
    .from("events")
    .select(
      `id, title, slug, date, location, campus, category, primary_color, banner_url, logo_url, status,
       organizer:organizer_profiles!events_organizer_id_fkey(id, name, slug, primary_color, contact_email, about, logo_url)`,
    )
    .eq("status", "published")
    .not("organizer_id", "is", null)
    .order("date", { ascending: true });

  if (error) {
    console.error("[publishedEvents] fetch events:", error);
    return [];
  }

  const rows = (evRows ?? []) as Array<{
    id: string;
    title: string;
    slug: string | null;
    date: string;
    location: string | null;
    campus: string | null;
    category: string | null;
    primary_color: string | null;
    banner_url: string | null;
    logo_url: string | null;
    organizer: { id: string; name: string; slug: string; primary_color: string; contact_email: string; about: string | null; logo_url: string | null } | { id: string; name: string; slug: string; primary_color: string; contact_email: string; about: string | null; logo_url: string | null }[] | null;
  }>;

  const ids = rows.map((e) => e.id);
  let tierAgg: Record<string, { sold: number; total: number; minPriceCents: number; count: number }> = {};
  if (ids.length) {
    const { data: tiers } = await supabase
      .from("event_tiers")
      .select("event_id, sold_qty, total_qty, price_cents")
      .in("event_id", ids)
      .eq("is_active", true);
    tierAgg = (tiers ?? []).reduce(
      (acc, t: { event_id: string; sold_qty: number; total_qty: number; price_cents: number }) => {
        const cur = acc[t.event_id] ?? { sold: 0, total: 0, minPriceCents: Infinity, count: 0 };
        cur.sold += t.sold_qty;
        cur.total += t.total_qty;
        cur.minPriceCents = Math.min(cur.minPriceCents, t.price_cents);
        cur.count += 1;
        acc[t.event_id] = cur;
        return acc;
      },
      {} as Record<string, { sold: number; total: number; minPriceCents: number; count: number }>,
    );
  }

  return rows
    .filter((e) => e.slug)
    .map((e) => {
      const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer;
      const derivedCampus =
        (e.campus as Campus | null) ??
        detectCampus({
          slug: org?.slug,
          name: org?.name,
          contact_email: org?.contact_email,
          about: org?.about,
          location: e.location,
        }) ??
        "paris";
      const cat = (e.category ?? "other") as string;
      const allowedCats = ["gala", "party", "conference", "sports"] as const;
      const normCategory = (allowedCats as readonly string[]).includes(cat) ? (cat as Category) : ("party" as Category);
      const agg = tierAgg[e.id];
      return {
        id: e.id,
        slug: e.slug!,
        title: e.title,
        organizer: org?.name ?? "Organizer",
        date: e.date,
        time: new Date(e.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        venue: e.location ?? "",
        campus: derivedCampus as Campus,
        category: normCategory,
        priceFrom: agg && agg.minPriceCents !== Infinity ? Math.ceil(agg.minPriceCents / 100) : 0,
        tiersCount: agg?.count ?? 0,
        capacity: agg?.total ?? 0,
        sold: agg?.sold ?? 0,
        bannerUrl: e.banner_url,
        logoUrl: e.logo_url ?? org?.logo_url ?? null,
      } satisfies PublishedEvent;
    })
    // Hide past events. 12h grace so an event happening tonight stays visible
    // through the night and only drops off the next day.
    .filter((e) => new Date(e.date).getTime() >= Date.now() - 12 * 60 * 60 * 1000);
}

/** Adapts `PublishedEvent` (tier aggregates, campus, capacity — none of
 *  which the shared card needs to know about) to the shared poster
 *  `EventData` the rest of the redesign uses. Pure presentation mapping,
 *  no business logic touched. */
export function toEventData(e: PublishedEvent): EventData {
  const hasCapacity = e.capacity > 0;
  const soldPct = hasCapacity ? Math.round((e.sold / e.capacity) * 100) : 0;
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    location: e.venue,
    organizer: e.organizer,
    description: "",
    category: e.category,
    filterCategory: e.category,
    image: e.bannerUrl,
    isPastEvent: false,
    fromPriceCents: e.priceFrom > 0 ? e.priceFrom * 100 : undefined,
    campus: e.campus.charAt(0).toUpperCase() + e.campus.slice(1),
    percentRemaining: hasCapacity ? 100 - soldPct : undefined,
    soldOut: hasCapacity && soldPct >= 100,
  };
}
