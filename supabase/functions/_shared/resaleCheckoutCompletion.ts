/**
 * completeResaleCheckout — what stripe-connect-webhook does when a resale
 * Checkout session is paid.
 *
 * complete_resale_purchase (SQL) decides, under row locks, whether this
 * transaction still gets the listing. On success it marks the listing sold,
 * transfers the Studio ticket (old one 'transferred', new nominative one
 * issued with the token signed here) and completes the transaction, all in
 * one database transaction. Then the usual sale emails go out.
 *
 * When the buyer paid but the ticket went elsewhere (REFUND_OUTCOMES: sold
 * to someone else, reservation taken over after expiry, listing withdrawn,
 * Studio ticket already scanned…) the payment is refunded in full right
 * away, with an idempotency key per transaction so a retried webhook never
 * refunds twice. The buyer gets a "Your payment was refunded" email and the
 * admin an alert. If the refund itself fails, the admin gets an urgent alert
 * and the error is rethrown so the webhook answers 500 and Stripe retries.
 *
 * Plain TypeScript, no Deno imports: the vitest suite imports it directly.
 * The webhook passes its supabase-js client, its Stripe client and its email
 * senders in.
 */
import { needsRefund, parseCompletionResult, type ResaleCompletionOutcome } from "./resaleReservation.ts";

export interface DbResult {
  data: unknown;
  error: { message: string } | null;
}

export interface FilterBuilder extends PromiseLike<DbResult> {
  eq(column: string, value: unknown): FilterBuilder;
  maybeSingle(): PromiseLike<DbResult>;
}

export interface QueryClient {
  from(table: string): {
    select(columns: string): FilterBuilder;
    update(values: Record<string, unknown>): FilterBuilder;
  };
}

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<DbResult>;
}

export interface StripeRefunds {
  refunds: {
    create(
      params: { payment_intent: string; metadata: Record<string, string> },
      opts: { idempotencyKey: string },
    ): Promise<{ id: string; status?: string | null }>;
  };
}

export interface BuyerRefundEmail {
  transactionId: string;
  buyerId: string;
  amountCents: number;
  eventTitle: string | null;
}

export interface CompleteResaleCheckoutDeps {
  supabase: RpcClient & QueryClient;
  stripe: StripeRefunds;
  signQr: (p: { ticket_id: string; event_id: string; exp_seconds: number }) => Promise<string | null>;
  newId: () => string;
  nowMs: () => number;
  sendCompletionEmails: (txId: string) => Promise<unknown>;
  sendBuyerRefundEmail: (a: BuyerRefundEmail) => Promise<void>;
  sendAdminAlert: (subject: string, text: string) => Promise<void>;
}

export interface CompleteResaleCheckoutInput {
  transactionId: string;
  paymentIntentId: string | null;
}

export interface CompleteResaleCheckoutResult {
  outcome: ResaleCompletionOutcome;
  refunded: boolean;
}

/** A Studio ticket stays valid until a day after the event, else 30 days (same rule as before). */
const DAY_SECONDS = 86_400;

interface TxRow {
  id: string;
  ticket_id: string | null;
  buyer_id: string | null;
  amount: number | string | null;
}

interface ListingRow {
  id: string;
  studio_ticket_id: string | null;
  event_id: string | null;
  events: { date?: string | null; title?: string | null } | { date?: string | null; title?: string | null }[] | null;
}

function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

