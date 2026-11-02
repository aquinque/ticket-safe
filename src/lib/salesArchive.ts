/**
 * The Sales archive as pure data: which events belong to it, what they add up to per currency,
 * and how one past event's orders read (the buyer, the status after refunds and resales, the
 * door check-ins). The list page and the past-event page both render from these rules, and the
 * rules are unit tested without a browser.
 *
 * No supabase import: everything here takes rows and returns rows. The end-of-event rule itself
 * lives in @/lib/eventTime and is never restated here.
 */
import { eventEnd, eventStart, isPastEvent, type EventTimeFields } from "@/lib/eventTime";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/money";

/** One row of public.studio_event_sales_summary(p_organizer_id); bigint columns arrive as numbers. */
export interface SalesSummaryRow {
  event_id: string;
  tickets_sold: number;
  capacity: number;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  refunded_orders: number;
  refunded_tickets: number;
  refunded_cents: number;
  checked_in: number;
  /** 'paid' | 'pending' | 'none' */
  payout_status: string;
}

/** The columns of `events` the archive reads. */
export interface ArchiveEventRow extends EventTimeFields {
  id: string;
  title: string | null;
  slug: string | null;
  date: string | null;
  ends_at: string | null;
  status: string | null;
  currency: string | null;
  payment_provider: string | null;
}

/** One line of the archive: the event, its figures, and whether its financial statement exists. */
export interface ArchiveEvent {
  event: ArchiveEventRow;
  summary: SalesSummaryRow;
  hasStatement: boolean;
}

/** The figures of an event the summary function returned no row for (nothing sold). */
export function emptySummary(eventId: string): SalesSummaryRow {
  return {
    event_id: eventId,
    tickets_sold: 0,
    capacity: 0,
    gross_cents: 0,
    fee_cents: 0,
    net_cents: 0,
    refunded_orders: 0,
    refunded_tickets: 0,
    refunded_cents: 0,
    checked_in: 0,
    payout_status: "none",
  };
}

/** The instant an event is filed under: its start, or its end when it has no readable start. */
const filedAt = (event: EventTimeFields): number => eventStart(event)?.getTime() ?? eventEnd(event)?.getTime() ?? 0;

/** The events that have ended (isPastEvent), newest first. */
export function pastEventsNewestFirst<T extends EventTimeFields>(events: T[], now: Date = new Date()): T[] {
  return events.filter((event) => isPastEvent(event, now)).sort((a, b) => filedAt(b) - filedAt(a));
}

/** Pairs past events with their summary row (zeros without one) and their statement flag, keeping the order given. */
export function attachSales(
  pastEvents: ArchiveEventRow[],
  summaries: SalesSummaryRow[],
  statementEventIds: Iterable<string>,
): ArchiveEvent[] {
  const byEvent = new Map(summaries.map((row) => [row.event_id, row]));
  const withStatement = new Set(statementEventIds);
  return pastEvents.map((event) => ({
    event,
    summary: byEvent.get(event.id) ?? emptySummary(event.id),
    hasStatement: withStatement.has(event.id),
  }));
}

export interface CurrencyTotals {
  currency: Currency;
  events: number;
  tickets: number;
  gross_cents: number;
  net_cents: number;
}

/**
 * What the archive adds up to, one entry per currency sold in (euros first), only for the
 * currencies present. Pounds and euros are never added together.
 */
export function totalsByCurrency(rows: ArchiveEvent[]): CurrencyTotals[] {
  const by = new Map<Currency, CurrencyTotals>();
  for (const row of rows) {
    const currency = toCurrency(row.event.currency);
    const totals = by.get(currency) ?? { currency, events: 0, tickets: 0, gross_cents: 0, net_cents: 0 };
    totals.events += 1;
    totals.tickets += row.summary.tickets_sold;
    totals.gross_cents += row.summary.gross_cents;
    totals.net_cents += row.summary.net_cents;
    by.set(currency, totals);
  }
  return CURRENCIES.filter((currency) => by.has(currency)).map((currency) => by.get(currency) as CurrencyTotals);
}

export type PayoutTone = "emerald" | "amber" | "muted";

/** The payout badge of an event: Paid (emerald), Pending (amber), None (muted) for anything else. */
export function payoutLabel(status: string | null | undefined): { label: "Paid" | "Pending" | "None"; tone: PayoutTone } {
  if (status === "paid") return { label: "Paid", tone: "emerald" };
  if (status === "pending") return { label: "Pending", tone: "amber" };
  return { label: "None", tone: "muted" };
}

