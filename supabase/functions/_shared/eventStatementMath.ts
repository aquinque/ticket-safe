/**
 * The arithmetic of an event's financial statement, free of Stripe's SDK, Deno and the database so it can be unit
 * tested with plain fixtures (src/__tests__/eventStatement.test.ts).
 *
 * Money flow it describes (see stripe-connect-create-checkout): the buyer pays ticket price + service fee to the
 * platform's Stripe account (a destination charge). Stripe moves the ticket price to the organizer's connected
 * account at once (a transfer, `tr_`), the platform keeps the service fee (`application_fee_amount`) and pays
 * Stripe's processing fee out of it. A refund is issued on the platform and reverses the transfer in proportion.
 *
 * Every amount is an integer in the currency's minor unit (cents). Nothing here is recalculated from our orders:
 * the inputs are Stripe objects, normalised to the few fields the statement needs.
 */

// ── Normalised Stripe objects ─────────────────────────────────────────────

export interface StatementRefund {
  id: string;
  created: number;
  amount: number;
  currency: string;
  status: string | null;
  balanceTransactionId: string | null;
}

export interface StatementCharge {
  id: string;
  paymentIntentId: string | null;
  created: number;
  currency: string;
  /** What the buyer paid, service fee included. */
  amount: number;
  amountRefunded: number;
  /** TicketSafe's service fee, kept on the platform (0 for a charge without one). */
  applicationFee: number;
  /** The part of that fee given back to the buyer with a refund. */
  applicationFeeRefunded: number;
  /** Stripe's processing fee on this charge, charged to the platform. */
  stripeFee: number;
  /** The transfer that carried the ticket price to the organizer's connected account. */
  transferId: string | null;
  status: string;
  metadata: Record<string, string>;
  cardLast4: string | null;
  refunds: StatementRefund[];
}

/** A balance transaction of the organizer's connected account. */
export interface ConnectedBalanceTransaction {
  id: string;
  type: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
  /** The source object's id (py_ for a payment, pyr_ for a payment refund, po_ for a payout). */
  sourceId: string | null;
  /** For a payment: the platform transfer it came from (charge.source_transfer). */
  sourceTransferId: string | null;
  /** For a payment refund: the connected-account charge it refunds (refund.charge). */
  sourceChargeId: string | null;
}

export interface StatementPayout {
  id: string;
  created: number;
  arrivalDate: number | null;
  amount: number;
  currency: string;
  status: string;
  /** Last digits of the bank account, when Stripe expanded the destination. */
  bankLast4: string | null;
  bankName: string | null;
  automatic: boolean;
  balanceTransactionId: string | null;
}

// ── Reading Stripe objects ────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" ? (v as Raw) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v)?.id);
const metadataOf = (v: unknown): Record<string, string> => {
  const m = obj(v);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(m)) if (typeof val === "string") out[k] = val;
  return out;
};

/** The `event_id` a charge carries: on its own metadata, or on its PaymentIntent's when that was expanded. */
export function chargeEventId(raw: unknown): string | null {
  const c = obj(raw);
  if (!c) return null;
  const own = metadataOf(c.metadata).event_id;
  if (own) return own;
  const pi = obj(c.payment_intent);
  return pi ? metadataOf(pi.metadata).event_id ?? null : null;
}

/** Only the charges of this event, whatever else a search or list returned. */
export function chargesOfEvent(raws: unknown[], eventId: string): unknown[] {
  return raws.filter((raw) => chargeEventId(raw) === eventId);
}

/** A Stripe Charge (with balance_transaction and application_fee expanded when available) as the statement sees it. */
export function normalizeCharge(raw: unknown, refundsRaw: unknown[] = []): StatementCharge {
  const c = obj(raw) ?? {};
  const bt = obj(c.balance_transaction);
  const fee = obj(c.application_fee);
  const pmd = obj(c.payment_method_details);
  const card = obj(pmd?.card);
  return {
    id: str(c.id) ?? "",
    paymentIntentId: idOf(c.payment_intent),
    created: num(c.created),
    currency: (str(c.currency) ?? "eur").toLowerCase(),
    amount: num(c.amount),
    amountRefunded: num(c.amount_refunded),
    applicationFee: num(c.application_fee_amount, fee ? num(fee.amount) : 0),
    applicationFeeRefunded: fee ? num(fee.amount_refunded) : 0,
    stripeFee: bt ? num(bt.fee) : 0,
    transferId: idOf(c.transfer),
    status: str(c.status) ?? "unknown",
    metadata: metadataOf(c.metadata),
    cardLast4: str(card?.last4),
    refunds: refundsRaw.map(normalizeRefund),
  };
}