async function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[resale-completion] ${label} failed:`, err);
  }
}

export async function completeResaleCheckout(
  deps: CompleteResaleCheckoutDeps,
  input: CompleteResaleCheckoutInput,
): Promise<CompleteResaleCheckoutResult> {
  const { supabase, stripe } = deps;
  const { transactionId, paymentIntentId } = input;

  const txRes = await supabase.from("transactions").select("id, ticket_id, buyer_id, amount").eq("id", transactionId).maybeSingle();
  if (txRes.error) throw new Error("Resale transaction read failed: " + txRes.error.message);
  const tx = txRes.data as TxRow | null;
  if (!tx) {
    console.error(`[resale-completion] transaction ${transactionId} not found (payment ${paymentIntentId ?? "?"})`);
    return { outcome: "transaction_missing", refunded: false };
  }

  let listing: ListingRow | null = null;
  if (tx.ticket_id) {
    const listingRes = await supabase.from("tickets").select("id, studio_ticket_id, event_id, events(date, title)").eq("id", tx.ticket_id).maybeSingle();
    if (listingRes.error) throw new Error("Resale listing read failed: " + listingRes.error.message);
    listing = listingRes.data as ListingRow | null;
  }
  const event = Array.isArray(listing?.events) ? listing?.events[0] ?? null : listing?.events ?? null;
  const eventTitle = event?.title ?? null;

  // A Studio resale issues the buyer a new ticket: its id and signed QR token
  // are made here and written by the SQL function in the same transaction.
  let newEventTicketId: string | null = null;
  let newQrToken: string | null = null;
  if (listing?.studio_ticket_id) {
    let eventId = listing.event_id;
    if (!eventId) {
      const etRes = await supabase.from("event_tickets").select("event_id").eq("id", listing.studio_ticket_id).maybeSingle();
      if (etRes.error) throw new Error("Studio ticket read failed: " + etRes.error.message);
      eventId = (etRes.data as { event_id?: string | null } | null)?.event_id ?? null;
    }
    newEventTicketId = deps.newId();
    const eventMs = event?.date ? new Date(event.date).getTime() : NaN;
    const expSeconds = Number.isFinite(eventMs)
      ? Math.floor(eventMs / 1000) + DAY_SECONDS
      : Math.floor(deps.nowMs() / 1000) + 30 * DAY_SECONDS;
    const signed = eventId ? await deps.signQr({ ticket_id: newEventTicketId, event_id: eventId, exp_seconds: expSeconds }) : null;
    newQrToken = signed ?? deps.newId().replace(/-/g, "");
  }

  const rpcRes = await supabase.rpc("complete_resale_purchase", {
    p_transaction_id: transactionId,
    p_payment_intent_id: paymentIntentId,
    p_new_event_ticket_id: newEventTicketId,
    p_new_qr_token: newQrToken,
  });
  if (rpcRes.error) throw new Error("complete_resale_purchase failed: " + rpcRes.error.message);
  const { outcome } = parseCompletionResult(rpcRes.data);

  if (outcome === "completed") {
    await safely("completion emails", () => deps.sendCompletionEmails(transactionId));
    return { outcome, refunded: false };
  }

  if (!needsRefund(outcome)) {
    console.log(`[resale-completion] transaction ${transactionId}: ${outcome}, nothing to do`);
    return { outcome, refunded: false };
  }

  const amountCents = Math.round(Number(tx.amount ?? 0) * 100);
  const details = [
    `Transaction: ${transactionId}`,
    `Listing: ${tx.ticket_id ?? "—"}`,
    `Event: ${eventTitle ?? "—"}`,
    `Reason: ${outcome}`,
    `Amount: ${euros(amountCents)}`,
    `Payment intent: ${paymentIntentId ?? "—"}`,
  ].join("\n");

  if (!paymentIntentId) {
    console.error(`[resale-completion] ${transactionId}: ${outcome} but no payment intent to refund`);
    await safely("admin alert", () => deps.sendAdminAlert(
      `[URGENT] Resale conflict with no payment intent — refund manually`,
      `A resale buyer paid but could not get the ticket, and the payment has no payment intent, so it was not refunded automatically. Refund it from the Stripe Dashboard.\n\n${details}`,
    ));
    return { outcome, refunded: false };
  }

  let refundId: string;
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { source: "resale_conflict", transaction_id: transactionId } },
      { idempotencyKey: `resale_conflict_${transactionId}` },
    );
    refundId = refund.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await safely("admin alert", () => deps.sendAdminAlert(
      `[URGENT] resale conflict refund failed — refund manually`,
      `A resale buyer paid but could not get the ticket, and the automatic refund failed: ${message}. Stripe will retry the webhook; if this keeps failing, refund the payment from the Stripe Dashboard.\n\n${details}`,
    ));
    throw err;
  }

  // complete_resale_purchase left the transaction 'cancelled'; charge.refunded
  // may already have moved it on, hence the status condition.
  const markRes = await supabase.from("transactions").update({ status: "refunded" }).eq("id", transactionId).eq("status", "cancelled");
  if (markRes.error) console.error(`[resale-completion] could not mark ${transactionId} refunded:`, markRes.error.message);

  if (tx.buyer_id) {
    const buyerId = tx.buyer_id;
    await safely("buyer refund email", () => deps.sendBuyerRefundEmail({ transactionId, buyerId, amountCents, eventTitle }));
  }
  await safely("admin alert", () => deps.sendAdminAlert(
    `Resale conflict: buyer refunded automatically — ${euros(amountCents)}`,
    `A resale buyer paid but could not get the ticket, so the payment was refunded in full (refund ${refundId}). Nothing else to do unless the buyer gets in touch.\n\n${details}`,
  ));

  console.log(`[resale-completion] ${transactionId}: ${outcome}, refunded ${refundId}`);
  return { outcome, refunded: true };
}
