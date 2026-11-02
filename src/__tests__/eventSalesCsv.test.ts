/**
 * The sales CSV of an event, one line per ticket sold: the pure row builder behind the
 * export-event-sales edge function (supabase/functions/_shared/eventSalesCsv.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CSV_BOM } from "../../supabase/functions/_shared/csv.ts";
import {
  SALES_CSV_HEADER,
  buildEventSalesCsv,
  buyerName,
  formatInTz,
  resolveTimeZone,
  shareCents,
  type SalesCsvInput,
  type SalesOrder,
  type SalesProfile,
  type SalesTicket,
} from "../../supabase/functions/_shared/eventSalesCsv.ts";

const HEADER_LINE =
  "Order id,Purchase date,Buyer name,Buyer email,Ticket type,Ticket price,Discount,Price paid,Service fee,Total charged,Refunded,Refund amount,Stripe payment id,Payment reference,Ticket status,Ticket holder,Holder email,Checked in,Scanned at";

const event = { id: "event-1", title: "Midnight Party", slug: "midnight-party", currency: "EUR" };
const tiers = [
  { id: "tier-std", name: "Standard" },
  { id: "tier-vip", name: "VIP" },
];
const now = new Date("2026-11-07T10:00:00Z");

let seq = 0;

function order(over: Partial<SalesOrder> = {}): SalesOrder {
  seq += 1;
  return {
    id: `order-${seq}`,
    buyer_id: `buyer-${seq}`,
    buyer_email: `buyer${seq}@example.com`,
    attendees: null,
    quantity: 1,
    unit_price_cents: 2000,
    total_cents: 2160,
    fee_cents: 160,
    discount_cents: 0,
    currency: "EUR",
    tier_id: "tier-std",
    status: "paid",
    stripe_payment_intent_id: "pi_1",
    stripe_checkout_session_id: "cs_1",
    paid_at: "2026-11-01T10:00:00Z",
    created_at: "2026-11-01T09:59:00Z",
    refunded_at: null,
    ...over,
  };
}

function ticket(over: Partial<SalesTicket> & { order_id: string; buyer_id: string | null }): SalesTicket {
  seq += 1;
  return {
    id: `ticket-${seq}`,
    tier_id: "tier-std",
    holder_first_name: null,
    holder_last_name: null,
    holder_email: null,
    status: "valid",
    scanned_at: null,
    created_at: `2026-11-01T10:00:${String(seq % 60).padStart(2, "0")}Z`,
    ...over,
  };
}

function profile(id: string, full_name: string, first_name: string | null = null, last_name: string | null = null): SalesProfile {
  return { id, full_name, first_name, last_name };
}

function build(over: Partial<SalesCsvInput>) {
  return buildEventSalesCsv({ event, orders: [], tickets: [], tiers, profiles: [], tz: "UTC", now, ...over });
}

/** The data lines of a file: BOM and header stripped, the closing line break checked. */
function dataLines(csv: string): string[] {
  const lines = csv.replace(CSV_BOM, "").split("\r\n");
  expect(lines[0]).toBe(HEADER_LINE);
  expect(lines[lines.length - 1]).toBe("");
  return lines.slice(1, -1);
}

describe("the header", () => {
  it("is exactly the agreed columns, in order", () => {
    expect(SALES_CSV_HEADER).toHaveLength(19);
    const { csv, rowCount } = build({});
    expect(csv).toBe(`${CSV_BOM}${HEADER_LINE}\r\n`);
    expect(rowCount).toBe(0);
  });
});

