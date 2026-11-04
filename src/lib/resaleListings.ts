/**
 * Resale listings as the public site sees them.
 *
 * Every public read of a listing goes through the `resale_listings` Postgres function (SECURITY DEFINER),
 * never a direct read of `tickets`: anon and signed-in users can no longer select the sensitive columns
 * (qr_hash, file_url, buyer_id, studio_ticket_id, seller_id for anon, notes for anon, ...). The function only
 * returns verified listings of open, published events, cheapest first.
 *
 * This module is pure: it parses the function's rows (keeping only the contract fields, so a stray column can
 * never reach the UI), groups and sorts them, and words the card copy. The hooks live in
 * src/hooks/useResaleListings.ts.
 */

import { calcBreakdown, RESALE_BUYER_FEE_PHRASE } from "@/lib/fees";
import type { RpcCaller } from "@/lib/supabaseRpc";

/** One row of `resale_listings(...)`, in the function's column order. */
export interface ResaleListingRow {
  listing_id: string;
  event_id: string;
  tier_name: string | null;
  price_cents: number;
  quantity: number;
  listed_at: string;
  is_boosted: boolean;
  photo_url: string | null;
  video_url: string | null;
  is_own: boolean;
  is_reserved: boolean;
  event_title: string;
  event_slug: string | null;
  event_date: string | null;
  event_ends_at: string | null;
  event_location: string | null;
  event_category: string | null;
  event_university: string | null;
  event_campus: string | null;
  event_banner_url: string | null;
  event_video_url: string | null;
  event_base_price: number | null;
}

export interface ResaleEventSummary {
  id: string;
  title: string;
  slug: string | null;
  date: string | null;
  endsAt: string | null;
  location: string | null;
  category: string | null;
  university: string | null;
  campus: string | null;
  bannerUrl: string | null;
  videoUrl: string | null;
  basePrice: number | null;
}

export interface ResaleListing {
  id: string;
  eventId: string;
  tierName: string | null;
  /** Per ticket, before the buyer fee. */
  priceCents: number;
  quantity: number;
  listedAt: string;
  isBoosted: boolean;
  photoUrl: string | null;
  videoUrl: string | null;
  isOwn: boolean;
  isReserved: boolean;
  event: ResaleEventSummary;
}

export interface ResaleEventGroup {
  event: ResaleEventSummary;
  listings: ResaleListing[];
  minPriceCents: number;
  ticketCount: number;
  hasBoosted: boolean;
}

// ── Query keys (shared by every reader, so the event page, the Resale page and the legacy context share a cache) ──

export const RESALE_LISTINGS_QUERY_KEY = ["resale-listings"] as const;
export const resaleListingsQueryKey = (eventId?: string | null) => ["resale-listings", eventId ?? "all"] as const;
export const resaleListingQueryKey = (id: string) => ["resale-listings", "listing", id] as const;

// ── Parsing ──────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean => v === true;

/** One row, or null when it lacks what a card needs (id, event, a price, a quantity, a listing date). */
export function parseResaleListingRow(row: unknown): ResaleListing | null {
  if (!isRecord(row)) return null;
  const id = str(row.listing_id);
  const eventId = str(row.event_id);
  const priceCents = num(row.price_cents);
  const quantity = num(row.quantity);
  const listedAt = str(row.listed_at);
  if (!id || !eventId || priceCents === null || quantity === null || !listedAt) return null;
  if (!Number.isInteger(priceCents) || priceCents < 0 || !Number.isInteger(quantity) || quantity < 1) return null;
  return {
    id,
    eventId,
    tierName: str(row.tier_name),
    priceCents,
    quantity,
    listedAt,
    isBoosted: bool(row.is_boosted),
    photoUrl: str(row.photo_url),
    videoUrl: str(row.video_url),
    isOwn: bool(row.is_own),
    isReserved: bool(row.is_reserved),
    event: {
      id: eventId,
      title: str(row.event_title) ?? "Event",
      slug: str(row.event_slug),
      date: str(row.event_date),
      endsAt: str(row.event_ends_at),
      location: str(row.event_location),
      category: str(row.event_category),
      university: str(row.event_university),
      campus: str(row.event_campus),
      bannerUrl: str(row.event_banner_url),
      videoUrl: str(row.event_video_url),
      basePrice: num(row.event_base_price),
    },
  };
}

