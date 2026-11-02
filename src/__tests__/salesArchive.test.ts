import { describe, expect, it } from "vitest";
import {
  attachSales,
  attendeesOf,
  buildOrderViews,
  buyerEmailOf,
  buyerNameOf,
  checkInsOf,
  emptySummary,
  filenameFromDisposition,
  filterOrders,
  orderStatus,
  pastEventsNewestFirst,
  payoutLabel,
  percentOf,
  sortOrders,
  statementState,
  totalsByCurrency,
  type ArchiveEventRow,
  type ArchiveOrderRow,
  type ArchiveTicketRow,
  type OrderView,
  type SalesSummaryRow,
} from "@/lib/salesArchive";

const NOW = new Date("2026-11-02T12:00:00Z");

const event = (over: Partial<ArchiveEventRow> & { id: string }): ArchiveEventRow => ({
  title: `Event ${over.id}`,
  slug: `event-${over.id}`,
  date: null,
  ends_at: null,
  status: "published",
  currency: "EUR",
  payment_provider: "stripe",
  ...over,
});

const summary = (over: Partial<SalesSummaryRow> & { event_id: string }): SalesSummaryRow => ({ ...emptySummary(over.event_id), ...over });

const order = (over: Partial<ArchiveOrderRow> & { id: string }): ArchiveOrderRow => ({
  buyer_id: "buyer-1",
  buyer_email: "jane@example.com",
  attendees: null,
  quantity: 1,
  unit_price_cents: 1000,
  total_cents: 1180,
  fee_cents: 180,
  discount_cents: 0,
  currency: "EUR",
  tier_id: "tier-std",
  status: "paid",
  paid_at: "2026-10-01T10:00:00Z",
  created_at: "2026-10-01T09:59:00Z",
  refunded_at: null,
  ...over,
});

const ticket = (over: Partial<ArchiveTicketRow> & { id: string }): ArchiveTicketRow => ({
  order_id: "o1",
  tier_id: "tier-std",
  buyer_id: "buyer-1",
  holder_first_name: "Jane",
  holder_last_name: "Doe",
  holder_email: "jane@example.com",
  status: "valid",
  scanned_at: null,
  created_at: "2026-10-01T10:00:00Z",
  ...over,
});

