/**
 * Everything an event's financial statement needs, read from Stripe (never recalculated from our orders):
 *
 *  - the event's payments: the platform's charges carrying `metadata.event_id` (charges.search), with their
 *    balance transaction (Stripe's fee), application fee (TicketSafe's fee, and what was refunded of it) and
 *    refunds;
 *  - the organizer's side: the connected account's balance transactions, kept to the payments that came through
 *    the event's transfers and their refunds (balanceTransactions.list with the source expanded);
 *  - the payouts to the organizer's bank that carried that money (payouts.list, matched through our payout jobs
 *    and through the balance transactions each payout contains);
 *  - the connected account's balance at this moment (balance.retrieve).
 *
 * The orders in our database are read for two things only: how many tickets a payment covers when Stripe's
 * metadata does not say, and the reconciliation flag for the admins.
 */
import type Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chargesOfEvent,
  connectedTransactionsOfEvent,
  normalizeBalanceTransaction,
  normalizeCharge,
  normalizePayout,
  payoutsOfEvent,
  type ConnectedBalanceTransaction,
  type DbOrderForReconciliation,
  type StatementCharge,
  type StatementPayout,
} from "./eventStatementMath.ts";

export interface BalanceLine {
  currency: string;
  amountCents: number;
}

export interface CollectedStatementData {
  charges: StatementCharge[];
  /** The organizer's balance transactions for this event only. */
  connected: ConnectedBalanceTransaction[];
  /** The organizer's payouts that carried this event's money. */
  payouts: StatementPayout[];
  balance: { available: BalanceLine[]; pending: BalanceLine[] };
  orderQuantities: Map<string, number>;
  dbOrders: DbOrderForReconciliation[];
  /** First payment and last movement, unix seconds; null without any. */
  period: { start: number | null; end: number | null };
  /** How many requests went to Stripe, for the logs. */
  stripeCalls: number;
}

/** Payouts of this many at most are asked for their balance transactions, so a busy account cannot stall the job. */
const MAX_PAYOUTS_TO_INSPECT = 40;
const DAY = 86_400;

type ListPromise<T> = { autoPagingToArray(opts: { limit: number }): Promise<T[]> };

export async function collectEventStatementData(
  stripe: Stripe,
  supabase: SupabaseClient,
  eventId: string,
  stripeAccountId: string,
): Promise<CollectedStatementData> {
  let stripeCalls = 0;
  const opts = { stripeAccount: stripeAccountId };

  // ── The event's payments, on the platform account ──
  const rawCharges: unknown[] = [];
  let page: string | undefined;
  do {
    stripeCalls++;
    const res = await stripe.charges.search({
      query: `metadata['event_id']:'${eventId}'`,
      limit: 100,
      expand: ["data.balance_transaction", "data.application_fee"],
      ...(page ? { page } : {}),
    });
    rawCharges.push(...(res.data as unknown[]));
    page = res.next_page ?? undefined;
  } while (page);

  const charges: StatementCharge[] = [];
  for (const raw of chargesOfEvent(rawCharges, eventId)) {
    const c = raw as { id: string; amount_refunded?: number; refunded?: boolean };
    let refunds: unknown[] = [];
    if ((c.amount_refunded ?? 0) > 0 || c.refunded) {
      stripeCalls++;
      refunds = await (stripe.refunds.list({ charge: c.id, limit: 100 }) as unknown as ListPromise<unknown>).autoPagingToArray({ limit: 1000 });
    }
    charges.push(normalizeCharge(raw, refunds));
  }
  charges.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));

  const firstPayment = charges.length ? Math.min(...charges.map((c) => c.created)) : null;
  const transferIds = charges.map((c) => c.transferId).filter((id): id is string => id !== null);

  // ── The organizer's side: the connected account's balance transactions since the first payment ──
  let connected: ConnectedBalanceTransaction[] = [];
  let payouts: StatementPayout[] = [];
  if (firstPayment !== null) {
    stripeCalls++;
    const allRaw = await (stripe.balanceTransactions.list(
      { limit: 100, expand: ["data.source"], created: { gte: firstPayment - DAY } },
      opts,
    ) as unknown as ListPromise<unknown>).autoPagingToArray({ limit: 10_000 });
    connected = connectedTransactionsOfEvent(allRaw.map(normalizeBalanceTransaction), transferIds);

    // ── The payouts that carried this event's money ──
    stripeCalls++;
    const payoutsRaw = await (stripe.payouts.list(
      { limit: 100, expand: ["data.destination"], created: { gte: firstPayment - DAY } },
      opts,
    ) as unknown as ListPromise<unknown>).autoPagingToArray({ limit: 1000 });
    const allPayouts = payoutsRaw.map(normalizePayout);

    const { data: jobs } = await supabase
      .from("stripe_connect_payout_jobs")
      .select("stripe_payout_id")
      .eq("event_id", eventId)
      .not("stripe_payout_id", "is", null);
    const jobPayoutIds = ((jobs ?? []) as { stripe_payout_id: string }[]).map((j) => j.stripe_payout_id);

    const eventTransactionIds = connected.map((t) => t.id);
    const balanceTransactionIdsByPayout = new Map<string, string[]>();
    const toInspect = allPayouts.filter((p) => !jobPayoutIds.includes(p.id)).slice(-MAX_PAYOUTS_TO_INSPECT);
    for (const payout of toInspect) {
      stripeCalls++;
      const carried = await (stripe.balanceTransactions.list({ payout: payout.id, limit: 100 }, opts) as unknown as ListPromise<{ id: string }>).autoPagingToArray({ limit: 10_000 });
      balanceTransactionIdsByPayout.set(payout.id, carried.map((t) => t.id));
    }
    payouts = payoutsOfEvent(allPayouts, { jobPayoutIds, balanceTransactionIdsByPayout, eventTransactionIds });
  }

  // ── The balance right now ──
  stripeCalls++;
  const balance = await stripe.balance.retrieve(undefined, opts);
  const lines = (rows: { currency: string; amount: number }[] | undefined): BalanceLine[] =>
    (rows ?? []).map((r) => ({ currency: r.currency.toLowerCase(), amountCents: r.amount })).sort((a, b) => a.currency.localeCompare(b.currency));

  // ── Our orders, for the ticket counts and the reconciliation ──
  const { data: orderRows } = await supabase
    .from("event_orders")
    .select("id, status, total_cents, quantity, stripe_payment_intent_id, stripe_checkout_session_id")
    .eq("event_id", eventId);
  const orders = (orderRows ?? []) as { id: string; status: string; total_cents: number; quantity: number; stripe_payment_intent_id: string | null; stripe_checkout_session_id: string | null }[];
  const orderQuantities = new Map(orders.map((o) => [o.id, o.quantity]));
  const dbOrders: DbOrderForReconciliation[] = orders
    .filter((o) => o.stripe_payment_intent_id || (o.stripe_checkout_session_id ?? "").startsWith("cs_"))
    .map((o) => ({ id: o.id, status: o.status, totalCents: o.total_cents }));

  const moments = [
    ...charges.map((c) => c.created),
    ...charges.flatMap((c) => c.refunds.map((r) => r.created)),
    ...payouts.map((p) => p.arrivalDate ?? p.created),
  ];

  return {
    charges,
    connected,
    payouts,
    balance: { available: lines(balance.available), pending: lines(balance.pending) },
    orderQuantities,
    dbOrders,
    period: { start: firstPayment, end: moments.length ? Math.max(...moments) : null },
    stripeCalls,
  };
}
