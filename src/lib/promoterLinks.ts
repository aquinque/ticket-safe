/**
 * Promoter links: the public event page with `?ref=<code>`, one link per promoter.
 *
 * The organizer creates and reads them in the Studio (PromoterLinksPanel). The database side is
 * supabase/migrations/20261021120000_event_promoter_links.sql; the Studio checkout functions store the code on
 * the order (`promoter_code` in the body). Nothing is kept in the visitor's browser: the page reads the code from
 * its address, adds one to an anonymous daily counter, and passes the code along if the visitor starts a checkout.
 */
import { supabase } from "@/integrations/supabase/client";

/** Same shape as event_promoter_links.code: lowercase letters, digits and hyphens, 3 to 40 characters. */
export const PROMOTER_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const PROMOTER_NAME_MAX = 60;
export const PROMOTER_LINKS_MAX = 50;

const SITE = "https://ticket-safe.eu";

export const isPromoterCode = (value: unknown): value is string =>
  typeof value === "string" && PROMOTER_CODE_PATTERN.test(value);

/** The promoter code in a page address (`location.search`), or null when there is none or it is malformed. */
export function readPromoterRef(search: string): string | null {
  const raw = new URLSearchParams(search).get("ref");
  const code = raw?.trim().toLowerCase() ?? "";
  return isPromoterCode(code) ? code : null;
}

/** "Léa — Insta" becomes "lea-insta": accents dropped, anything else turned into hyphens, 24 characters at most. */
export function slugifyForCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
}

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * The code for a new link: the promoter's name, then three random characters so one link cannot be guessed from
 * another ("lea-insta-k3x"). Always a valid code, whatever the name.
 */
export function makePromoterCode(name: string, random: () => number = Math.random): string {
  const base = slugifyForCode(name) || "promo";
  let suffix = "";
  for (let i = 0; i < 3; i++) suffix += SUFFIX_ALPHABET[Math.floor(random() * SUFFIX_ALPHABET.length) % SUFFIX_ALPHABET.length];
  return `${base}-${suffix}`;
}

/** The link the promoter shares. */
export const promoterLinkUrl = (eventSlug: string, code: string): string => `${SITE}/e/${eventSlug}?ref=${code}`;

// ── The organizer's numbers ───────────────────────────────────────────────

export interface PromoterDay {
  /** YYYY-MM-DD, Europe/Paris. */
  day: string;
  visits: number;
  tickets: number;
}

export interface PromoterLinkStats {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  archivedAt: string | null;
  visits: number;
  /** Orders started from the link, whatever became of them. */
  checkouts: number;
  paidOrders: number;
  tickets: number;
  /** What the organizer receives for the paid orders: ticket price after any promo code, service fee excluded. */
  revenueCents: number;
  lastSaleAt: string | null;
  /** The last 14 days, oldest first. */
  series: PromoterDay[];
}

export interface PromoterOtherStats {
  paidOrders: number;
  tickets: number;
  revenueCents: number;
}

export interface PromoterStats {
  links: PromoterLinkStats[];
  /** Paid orders that did not come through a promoter link (the main link, social posts, search...). */
  other: PromoterOtherStats;
}

const EMPTY_STATS: PromoterStats = { links: [], other: { paidOrders: 0, tickets: 0, revenueCents: 0 } };

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(n) ? n : 0;
};
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads what promoter_link_stats() returns. Anything unexpected becomes zero, so the panel never breaks on a bad row. */
export function parsePromoterStats(raw: unknown): PromoterStats {
  if (!isRecord(raw)) return EMPTY_STATS;

  const links: PromoterLinkStats[] = [];
  for (const row of Array.isArray(raw.links) ? raw.links : []) {
    if (!isRecord(row)) continue;
    const id = text(row.id);
    const code = text(row.code);
    if (!id || !code) continue;
    const series: PromoterDay[] = [];
    for (const d of Array.isArray(row.series) ? row.series : []) {
      if (!isRecord(d)) continue;
      const day = text(d.day);
      if (day) series.push({ day, visits: num(d.visits), tickets: num(d.tickets) });
    }
    links.push({
      id,
      name: text(row.name) ?? code,
      code,
      createdAt: text(row.created_at) ?? "",
      archivedAt: text(row.archived_at),
      visits: num(row.visits),
      checkouts: num(row.checkouts),
      paidOrders: num(row.paid_orders),
      tickets: num(row.tickets),
      revenueCents: num(row.revenue_cents),
      lastSaleAt: text(row.last_sale_at),
      series,
    });
  }

  const other = isRecord(raw.other) ? raw.other : {};
  return {
    links,
    other: { paidOrders: num(other.paid_orders), tickets: num(other.tickets), revenueCents: num(other.revenue_cents) },
  };
}

/**
 * Active links first, then the ones that sold the most. A link just created stays on top so the organizer sees
 * it appear where they were looking.
 */
