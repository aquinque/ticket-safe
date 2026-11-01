import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  aggregate,
  chargeEventId,
  chargesOfEvent,
  connectedTransactionsOfEvent,
  fnv1a64,
  formatDateEn,
  formatMoney,
  normalizeBalanceTransaction,
  normalizeCharge,
  normalizePayout,
  normalizeRefund,
  payoutsOfEvent,
  reconcile,
  statementFingerprint,
  ticketsOnCharge,
  type StatementCharge,
} from "../../supabase/functions/_shared/eventStatementMath";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const EVENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** A Stripe Charge as charges.search returns it with balance_transaction and application_fee expanded. */
function rawCharge(over: Record<string, unknown> = {}) {
  return {
    id: "ch_1",
    object: "charge",
    amount: 2500, // €25.00: a €23.20 ticket + €1.80 service fee
    amount_refunded: 0,
    application_fee: { id: "fee_1", object: "application_fee", amount: 180, amount_refunded: 0 },
    application_fee_amount: 180,
    balance_transaction: { id: "txn_p1", object: "balance_transaction", amount: 2500, fee: 61, net: 2439 },
    created: 1_762_000_000,
    currency: "eur",
    metadata: { source: "stripe_connect_studio_sale", order_id: "order-1", event_id: EVENT },
    payment_intent: "pi_1",
    payment_method_details: { card: { last4: "4242", brand: "visa" }, type: "card" },
    status: "succeeded",
    transfer: "tr_1",
    ...over,
  };
}

function rawRefund(over: Record<string, unknown> = {}) {
  return { id: "re_1", object: "refund", amount: 2500, balance_transaction: "txn_pr1", charge: "ch_1", created: 1_762_100_000, currency: "eur", status: "succeeded", ...over };
}

/** The organizer's connected-account balance transactions, `source` expanded. */
const connectedRaw = [
  { id: "txn_c1", object: "balance_transaction", type: "payment", amount: 2320, fee: 0, net: 2320, currency: "eur", created: 1_762_000_001, source: { id: "py_1", object: "charge", source_transfer: "tr_1" } },
  { id: "txn_c2", object: "balance_transaction", type: "payment", amount: 1500, fee: 0, net: 1500, currency: "eur", created: 1_762_000_002, source: { id: "py_2", object: "charge", source_transfer: "tr_2" } },
  { id: "txn_c3", object: "balance_transaction", type: "payment", amount: 9900, fee: 0, net: 9900, currency: "eur", created: 1_762_000_003, source: { id: "py_other", object: "charge", source_transfer: "tr_other" } },
  { id: "txn_c4", object: "balance_transaction", type: "payment_refund", amount: -2320, fee: 0, net: -2320, currency: "eur", created: 1_762_100_001, source: { id: "pyr_1", object: "refund", charge: "py_1" } },
  { id: "txn_c5", object: "balance_transaction", type: "payout", amount: -1500, fee: 0, net: -1500, currency: "eur", created: 1_762_200_000, source: { id: "po_1", object: "payout" } },
];

describe("finding the event's payments", () => {
  it("reads event_id from the charge's metadata, or from its payment intent's when the charge has none", () => {
    expect(chargeEventId(rawCharge())).toBe(EVENT);
    expect(chargeEventId(rawCharge({ metadata: {}, payment_intent: { id: "pi_1", metadata: { event_id: OTHER } } }))).toBe(OTHER);
    expect(chargeEventId(rawCharge({ metadata: {}, payment_intent: "pi_1" }))).toBeNull();
    expect(chargeEventId(null)).toBeNull();
  });

  it("keeps only the charges of the requested event", () => {
    const raws = [rawCharge(), rawCharge({ id: "ch_2", metadata: { event_id: OTHER } }), rawCharge({ id: "ch_3", metadata: {} })];
    expect(chargesOfEvent(raws, EVENT).map((c) => (c as { id: string }).id)).toEqual(["ch_1"]);
    expect(chargesOfEvent(raws, OTHER).map((c) => (c as { id: string }).id)).toEqual(["ch_2"]);
  });

  it("normalises a charge with its expanded fee objects, its card and its refunds", () => {
    const c = normalizeCharge(rawCharge({ amount_refunded: 2500, application_fee: { amount: 180, amount_refunded: 180 } }), [rawRefund()]);
    expect(c).toMatchObject({
      id: "ch_1", paymentIntentId: "pi_1", currency: "eur", amount: 2500, amountRefunded: 2500,
      applicationFee: 180, applicationFeeRefunded: 180, stripeFee: 61, transferId: "tr_1", status: "succeeded", cardLast4: "4242",
    });
    expect(c.refunds).toEqual([{ id: "re_1", created: 1_762_100_000, amount: 2500, currency: "eur", status: "succeeded", balanceTransactionId: "txn_pr1" }]);
    // unexpanded references still give ids; missing pieces give nulls and zeros, never NaN
    const bare = normalizeCharge({ id: "ch_9", amount: 1000, currency: "EUR", status: "succeeded", payment_intent: { id: "pi_9" }, transfer: { id: "tr_9" } });
    expect(bare).toMatchObject({ paymentIntentId: "pi_9", transferId: "tr_9", applicationFee: 0, stripeFee: 0, cardLast4: null, amountRefunded: 0, currency: "eur" });
    expect(normalizeRefund({ id: "re_x", amount: 5 }).balanceTransactionId).toBeNull();
  });
});