describe("one line per ticket sold", () => {
  const o = order({
    id: "order-a", buyer_id: "buyer-a", buyer_email: "ann@example.com", quantity: 3, fee_cents: 480, total_cents: 6480,
    stripe_payment_intent_id: "pi_a", stripe_checkout_session_id: "cs_a",
  });
  const original1 = ticket({
    id: "t1", order_id: "order-a", buyer_id: "buyer-a", holder_first_name: "Ann", holder_last_name: "Lee", holder_email: "ann@example.com",
    status: "scanned", scanned_at: "2026-11-06T21:05:00Z", created_at: "2026-11-01T10:00:01Z",
  });
  const original2 = ticket({
    id: "t2", order_id: "order-a", buyer_id: "buyer-a", holder_first_name: "Bob", holder_last_name: "Lee", holder_email: "bob@example.com",
    status: "transferred", created_at: "2026-11-01T10:00:02Z",
  });
  const original3 = ticket({
    id: "t3", order_id: "order-a", buyer_id: "buyer-a", holder_first_name: "Cy", holder_last_name: "Lee", holder_email: "cy@example.com",
    created_at: "2026-11-01T10:00:03Z",
  });
  const resaleRow = ticket({
    id: "r1", order_id: "order-a", buyer_id: "buyer-r", holder_first_name: "Rick", holder_last_name: "Resale", holder_email: "rick@example.com",
    status: "scanned", scanned_at: "2026-11-06T22:00:00Z", created_at: "2026-11-03T12:00:00Z",
  });
  const imported = ticket({ id: "x1", order_id: "external-order", buyer_id: "buyer-x", holder_first_name: "Ex", holder_last_name: "Ternal" });
  const profiles = [profile("buyer-a", "Ann Lee"), profile("buyer-r", "Rick Resale")];

  it("writes the original rows in creation order, a resold seat with its current holder, and ignores tickets of no loaded order", () => {
    const { csv, rowCount } = build({ orders: [o], tickets: [original3, resaleRow, imported, original1, original2], profiles });
    expect(rowCount).toBe(3);
    expect(dataLines(csv)).toEqual([
      "order-a,2026-11-01 10:00,Ann Lee,ann@example.com,Standard,20.00,0.00,20.00,1.60,21.60,no,,pi_a,cs_a,paid,Ann Lee,ann@example.com,yes,2026-11-06 21:05",
      "order-a,2026-11-01 10:00,Ann Lee,ann@example.com,Standard,20.00,0.00,20.00,1.60,21.60,no,,pi_a,cs_a,resold,Rick Resale,rick@example.com,yes,2026-11-06 22:00",
      "order-a,2026-11-01 10:00,Ann Lee,ann@example.com,Standard,20.00,0.00,20.00,1.60,21.60,no,,pi_a,cs_a,paid,Cy Lee,cy@example.com,no,",
    ]);
  });

  it("skips orders that are neither paid nor refunded", () => {
    const pending = order({ id: "order-p", status: "pending" });
    const cancelled = order({ id: "order-c", status: "cancelled" });
    const expired = order({ id: "order-e", status: "expired" });
    const { csv, rowCount } = build({ orders: [pending, cancelled, expired, o], tickets: [original1, original2, original3, resaleRow], profiles });
    expect(rowCount).toBe(3);
    expect(dataLines(csv).every((line) => line.startsWith("order-a,"))).toBe(true);
  });

  it("names the buyer after the line's own row, not after the resale buyer's row", () => {
    const h = order({ id: "order-h", buyer_id: "buyer-h", buyer_email: "h@example.com" });
    const original = ticket({ order_id: "order-h", buyer_id: "buyer-h", holder_first_name: "Orig", holder_last_name: "Inal", status: "transferred", created_at: "2026-11-01T10:00:01Z" });
    const resale = ticket({ order_id: "order-h", buyer_id: "buyer-k", holder_first_name: "Rick", holder_last_name: "Resale", holder_email: "rick@example.com", created_at: "2026-11-02T10:00:01Z" });
    const cells = dataLines(build({ orders: [h], tickets: [resale, original] }).csv)[0].split(",");
    expect(cells[2]).toBe("Orig Inal");
    expect(cells[14]).toBe("resold");
    expect(cells[15]).toBe("Rick Resale");
    expect(cells[16]).toBe("rick@example.com");
  });
});

