/**
 * revolut-create-checkout — Studio primary-sale checkout via Revolut Merchant.
 *
 * This was the missing half of the Stripe→Revolut migration for Studio events:
 * EventPublic.tsx has called this function name since June 11 (commit bd575b2,
 * "Revolut is now the payment provider for Studio"), and revolut-webhook has
 * had full completion logic for it (mark event_orders paid, finalize_tier_sale,
 * issue event_tickets with signed QR JWTs, send the confirmation email) since
 * around the same time — but this checkout-creation function's source was
 * never committed to the repo, and a live probe on 2026-09-29 showed whatever
 * is currently deployed under this name returns an unrelated error
 * ("Please enter your name."), i.e. it does not create a ticket checkout at
 * all. This file replaces it with the two already-proven pieces glued
 * together:
 *   - Validation + atomic seat reservation: same contract as
 *     studio-create-checkout (reserve_tier RPC, per-buyer limit, tier/event/
 *     organizer status checks, release-on-failure).
 *   - Revolut Merchant order creation: same API call shape as
 *     revolut-resale-checkout (same env vars, same Orders endpoint, same
 *     `stripe_checkout_session_id = "revolut:<order_id>"` convention that
 *     revolut-webhook already looks up event_orders by).
 *
 * Response shape matches what EventPublic.tsx's handleBuy() already expects:
 * `{ url, order_id }` (NOT `checkout_url` — the frontend checks `data?.url`).
 *
 * Fee model unchanged from studio-create-checkout: buyer pays ticket price +
 * 5% service fee at checkout; the organizer's 8% fee is taken later, at
 * withdrawal (see request-payout).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUYER_FEE_PERCENT = 5;
const ORGANIZER_FEE_PERCENT = 8;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_CENTS = 50;
const MAX_UNIT_PRICE_CENTS = 500_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const revolutSecret = Deno.env.get("REVOLUT_MERCHANT_SECRET_KEY");
  const revolutBase = (Deno.env.get("REVOLUT_MERCHANT_BASE") ?? "https://merchant.revolut.com/api").replace(/\/+$/, "");
  const revolutApiVersion = Deno.env.get("REVOLUT_API_VERSION") ?? "2024-09-01";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  if (!revolutSecret) return json({ error: "Revolut not configured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);

  let reservedTierId: string | null = null;
  let reservedQty = 0;
  let orderId: string | null = null;
  const releaseReservation = async () => {
    if (reservedTierId && reservedQty > 0) {
      await supabase.rpc("release_tier_reservation", { p_tier_id: reservedTierId, p_qty: reservedQty });
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // Same rate-limit shape as revolut-resale-checkout — defense against a
    // buggy client or a bot hammering checkout creation (each hit reserves
    // seats, so this also protects real buyers from artificial sell-outs).
    try {
      const { data: rlOk } = await supabase.rpc("rate_limit_consume", {
        p_bucket: "studio_checkout",
        p_key: user.id,
        p_max_hits: 12,
        p_window_sec: 60,
      });
      if (rlOk === false) return json({ error: "Too many checkout attempts. Please wait a minute and try again." }, 429);
    } catch {
      /* fail open — rate limiting is defense-in-depth, not a hard dependency */
    }

    interface AttendeeIn { first_name?: string; last_name?: string; email?: string }
    let body: { tier_id?: string; quantity?: number; attendees?: AttendeeIn[] };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const tierId = body.tier_id;
    const quantity = Math.floor(body.quantity ?? 1);
    if (!tierId || typeof tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(tierId)) return json({ error: "Invalid tier_id" }, 400);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return json({ error: "Invalid quantity" }, 400);

    const attendees: { first_name: string; last_name: string; email: string }[] = [];
    if (Array.isArray(body.attendees) && body.attendees.length > 0) {
      if (body.attendees.length !== quantity) return json({ error: "Attendee list must match the ticket quantity." }, 400);
      for (const a of body.attendees) {
        const first = (a?.first_name ?? "").trim();
        const last = (a?.last_name ?? "").trim();
        const email = (a?.email ?? "").trim().toLowerCase();
        if (first.length < 1 || first.length > 100) return json({ error: "Each attendee needs a first name." }, 400);
        if (last.length < 1 || last.length > 100) return json({ error: "Each attendee needs a last name." }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Each attendee needs a valid email." }, 400);
        attendees.push({ first_name: first, last_name: last, email });
      }
    }

    const { data: tier, error: tierErr } = await supabase
      .from("event_tiers")
      .select(`id, event_id, name, price_cents, currency, total_qty, sold_qty, reserved_qty, is_active,
               event:events!inner(id, title, slug, status, organizer_id, max_tickets_per_buyer,
                 organizer:organizer_profiles!events_organizer_id_fkey(id, user_id, name, status))`)
      .eq("id", tierId).maybeSingle();
    if (tierErr || !tier) return json({ error: "Tier not found" }, 404);

    const evRaw = (tier as { event: unknown }).event;
    const ev = Array.isArray(evRaw) ? evRaw[0] : evRaw;
    if (!ev) return json({ error: "Event not found" }, 404);
    if (ev.status !== "published") return json({ error: "Event is not available for sale." }, 400);
    const orgRaw = ev.organizer;
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    if (!org || org.status !== "approved") return json({ error: "Organizer not active." }, 400);
    if (!tier.is_active) return json({ error: "Tier is not on sale." }, 400);
    if (tier.price_cents < MIN_UNIT_PRICE_CENTS || tier.price_cents > MAX_UNIT_PRICE_CENTS) return json({ error: "Tier price out of bounds." }, 400);

    const maxPerBuyer = (ev as { max_tickets_per_buyer?: number | null }).max_tickets_per_buyer;
    if (Number.isInteger(maxPerBuyer) && maxPerBuyer && maxPerBuyer > 0) {
      const { data: alreadyOwned } = await supabase.rpc("buyer_ticket_count_for_event", { p_event_id: ev.id, p_buyer_id: user.id });
      const already = typeof alreadyOwned === "number" ? alreadyOwned : 0;
      if (already + quantity > maxPerBuyer) {
        const remaining = Math.max(0, maxPerBuyer - already);
        return json({
          error: remaining > 0
            ? `Limit reached: you can only buy ${remaining} more ticket${remaining > 1 ? "s" : ""} for this event (max ${maxPerBuyer} per person).`
            : `You already have ${already} ticket${already > 1 ? "s" : ""} for this event — the per-buyer limit is ${maxPerBuyer}.`,
          code: "PER_BUYER_LIMIT",
        }, 409);
      }
    }

    // Atomic seat reservation — the actual concurrency guard for "200 people
    // checking out at once". reserve_tier is a service-role-only RPC that
    // increments reserved_qty inside a single UPDATE guarded by remaining
    // capacity, so two simultaneous requests for the last seat can't both
    // succeed. See studio-create-checkout for the identical contract.
    const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_tier", { p_tier_id: tierId, p_qty: quantity });
    if (reserveErr) {
      console.error("[revolut-create-checkout] reserve_tier failed:", reserveErr);
      return json({ error: "Could not reserve seats." }, 500);
    }
    if (!reserved) return json({ error: "Not enough tickets available." }, 409);
    reservedTierId = tierId;
    reservedQty = quantity;

    // Fee math: 5% on top for the buyer, at checkout. The organizer's 8% is
    // applied later, at withdrawal — see request-payout.
    const unitPrice = tier.price_cents;
    const subtotal = unitPrice * quantity;
    const buyerFeeCents = Math.round(subtotal * (BUYER_FEE_PERCENT / 100));
    const totalCents = subtotal + buyerFeeCents;

    const { data: order, error: orderErr } = await supabase
      .from("event_orders")
      .insert({
        event_id: ev.id, tier_id: tierId, organizer_id: org.id, buyer_id: user.id,
        quantity, unit_price_cents: unitPrice, total_cents: totalCents, fee_cents: buyerFeeCents,
        currency: tier.currency ?? "EUR", status: "pending", buyer_email: user.email ?? "",
        attendees: attendees.length > 0 ? attendees : null,
      })
      .select("id").single();
    if (orderErr || !order) {
      console.error("[revolut-create-checkout] order insert failed:", orderErr);
      await releaseReservation();
      return json({ error: "Could not create order." }, 500);
    }
    orderId = order.id;

    const revRes = await fetch(`${revolutBase}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${revolutSecret}`,
        "Revolut-Api-Version": revolutApiVersion,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        amount: totalCents,
        currency: (tier.currency ?? "EUR").toUpperCase(),
        description: `${ev.title} — ${tier.name} × ${quantity} · incl. ${BUYER_FEE_PERCENT}% service fee`,
        merchant_order_data: { reference: order.id },
        metadata: {
          source: "studio_primary_sale",
          order_id: order.id, event_id: ev.id, tier_id: tierId, organizer_id: org.id,
          quantity: String(quantity),
          buyer_fee_cents: String(buyerFeeCents),
          organizer_fee_percent: String(ORGANIZER_FEE_PERCENT),
        },
        redirect_url: `${siteUrl}/checkout/success?order_id=${order.id}&provider=revolut`,
      }),
    });
    const revText = await revRes.text();
    let revOrder: { id?: string; checkout_url?: string } = {};
    try { revOrder = JSON.parse(revText); } catch { /* empty body */ }

    if (!revRes.ok || !revOrder.checkout_url || !revOrder.id) {
      console.error("[revolut-create-checkout] revolut order failed:", revRes.status, revText);
      await releaseReservation();
      await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.id);
      return json({ error: "Could not start the checkout. Please try again." }, 502);
    }

    // Convention revolut-webhook already relies on: it looks up event_orders
    // by stripe_checkout_session_id = "revolut:<revolut_order_id>" (the same
    // column/prefix revolut-resale-checkout uses on the transactions table).
    await supabase.from("event_orders").update({ stripe_checkout_session_id: `revolut:${revOrder.id}` }).eq("id", order.id);

    return json({ url: revOrder.checkout_url, order_id: order.id });
  } catch (err) {
    console.error("[revolut-create-checkout] unexpected:", err);
    await releaseReservation();
    if (orderId) await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", orderId);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
