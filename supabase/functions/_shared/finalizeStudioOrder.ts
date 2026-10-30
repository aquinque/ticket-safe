/**
 * Finalises a paid Studio order: marks it paid, moves the seats to sold,
 * creates the tickets (signed QR tokens), sends the confirmation email and
 * the Discord alert. Shared by stripe-connect-webhook (checkout.session.completed)
 * and admin-repair-order (manual repair after a missed or ignored event).
 *
 * Idempotent on the order: an order already marked paid is left alone.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signStudioTicketJWT } from "./ticketJwt.ts";
import { postDiscordSaleAlert } from "./discordSaleAlert.ts";

export interface FinalizeArgs {
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseServiceKey: string;
  replaySecret: string;
  orderId: string;
  tierId: string;
  qty: number;
  paymentIntentId: string | null;
  customerEmail: string | null;
}

export type FinalizeOutcome =
  | { outcome: "finalized"; tickets: number; revivedFrom: string | null }
  | { outcome: "already_paid"; tickets?: undefined }
  | { outcome: "skipped"; reason: string; tickets?: undefined };

export async function finalizeStudioOrder(a: FinalizeArgs): Promise<FinalizeOutcome> {
  const { supabase, orderId, tierId, qty } = a;

  // The buyer paid, so the order is honoured whatever state we had put it in.
  // A first declined card attempt used to cancel the order while Stripe's page
  // let the buyer try again; the second attempt then paid and was ignored
  // (money taken, no ticket). Only an order already marked paid is skipped.
  const { data: before } = await supabase.from("event_orders").select("status").eq("id", orderId).maybeSingle();
  const prevStatus = (before as { status?: string } | null)?.status;
  if (!prevStatus) return { outcome: "skipped", reason: "order not found" };
  if (prevStatus === "paid") return { outcome: "already_paid" };
  if (!["pending", "cancelled", "expired"].includes(prevStatus)) return { outcome: "skipped", reason: `status ${prevStatus}` };

  const { data: updRows } = await supabase
    .from("event_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: a.paymentIntentId, cancelled_at: null })
    .eq("id", orderId).eq("status", prevStatus).select("id, event_id, buyer_id, attendees");
  if (!updRows || updRows.length === 0) return { outcome: "skipped", reason: "raced with another delivery" };

  const ord = updRows[0] as { id: string; event_id: string; buyer_id: string; attendees: unknown };
  if (prevStatus === "pending") {
    await supabase.rpc("finalize_tier_sale", { p_tier_id: tierId, p_qty: qty });
  } else {
    // Revived order: its seats were released when it was cancelled or expired.
    // Take them back, or count the sale anyway if the tier filled up meanwhile.
    console.warn(`[finalizeStudioOrder] reviving order ${orderId} from status ${prevStatus}`);
    const { data: reserved } = await supabase.rpc("reserve_tier", { p_tier_id: tierId, p_qty: qty });
    if (reserved) {
      await supabase.rpc("finalize_tier_sale", { p_tier_id: tierId, p_qty: qty });
    } else {
      const { data: tierRow } = await supabase.from("event_tiers").select("sold_qty").eq("id", tierId).maybeSingle();
      const soldNow = (tierRow as { sold_qty?: number } | null)?.sold_qty ?? 0;
      await supabase.from("event_tiers").update({ sold_qty: soldNow + qty }).eq("id", tierId);
    }
  }

  const { data: evForExp } = await supabase.from("events").select("date").eq("id", ord.event_id).maybeSingle();
  const expSeconds = evForExp?.date ? Math.floor(new Date(evForExp.date).getTime() / 1000) + 86_400 : Math.floor(Date.now() / 1000) + 30 * 86_400;
  const attendees = Array.isArray(ord.attendees) ? (ord.attendees as { first_name?: string; last_name?: string; email?: string; gender?: string }[]) : [];

  const ticketRows = await Promise.all(Array.from({ length: qty }).map(async (_, i) => {
    const att = attendees[i] ?? null;
    const ticketId = crypto.randomUUID();
    const signed = await signStudioTicketJWT({ ticket_id: ticketId, event_id: ord.event_id, exp_seconds: expSeconds });
    const qrToken = signed ?? (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8));
    return { id: ticketId, order_id: ord.id, event_id: ord.event_id, tier_id: tierId, buyer_id: ord.buyer_id, qr_token: qrToken, holder_first_name: att?.first_name ?? null, holder_last_name: att?.last_name ?? null, holder_email: att?.email ?? a.customerEmail ?? null, holder_gender: att?.gender ?? null, status: "valid" as const };
  }));
  const { error: tixErr } = await supabase.from("event_tickets").insert(ticketRows);
  if (tixErr) console.error("[finalizeStudioOrder] event_tickets insert failed:", tixErr);

  try {
    await fetch(`${a.supabaseUrl}/functions/v1/replay-order-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: a.supabaseServiceKey, Authorization: `Bearer ${a.supabaseServiceKey}` },
      body: JSON.stringify({ order_id: ord.id, admin_secret: a.replaySecret }),
    });
  } catch (e) { console.warn("[finalizeStudioOrder] ticket email failed:", e); }

  // Team alert in Discord (no-op without DISCORD_SALES_WEBHOOK_URL).
  await postDiscordSaleAlert(supabase, ord.id, "Stripe");

  return { outcome: "finalized", tickets: ticketRows.length, revivedFrom: prevStatus === "pending" ? null : prevStatus };
}