describe("a refunded order", () => {
  it("marks every line refunded, with the refund amount on the seats the buyer kept and 0.00 on a resold one", () => {
    const o = order({
      id: "order-b", buyer_id: "buyer-b", buyer_email: "bea@example.com", quantity: 2, unit_price_cents: 1000, fee_cents: 200, total_cents: 2200,
      status: "refunded", refunded_at: "2026-11-02T08:00:00Z", stripe_payment_intent_id: "pi_b", stripe_checkout_session_id: "cs_b",
    });
    const kept = ticket({ order_id: "order-b", buyer_id: "buyer-b", holder_first_name: "Bea", holder_last_name: "Bee", holder_email: "bea@example.com", status: "refunded", created_at: "2026-11-01T10:00:01Z" });
    const resold = ticket({ order_id: "order-b", buyer_id: "buyer-b", holder_first_name: "Bea", holder_last_name: "Bee", status: "transferred", created_at: "2026-11-01T10:00:02Z" });
    const holder = ticket({ order_id: "order-b", buyer_id: "buyer-n", holder_first_name: "New", holder_last_name: "Holder", holder_email: "new@example.com", created_at: "2026-11-02T10:00:00Z" });
    const { csv } = build({ orders: [o], tickets: [holder, resold, kept], profiles: [profile("buyer-b", "Bea Bee")] });
    expect(dataLines(csv)).toEqual([
      "order-b,2026-11-01 10:00,Bea Bee,bea@example.com,Standard,10.00,0.00,10.00,1.00,11.00,yes,11.00,pi_b,cs_b,refunded,Bea Bee,bea@example.com,no,",
      "order-b,2026-11-01 10:00,Bea Bee,bea@example.com,Standard,10.00,0.00,10.00,1.00,11.00,yes,0.00,pi_b,cs_b,resold,New Holder,new@example.com,no,",
    ]);
  });
});

describe("an order whose ticket rows do not match its quantity", () => {
  it("still has exactly quantity lines, the missing ones with empty ticket columns", () => {
    const o = order({
      id: "order-c", buyer_id: "buyer-c", buyer_email: "cal@example.com", quantity: 2, fee_cents: 320, total_cents: 4320, tier_id: "tier-vip",
      stripe_payment_intent_id: "pi_c", stripe_checkout_session_id: "cs_c",
    });
    const only = ticket({ order_id: "order-c", buyer_id: "buyer-c", tier_id: "tier-vip", holder_first_name: "Cal", holder_last_name: "Dee", holder_email: "cal@example.com" });
    const { csv, rowCount } = build({ orders: [o], tickets: [only], profiles: [profile("buyer-c", "Cal Dee")] });
    expect(rowCount).toBe(2);
    expect(dataLines(csv)).toEqual([
      "order-c,2026-11-01 10:00,Cal Dee,cal@example.com,VIP,20.00,0.00,20.00,1.60,21.60,no,,pi_c,cs_c,paid,Cal Dee,cal@example.com,no,",
      "order-c,2026-11-01 10:00,Cal Dee,cal@example.com,VIP,20.00,0.00,20.00,1.60,21.60,no,,pi_c,cs_c,paid,,,,",
    ]);
  });

  it("never writes more lines than the quantity", () => {
    const o = order({ id: "order-m", buyer_id: "buyer-m", quantity: 1 });
    const first = ticket({ order_id: "order-m", buyer_id: "buyer-m", holder_first_name: "One", holder_last_name: "Row", created_at: "2026-11-01T10:00:01Z" });
    const extra = ticket({ order_id: "order-m", buyer_id: "buyer-m", holder_first_name: "Two", holder_last_name: "Row", created_at: "2026-11-01T10:00:02Z" });
    const { csv, rowCount } = build({ orders: [o], tickets: [extra, first] });
    expect(rowCount).toBe(1);
    expect(dataLines(csv)[0].split(",")[15]).toBe("One Row");
  });
});

describe("sharing an order amount over its lines", () => {
  it("floors and gives the last line the remainder", () => {
    expect(shareCents(100, 3)).toEqual([33, 33, 34]);
    expect(shareCents(0, 2)).toEqual([0, 0]);
    expect(shareCents(7, 1)).toEqual([7]);
    expect(shareCents(5, 0)).toEqual([]);
  });

  it("makes the lines of an order sum to its total", () => {
    const o = order({ id: "order-d", buyer_id: "buyer-d", quantity: 3, unit_price_cents: 2000, discount_cents: 100, fee_cents: 100, total_cents: 6000 });
    const { csv } = build({ orders: [o], profiles: [profile("buyer-d", "Dee Dee")] });
    const cells = dataLines(csv).map((line) => line.split(","));
    expect(cells.map((c) => c[5])).toEqual(["20.00", "20.00", "20.00"]);
    expect(cells.map((c) => c[6])).toEqual(["0.33", "0.33", "0.34"]);
    expect(cells.map((c) => c[7])).toEqual(["19.67", "19.67", "19.66"]);
    expect(cells.map((c) => c[8])).toEqual(["0.33", "0.33", "0.34"]);
    expect(cells.map((c) => c[9])).toEqual(["20.00", "20.00", "20.00"]);
    const charged = cells.reduce((sum, c) => sum + Math.round(Number(c[9]) * 100), 0);
    expect(charged).toBe(o.total_cents);
  });
});