describe("pastEventsNewestFirst", () => {
  it("keeps an event that ended an hour ago and leaves out one ending in an hour", () => {
    const endedAnHourAgo = event({ id: "ended", date: "2026-11-02T03:00:00Z", ends_at: "2026-11-02T11:00:00Z" });
    const endsInAnHour = event({ id: "running", date: "2026-11-02T08:00:00Z", ends_at: "2026-11-02T13:00:00Z" });
    expect(pastEventsNewestFirst([endsInAnHour, endedAnHourAgo], NOW).map((e) => e.id)).toEqual(["ended"]);
  });

  it("gives an event without an end the default duration (8 h) before archiving it", () => {
    const startedNineHoursAgo = event({ id: "over", date: "2026-11-02T03:00:00Z" });
    const startedSevenHoursAgo = event({ id: "still-on", date: "2026-11-02T05:00:00Z" });
    expect(pastEventsNewestFirst([startedSevenHoursAgo, startedNineHoursAgo], NOW).map((e) => e.id)).toEqual(["over"]);
  });

  it("lists the newest first, cancelled events included", () => {
    const old = event({ id: "old", date: "2026-10-01T20:00:00Z", status: "cancelled" });
    const recent = event({ id: "recent", date: "2026-11-01T20:00:00Z" });
    const mid = event({ id: "mid", date: "2026-10-15T20:00:00Z" });
    expect(pastEventsNewestFirst([old, recent, mid], NOW).map((e) => e.id)).toEqual(["recent", "mid", "old"]);
  });

  it("leaves out a draft whose date has passed: it was never on sale and stays in Events to be re-dated", () => {
    const draft = event({ id: "draft", date: "2026-11-01T20:00:00Z", status: "draft" });
    expect(pastEventsNewestFirst([draft], NOW)).toEqual([]);
  });

  it("never archives an event whose date cannot be read", () => {
    expect(pastEventsNewestFirst([event({ id: "no-date" }), event({ id: "bad", date: "whenever" })], NOW)).toEqual([]);
  });

  it("leaves the input untouched", () => {
    const input = [event({ id: "b", date: "2026-10-01T20:00:00Z" }), event({ id: "a", date: "2026-10-02T20:00:00Z" })];
    pastEventsNewestFirst(input, NOW);
    expect(input.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("attachSales", () => {
  it("pairs each event with its summary, zeros without one, and the statement flag", () => {
    const past = [event({ id: "e1" }), event({ id: "e2" })];
    const rows = attachSales(past, [summary({ event_id: "e1", tickets_sold: 5, gross_cents: 5000, net_cents: 4500, payout_status: "paid" })], ["e2"]);
    expect(rows.map((r) => r.event.id)).toEqual(["e1", "e2"]);
    expect(rows[0].summary.tickets_sold).toBe(5);
    expect(rows[0].hasStatement).toBe(false);
    expect(rows[1].summary).toEqual(emptySummary("e2"));
    expect(rows[1].hasStatement).toBe(true);
  });
});

describe("totalsByCurrency", () => {
  it("adds up per currency and never pounds with euros", () => {
    const rows = attachSales(
      [event({ id: "p1" }), event({ id: "l1", currency: "GBP" }), event({ id: "p2" })],
      [
        summary({ event_id: "p1", tickets_sold: 2, gross_cents: 1000, net_cents: 900 }),
        summary({ event_id: "l1", tickets_sold: 1, gross_cents: 500, net_cents: 450 }),
        summary({ event_id: "p2", tickets_sold: 3, gross_cents: 2000, net_cents: 1800 }),
      ],
      [],
    );
    expect(totalsByCurrency(rows)).toEqual([
      { currency: "EUR", events: 2, tickets: 5, gross_cents: 3000, net_cents: 2700 },
      { currency: "GBP", events: 1, tickets: 1, gross_cents: 500, net_cents: 450 },
    ]);
  });

  it("is empty without events and counts an unknown currency as euros", () => {
    expect(totalsByCurrency([])).toEqual([]);
    const rows = attachSales([event({ id: "x", currency: null })], [summary({ event_id: "x", tickets_sold: 1, gross_cents: 100, net_cents: 90 })], []);
    expect(totalsByCurrency(rows)).toEqual([{ currency: "EUR", events: 1, tickets: 1, gross_cents: 100, net_cents: 90 }]);
  });
});

describe("payoutLabel", () => {
  it("names the three states and treats anything else as none", () => {
    expect(payoutLabel("paid")).toEqual({ label: "Paid", tone: "emerald" });
    expect(payoutLabel("pending")).toEqual({ label: "Pending", tone: "amber" });
    expect(payoutLabel("none")).toEqual({ label: "None", tone: "muted" });
    expect(payoutLabel(null)).toEqual({ label: "None", tone: "muted" });
    expect(payoutLabel("whatever")).toEqual({ label: "None", tone: "muted" });
  });
});

describe("statementState", () => {
  it("offers the statement for Stripe events only", () => {
    expect(statementState({ payment_provider: "stripe" }, true)).toBe("available");
    expect(statementState({ payment_provider: "stripe" }, false)).toBe("missing");
    expect(statementState({ payment_provider: "revolut" }, true)).toBe("not_stripe");
    expect(statementState({ payment_provider: null }, false)).toBe("not_stripe");
  });
});

describe("orderStatus", () => {
  const two = order({ id: "o1", quantity: 2 });

  it("is paid while the buyer still holds the tickets, scanned or not", () => {
    expect(orderStatus(two, [ticket({ id: "t1" }), ticket({ id: "t2", status: "scanned", scanned_at: "2026-10-02T21:00:00Z" })])).toBe("paid");
  });

  it("is refunded whatever happened to the tickets", () => {
    expect(orderStatus(order({ id: "o1", status: "refunded" }), [ticket({ id: "t1", status: "transferred" })])).toBe("refunded");
  });

  it("is resold once every original ticket has been passed on", () => {
    const rows = [
      ticket({ id: "t1", status: "transferred" }),
      ticket({ id: "t2", status: "transferred" }),
      ticket({ id: "t3", buyer_id: "buyer-2", holder_first_name: "Ann", holder_last_name: "Lee" }),
      ticket({ id: "t4", buyer_id: "buyer-3", holder_first_name: "Bob", holder_last_name: "Ray" }),
    ];
    expect(orderStatus(two, rows)).toBe("resold");
  });

  it("is partly resold when only some were", () => {
    const rows = [ticket({ id: "t1", status: "transferred" }), ticket({ id: "t2" }), ticket({ id: "t3", buyer_id: "buyer-2" })];
    expect(orderStatus(two, rows)).toBe("partly resold");
  });

  it("is paid when the order has no buyer id to match (null-safe)", () => {
    expect(orderStatus(order({ id: "o1", buyer_id: null }), [ticket({ id: "t1", buyer_id: null, status: "transferred" })])).toBe("paid");
  });
});

describe("buyerNameOf", () => {
  it("is the holder of the first original ticket", () => {
    const rows = [ticket({ id: "t1", holder_first_name: "Jane", holder_last_name: "Doe" }), ticket({ id: "t2", holder_first_name: "John", holder_last_name: "Doe" })];
    expect(buyerNameOf(order({ id: "o1" }), rows)).toBe("Jane Doe");
  });

  it("keeps the original holder after a resale (the new owner's row is not the buyer)", () => {
    const rows = [ticket({ id: "t1", status: "transferred" }), ticket({ id: "t2", buyer_id: "buyer-2", holder_first_name: "Ann", holder_last_name: "Lee" })];
    expect(buyerNameOf(order({ id: "o1" }), rows)).toBe("Jane Doe");
  });

  it("falls back to the first guest named at checkout, then to (unnamed)", () => {
    const named = order({ id: "o1", attendees: [{ first_name: "Léa", last_name: "Martin", email: "lea@example.com" }] });
    expect(buyerNameOf(named, [ticket({ id: "t1", holder_first_name: " ", holder_last_name: null })])).toBe("Léa Martin");
    expect(buyerNameOf(named, [])).toBe("Léa Martin");
    expect(buyerNameOf(order({ id: "o2" }), [])).toBe("(unnamed)");
    expect(buyerNameOf(order({ id: "o3", attendees: { first_name: "not a list" } }), [])).toBe("(unnamed)");
    expect(buyerNameOf(order({ id: "o4", attendees: [{ first_name: "", last_name: "" }] }), [])).toBe("(unnamed)");
  });

  it("reads a single name too", () => {
    expect(buyerNameOf(order({ id: "o1" }), [ticket({ id: "t1", holder_first_name: "Madonna", holder_last_name: null })])).toBe("Madonna");
  });
});

describe("attendeesOf / buyerEmailOf", () => {
  it("reads the guests from the order's JSON and ignores anything else", () => {
    expect(attendeesOf(order({ id: "o1", attendees: [{ first_name: " A ", last_name: "B", email: "a@b.c" }, "junk", null] }))).toEqual([
      { first_name: "A", last_name: "B", email: "a@b.c" },
      { first_name: "", last_name: "", email: "" },
      { first_name: "", last_name: "", email: "" },
    ]);
    expect(attendeesOf(order({ id: "o2", attendees: null }))).toEqual([]);
  });

  it("prefers the order's email, then the first original holder's, then the first guest's", () => {
    expect(buyerEmailOf(order({ id: "o1" }), [ticket({ id: "t1", holder_email: "holder@example.com" })])).toBe("jane@example.com");
    expect(buyerEmailOf(order({ id: "o1", buyer_email: " " }), [ticket({ id: "t1", holder_email: "holder@example.com" })])).toBe("holder@example.com");
    expect(buyerEmailOf(order({ id: "o1", buyer_email: null, attendees: [{ email: "guest@example.com" }] }), [])).toBe("guest@example.com");
    expect(buyerEmailOf(order({ id: "o1", buyer_email: null }), [])).toBe("");
  });
});

describe("checkInsOf", () => {
  it("counts the scanned tickets out of the quantity bought", () => {
    const rows = [ticket({ id: "t1", status: "scanned", scanned_at: "2026-10-02T21:00:00Z" }), ticket({ id: "t2" })];
    expect(checkInsOf(order({ id: "o1", quantity: 2 }), rows)).toEqual({ scanned: 1, total: 2 });
    expect(checkInsOf(order({ id: "o1", quantity: 2 }), [])).toEqual({ scanned: 0, total: 2 });
  });

  it("counts the new owner's ticket after a resale, not the transferred row", () => {
    const rows = [
      ticket({ id: "t1", status: "transferred", scanned_at: "2026-10-02T20:00:00Z" }),
      ticket({ id: "t2", buyer_id: "buyer-2", status: "scanned", scanned_at: "2026-10-02T21:00:00Z" }),
    ];
    expect(checkInsOf(order({ id: "o1", quantity: 1 }), rows)).toEqual({ scanned: 1, total: 1 });
  });
});

describe("buildOrderViews", () => {
  it("builds one line per order from its own tickets and tier", () => {
    const orders = [
      order({ id: "o1", tier_id: "tier-vip", total_cents: 2500, currency: "gbp", paid_at: null, created_at: "2026-10-01T09:59:00Z" }),
      order({ id: "o2", buyer_id: "buyer-2", buyer_email: "ann@example.com", tier_id: "tier-gone", quantity: 2 }),
    ];
    const tickets = [
      ticket({ id: "t1", order_id: "o1", created_at: "2026-10-01T10:00:01Z", holder_first_name: "Second", holder_last_name: "Row" }),
      ticket({ id: "t0", order_id: "o1", created_at: "2026-10-01T10:00:00Z", holder_first_name: "First", holder_last_name: "Row" }),
      ticket({ id: "t2", order_id: "o2", buyer_id: "buyer-2", holder_first_name: "Ann", holder_last_name: "Lee", status: "scanned", scanned_at: "2026-10-02T21:00:00Z" }),
    ];
    const views = buildOrderViews(orders, tickets, [{ id: "tier-vip", name: "VIP" }, { id: "tier-std", name: "Standard" }]);
    expect(views).toEqual([
      {
        id: "o1",
        buyerName: "First Row",
        email: "jane@example.com",
        tierId: "tier-vip",
        tierName: "VIP",
        quantity: 1,
        amountCents: 2500,
        currency: "GBP",
        date: "2026-10-01T09:59:00Z",
        status: "paid",
        checkIns: { scanned: 0, total: 1 },
      },
      {
        id: "o2",
        buyerName: "Ann Lee",
        email: "ann@example.com",
        tierId: "tier-gone",
        tierName: "—",
        quantity: 2,
        amountCents: 1180,
        currency: "EUR",
        date: "2026-10-01T10:00:00Z",
        status: "paid",
        checkIns: { scanned: 1, total: 2 },
      },
    ]);
  });
});

describe("sortOrders / filterOrders", () => {
  const view = (over: Partial<OrderView> & { id: string }): OrderView => ({
    buyerName: "Jane Doe",
    email: "jane@example.com",
    tierId: "tier-std",
    tierName: "Standard",
    quantity: 1,
    amountCents: 1180,
    currency: "EUR",
    date: "2026-10-01T10:00:00Z",
    status: "paid",
    checkIns: { scanned: 0, total: 1 },
    ...over,
  });
  const rows = [
    view({ id: "a", buyerName: "zoe Adams", amountCents: 500, date: "2026-10-03T10:00:00Z", status: "refunded", checkIns: { scanned: 0, total: 1 } }),
    view({ id: "b", buyerName: "Émile Blanc", amountCents: 2500, date: "2026-10-01T10:00:00Z", status: "resold", checkIns: { scanned: 2, total: 2 } }),
    view({ id: "c", buyerName: "anna Cole", email: "ANNA@example.com", tierId: "tier-vip", amountCents: 1180, date: "2026-10-02T10:00:00Z", status: "partly resold", checkIns: { scanned: 1, total: 2 } }),
  ];
  const ids = (list: OrderView[]) => list.map((r) => r.id);

  it("sorts by date, amount, buyer (case-insensitive), status and check-ins, both ways", () => {
    expect(ids(sortOrders(rows, "date", "desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortOrders(rows, "date", "asc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortOrders(rows, "amount", "asc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortOrders(rows, "amount", "desc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortOrders(rows, "buyer", "asc"))).toEqual(["c", "b", "a"]);
    expect(ids(sortOrders(rows, "status", "asc"))).toEqual(["c", "b", "a"]);
    expect(ids(sortOrders(rows, "checkin", "desc"))).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by the newest order and leaves the input untouched", () => {
    const tied = [view({ id: "x", amountCents: 100, date: "2026-10-01T10:00:00Z" }), view({ id: "y", amountCents: 100, date: "2026-10-05T10:00:00Z" })];
    expect(ids(sortOrders(tied, "amount", "asc"))).toEqual(["y", "x"]);
    expect(ids(tied)).toEqual(["x", "y"]);
  });

  it("filters by name or email, case-insensitive and trimmed, and by ticket type", () => {
    expect(ids(filterOrders(rows, "  COLE ", "all"))).toEqual(["c"]);
    expect(ids(filterOrders(rows, "anna@", null))).toEqual(["c"]);
    expect(ids(filterOrders(rows, "émile", undefined))).toEqual(["b"]);
    expect(ids(filterOrders(rows, "", "tier-vip"))).toEqual(["c"]);
    expect(ids(filterOrders(rows, "adams", "tier-vip"))).toEqual([]);
    expect(ids(filterOrders(rows, "   ", "all"))).toEqual(["a", "b", "c"]);
  });
});

describe("percentOf", () => {
  it("rounds to a whole number and is 0 without a total", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, 5)).toBe(100);
  });
});

describe("filenameFromDisposition", () => {
  it("reads a quoted and an unquoted file name", () => {
    expect(filenameFromDisposition('attachment; filename="midnight-party-sales-2026-11-07.csv"')).toBe("midnight-party-sales-2026-11-07.csv");
    expect(filenameFromDisposition("attachment; filename=midnight-party-sales-2026-11-07.csv")).toBe("midnight-party-sales-2026-11-07.csv");
    expect(filenameFromDisposition('attachment; filename="with, comma.csv"; size=12')).toBe("with, comma.csv");
  });

  it("prefers the UTF-8 form and decodes it", () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''soir%C3%A9e-sales.csv")).toBe("soirée-sales.csv");
    expect(filenameFromDisposition("attachment; filename=\"plain.csv\"; filename*=UTF-8''f%C3%AAte.csv")).toBe("fête.csv");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A; filename=\"fallback.csv\"")).toBe("fallback.csv");
  });

  it("is null without a file name", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition(undefined)).toBeNull();
    expect(filenameFromDisposition("")).toBeNull();
    expect(filenameFromDisposition("inline")).toBeNull();
    expect(filenameFromDisposition('attachment; filename=""')).toBeNull();
  });
});