describe("the organizer's own transactions", () => {
  const connected = connectedRaw.map(normalizeBalanceTransaction);

  it("keeps the payments that came through the event's transfers, and the refunds of those payments", () => {
    const mine = connectedTransactionsOfEvent(connected, ["tr_1", "tr_2"]);
    expect(mine.map((t) => t.id)).toEqual(["txn_c1", "txn_c2", "txn_c4"]);
  });

  it("leaves out other events' payments, their refunds and the payouts", () => {
    expect(connectedTransactionsOfEvent(connected, ["tr_other"]).map((t) => t.id)).toEqual(["txn_c3"]);
    expect(connectedTransactionsOfEvent(connected, []).map((t) => t.id)).toEqual([]);
  });

  it("reads the transfer and the refunded charge from the expanded source", () => {
    expect(connected[0]).toMatchObject({ type: "payment", sourceId: "py_1", sourceTransferId: "tr_1", net: 2320 });
    expect(connected[3]).toMatchObject({ type: "payment_refund", sourceId: "pyr_1", sourceChargeId: "py_1", net: -2320 });
  });
});

describe("the totals", () => {
  const charges: StatementCharge[] = [
    normalizeCharge(rawCharge({ amount_refunded: 2500, application_fee: { amount: 180, amount_refunded: 0 } }), [rawRefund()]), // fully refunded, fee kept
    normalizeCharge(rawCharge({ id: "ch_2", amount: 1680, application_fee_amount: 180, application_fee: { amount: 180, amount_refunded: 0 }, balance_transaction: { fee: 49 }, transfer: "tr_2", payment_intent: "pi_2", metadata: { order_id: "order-2", event_id: EVENT, quantity: "2" } })),
    normalizeCharge(rawCharge({ id: "ch_3", status: "failed", amount: 999, transfer: null, payment_intent: "pi_3", metadata: { order_id: "order-3", event_id: EVENT } })),
  ];
  const connected = connectedTransactionsOfEvent(connectedRaw.map(normalizeBalanceTransaction), ["tr_1", "tr_2"]);

  it("counts tickets, gross sales, refunds, both kinds of fees and the net, from Stripe's own numbers", () => {
    const { totals } = aggregate({ charges, connected, orderQuantities: new Map([["order-1", 1]]) });
    expect(totals).toHaveLength(1);
    expect(totals[0]).toEqual({
      currency: "eur",
      chargesCount: 2, // the failed payment is not a sale
      ticketsSold: 2, // ch_2's two tickets; ch_1 was refunded in full
      grossCents: 4180, // 2500 + 1680
      refundsCount: 1,
      refundedCents: 2500,
      ticketSafeFeeCents: 360, // 180 kept on each (the refund gave no fee back)
      stripeFeeCents: 110, // 61 + 49, paid by TicketSafe
      netToOrganizerCents: 1500, // 2320 + 1500 - 2320 on the connected account
      netSource: "connected_account",
    });
  });

  it("falls back to platform arithmetic when the connected account's transactions are not there", () => {
    const { totals } = aggregate({ charges, connected: [] });
    expect(totals[0].netToOrganizerCents).toBe(4180 - 2500 - 360);
    expect(totals[0].netSource).toBe("platform");
  });

  it("gives one row per payment and per refund, dated, with the card's last digits and no buyer identity", () => {
    const { rows } = aggregate({ charges, connected });
    expect(rows.map((r) => [r.type, r.reference, r.grossCents, r.ticketSafeFeeCents, r.netCents, r.cardLast4, r.estimated])).toEqual([
      ["charge", "pi_1", 2500, 180, 2320, "4242", false],
      ["charge", "pi_2", 1680, 180, 1500, "4242", false],
      ["refund", "re_1", -2500, 0, -2320, "4242", false],
    ]);
    const joined = JSON.stringify(rows);
    expect(joined).not.toMatch(/@|email|name/i);
  });

  it("attributes a refunded service fee to the refund, and estimates a refund the connected account has not shown yet", () => {
    const halfBack = normalizeCharge(
      rawCharge({ amount_refunded: 1250, application_fee: { amount: 180, amount_refunded: 90 } }),
      [rawRefund({ amount: 1250 })],
    );
    const { rows, totals } = aggregate({ charges: [halfBack], connected: connectedTransactionsOfEvent(connectedRaw.map(normalizeBalanceTransaction), ["tr_1"]).filter((t) => t.type === "payment") });
    const refund = rows.find((r) => r.type === "refund")!;
    expect(refund).toMatchObject({ grossCents: -1250, ticketSafeFeeCents: -90, netCents: -1160, estimated: true });
    expect(totals[0].ticketSafeFeeCents).toBe(90);
  });

  it("keeps currencies apart", () => {
    const gbp = normalizeCharge(rawCharge({ id: "ch_gbp", currency: "gbp", amount: 1000, application_fee_amount: 100, application_fee: { amount: 100, amount_refunded: 0 }, balance_transaction: { fee: 30 }, transfer: "tr_gbp", payment_intent: "pi_gbp" }));
    const { totals } = aggregate({ charges: [charges[1], gbp], connected: [] });
    expect(totals.map((t) => [t.currency, t.grossCents, t.netToOrganizerCents])).toEqual([["eur", 1680, 1500], ["gbp", 1000, 900]]);
  });

  it("takes the ticket count from Stripe's quantity metadata first, then from the order, then one", () => {
    const base = normalizeCharge(rawCharge());
    expect(ticketsOnCharge({ ...base, metadata: { quantity: "3" } }, new Map())).toBe(3);
    expect(ticketsOnCharge({ ...base, metadata: { order_id: "order-1" } }, new Map([["order-1", 4]]))).toBe(4);
    expect(ticketsOnCharge({ ...base, metadata: {} }, new Map())).toBe(1);
  });
});