export function orderPromoterLinks(links: PromoterLinkStats[], pinnedId: string | null = null): PromoterLinkStats[] {
  const rank = (l: PromoterLinkStats) => (l.id === pinnedId ? 0 : l.archivedAt ? 2 : 1);
  return [...links].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.tickets - a.tickets ||
      b.visits - a.visits ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

/** Paid orders per visit, 0 to 1, or null when no visit was counted (so there is nothing to divide by). */
export function conversionRate(visits: number, paidOrders: number): number | null {
  if (visits <= 0) return null;
  return Math.min(1, Math.max(0, paidOrders / visits));
}

/** "—", "3.4%", "12%". */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const pct = rate * 100;
  return pct > 0 && pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** How many of the event's paid tickets came through promoter links, for the line above the list. */
export function promoterShare(stats: PromoterStats): { viaLinks: number; total: number; percent: number } {
  const viaLinks = stats.links.reduce((sum, l) => sum + l.tickets, 0);
  const total = viaLinks + stats.other.tickets;
  return { viaLinks, total, percent: total > 0 ? Math.round((viaLinks / total) * 100) : 0 };
}

// ── Supabase calls ────────────────────────────────────────────────────────
// The generated Supabase types predate these tables and functions, so the calls go through a narrow shape.

interface DbResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}
interface LooseClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<DbResult>;
  from: (table: string) => {
    select: (columns: string) => { eq: (column: string, value: string) => PromiseLike<DbResult> };
    insert: (row: Record<string, unknown>) => PromiseLike<DbResult>;
    update: (patch: Record<string, unknown>) => { eq: (column: string, value: string) => PromiseLike<DbResult> };
  };
}
const db = supabase as unknown as LooseClient;

/** Counts one visit for the link, once per page load. Never throws: counting must not get in the visitor's way. */
export async function trackPromoterVisit(eventSlug: string, code: string): Promise<void> {
  try {
    await db.rpc("track_promoter_visit", { p_slug: eventSlug, p_code: code });
  } catch {
    /* a lost count is better than a broken page */
  }
}

export async function fetchPromoterStats(eventId: string): Promise<PromoterStats> {
  const { data, error } = await db.rpc("promoter_link_stats", { p_event_id: eventId });
  if (error) throw new Error(error.message);
  return parsePromoterStats(data);
}

const friendly = (error: { code?: string; message: string }): string => {
  // 23514 is the "at most 50 active links" guard, whose message is written for the organizer.
  if (error.code === "23514") return error.message;
  if (error.code === "42501") return "You can't add links to this event.";
  return "Could not save the link. Please try again.";
};

/** Creates a link for the promoter and returns its code. A code already taken on this event gets a fresh suffix. */
export async function createPromoterLink(eventId: string, name: string, userId: string | null): Promise<string> {
  const clean = name.trim().slice(0, PROMOTER_NAME_MAX);
  if (!clean) throw new Error("Give the link the promoter's name.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = makePromoterCode(clean);
    const { error } = await db
      .from("event_promoter_links")
      .insert({ event_id: eventId, name: clean, code, ...(userId ? { created_by: userId } : {}) });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(friendly(error));
  }
  throw new Error("Could not find a free code for this link. Please try again.");
}

/** Archiving stops a link counting; the numbers stay. Restoring puts it back, within the limit of active links. */
export async function setPromoterLinkArchived(linkId: string, archived: boolean): Promise<void> {
  const { error } = await db
    .from("event_promoter_links")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", linkId);
  if (error) throw new Error(friendly(error));
}

// ── The promoter's own page ───────────────────────────────────────────────
// /p/<report token>: read-only numbers for one link, opened by the promoter without an account.

/** The private address the organizer sends to the promoter. */
export const promoterReportUrl = (token: string): string => `${SITE}/p/${token}`;

/** Report tokens of an event's links, by link id. Only the event's organizer can read them (RLS). */
export async function fetchReportTokens(eventId: string): Promise<Record<string, string>> {
  const { data, error } = await db.from("event_promoter_links").select("id, report_token").eq("event_id", eventId);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const row of Array.isArray(data) ? data : []) {
    if (isRecord(row) && typeof row.id === "string" && typeof row.report_token === "string") out[row.id] = row.report_token;
  }
  return out;
}

export interface PromoterReport {
  name: string;
  archived: boolean;
  eventTitle: string;
  eventSlug: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  bannerUrl: string | null;
  organizerName: string | null;
  visits: number;
  checkouts: number;
  paidOrders: number;
  tickets: number;
  lastSaleAt: string | null;
  series: PromoterDay[];
}

/** Reads what promoter_report() returns; null when the address is not a known report. */
export function parsePromoterReport(raw: unknown): PromoterReport | null {
  if (!isRecord(raw)) return null;
  const series: PromoterDay[] = [];
  for (const d of Array.isArray(raw.series) ? raw.series : []) {
    if (!isRecord(d)) continue;
    const day = text(d.day);
    if (day) series.push({ day, visits: num(d.visits), tickets: num(d.tickets) });
  }
  return {
    name: text(raw.name) ?? "Promoter",
    archived: raw.archived === true,
    eventTitle: text(raw.event_title) ?? "Event",
    eventSlug: text(raw.event_slug),
    eventDate: text(raw.event_date),
    eventLocation: text(raw.event_location),
    bannerUrl: text(raw.banner_url),
    organizerName: text(raw.organizer_name),
    visits: num(raw.visits),
    checkouts: num(raw.checkouts),
    paidOrders: num(raw.paid_orders),
    tickets: num(raw.tickets),
    lastSaleAt: text(raw.last_sale_at),
    series,
  };
}

export async function fetchPromoterReport(token: string): Promise<PromoterReport | null> {
  const { data, error } = await db.rpc("promoter_report", { p_token: token });
  if (error) throw new Error(error.message);
  return parsePromoterReport(data);
}
