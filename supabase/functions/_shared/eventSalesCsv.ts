/**
 * The sales export of an event: one CSV line per ticket sold by the organizer. This is the row
 * building, pure (only ./csv.ts is imported, no Deno API) so vitest pins it from
 * src/__tests__/eventSalesCsv.test.ts; the edge function export-event-sales checks who asks, loads
 * the rows under the service role and sends what buildEventSalesCsv returns.
 *
 * One line per ticket sold = for each paid or refunded order, exactly `quantity` lines:
 *   - the order's original ticket rows (the event_tickets rows carrying the order's buyer_id), in
 *     creation order;
 *   - an original row marked 'transferred' is a seat resold on Ticket Safe: its holder, check-in and
 *     scan columns come from the row that holds the seat now (the order's other rows that are not
 *     themselves transferred, paired in creation order);
 *   - when the order has fewer rows than `quantity` (a ticket insert failed), the missing lines keep
 *     the order's money columns and leave the ticket columns empty, so a file always adds up.
 * Ticket rows that belong to no loaded order (imported tickets) are left out.
 *
 * Money: the ticket price is the order's unit price; the order's discount and service fee are
 * shared over its lines (floored, the last line taking the remainder), so the lines of an order
 * sum exactly to its total_cents. There is no currency column: a file is one event, and an event
 * has one currency. Nothing here computes VAT.
 */
import { buildCsv, csvCell, csvMoney, csvText, salesCsvFilename } from "./csv.ts";

export interface SalesEvent {
  id: string;
  title?: string | null;
  slug?: string | null;
  currency?: string | null;
}

/** An event_orders row as the export reads it; a status other than paid or refunded is skipped. */
export interface SalesOrder {
  id: string;
  buyer_id: string | null;
  buyer_email: string | null;
  /** The attendees jsonb: [{ first_name, last_name, email, gender }] or null. */
  attendees: unknown;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  fee_cents: number | null;
  discount_cents: number | null;
  currency?: string | null;
  tier_id: string | null;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  paid_at: string | null;
  created_at: string;
  refunded_at?: string | null;
}

/** An event_tickets row as the export reads it. */
export interface SalesTicket {
  id: string;
  order_id: string;
  tier_id: string | null;
  buyer_id: string | null;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  status: string;
  scanned_at: string | null;
  created_at: string;
}

export interface SalesTier {
  id: string;
  name: string | null;
}

export interface SalesProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface SalesCsvInput {
  event: SalesEvent;
  orders: SalesOrder[];
  tickets: SalesTicket[];
  tiers: SalesTier[];
  profiles: SalesProfile[];
  /** The IANA zone the dates are written in (the browser's, see resolveTimeZone). */
  tz: string;
  /** The export instant: it dates the file name. */
  now: Date;
}

export interface SalesCsvResult {
  csv: string;
  rowCount: number;
  /** {event-slug}-sales-YYYY-MM-DD.csv */
  filename: string;
}

/** What the per-line helpers need from the whole file. */
export interface SalesLineContext {
  /** The name of a tier by id, '' when unknown. */
  tierName: (id: string | null | undefined) => string;
  /** The profile of a buyer by id, when one was loaded. */
  profile: (id: string | null | undefined) => SalesProfile | undefined;
  /** 'YYYY-MM-DD HH:mm' in the export zone (makeTzFormatter). */
  fmt: (iso: string | null | undefined) => string;
}

export const SALES_CSV_HEADER: string[] = [
  "Order id",
  "Purchase date",
  "Buyer name",
  "Buyer email",
  "Ticket type",
  "Ticket price",
  "Discount",
  "Price paid",
  "Service fee",
  "Total charged",
  "Refunded",
  "Refund amount",
  "Stripe payment id",
  "Payment reference",
  "Ticket status",
  "Ticket holder",
  "Holder email",
  "Checked in",
  "Scanned at",
];

export const DEFAULT_EXPORT_TIME_ZONE = "Europe/Paris";

/** The zone itself when it is a valid IANA name, else the fallback (the company's own zone). */
export function resolveTimeZone(tz: unknown, fallback = DEFAULT_EXPORT_TIME_ZONE): string {
  if (typeof tz !== "string" || tz.trim() === "") return fallback;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    return fallback;
  }
  return tz;
}

/**
 * A formatter writing an ISO instant as 'YYYY-MM-DD HH:mm' in a zone ('' when the value is missing
 * or unreadable). One Intl formatter serves the whole file.
 */
export function makeTzFormatter(tz: string): (iso: string | null | undefined) => string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const part: Record<string, string> = {};
    for (const p of fmt.formatToParts(date)) part[p.type] = p.value;
    // With hour12 off, en-GB renders midnight as '24' in some engines.
    const hour = part.hour === "24" ? "00" : (part.hour ?? "00");
    return `${part.year}-${part.month}-${part.day} ${hour}:${part.minute}`;
  };
}

export function formatInTz(iso: string | null | undefined, tz: string): string {
  return makeTzFormatter(tz)(iso);
}