describe("the payouts", () => {
  const payouts = [
    { id: "po_1", object: "payout", amount: 1500, arrival_date: 1_762_300_000, created: 1_762_200_000, currency: "eur", status: "paid", automatic: false, destination: { id: "ba_1", object: "bank_account", last4: "1234", bank_name: "BNP" }, balance_transaction: "txn_c5" },
    { id: "po_2", object: "payout", amount: 9900, created: 1_762_250_000, currency: "eur", status: "paid", destination: "ba_1" },
    { id: "po_3", object: "payout", amount: 500, created: 1_762_260_000, currency: "eur", status: "failed", destination: "ba_1" },
  ].map(normalizePayout);

  it("reads the bank's last digits when the destination is expanded", () => {
    expect(payouts[0]).toMatchObject({ id: "po_1", amount: 1500, status: "paid", bankLast4: "1234", bankName: "BNP", arrivalDate: 1_762_300_000, balanceTransactionId: "txn_c5" });
    expect(payouts[1].bankLast4).toBeNull();
  });

  it("attaches a payout through our payout job, or through the event's transactions it carried, never twice", () => {
    const mine = payoutsOfEvent(payouts, {
      jobPayoutIds: ["po_3"],
      balanceTransactionIdsByPayout: new Map([["po_1", ["txn_c1", "txn_c2", "txn_c4"]], ["po_2", ["txn_c3"]], ["po_3", ["txn_c2"]]]),
      eventTransactionIds: ["txn_c1", "txn_c2", "txn_c4"],
    });
    expect(mine.map((p) => p.id)).toEqual(["po_1", "po_3"]);
  });

  it("attaches nothing without a job or a shared transaction", () => {
    expect(payoutsOfEvent(payouts, { eventTransactionIds: ["txn_c1"] })).toEqual([]);
  });
});