/** The function's result (an array of rows), whitelisted field by field; malformed rows are dropped. */
export function parseResaleListingRows(data: unknown): ResaleListing[] {
  if (!Array.isArray(data)) return [];
  const out: ResaleListing[] = [];
  for (const row of data) {
    const listing = parseResaleListingRow(row);
    if (listing) out.push(listing);
  }
  return out;
}

// ── Sorting and grouping ─────────────────────────────────────────────────────

/** Cheapest first, then the oldest listing, then by id (the same order as the SQL function). */
export function sortByPriceAsc(listings: readonly ResaleListing[]): ResaleListing[] {
  return [...listings].sort(
    (a, b) => a.priceCents - b.priceCents || a.listedAt.localeCompare(b.listedAt) || a.id.localeCompare(b.id),
  );
}

/** One group per event, the cheapest group first; inside a group, the cheapest listing first. */
export function groupResaleListingsByEvent(listings: readonly ResaleListing[]): ResaleEventGroup[] {
  const map = new Map<string, ResaleEventGroup>();
  for (const l of sortByPriceAsc(listings)) {
    let g = map.get(l.eventId);
    if (!g) {
      g = { event: l.event, listings: [], minPriceCents: l.priceCents, ticketCount: 0, hasBoosted: false };
      map.set(l.eventId, g);
    }
    g.listings.push(l);
    g.ticketCount += l.quantity;
    g.minPriceCents = Math.min(g.minPriceCents, l.priceCents);
    if (l.isBoosted) g.hasBoosted = true;
  }
  return Array.from(map.values()).sort((a, b) => a.minPriceCents - b.minPriceCents);
}

// ── Fetching ─────────────────────────────────────────────────────────────────

/** Every listing on sale, or those of one event. Throws on an RPC error so the query shows its error state. */
export async function fetchResaleListings(rpc: RpcCaller, eventId?: string | null): Promise<ResaleListing[]> {
  const { data, error } = await rpc("resale_listings", { p_event_id: eventId ?? null });
  if (error) throw new Error(error.message);
  return parseResaleListingRows(data);
}

/** One listing for the checkout (also returned while reserved, with isReserved), or null when it's gone. */
export async function fetchResaleListing(rpc: RpcCaller, listingId: string): Promise<ResaleListing | null> {
  const { data, error } = await rpc("resale_listings", { p_listing_id: listingId });
  if (error) throw new Error(error.message);
  return parseResaleListingRows(data)[0] ?? null;
}

// ── Card copy ────────────────────────────────────────────────────────────────

export const formatEuroCents = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

/**
 * What the buyer pays, fee included: per ticket, and for the whole listing (a listing is bought whole).
 * Same rounding as the checkout (calcBreakdown, and round(subtotal * 5 / 100) on the server), so the total
 * on the card is exactly the amount charged.
 */
export function resaleCardPricing(l: Pick<ResaleListing, "priceCents" | "quantity">): { eachCents: number; totalCents: number } {
  const unit = l.priceCents / 100;
  return {
    eachCents: calcBreakdown(unit, 1).buyerTotalCents,
    totalCents: calcBreakdown(unit, l.quantity).buyerTotalCents,
  };
}

const startOfLocalDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Listed today", "Listed yesterday" or "Listed N days ago", by calendar day in the viewer's time zone. */
export function listedAgo(listedAt: string, now: Date = new Date()): string {
  const listed = new Date(listedAt);
  if (Number.isNaN(listed.getTime())) return "Listed recently";
  const days = Math.max(0, Math.round((startOfLocalDay(now) - startOfLocalDay(listed)) / 86_400_000));
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed yesterday";
  return `Listed ${days} days ago`;
}

/** The small line under the tier name: when it was listed (single ticket), or what the lot costs in all. */
export function resaleCardMeta(l: Pick<ResaleListing, "priceCents" | "quantity" | "listedAt">, now: Date = new Date()): string {
  if (l.quantity > 1) {
    return `${l.quantity} tickets, sold together · ${formatEuroCents(resaleCardPricing(l).totalCents)}`;
  }
  return `${listedAgo(l.listedAt, now)} · incl. ${RESALE_BUYER_FEE_PHRASE} fee`;
}