export type StatementState = "not_stripe" | "available" | "missing";

/** Whether the financial statement PDF can be offered: only Stripe events have one. */
export function statementState(event: { payment_provider: string | null | undefined }, hasStatement: boolean): StatementState {
  if (event.payment_provider !== "stripe") return "not_stripe";
  return hasStatement ? "available" : "missing";
}

/** The columns of `event_orders` the past-event page reads. */
export interface ArchiveOrderRow {
  id: string;
  buyer_id: string | null;
  buyer_email: string | null;
  /** event_orders.attendees jsonb: [{ first_name, last_name, email, gender }] when the buyer named the guests. */
  attendees: unknown;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  fee_cents: number | null;
  discount_cents: number | null;
  currency: string | null;
  tier_id: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  refunded_at: string | null;
}

/** The columns of `event_tickets` the past-event page reads. */
export interface ArchiveTicketRow {
  id: string;
  order_id: string;
  tier_id: string | null;
  buyer_id: string | null;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  /** valid | scanned | cancelled | refunded | transferred */
  status: string;
  scanned_at: string | null;
  created_at: string;
}

export type OrderStatusLabel = "paid" | "refunded" | "resold" | "partly resold";

export interface Attendee {
  first_name: string;
  last_name: string;
  email: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const fullName = (first: string | null | undefined, last: string | null | undefined): string =>
  [first, last].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");

/** The guests named at checkout, from the order's attendees JSON; empty when there is none. */
export function attendeesOf(order: Pick<ArchiveOrderRow, "attendees">): Attendee[] {
  if (!Array.isArray(order.attendees)) return [];
  return order.attendees.map((raw) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { first_name: text(entry.first_name), last_name: text(entry.last_name), email: text(entry.email) };
  });
}

/**
 * The ticket rows issued to the order's buyer. A resale flips the seller's row to 'transferred'
 * and inserts a new row for the new owner under the same order, so the original rows are the
 * ones carrying the order's buyer_id.
 */
const originalRows = (order: Pick<ArchiveOrderRow, "buyer_id">, ticketsOfOrder: ArchiveTicketRow[]): ArchiveTicketRow[] =>
  order.buyer_id ? ticketsOfOrder.filter((ticket) => ticket.buyer_id === order.buyer_id) : [];

/** paid | refunded | resold (every original ticket passed on) | partly resold (some of them). */
export function orderStatus(order: Pick<ArchiveOrderRow, "status" | "buyer_id">, ticketsOfOrder: ArchiveTicketRow[]): OrderStatusLabel {
  if (order.status === "refunded") return "refunded";
  const originals = originalRows(order, ticketsOfOrder);
  const transferred = originals.filter((ticket) => ticket.status === "transferred").length;
  if (originals.length > 0 && transferred === originals.length) return "resold";
  if (transferred > 0) return "partly resold";
  return "paid";
}

/** The buyer's name: the holder of the first original ticket, else the first guest named at checkout, else '(unnamed)'. */
export function buyerNameOf(order: Pick<ArchiveOrderRow, "buyer_id" | "attendees">, ticketsOfOrder: ArchiveTicketRow[]): string {
  const first = originalRows(order, ticketsOfOrder)[0];
  const holder = first ? fullName(first.holder_first_name, first.holder_last_name) : "";
  if (holder) return holder;
  const guest = attendeesOf(order)[0];
  const named = guest ? fullName(guest.first_name, guest.last_name) : "";
  return named || "(unnamed)";
}

/** The buyer's email: the order's, else the first original ticket's holder email, else the first guest's; empty when none. */
export function buyerEmailOf(order: Pick<ArchiveOrderRow, "buyer_id" | "buyer_email" | "attendees">, ticketsOfOrder: ArchiveTicketRow[]): string {
  const own = text(order.buyer_email);
  if (own) return own;
  const first = originalRows(order, ticketsOfOrder)[0];
  const holder = first ? text(first.holder_email) : "";
  if (holder) return holder;
  return attendeesOf(order)[0]?.email ?? "";
}

