/**
 * admin-stripe-fees — reads, from Stripe, the processing fee on each paid Studio order and keeps it
 * in order_stripe_fees, so the admin overview can show what TicketSafe keeps after Stripe.
 *
 * POST (admins only, with the signed-in admin's token). Read-only at Stripe: it retrieves payments,
 * it never charges, refunds or moves money. Each call fills up to 60 orders that have no fee yet and
 * returns { synced, failed, remaining }; the admin page calls it again while something remains.
 *
 * The fee is the balance transaction's fee on the platform charge (destination charges: Stripe
 * bills the platform). An order without a Stripe payment (free, Revolut, unknown session) is kept
 * with a note and no fee, so it is not asked again.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BATCH = 60;

type BalanceTx = { id: string; fee: number; net: number; amount: number; currency: string };
type Charge = { balance_transaction?: BalanceTx | string | null } | null;
type PaymentIntent = { latest_charge?: Charge | string | null } | null;

const balanceOf = (pi: PaymentIntent): BalanceTx | null => {
  const charge = pi?.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const bt = charge.balance_transaction;
  return bt && typeof bt === "object" ? bt : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Server misconfigured" }, 500);
  const supabase = createClient(url, key);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ error: "Missing authorization" }, 401);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ error: "Admin only" }, 403);

  let stripe: ReturnType<typeof getStripeClient>;
  try { stripe = getStripeClient(); } catch { return json({ error: "Stripe not configured" }, 500); }

  // Paid orders with money on them and no fee recorded yet, oldest first.
  const { data: known } = await supabase.from("order_stripe_fees").select("order_id");
  const done = new Set((known ?? []).map((r: { order_id: string }) => r.order_id));
  const { data: orders, error } = await supabase
    .from("event_orders")
    .select("id, stripe_payment_intent_id, stripe_checkout_session_id")
    .eq("status", "paid")
    .gt("total_cents", 0)
    .order("created_at", { ascending: true });
  if (error) return json({ error: error.message }, 500);
  const todo = (orders ?? []).filter((o: { id: string }) => !done.has(o.id));
  const batch = todo.slice(0, BATCH);

  let synced = 0;
  let failed = 0;
  for (const o of batch as { id: string; stripe_payment_intent_id: string | null; stripe_checkout_session_id: string | null }[]) {
    let row: Record<string, unknown> = { order_id: o.id, fetched_at: new Date().toISOString() };
    try {
      let pi: PaymentIntent = null;
      if (o.stripe_payment_intent_id?.startsWith("pi_")) {
        pi = (await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id, { expand: ["latest_charge.balance_transaction"] })) as unknown as PaymentIntent;
      } else if (o.stripe_checkout_session_id?.startsWith("cs_")) {
        const s = (await stripe.checkout.sessions.retrieve(o.stripe_checkout_session_id, { expand: ["payment_intent.latest_charge.balance_transaction"] })) as unknown as { payment_intent?: PaymentIntent | string | null };
        pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
      }
      const bt = balanceOf(pi);
      row = bt
        ? { ...row, fee_cents: bt.fee, net_cents: bt.net, amount_cents: bt.amount, currency: bt.currency.toUpperCase(), balance_transaction_id: bt.id, note: null }
        : { ...row, fee_cents: null, note: o.stripe_checkout_session_id?.startsWith("cs_") || o.stripe_payment_intent_id ? "no Stripe charge found" : "not a Stripe payment" };
      synced++;
    } catch (e) {
      failed++;
      console.error("[admin-stripe-fees]", o.id, e instanceof Error ? e.message : e);
      continue; // asked again on the next call
    }
    const { error: upErr } = await supabase.from("order_stripe_fees").upsert(row, { onConflict: "order_id" });
    if (upErr) { failed++; synced--; console.error("[admin-stripe-fees] save", o.id, upErr.message); }
  }

  return json({ synced, failed, remaining: Math.max(todo.length - batch.length, 0) + failed });
});
