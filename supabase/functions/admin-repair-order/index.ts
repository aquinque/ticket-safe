/**
 * admin-repair-order — finalise a Studio order whose payment succeeded at
 * Stripe but which never got its tickets (a webhook delivery that was missed
 * or ignored). Back-office only.
 *
 * POST { admin_secret, order_id }  or  POST { admin_secret, email }
 *   admin_secret: the REPLAY_ADMIN_SECRET function secret.
 *   email: repairs every non-paid order of that buyer whose Stripe Checkout
 *          session is paid (most recent first).
 *
 * For each candidate order the Checkout Session is fetched from Stripe and the
 * order is finalised only if Stripe says payment_status = "paid". Nothing is
 * ever charged here. Returns one line per order with what happened.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { finalizeStudioOrder } from "../_shared/finalizeStudioOrder.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET");
  if (!replaySecret) return json({ error: "REPLAY_ADMIN_SECRET is not set on the project" }, 500);

  let body: { admin_secret?: unknown; order_id?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (body.admin_secret !== replaySecret) return json({ error: "Forbidden" }, 403);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let stripe: ReturnType<typeof getStripeClient>;
  try { stripe = getStripeClient(); } catch { return json({ error: "Stripe not configured" }, 500); }

  type OrderRow = { id: string; status: string; buyer_email: string | null; tier_id: string | null; quantity: number; stripe_checkout_session_id: string | null; created_at: string };
  const cols = "id, status, buyer_email, tier_id, quantity, stripe_checkout_session_id, created_at";
  let orders: OrderRow[] = [];
  if (typeof body.order_id === "string" && /^[0-9a-f-]{36}$/i.test(body.order_id)) {
    const { data } = await supabase.from("event_orders").select(cols).eq("id", body.order_id).maybeSingle();
    if (data) orders = [data as OrderRow];
  } else if (typeof body.email === "string" && body.email.includes("@")) {
    const { data } = await supabase.from("event_orders").select(cols).ilike("buyer_email", body.email.trim()).neq("status", "paid").order("created_at", { ascending: false }).limit(10);
    orders = (data ?? []) as OrderRow[];
  } else {
    return json({ error: "Give order_id or email" }, 400);
  }
  if (orders.length === 0) return json({ ok: true, repaired: [], note: "No non-paid order found for that buyer." });

  const results: unknown[] = [];
  for (const o of orders) {
    const sessionId = o.stripe_checkout_session_id ?? "";
    if (!sessionId.startsWith("cs_")) { results.push({ order_id: o.id, status: o.status, outcome: "skipped", reason: "not a Stripe checkout" }); continue; }
    let session;
    try { session = await stripe.checkout.sessions.retrieve(sessionId); } catch (e) {
      results.push({ order_id: o.id, status: o.status, outcome: "skipped", reason: `Stripe: ${e instanceof Error ? e.message : e}` }); continue;
    }
    if (session.payment_status !== "paid") { results.push({ order_id: o.id, status: o.status, outcome: "not_paid_at_stripe", stripe_status: session.payment_status }); continue; }
    if (!o.tier_id) { results.push({ order_id: o.id, outcome: "skipped", reason: "no tier" }); continue; }
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const r = await finalizeStudioOrder({
      supabase, supabaseUrl, supabaseServiceKey, replaySecret,
      orderId: o.id, tierId: o.tier_id, qty: o.quantity || 1, paymentIntentId, customerEmail: session.customer_email ?? o.buyer_email,
    });
    results.push({ order_id: o.id, buyer_email: o.buyer_email, previous_status: o.status, ...r });
  }
  return json({ ok: true, repaired: results });
});