/** An order amount over its lines: floored, the last line takes the remainder, so the lines sum exactly. */
export function shareCents(total: number, count: number): number[] {
  if (!Number.isFinite(count) || count < 1) return [];
  const amount = Number.isFinite(total) ? Math.trunc(total) : 0;
  const each = Math.floor(amount / count);
  const shares = new Array<number>(count).fill(each);
  shares[count - 1] = amount - each * (count - 1);
  return shares;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const joinName = (first: unknown, last: unknown): string => [clean(first), clean(last)].filter(Boolean).join(" ");

/** The first attendee of an order's attendees jsonb, or null when there is none to read. */
export function firstAttendee(attendees: unknown): { first_name?: unknown; last_name?: unknown } | null {
  if (!Array.isArray(attendees)) return null;
  const first: unknown = attendees[0];
  return first !== null && typeof first === "object" ? (first as { first_name?: unknown; last_name?: unknown }) : null;
}

/**
 * The buyer's name, in order: the profile's full name, its first and last names, the holder of the
 * line's own ticket row, the order's first attendee, else ''.
 */
export function buyerName(
  order: Pick<SalesOrder, "attendees">,
  profile: SalesProfile | null | undefined,
  ticket: Pick<SalesTicket, "holder_first_name" | "holder_last_name"> | null | undefined,
): string {
  const full = clean(profile?.full_name);
  if (full) return full;
  const parts = joinName(profile?.first_name, profile?.last_name);
  if (parts) return parts;
  const holder = joinName(ticket?.holder_first_name, ticket?.holder_last_name);
  if (holder) return holder;
  const attendee = firstAttendee(order.attendees);
  return attendee ? joinName(attendee.first_name, attendee.last_name) : "";
}

/** First and last name of the person holding a ticket row, '' without a row. */
export function holderName(ticket: Pick<SalesTicket, "holder_first_name" | "holder_last_name"> | null | undefined): string {
  return joinName(ticket?.holder_first_name, ticket?.holder_last_name);
}

/** The instant of an ISO string, unreadable ones sorting last. */
const instant = (iso: string | null | undefined): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};
const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Ticket rows in creation order, then id: the order of the seats inside an order. */
const byCreation = (a: SalesTicket, b: SalesTicket): number => {
  const ta = instant(a.created_at);
  const tb = instant(b.created_at);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return compareIds(a.id, b.id);
};

const purchaseInstant = (o: SalesOrder): number => instant(o.paid_at ?? o.created_at);

/** Orders by purchase date, then id. */
const byPurchase = (a: SalesOrder, b: SalesOrder): number => {
  const ta = purchaseInstant(a);
  const tb = purchaseInstant(b);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return compareIds(a.id, b.id);
};

/** The `quantity` lines of one order, cells already escaped, in seat order. */
export function orderLines(order: SalesOrder, rows: SalesTicket[], ctx: SalesLineContext): string[][] {
  const buyerId = order.buyer_id ?? null;
  const ofOrder = rows.filter((t) => t.order_id === order.id).sort(byCreation);
  const originals = ofOrder.filter((t) => (t.buyer_id ?? null) === buyerId);
  // The rows holding the seats that were resold, in the order the resales happened.
  const holders = ofOrder.filter((t) => (t.buyer_id ?? null) !== buyerId && t.status !== "transferred");
  const count = Math.max(0, Math.floor(Number(order.quantity) || 0));
  const unitPrice = Number(order.unit_price_cents) || 0;
  const discounts = shareCents(order.discount_cents ?? 0, count);
  const fees = shareCents(order.fee_cents ?? 0, count);
  const refunded = order.status === "refunded";
  const purchase = ctx.fmt(order.paid_at ?? order.created_at);
  const profile = ctx.profile(order.buyer_id);
  const lines: string[][] = [];
  let nextHolder = 0;
  for (let i = 0; i < count; i++) {
    const original = originals[i] ?? null;
    const resold = original?.status === "transferred";
    const current = resold ? (holders[nextHolder++] ?? null) : original;
    const pricePaid = unitPrice - discounts[i];
    const totalCharged = pricePaid + fees[i];
    lines.push([
      csvCell(order.id),
      csvCell(purchase),
      csvText(buyerName(order, profile, original)),
      csvText(order.buyer_email),
      csvText(ctx.tierName(original?.tier_id) || ctx.tierName(order.tier_id)),
      csvMoney(unitPrice),
      csvMoney(discounts[i]),
      csvMoney(pricePaid),
      csvMoney(fees[i]),
      csvMoney(totalCharged),
      refunded ? "yes" : "no",
      refunded ? csvMoney(resold ? 0 : totalCharged) : "",
      csvCell(order.stripe_payment_intent_id),
      csvCell(order.stripe_checkout_session_id),
      resold ? "resold" : refunded ? "refunded" : "paid",
      csvText(holderName(current)),
      csvText(current?.holder_email),
      current ? (current.scanned_at ? "yes" : "no") : "",
      csvCell(current?.scanned_at ? ctx.fmt(current.scanned_at) : ""),
    ]);
  }
  return lines;
}

/** The whole file: header, then the lines of every paid or refunded order by purchase date. */
export function buildEventSalesCsv(input: SalesCsvInput): SalesCsvResult {
  const fmt = makeTzFormatter(input.tz);
  const tierNames = new Map(input.tiers.map((t) => [t.id, clean(t.name)] as const));
  const profiles = new Map(input.profiles.map((p) => [p.id, p] as const));
  const ticketsByOrder = new Map<string, SalesTicket[]>();
  for (const t of input.tickets) {
    const list = ticketsByOrder.get(t.order_id);
    if (list) list.push(t);
    else ticketsByOrder.set(t.order_id, [t]);
  }
  const ctx: SalesLineContext = {
    tierName: (id) => (id ? (tierNames.get(id) ?? "") : ""),
    profile: (id) => (id ? profiles.get(id) : undefined),
    fmt,
  };
  const orders = input.orders.filter((o) => o.status === "paid" || o.status === "refunded").sort(byPurchase);
  const rows: string[][] = [];
  for (const order of orders) {
    for (const line of orderLines(order, ticketsByOrder.get(order.id) ?? [], ctx)) rows.push(line);
  }
  return {
    csv: buildCsv(SALES_CSV_HEADER, rows),
    rowCount: rows.length,
    filename: salesCsvFilename(input.event.slug, input.now),
  };
}