describe("payment references", () => {
  it("writes the Revolut reference and leaves a free order's payment columns empty", () => {
    const rev = order({ id: "order-r", buyer_id: "buyer-r", stripe_payment_intent_id: null, stripe_checkout_session_id: "revolut:abc-123" });
    const free = order({
      id: "order-0", buyer_id: "buyer-0", unit_price_cents: 0, fee_cents: 0, total_cents: 0,
      stripe_payment_intent_id: null, stripe_checkout_session_id: null, paid_at: "2026-11-02T10:00:00Z",
    });
    const cells = dataLines(build({ orders: [rev, free] }).csv).map((line) => line.split(","));
    expect(cells[0].slice(12, 14)).toEqual(["", "revolut:abc-123"]);
    expect(cells[1].slice(5, 10)).toEqual(["0.00", "0.00", "0.00", "0.00", "0.00"]);
    expect(cells[1].slice(12, 14)).toEqual(["", ""]);
  });
});

describe("the file", () => {
  it("starts with the byte-order mark and uses CRLF line breaks", () => {
    const { csv } = build({ orders: [order()] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("is named after the event slug and the export day", () => {
    expect(build({}).filename).toBe("midnight-party-sales-2026-11-07.csv");
  });
});

describe("dates in the browser's time zone", () => {
  it("writes the same instant differently in Europe/Paris and in UTC", () => {
    expect(formatInTz("2026-07-14T20:30:00Z", "Europe/Paris")).toBe("2026-07-14 22:30");
    expect(formatInTz("2026-07-14T20:30:00Z", "UTC")).toBe("2026-07-14 20:30");
    expect(formatInTz("2026-11-01T10:00:00Z", "Europe/Paris")).toBe("2026-11-01 11:00");
  });

  it("writes midnight as 00:00 on the right day", () => {
    expect(formatInTz("2026-11-07T23:00:00Z", "Europe/Paris")).toBe("2026-11-08 00:00");
    expect(formatInTz("2026-11-08T00:00:00Z", "UTC")).toBe("2026-11-08 00:00");
    expect(formatInTz("2026-11-08T00:00:00+01:00", "Europe/Paris")).toBe("2026-11-08 00:00");
  });

  it("is empty for a missing or unreadable instant", () => {
    expect(formatInTz(null, "UTC")).toBe("");
    expect(formatInTz(undefined, "UTC")).toBe("");
    expect(formatInTz("", "UTC")).toBe("");
    expect(formatInTz("whenever", "UTC")).toBe("");
  });

  it("uses the zone for the purchase date and the scan time of a file", () => {
    const o = order({ id: "order-e", buyer_id: "buyer-e", paid_at: "2026-07-14T20:30:00Z" });
    const row = ticket({ order_id: "order-e", buyer_id: "buyer-e", status: "scanned", scanned_at: "2026-07-14T23:30:00Z" });
    const paris = dataLines(build({ orders: [o], tickets: [row], tz: "Europe/Paris" }).csv)[0].split(",");
    const utc = dataLines(build({ orders: [o], tickets: [row], tz: "UTC" }).csv)[0].split(",");
    expect(paris[1]).toBe("2026-07-14 22:30");
    expect(utc[1]).toBe("2026-07-14 20:30");
    expect(paris[17]).toBe("yes");
    expect(paris[18]).toBe("2026-07-15 01:30");
    expect(utc[18]).toBe("2026-07-14 23:30");
  });

  it("dates a purchase from the order's creation when it was never marked paid", () => {
    const o = order({ id: "order-n", buyer_id: "buyer-n", paid_at: null, created_at: "2026-11-05T08:15:00Z" });
    expect(dataLines(build({ orders: [o] }).csv)[0].split(",")[1]).toBe("2026-11-05 08:15");
  });

  it("accepts a valid IANA zone and falls back to Europe/Paris otherwise", () => {
    expect(resolveTimeZone("Europe/London")).toBe("Europe/London");
    expect(resolveTimeZone("UTC")).toBe("UTC");
    expect(resolveTimeZone("Mars/Olympus")).toBe("Europe/Paris");
    expect(resolveTimeZone(undefined)).toBe("Europe/Paris");
    expect(resolveTimeZone("")).toBe("Europe/Paris");
    expect(resolveTimeZone(42)).toBe("Europe/Paris");
    expect(resolveTimeZone("Nowhere/Town", "UTC")).toBe("UTC");
  });
});

describe("the buyer name", () => {
  const withAttendee = order({ id: "order-f", buyer_id: "buyer-f", attendees: [{ first_name: "Att", last_name: "Endee", email: "att@example.com", gender: "other" }] });
  const row = ticket({ order_id: "order-f", buyer_id: "buyer-f", holder_first_name: "Hol", holder_last_name: "Der" });

  it("prefers the profile's full name, then its first and last names, then the ticket holder, then the first attendee", () => {
    expect(buyerName(withAttendee, profile("buyer-f", "Full Name", "First", "Last"), row)).toBe("Full Name");
    expect(buyerName(withAttendee, profile("buyer-f", "   ", "First", "Last"), row)).toBe("First Last");
    expect(buyerName(withAttendee, profile("buyer-f", "", null, "Last"), row)).toBe("Last");
    expect(buyerName(withAttendee, profile("buyer-f", "", null, null), row)).toBe("Hol Der");
    expect(buyerName(withAttendee, null, row)).toBe("Hol Der");
    expect(buyerName(withAttendee, null, null)).toBe("Att Endee");
    expect(buyerName(order({ attendees: null }), null, null)).toBe("");
    expect(buyerName(order({ attendees: "not a list" }), null, null)).toBe("");
    expect(buyerName(order({ attendees: [null] }), null, null)).toBe("");
  });

  it("neutralises a name a spreadsheet would run as a formula", () => {
    const o = order({ id: "order-g", buyer_id: "buyer-g", buyer_email: "g@example.com" });
    const row = ticket({ order_id: "order-g", buyer_id: "buyer-g", holder_first_name: "=1+1", holder_last_name: "Sum" });
    const { csv } = build({ orders: [o], tickets: [row], profiles: [profile("buyer-g", '=HYPERLINK("x")')] });
    const line = dataLines(csv)[0];
    expect(line).toContain(`,"'=HYPERLINK(""x"")",g@example.com,`);
    expect(line).toContain(",'=1+1 Sum,");
  });
});

describe("the order of the lines", () => {
  it("sorts by purchase date, then order id, and keeps the lines of an order together in seat order", () => {
    const z = order({ id: "order-z", buyer_id: "buyer-z", paid_at: "2026-11-03T10:00:00Z" });
    const y = order({ id: "order-y", buyer_id: "buyer-y", paid_at: null, created_at: "2026-11-02T10:00:00Z" });
    const x = order({ id: "order-x", buyer_id: "buyer-x", paid_at: "2026-11-02T10:00:00Z", created_at: "2026-10-31T10:00:00Z" });
    const w = order({ id: "order-w", buyer_id: "buyer-w", quantity: 2, fee_cents: 320, total_cents: 4320, paid_at: "2026-11-01T10:00:00Z" });
    const w2 = ticket({ order_id: "order-w", buyer_id: "buyer-w", holder_first_name: "Second", holder_last_name: "Row", created_at: "2026-11-01T10:00:02Z" });
    const w1 = ticket({ order_id: "order-w", buyer_id: "buyer-w", holder_first_name: "First", holder_last_name: "Row", created_at: "2026-11-01T10:00:01Z" });
    const cells = dataLines(build({ orders: [z, y, x, w], tickets: [w2, w1] }).csv).map((line) => line.split(","));
    expect(cells.map((c) => c[0])).toEqual(["order-w", "order-w", "order-x", "order-y", "order-z"]);
    expect(cells.slice(0, 2).map((c) => c[15])).toEqual(["First Row", "Second Row"]);
    expect(cells[2][1]).toBe("2026-11-02 10:00");
    expect(cells[3][1]).toBe("2026-11-02 10:00");
  });
});

describe("the module", () => {
  it("imports nothing but ./csv.ts and uses no Deno API, so Deno and vitest both run it", () => {
    const source = readFileSync("supabase/functions/_shared/eventSalesCsv.ts", "utf8");
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).toMatch(/from "\.\/csv\.ts";$/);
    expect(source).not.toMatch(/Deno\./);
  });
});