export function normalizeRefund(raw: unknown): StatementRefund {
  const r = obj(raw) ?? {};
  return {
    id: str(r.id) ?? "",
    created: num(r.created),
    amount: num(r.amount),
    currency: (str(r.currency) ?? "eur").toLowerCase(),
    status: str(r.status),
    balanceTransactionId: idOf(r.balance_transaction),
  };
}

/** A connected-account BalanceTransaction (with `source` expanded) as the statement sees it. */
export function normalizeBalanceTransaction(raw: unknown): ConnectedBalanceTransaction {
  const t = obj(raw) ?? {};
  const source = obj(t.source);
  return {
    id: str(t.id) ?? "",
    type: str(t.type) ?? "unknown",
    amount: num(t.amount),
    fee: num(t.fee),
    net: num(t.net),
    currency: (str(t.currency) ?? "eur").toLowerCase(),
    created: num(t.created),
    sourceId: idOf(t.source),
    sourceTransferId: source ? idOf(source.source_transfer) : null,
    sourceChargeId: source ? idOf(source.charge) : null,
  };
}

/** A connected-account Payout (with `destination` expanded when available) as the statement sees it. */
export function normalizePayout(raw: unknown): StatementPayout {
  const p = obj(raw) ?? {};
  const dest = obj(p.destination);
  return {
    id: str(p.id) ?? "",
    created: num(p.created),
    arrivalDate: typeof p.arrival_date === "number" ? p.arrival_date : null,
    amount: num(p.amount),
    currency: (str(p.currency) ?? "eur").toLowerCase(),
    status: str(p.status) ?? "unknown",
    bankLast4: str(dest?.last4),
    bankName: str(dest?.bank_name),
    automatic: p.automatic === true,
    balanceTransactionId: idOf(p.balance_transaction),
  };
}

// ── Which connected-account transactions belong to the event ──────────────

/**
 * The organizer's balance transactions that carry this event's money: the payments that arrived through the
 * event's transfers, and the refunds of those payments. Everything else on the account (other events, manual
 * cash-outs, payouts) is left out.
 */