/** Door check-ins of the order: scanned rows among the current tickets (a transferred row no longer counts), out of the quantity bought. */
export function checkInsOf(order: Pick<ArchiveOrderRow, "quantity">, ticketsOfOrder: ArchiveTicketRow[]): { scanned: number; total: number } {
  const scanned = ticketsOfOrder.filter((ticket) => ticket.status !== "transferred" && ticket.scanned_at != null).length;
  return { scanned, total: order.quantity };
}

/** One line of the orders table of a past event. */
export interface OrderView {
  id: string;
  buyerName: string;
  email: string;
  tierId: string | null;
  tierName: string;
  quantity: number;
  amountCents: number;
  currency: Currency;
  /** paid_at, or created_at for a row that never recorded one. */
  date: string;
  status: OrderStatusLabel;
  checkIns: { scanned: number; total: number };
}

/** The tickets of each order, oldest row first (so the first original row is the first one issued). */
export function ticketsByOrder(tickets: ArchiveTicketRow[]): Map<string, ArchiveTicketRow[]> {
  const sorted = [...tickets].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const by = new Map<string, ArchiveTicketRow[]>();
  for (const ticket of sorted) {
    const rows = by.get(ticket.order_id) ?? [];
    rows.push(ticket);
    by.set(ticket.order_id, rows);
  }
  return by;
}

/** The orders table rows, in the order of `orders`. */
export function buildOrderViews(orders: ArchiveOrderRow[], tickets: ArchiveTicketRow[], tiers: { id: string; name: string }[]): OrderView[] {
  const byOrder = ticketsByOrder(tickets);
  const tierName = new Map(tiers.map((tier) => [tier.id, tier.name]));
  return orders.map((order) => {
    const own = byOrder.get(order.id) ?? [];
    return {
      id: order.id,
      buyerName: buyerNameOf(order, own),
      email: buyerEmailOf(order, own),
      tierId: order.tier_id,
      tierName: (order.tier_id && tierName.get(order.tier_id)) || "—",
      quantity: order.quantity,
      amountCents: order.total_cents,
      currency: toCurrency(order.currency),
      date: order.paid_at ?? order.created_at,
      status: orderStatus(order, own),
      checkIns: checkInsOf(order, own),
    };
  });
}

export type OrderSortKey = "buyer" | "amount" | "date" | "status" | "checkin";
export type SortDir = "asc" | "desc";

/** Ascending order of the statuses: the plain sales first, the refunds last. */
const STATUS_RANK: Record<OrderStatusLabel, number> = { paid: 0, "partly resold": 1, resold: 2, refunded: 3 };

const instant = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** A sorted copy; ties fall back to the newest order first, then the id, so the order is stable. */
export function sortOrders(rows: OrderView[], key: OrderSortKey, dir: SortDir): OrderView[] {
  const compare = (a: OrderView, b: OrderView): number => {
    switch (key) {
      case "buyer":
        return a.buyerName.localeCompare(b.buyerName, "en", { sensitivity: "base" });
      case "amount":
        return a.amountCents - b.amountCents;
      case "status":
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      case "checkin":
        return a.checkIns.scanned - b.checkIns.scanned || a.checkIns.total - b.checkIns.total;
      default:
        return instant(a.date) - instant(b.date);
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(a, b) || instant(b.date) - instant(a.date) || a.id.localeCompare(b.id));
}

/** The rows whose buyer name or email contains the query (case-insensitive, trimmed) and whose ticket type is `tierId` ('all' or empty for every type). */
export function filterOrders(rows: OrderView[], query: string, tierId: string | null | undefined): OrderView[] {
  const q = query.trim().toLowerCase();
  const tier = tierId && tierId !== "all" ? tierId : null;
  return rows.filter((row) => {
    if (tier && row.tierId !== tier) return false;
    if (q && !row.buyerName.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Whole-number percentage of `part` in `total`; 0 when there is no total. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * The file name of a Content-Disposition header: the RFC 5987 `filename*=UTF-8''…` form when
 * present (percent-decoded), else `filename="…"` or a bare `filename=…`; null without one.
 */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*[\w-]*'[\w-]*'([^;]+)/i.exec(header);
  if (extended) {
    const raw = extended[1].trim().replace(/^"|"$/g, "");
    try {
      const decoded = decodeURIComponent(raw).trim();
      if (decoded) return decoded;
    } catch {
      // a badly encoded name: fall back to the plain form below
    }
  }
  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
  if (!plain) return null;
  const name = (plain[1] !== undefined ? plain[1].replace(/\\(.)/g, "$1") : plain[2]).trim();
  return name || null;
}