describe("reconciliation with our orders", () => {
  const charges = [normalizeCharge(rawCharge()), normalizeCharge(rawCharge({ id: "ch_2", amount: 1680, transfer: "tr_2", payment_intent: "pi_2", metadata: { order_id: "order-2", event_id: EVENT } }))];

  it("is quiet when Stripe and the database agree", () => {
    const r = reconcile(charges, [{ id: "order-1", status: "paid", totalCents: 2500 }, { id: "order-2", status: "paid", totalCents: 1680 }, { id: "order-free", status: "paid", totalCents: 0 }]);
    expect(r.discrepancy).toBe(false);
    expect(r).toMatchObject({ stripeGrossCents: 4180, dbGrossCents: 4180, ordersWithoutCharge: [], chargesWithoutOrder: [] });
  });

  it("flags an amount that differs, an order Stripe never charged, or a charge we have no order for", () => {
    expect(reconcile(charges, [{ id: "order-1", status: "paid", totalCents: 2500 }, { id: "order-2", status: "paid", totalCents: 1600 }]).discrepancy).toBe(true);
    const missing = reconcile(charges, [{ id: "order-1", status: "paid", totalCents: 2500 }, { id: "order-2", status: "paid", totalCents: 1680 }, { id: "order-3", status: "paid", totalCents: 900 }]);
    expect(missing.discrepancy).toBe(true);
    expect(missing.ordersWithoutCharge).toEqual(["order-3"]);
    const extra = reconcile(charges, [{ id: "order-1", status: "paid", totalCents: 2500 }]);
    expect(extra.chargesWithoutOrder).toEqual(["ch_2"]);
  });

  it("ignores failed charges and pending orders", () => {
    const withFailed = [...charges, normalizeCharge(rawCharge({ id: "ch_f", status: "failed", amount: 5000, metadata: { order_id: "order-f", event_id: EVENT } }))];
    const r = reconcile(withFailed, [{ id: "order-1", status: "paid", totalCents: 2500 }, { id: "order-2", status: "paid", totalCents: 1680 }, { id: "order-f", status: "cancelled", totalCents: 5000 }]);
    expect(r.discrepancy).toBe(false);
  });
});

describe("idempotence", () => {
  const base = () => ({
    charges: [normalizeCharge(rawCharge())],
    connected: connectedTransactionsOfEvent(connectedRaw.map(normalizeBalanceTransaction), ["tr_1"]),
    payouts: [normalizePayout({ id: "po_1", amount: 2320, created: 1, currency: "eur", status: "paid" })],
  });

  it("gives the same fingerprint for the same data, whatever the order and the time", () => {
    const a = statementFingerprint(base());
    const shuffled = base();
    shuffled.connected.reverse();
    expect(statementFingerprint(shuffled)).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a refund, a payout or a payout's status appears", () => {
    const a = statementFingerprint(base());
    const refunded = base();
    refunded.charges[0] = normalizeCharge(rawCharge({ amount_refunded: 2500 }), [rawRefund()]);
    expect(statementFingerprint(refunded)).not.toBe(a);
    const paid = base();
    paid.payouts[0] = { ...paid.payouts[0], status: "in_transit" };
    expect(statementFingerprint(paid)).not.toBe(a);
    const more = base();
    more.payouts.push(normalizePayout({ id: "po_2", amount: 1, created: 2, currency: "eur", status: "paid" }));
    expect(statementFingerprint(more)).not.toBe(a);
  });

  it("hashes deterministically", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
  });
});

describe("formatting", () => {
  it("writes money in the currency's symbol with two decimals, zero for yen", () => {
    expect(formatMoney(2500, "eur")).toBe("€25.00");
    expect(formatMoney(-320, "eur")).toBe("-€3.20");
    expect(formatMoney(123456, "gbp")).toBe("£1,234.56");
    expect(formatMoney(1200, "jpy")).toBe("¥1,200");
  });

  it("writes dates in Paris time, in English", () => {
    expect(formatDateEn(1_762_000_000)).toBe("1 Nov 2025");
    expect(formatDateEn("2026-11-06T23:01:00+00:00")).toBe("7 Nov 2026");
    expect(formatDateEn(null)).toBe("—");
  });
});

describe("the module stays testable", () => {
  it("imports nothing from Deno, Stripe's SDK or the database", () => {
    const source = read("supabase/functions/_shared/eventStatementMath.ts");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/Deno\.|supabase|stripe\./);
  });
});
