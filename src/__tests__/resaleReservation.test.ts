import { describe, it, expect } from "vitest";
import {
  REFUND_OUTCOMES,
  RESERVATION_HOLD_SECONDS,
  STRIPE_SESSION_TTL_SECONDS,
  needsRefund,
  parseCompletionResult,
  parseRefundRecordResult,
  parseReserveResult,
  refundNeedsAdminReview,
  reserveOutcomeResponse,
  stripeSessionExpiresAt,
  type ReserveResult,
  type ResaleCompletionOutcome,
} from "../../supabase/functions/_shared/resaleReservation";

const reservedRow = {
  outcome: "reserved",
  transaction_id: "tx-1",
  seller_id: "seller-1",
  previous_transaction_id: null,
  reserved_until: "2026-11-08T12:35:00Z",
};

function result(over: Partial<ReserveResult>): ReserveResult {
  return { outcome: "reserved", transactionId: null, sellerId: null, previousTransactionId: null, reservedUntil: null, ...over };
}

describe("reserve_resale_listing results", () => {
  it("reads the first row of the array a set-returning function gives back", () => {
    expect(parseReserveResult([reservedRow])).toEqual({
      outcome: "reserved",
      transactionId: "tx-1",
      sellerId: "seller-1",
      previousTransactionId: null,
      reservedUntil: "2026-11-08T12:35:00Z",
    });
  });

  it("also reads a single row object", () => {
    const r = parseReserveResult({ ...reservedRow, previous_transaction_id: "tx-0" });
    expect(r.previousTransactionId).toBe("tx-0");
  });

  it("reads refusals, which carry no transaction", () => {
    expect(parseReserveResult([{ outcome: "price_changed", transaction_id: null }]).outcome).toBe("price_changed");
    expect(parseReserveResult([{ outcome: "reserved_by_other", reserved_until: "2026-11-08T12:35:00Z" }]).reservedUntil).toBe("2026-11-08T12:35:00Z");
  });

  it("refuses garbage instead of guessing", () => {
    expect(() => parseReserveResult(null)).toThrow();
    expect(() => parseReserveResult([])).toThrow();
    expect(() => parseReserveResult("reserved")).toThrow();
    expect(() => parseReserveResult([{ outcome: "maybe" }])).toThrow();
    expect(() => parseReserveResult([{ outcome: "reserved", transaction_id: null }])).toThrow();
  });
});

describe("the checkout's answer when the listing can't be reserved", () => {
  it("maps each refusal to its status, message and code", () => {
    expect(reserveOutcomeResponse(result({ outcome: "not_available" }))).toEqual({ status: 404, body: { error: "This ticket is no longer available." } });
    expect(reserveOutcomeResponse(result({ outcome: "own_listing" }))).toEqual({ status: 400, body: { error: "You cannot purchase your own ticket." } });
    expect(reserveOutcomeResponse(result({ outcome: "price_changed" }))).toEqual({
      status: 409,
      body: { error: "The price of this ticket just changed. Reload the page to see the new price.", code: "PRICE_CHANGED" },
    });
    expect(reserveOutcomeResponse(result({ outcome: "reserved_by_other", reservedUntil: "2026-11-08T12:35:00Z" }))).toEqual({
      status: 409,
      body: {
        error: "Someone is checking out this ticket right now. If they don't complete, it comes back within 35 minutes.",
        code: "RESERVED",
        reserved_until: "2026-11-08T12:35:00Z",
      },
    });
  });

  it("has nothing to answer for a successful reservation", () => {
    expect(() => reserveOutcomeResponse(result({ outcome: "reserved", transactionId: "tx-1" }))).toThrow();
  });
});

describe("timing", () => {
  it("holds the listing longer than the Stripe session lives", () => {
    expect(RESERVATION_HOLD_SECONDS).toBe(2100);
    expect(STRIPE_SESSION_TTL_SECONDS).toBe(1800);
    expect(RESERVATION_HOLD_SECONDS).toBeGreaterThan(STRIPE_SESSION_TTL_SECONDS);
  });

  it("ends the Stripe session 30 minutes after now, in whole seconds", () => {
    expect(stripeSessionExpiresAt(1_700_000_000_999)).toBe(1_700_000_000 + 1800);
  });
});

describe("complete_resale_purchase results", () => {
  const all: ResaleCompletionOutcome[] = [
    "completed",
    "already_completed",
    "transaction_missing",
    "transaction_not_pending",
    "listing_missing",
    "listing_sold",
    "reserved_by_other",
    "listing_unavailable",
    "studio_ticket_unavailable",
  ];

  it("parses an outcome row", () => {
    expect(parseCompletionResult([{ outcome: "completed", listing_id: "l-1", buyer_id: "b-1", new_event_ticket_id: "et-2" }])).toEqual({
      outcome: "completed",
      listingId: "l-1",
      buyerId: "b-1",
      newEventTicketId: "et-2",
    });
    expect(() => parseCompletionResult([{ outcome: "sold" }])).toThrow();
    expect(() => parseCompletionResult(undefined)).toThrow();
  });

  it("refunds exactly the conflict outcomes", () => {
    expect([...REFUND_OUTCOMES].sort()).toEqual(
      ["transaction_not_pending", "listing_missing", "listing_sold", "reserved_by_other", "listing_unavailable", "studio_ticket_unavailable"].sort(),
    );
    for (const o of all) expect(needsRefund(o), o).toBe(REFUND_OUTCOMES.includes(o));
    expect(needsRefund("completed")).toBe(false);
    expect(needsRefund("already_completed")).toBe(false);
    expect(needsRefund("transaction_missing")).toBe(false);
  });
});

describe("record_resale_refund results", () => {
  it("parses the four columns", () => {
    expect(parseRefundRecordResult([{ outcome: "refunded", transaction_id: "tx-1", relisted: true, was_completed: true }])).toEqual({
      outcome: "refunded",
      transactionId: "tx-1",
      relisted: true,
      wasCompleted: true,
    });
    expect(() => parseRefundRecordResult([{ outcome: "done" }])).toThrow();
  });

  it("asks an admin to look only at a completed sale that was refunded and not re-listed", () => {
    const r = (relisted: boolean, wasCompleted: boolean, outcome: "refunded" | "already_refunded" | "not_found" = "refunded") =>
      refundNeedsAdminReview({ outcome, transactionId: "tx-1", relisted, wasCompleted });
    expect(r(false, true)).toBe(true);
    expect(r(true, true)).toBe(false);
    expect(r(false, false)).toBe(false); // a conflict refund: the buyer never had the ticket
    expect(r(false, true, "already_refunded")).toBe(false);
    expect(r(false, true, "not_found")).toBe(false);
  });
});
