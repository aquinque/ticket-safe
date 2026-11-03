/**
 * Resale chargebacks — used by stripe-connect-webhook.
 *
 * A resale charge lands on the platform's Stripe account and the seller is
 * paid later by stripe-connect-payout-cron, which only pays transactions in
 * status 'completed' that no payout job has claimed yet. So:
 *
 *   charge.dispute.created → holdResaleOnDispute
 *     - sale not paid out yet: status 'disputed' keeps it out of every
 *       payout until the dispute is settled ("held").
 *     - sale already paid out (payout_job_id set): status 'disputed' too, and
 *       the admin alert says the money has to be recovered from the seller
 *       ("already_paid_out").
 *
 *   charge.dispute.closed → releaseResaleDispute
 *     - won: back to 'completed' (paid by the next cron run if it wasn't yet).
 *     - lost or anything else: stays 'disputed'.
 *
 * Plain TypeScript, no Deno imports: the vitest suite imports it directly.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface TxRow {
  id: string;
  status: string;
  seller_id: string;
  amount: number | string;
  fee_amount: number | string | null;
  commission_cents: number | null;
  payout_job_id: string | null;
  dispute_id: string | null;
}

export type ResaleDisputeHold =
  | { kind: "not_resale" }
  | { kind: "held"; transactionId: string; sellerId: string; sellerNetCents: number }
  | {
      kind: "already_paid_out";
      transactionId: string;
      sellerId: string;
      sellerNetCents: number;
      payoutJobId: string;
      payoutJobStatus: string | null;
      stripePayoutId: string | null;
    }
  | { kind: "already_disputed"; transactionId: string }
  | { kind: "not_completed"; transactionId: string; status: string };

const TX_COLUMNS = "id, status, seller_id, amount, fee_amount, commission_cents, payout_job_id, dispute_id";

/** What the seller is owed on one resale, in cents: buyer total minus buyer fee minus seller commission. */
export function sellerNetCents(tx: Pick<TxRow, "amount" | "fee_amount" | "commission_cents">): number {
  return Math.round(Number(tx.amount) * 100) - Math.round(Number(tx.fee_amount ?? 0) * 100) - (tx.commission_cents ?? 0);
}

export async function holdResaleOnDispute(
  supabase: SupabaseClient,
  { paymentIntentId, disputeId }: { paymentIntentId: string; disputeId: string },
): Promise<ResaleDisputeHold> {
  const { data: tx } = await supabase.from("transactions").select(TX_COLUMNS).eq("payment_intent_id", paymentIntentId).maybeSingle();
  if (!tx) return { kind: "not_resale" };
  const row = tx as TxRow;
  if (row.status === "disputed") return { kind: "already_disputed", transactionId: row.id };
  if (row.status !== "completed") return { kind: "not_completed", transactionId: row.id, status: row.status };

  // Conditional on 'completed' so a second delivery, or a refund landing at
  // the same moment, can't be overwritten. payout_job_id is read back from
  // the updated row: the cron claims a sale (sets payout_job_id) before it
  // transfers, so this tells reliably whether money has left.
  const { data: updated } = await supabase
    .from("transactions")
    .update({ status: "disputed", dispute_id: disputeId })
    .eq("id", row.id)
    .eq("status", "completed")
    .select(TX_COLUMNS);
  const after = (updated as TxRow[] | null)?.[0];
  if (!after) {
    const { data: now } = await supabase.from("transactions").select("id, status").eq("id", row.id).maybeSingle();
    const status = (now as { status?: string } | null)?.status ?? "unknown";
    return status === "disputed" ? { kind: "already_disputed", transactionId: row.id } : { kind: "not_completed", transactionId: row.id, status };
  }

  const net = sellerNetCents(after);
  if (!after.payout_job_id) return { kind: "held", transactionId: after.id, sellerId: after.seller_id, sellerNetCents: net };

  const { data: job } = await supabase.from("stripe_connect_payout_jobs").select("id, status, stripe_payout_id").eq("id", after.payout_job_id).maybeSingle();
  return {
    kind: "already_paid_out",
    transactionId: after.id,
    sellerId: after.seller_id,
    sellerNetCents: net,
    payoutJobId: after.payout_job_id,
    payoutJobStatus: (job as { status?: string } | null)?.status ?? null,
    stripePayoutId: (job as { stripe_payout_id?: string | null } | null)?.stripe_payout_id ?? null,
  };
}

export type ResaleDisputeRelease =
  | { kind: "released"; transactionId: string }
  | { kind: "kept"; transactionId: string; disputeStatus: string }
  | { kind: "nothing_to_release" };

/** On charge.dispute.closed: a won dispute gives the sale back to the seller; any other outcome keeps it held. */
export async function releaseResaleDispute(
  supabase: SupabaseClient,
  { disputeId, disputeStatus }: { disputeId: string; disputeStatus: string },
): Promise<ResaleDisputeRelease> {
  const { data: tx } = await supabase.from("transactions").select("id, status").eq("dispute_id", disputeId).eq("status", "disputed").maybeSingle();
  if (!tx) return { kind: "nothing_to_release" };
  if (disputeStatus !== "won") return { kind: "kept", transactionId: tx.id, disputeStatus };
  await supabase.from("transactions").update({ status: "completed" }).eq("id", tx.id).eq("status", "disputed");
  return { kind: "released", transactionId: tx.id };
}

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/** Extra rows and a note for the admin's dispute email, by what happened to the resale. */
export function resaleDisputeAlert(hold: ResaleDisputeHold): { rows: [string, string][]; note: string; urgent: boolean } | null {
  switch (hold.kind) {
    case "not_resale":
      return null;
    case "held":
      return {
        rows: [["Resale transaction", hold.transactionId], ["Seller payout", `${euros(hold.sellerNetCents)} held (not paid out)`]],
        note: "This is a resale. The seller's payout for this sale is on hold until the dispute is closed; a won dispute releases it automatically.",
        urgent: false,
      };
    case "already_paid_out":
      return {
        rows: [
          ["Resale transaction", hold.transactionId],
          ["Seller payout", `${euros(hold.sellerNetCents)} ALREADY PAID OUT`],
          ["Payout job", `${hold.payoutJobId} (${hold.payoutJobStatus ?? "unknown"})`],
          ["Stripe payout", hold.stripePayoutId ?? "—"],
        ],
        note: "This is a resale and the seller has already been paid. The transaction is marked disputed. Recover the money from the seller (reverse the transfer to their connected account in Stripe, or contact them) and check the ticket.",
        urgent: true,
      };
    case "already_disputed":
      return { rows: [["Resale transaction", `${hold.transactionId} (already disputed)`]], note: "This resale was already marked disputed.", urgent: false };
    case "not_completed":
      return {
        rows: [["Resale transaction", `${hold.transactionId} (status: ${hold.status})`]],
        note: "This is a resale that was not in a payable state (for example already refunded), so no payout was held.",
        urgent: false,
      };
  }
}
