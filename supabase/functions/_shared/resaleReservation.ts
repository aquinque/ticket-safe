/**
 * Resale reservations and purchase outcomes — shared by
 * stripe-connect-resale-checkout and stripe-connect-webhook.
 *
 * The database does the locking (migration 20261108090000):
 *   reserve_resale_listing     → one buyer at a time holds a listing, the hold
 *                                belongs to a transaction and ends at
 *                                reserved_until.
 *   complete_resale_purchase   → marks the listing sold only if this
 *                                transaction can still have it; otherwise it
 *                                returns a conflict outcome and the webhook
 *                                refunds the buyer (REFUND_OUTCOMES).
 *   record_resale_refund       → charge.refunded bookkeeping.
 *
 * This file turns their rows into typed results and HTTP answers.
 * Plain TypeScript, no Deno imports: the vitest suite imports it directly.
 */

/** How long a checkout holds a listing: 35 minutes, longer than the Stripe session. */
export const RESERVATION_HOLD_SECONDS = 2100;
/** Stripe Checkout session lifetime: 30 minutes, the shortest Stripe allows. */
export const STRIPE_SESSION_TTL_SECONDS = 1800;

export type ReserveOutcome = "reserved" | "not_available" | "own_listing" | "price_changed" | "reserved_by_other";

export interface ReserveResult {
  outcome: ReserveOutcome;
  transactionId: string | null;
  sellerId: string | null;
  previousTransactionId: string | null;
  reservedUntil: string | null;
}

export type ResaleCompletionOutcome =
  | "completed"
  | "already_completed"
  | "transaction_missing"
  | "transaction_not_pending"
  | "listing_missing"
  | "listing_sold"
  | "reserved_by_other"
  | "listing_unavailable"
  | "studio_ticket_unavailable";

/** The buyer paid but can't have the ticket: these outcomes are refunded automatically. */
export const REFUND_OUTCOMES: readonly ResaleCompletionOutcome[] = [
  "transaction_not_pending",
  "listing_missing",
  "listing_sold",
  "reserved_by_other",
  "listing_unavailable",
  "studio_ticket_unavailable",
];

export interface CompletionResult {
  outcome: ResaleCompletionOutcome;
  listingId: string | null;
  buyerId: string | null;
  newEventTicketId: string | null;
}

export type RefundRecordOutcome = "not_found" | "already_refunded" | "refunded";

export interface RefundRecordResult {
  outcome: RefundRecordOutcome;
  transactionId: string | null;
  relisted: boolean;
  wasCompleted: boolean;
}

const RESERVE_OUTCOMES: readonly ReserveOutcome[] = ["reserved", "not_available", "own_listing", "price_changed", "reserved_by_other"];
const COMPLETION_OUTCOMES: readonly ResaleCompletionOutcome[] = ["completed", "already_completed", "transaction_missing", ...REFUND_OUTCOMES];
const REFUND_RECORD_OUTCOMES: readonly RefundRecordOutcome[] = ["not_found", "already_refunded", "refunded"];

/** A set-returning function comes back as an array of rows; take the first one. */
function firstRow(data: unknown, fn: string): Record<string, unknown> {
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error(`${fn}: no result row`);
  return row as Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fn: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new Error(`${fn}: unexpected outcome ${JSON.stringify(v)}`);
}

export function parseReserveResult(data: unknown): ReserveResult {
  const row = firstRow(data, "reserve_resale_listing");
  const outcome = oneOf(row.outcome, RESERVE_OUTCOMES, "reserve_resale_listing");
  const transactionId = str(row.transaction_id);
  if (outcome === "reserved" && !transactionId) throw new Error("reserve_resale_listing: reserved without a transaction");
  return {
    outcome,
    transactionId,
    sellerId: str(row.seller_id),
    previousTransactionId: str(row.previous_transaction_id),
    reservedUntil: str(row.reserved_until),
  };
}

export const RESERVED_BY_OTHER_MESSAGE =
  "Someone is checking out this ticket right now. If they don't complete, it comes back within 35 minutes.";
export const PRICE_CHANGED_MESSAGE = "The price of this ticket just changed. Reload the page to see the new price.";

export interface ReserveErrorResponse {
  status: number;
  body: { error: string; code?: "PRICE_CHANGED" | "RESERVED"; reserved_until?: string };
}

/** The checkout's answer when the listing could not be reserved. */
export function reserveOutcomeResponse(r: ReserveResult): ReserveErrorResponse {
  switch (r.outcome) {
    case "not_available":
      return { status: 404, body: { error: "This ticket is no longer available." } };
    case "own_listing":
      return { status: 400, body: { error: "You cannot purchase your own ticket." } };
    case "price_changed":
      return { status: 409, body: { error: PRICE_CHANGED_MESSAGE, code: "PRICE_CHANGED" } };
    case "reserved_by_other":
      return {
        status: 409,
        body: { error: RESERVED_BY_OTHER_MESSAGE, code: "RESERVED", ...(r.reservedUntil ? { reserved_until: r.reservedUntil } : {}) },
      };
    case "reserved":
      throw new Error("reserveOutcomeResponse: the listing was reserved, there is no error to answer");
  }
}

/** Stripe `expires_at` for a session created now. Computed after the reserve call, so the hold outlives the session. */
export function stripeSessionExpiresAt(nowMs: number): number {
  return Math.floor(nowMs / 1000) + STRIPE_SESSION_TTL_SECONDS;
}

export function parseCompletionResult(data: unknown): CompletionResult {
  const row = firstRow(data, "complete_resale_purchase");
  return {
    outcome: oneOf(row.outcome, COMPLETION_OUTCOMES, "complete_resale_purchase"),
    listingId: str(row.listing_id),
    buyerId: str(row.buyer_id),
    newEventTicketId: str(row.new_event_ticket_id),
  };
}

export function needsRefund(outcome: ResaleCompletionOutcome): boolean {
  return REFUND_OUTCOMES.includes(outcome);
}

export function parseRefundRecordResult(data: unknown): RefundRecordResult {
  const row = firstRow(data, "record_resale_refund");
  return {
    outcome: oneOf(row.outcome, REFUND_RECORD_OUTCOMES, "record_resale_refund"),
    transactionId: str(row.transaction_id),
    relisted: row.relisted === true,
    wasCompleted: row.was_completed === true,
  };
}

/**
 * A completed sale was refunded but its listing did not go back on sale
 * (a Studio resale, whose seller ticket is already transferred): an admin has
 * to look at the buyer's ticket.
 */
export function refundNeedsAdminReview(r: RefundRecordResult): boolean {
  return r.outcome === "refunded" && r.wasCompleted && !r.relisted;
}