export function connectedTransactionsOfEvent(
  all: ConnectedBalanceTransaction[],
  transferIds: Iterable<string>,
): ConnectedBalanceTransaction[] {
  const transfers = new Set(transferIds);
  const payments = all.filter((t) => t.type === "payment" && t.sourceTransferId !== null && transfers.has(t.sourceTransferId));
  const paymentChargeIds = new Set(payments.map((t) => t.sourceId).filter((id): id is string => id !== null));
  const refunds = all.filter((t) => t.type === "payment_refund" && t.sourceChargeId !== null && paymentChargeIds.has(t.sourceChargeId));
  return [...payments, ...refunds].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

// ── Totals ────────────────────────────────────────────────────────────────

export interface CurrencyTotals {
  currency: string;
  /** Payments that went through (refunded ones included). */
  chargesCount: number;
  /** Tickets on the payments that were not refunded in full. */
  ticketsSold: number;
  /** Everything the buyers paid, service fee included. */
  grossCents: number;
  refundsCount: number;
  refundedCents: number;
  /** TicketSafe's service fee kept after refunds. */
  ticketSafeFeeCents: number;
  /** Stripe's processing fees on these payments, paid by TicketSafe out of its fee. */
  stripeFeeCents: number;
  /** What reached the organizer's Stripe balance for this event, after refunds. */
  netToOrganizerCents: number;
  /**
   * Where the net comes from: the connected account's own balance transactions when they were found, otherwise
   * the platform-side arithmetic (gross - refunds - service fee).
   */
  netSource: "connected_account" | "platform";
}

export interface StatementTransactionRow {
  date: number;
  type: "charge" | "refund";
  currency: string;
  /** Positive for a payment, negative for a refund. */
  grossCents: number;
  /** TicketSafe's service fee on this row (negative on a refund that gave it back). */
  ticketSafeFeeCents: number;
  /** What it changed on the organizer's balance. */
  netCents: number;
  /** pi_… when the charge has one, else ch_…; re_… for a refund. */
  reference: string;
  chargeId: string;
  cardLast4: string | null;
  /** A refund whose own balance transaction could not be matched is estimated in proportion. */
  estimated: boolean;
}

/** How many tickets a payment covers: Stripe's `quantity` metadata first, else the order it belongs to. */
export function ticketsOnCharge(charge: StatementCharge, orderQuantities: ReadonlyMap<string, number>): number {
  const fromMetadata = parseInt(charge.metadata.quantity ?? "", 10);
  if (Number.isFinite(fromMetadata) && fromMetadata > 0) return fromMetadata;
  const orderId = charge.metadata.order_id;
  const fromOrder = orderId ? orderQuantities.get(orderId) : undefined;
  return fromOrder && fromOrder > 0 ? fromOrder : 1;
}

/** A refund's share of the service fee that was given back, in proportion to its amount. */
function feeRefundedOn(refund: StatementRefund, charge: StatementCharge): number {
  if (charge.applicationFeeRefunded <= 0 || charge.amountRefunded <= 0) return 0;
  return Math.round((charge.applicationFeeRefunded * refund.amount) / charge.amountRefunded);
}

/** What a refund pulls back from the organizer: the transfer (ticket price) in proportion to the refunded amount. */
function pulledBackOn(refund: StatementRefund, charge: StatementCharge): number {
  if (charge.amount <= 0) return 0;
  return Math.round(((charge.amount - charge.applicationFee) * refund.amount) / charge.amount);
}

export interface AggregateInput {
  charges: StatementCharge[];
  /** The organizer's balance transactions for this event (connectedTransactionsOfEvent). */
  connected: ConnectedBalanceTransaction[];
  orderQuantities?: ReadonlyMap<string, number>;
}

export interface AggregateOutput {
  totals: CurrencyTotals[];
  rows: StatementTransactionRow[];
}

/** The summary per currency and the detail rows, from the event's charges and the organizer's balance transactions. */
export function aggregate(input: AggregateInput): AggregateOutput {
  const quantities = input.orderQuantities ?? new Map<string, number>();
  const succeeded = input.charges.filter((c) => c.status === "succeeded");
  const byCurrency = new Map<string, CurrencyTotals>();
  const totalsFor = (currency: string): CurrencyTotals => {
    let t = byCurrency.get(currency);
    if (!t) {
      t = {
        currency,
        chargesCount: 0,
        ticketsSold: 0,
        grossCents: 0,
        refundsCount: 0,
        refundedCents: 0,
        ticketSafeFeeCents: 0,
        stripeFeeCents: 0,
        netToOrganizerCents: 0,
        netSource: "platform",
      };
      byCurrency.set(currency, t);
    }
    return t;
  };

  // The connected account's own view of each payment and refund, by the transfer / charge they belong to.
  const connectedPayments = new Map<string, ConnectedBalanceTransaction>();
  const connectedRefundsByCharge = new Map<string, ConnectedBalanceTransaction[]>();
  for (const t of input.connected) {
    if (t.type === "payment" && t.sourceTransferId) connectedPayments.set(t.sourceTransferId, t);
    if (t.type === "payment_refund" && t.sourceChargeId) {
      const list = connectedRefundsByCharge.get(t.sourceChargeId) ?? [];
      list.push(t);
      connectedRefundsByCharge.set(t.sourceChargeId, list);
    }
  }
  const connectedNetByCurrency = new Map<string, number>();
  for (const t of input.connected) connectedNetByCurrency.set(t.currency, (connectedNetByCurrency.get(t.currency) ?? 0) + t.net);

  const rows: StatementTransactionRow[] = [];
  for (const charge of succeeded) {
    const t = totalsFor(charge.currency);
    const fullyRefunded = charge.amountRefunded >= charge.amount && charge.amount > 0;
    t.chargesCount += 1;
    if (!fullyRefunded) t.ticketsSold += ticketsOnCharge(charge, quantities);
    t.grossCents += charge.amount;
    t.ticketSafeFeeCents += charge.applicationFee - charge.applicationFeeRefunded;
    t.stripeFeeCents += charge.stripeFee;

    const payment = charge.transferId ? connectedPayments.get(charge.transferId) : undefined;
    rows.push({
      date: charge.created,
      type: "charge",
      currency: charge.currency,
      grossCents: charge.amount,
      ticketSafeFeeCents: charge.applicationFee,
      netCents: payment ? payment.net : charge.amount - charge.applicationFee,
      reference: charge.paymentIntentId ?? charge.id,
      chargeId: charge.id,
      cardLast4: charge.cardLast4,
      estimated: false,
    });

    const connectedRefunds = payment?.sourceId ? [...(connectedRefundsByCharge.get(payment.sourceId) ?? [])] : [];
    for (const refund of [...charge.refunds].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
      if (refund.status === "failed" || refund.status === "canceled") continue;
      t.refundsCount += 1;
      t.refundedCents += refund.amount;
      const feeBack = feeRefundedOn(refund, charge);
      // Stripe reverses the transfer in proportion to the refund, whether or not the service fee is given back
      // (that part comes from the platform). The connected-account refund that matches is the one of that amount.
      const pulledBack = pulledBackOn(refund, charge);
      const matchIndex = connectedRefunds.findIndex((r) => -r.amount === pulledBack);
      const matched = matchIndex >= 0 ? connectedRefunds.splice(matchIndex, 1)[0] : undefined;
      rows.push({
        date: refund.created,
        type: "refund",
        currency: refund.currency,
        grossCents: 0 - refund.amount,
        ticketSafeFeeCents: 0 - feeBack,
        netCents: matched ? matched.net : 0 - pulledBack,
        reference: refund.id,
        chargeId: charge.id,
        cardLast4: charge.cardLast4,
        estimated: !matched,
      });
    }
  }

  for (const t of byCurrency.values()) {
    const connectedNet = connectedNetByCurrency.get(t.currency);
    // A payment that never went through a transfer (a platform charge from before Connect) is not on the
    // connected account: its share is added from the platform side.
    const withoutTransfer = succeeded
      .filter((c) => c.currency === t.currency && !c.transferId)
      .reduce((s, c) => s + c.amount - c.amountRefunded - (c.applicationFee - c.applicationFeeRefunded), 0);
    if (connectedNet !== undefined) {
      t.netToOrganizerCents = connectedNet + withoutTransfer;
      t.netSource = "connected_account";
    } else {
      t.netToOrganizerCents = t.grossCents - t.refundedCents - t.ticketSafeFeeCents;
      t.netSource = "platform";
    }
  }

  rows.sort((a, b) => a.date - b.date || a.reference.localeCompare(b.reference));
  const totals = [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return { totals, rows };
}

// ── Payouts ───────────────────────────────────────────────────────────────

export interface PayoutAttachment {
  /** Payout ids our payout jobs recorded for this event. */
  jobPayoutIds?: Iterable<string>;
  /** For each payout Stripe was asked about, the ids of the balance transactions it carried. */
  balanceTransactionIdsByPayout?: ReadonlyMap<string, Iterable<string>>;
  /** The event's own balance transactions on the connected account. */
  eventTransactionIds: Iterable<string>;
}

/**
 * The payouts that carried this event's money to the organizer's bank: the ones our payout jobs sent for the
 * event, plus any payout whose balance transactions include one of the event's. Failed and cancelled payouts are
 * kept (they show in the list with their status); duplicates are not.
 */
export function payoutsOfEvent(payouts: StatementPayout[], attachment: PayoutAttachment): StatementPayout[] {
  const fromJobs = new Set(attachment.jobPayoutIds ?? []);
  const eventTx = new Set(attachment.eventTransactionIds);
  const out: StatementPayout[] = [];
  for (const payout of payouts) {
    let belongs = fromJobs.has(payout.id);
    if (!belongs) {
      const carried = attachment.balanceTransactionIdsByPayout?.get(payout.id);
      if (carried) for (const id of carried) if (eventTx.has(id)) { belongs = true; break; }
    }
    if (belongs && !out.some((p) => p.id === payout.id)) out.push(payout);
  }
  return out.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}

// ── Reconciliation with our own orders ────────────────────────────────────

export interface Reconciliation {
  discrepancy: boolean;
  stripeGrossCents: number;
  dbGrossCents: number;
  stripeRefundedCents: number;
  dbRefundedCents: number;
  /** Order ids our database holds for the event that no Stripe charge mentions, and the other way round. */
  ordersWithoutCharge: string[];
  chargesWithoutOrder: string[];
}

export interface DbOrderForReconciliation {
  id: string;
  status: string;
  totalCents: number;
}

/**
 * Stripe's figures against our orders for the same event. Only the gross amounts and the set of orders are
 * compared: a difference means a payment our database does not know of, or an order we think was paid that Stripe
 * never charged. The statement is produced with Stripe's figures either way; the flag is for the admins.
 */
export function reconcile(charges: StatementCharge[], orders: DbOrderForReconciliation[]): Reconciliation {
  const succeeded = charges.filter((c) => c.status === "succeeded");
  const stripeGrossCents = succeeded.reduce((s, c) => s + c.amount, 0);
  const stripeRefundedCents = succeeded.reduce((s, c) => s + c.amountRefunded, 0);
  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "refunded");
  const dbGrossCents = paidOrders.reduce((s, o) => s + o.totalCents, 0);
  const dbRefundedCents = orders.filter((o) => o.status === "refunded").reduce((s, o) => s + o.totalCents, 0);
  const chargedOrderIds = new Set(succeeded.map((c) => c.metadata.order_id).filter((id): id is string => !!id));
  const dbOrderIds = new Set(paidOrders.map((o) => o.id));
  const ordersWithoutCharge = paidOrders.filter((o) => o.totalCents > 0 && !chargedOrderIds.has(o.id)).map((o) => o.id).sort();
  const chargesWithoutOrder = succeeded
    .filter((c) => c.metadata.order_id && !dbOrderIds.has(c.metadata.order_id))
    .map((c) => c.id)
    .sort();
  return {
    discrepancy: stripeGrossCents !== dbGrossCents || ordersWithoutCharge.length > 0 || chargesWithoutOrder.length > 0,
    stripeGrossCents,
    dbGrossCents,
    stripeRefundedCents,
    dbRefundedCents,
    ordersWithoutCharge,
    chargesWithoutOrder,
  };
}

// ── Idempotence ───────────────────────────────────────────────────────────

/** FNV-1a over a string, 64-bit, as 16 hex characters. Deterministic everywhere, no crypto needed. */
export function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * A fingerprint of everything that can change the statement's figures: the charges, their refunds, the
 * organizer's transactions and the payouts with their statuses. The live balance and the generation time are left
 * out on purpose, so running the job twice on the same data yields the same fingerprint and no second file.
 */
export function statementFingerprint(input: {
  charges: StatementCharge[];
  connected: ConnectedBalanceTransaction[];
  payouts: StatementPayout[];
}): string {
  const charges = [...input.charges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => [
      c.id,
      c.status,
      c.amount,
      c.amountRefunded,
      c.applicationFee,
      c.applicationFeeRefunded,
      c.stripeFee,
      c.transferId ?? "",
      [...c.refunds].sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}:${r.amount}:${r.status ?? ""}`).join(","),
    ].join("|"));
  const connected = [...input.connected].sort((a, b) => a.id.localeCompare(b.id)).map((t) => `${t.id}|${t.type}|${t.amount}|${t.net}`);
  const payouts = [...input.payouts].sort((a, b) => a.id.localeCompare(b.id)).map((p) => `${p.id}|${p.status}|${p.amount}|${p.arrivalDate ?? ""}`);
  return fnv1a64(["v1", ...charges, "--", ...connected, "--", ...payouts].join("\n"));
}

// ── Formatting ────────────────────────────────────────────────────────────

/** Minor units of a currency (2 for EUR; Stripe's zero-decimal currencies have 0). */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

/** "€12.50", "-€3.00", "¥1,200": the currency's own symbol, English digits. */
/**
 * Printed at the foot of every statement page. TicketSafe is VAT-exempt on its service fees
 * (franchise en base, art. 293 B CGI); the VAT regime of the ticket revenue is the organizer's.
 */
export const STATEMENT_VAT_LINE =
  "VAT: not applicable on TicketSafe service fees (art. 293 B CGI). VAT treatment of ticket revenue is the organizer's responsibility.";

export function formatMoney(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const digits = ZERO_DECIMAL.has(currency.toLowerCase()) ? 0 : 2;
  const value = cents / 10 ** digits;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code, currencyDisplay: "narrowSymbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${code}`;
  }
}

const PARIS = "Europe/Paris";

/** "6 Nov 2026" in Paris time, from a unix timestamp (seconds) or an ISO string. */
export function formatDateEn(value: number | string | null | undefined): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, day: "numeric", month: "short", year: "numeric" }).format(d) : "—";
}

/** "6 Nov 2026, 23:01" in Paris time. */
export function formatDateTimeEn(value: number | string | null | undefined): string {
  const d = toDate(value);
  return d
    ? new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
    : "—";
}

function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
