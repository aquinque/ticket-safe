/**
 * Shared by cancel-event and admin-refund-order.
 *
 * A Studio order's tickets can have been resold on the marketplace by the
 * time the order is refunded. The resale buyer paid for their ticket via a
 * totally separate `transactions` row, not the original `event_orders` row —
 * so blindly refunding `event_orders.total_cents` back to the original buyer
 * refunds someone who already sold the ticket and was paid for it (double
 * payment), while the person who actually holds the now-invalidated ticket
 * gets nothing back.
 *
 * planResaleAwareRefund works out, per original order:
 *   - how many of its tickets are still with the original buyer (never
 *     resold, or resold-chain tickets that are themselves original — i.e.
 *     everything that is NOT the "transferred" predecessor of a resale)
 *   - the resale transaction that paid for each ticket that is no longer
 *     with the original buyer, so the CURRENT holder can be refunded
 *     directly on their own payment.
 *
 * Resale chains (A resells to B, B resells to C) are handled by only
 * refunding the transaction whose buyer's resulting ticket is still
 * 'valid' today — an intermediate buyer (B) who resold onward again has a
 * 'transferred' resulting ticket, not 'valid', so their transaction is
 * skipped (they already got paid for their own resale; refunding them too
 * would be a third payment for the same seat).
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ResaleRefundTarget {
  transactionId: string;
  ticketId: string;
  buyerId: string;
  amountCents: number;
  stripeCheckoutSessionId: string | null;
  paymentIntentId: string | null;
}

export interface ResaleAwareRefundPlan {
  keptCount: number;
  originalBuyerRefundCents: number;
  resaleRefunds: ResaleRefundTarget[];
}

export async function planResaleAwareRefund(
  supabase: SupabaseClient,
  order: { id: string; quantity: number; unit_price_cents: number; fee_cents: number },
): Promise<ResaleAwareRefundPlan> {
  const { data: tickets } = await supabase
    .from("event_tickets")
    .select("id, buyer_id, status")
    .eq("order_id", order.id);

  const rows = (tickets ?? []) as { id: string; buyer_id: string; status: string }[];
  const transferred = rows.filter((t) => t.status === "transferred");
  const keptCount = Math.max(0, order.quantity - transferred.length);
  const perTicketCents = order.quantity > 0
    ? order.unit_price_cents + Math.round(order.fee_cents / order.quantity)
    : 0;
  const originalBuyerRefundCents = keptCount * perTicketCents;

  const resaleRefunds: ResaleRefundTarget[] = [];
  for (const t of transferred) {
    const { data: listing } = await supabase
      .from("tickets")
      .select("id")
      .eq("studio_ticket_id", t.id)
      .eq("status", "sold")
      .maybeSingle();
    if (!listing) continue;

    const { data: tx } = await supabase
      .from("transactions")
      .select("id, buyer_id, amount, stripe_checkout_session_id, payment_intent_id")
      .eq("ticket_id", listing.id)
      .eq("status", "completed")
      .maybeSingle();
    if (!tx) continue;

    // Only refund if this transaction's buyer is still the current holder
    // (their resulting ticket is 'valid'). If they resold again, their
    // resulting ticket is 'transferred' and THAT resale's transaction is
    // the one that should be refunded instead — found on its own loop
    // iteration since every transferred ticket is in `rows`.
    const stillHolds = rows.some((r) => r.buyer_id === tx.buyer_id && r.status === "valid");
    if (!stillHolds) continue;

    resaleRefunds.push({
      transactionId: tx.id,
      ticketId: t.id,
      buyerId: tx.buyer_id,
      amountCents: Math.round(Number(tx.amount) * 100),
      stripeCheckoutSessionId: tx.stripe_checkout_session_id,
      paymentIntentId: tx.payment_intent_id,
    });
  }

  return { keptCount, originalBuyerRefundCents, resaleRefunds };
}

export interface RevolutCreds {
  secret: string;
  base: string;
  apiVersion: string;
}

async function refundViaRevolutOrder(
  creds: RevolutCreds,
  revolutOrderId: string,
  amountCents: number,
  extRef: string,
): Promise<{ ok: boolean; details?: string }> {
  try {
    const res = await fetch(`${creds.base}/orders/${revolutOrderId}/refund`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.secret}`,
        "Revolut-Api-Version": creds.apiVersion,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Idempotency-Key": extRef,
      },
      body: JSON.stringify({ amount: amountCents, currency: "EUR", merchant_order_ext_ref: extRef }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, details: `revolut_${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, details: `revolut_throw: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export interface ResaleRefundResult extends ResaleRefundTarget {
  ok: boolean;
  details?: string;
}

/** Refunds each resale buyer directly via their own payment reference. */
export async function refundResaleBuyers(
  targets: ResaleRefundTarget[],
  revolut: RevolutCreds | null,
  // deno-lint-ignore no-explicit-any
  stripe: { refunds: { create: (args: any, opts?: any) => Promise<unknown> } } | null,
  extRefPrefix: string,
): Promise<ResaleRefundResult[]> {
  const results: ResaleRefundResult[] = [];
  for (const target of targets) {
    const sid = target.stripeCheckoutSessionId ?? "";
    let outcome: { ok: boolean; details?: string };
    if (sid.startsWith("revolut:") && revolut) {
      outcome = await refundViaRevolutOrder(revolut, sid.slice("revolut:".length), target.amountCents, `${extRefPrefix}_resale_${target.transactionId}`);
    } else if (target.paymentIntentId && stripe) {
      try {
        await stripe.refunds.create(
          { payment_intent: target.paymentIntentId, metadata: { source: extRefPrefix, transaction_id: target.transactionId } },
          { idempotencyKey: `${extRefPrefix}_resale_${target.transactionId}` },
        );
        outcome = { ok: true };
      } catch (err) {
        outcome = { ok: false, details: err instanceof Error ? err.message : String(err) };
      }
    } else {
      outcome = { ok: false, details: "No usable payment reference for resale transaction" };
    }
    results.push({ ...target, ok: outcome.ok, details: outcome.details });
  }
  return results;
}
