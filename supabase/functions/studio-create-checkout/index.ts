/**
 * studio-create-checkout — Supabase Edge Function (Deno)
 *
 * Fee model:
 *   Buyer pays the listed ticket price + 5% service fee at checkout.
 *   That 5% is recorded as event_orders.fee_cents (the only fee taken at
 *   order time).
 *   The 8% organizer-side fee is applied LATER, when the organizer
 *   requests a payout — see request-payout for the math at that point.
 *
 *   Per €10 ticket:
 *     buyer pays           €10.50
 *     buyer fee (5%)       €0.50  → Ticket Safe immediately
 *     organizer balance    €10.00 (the gross they see in their dashboard)
 *     on withdrawal of €10 → 8% = €0.80 deducted, €9.20 wired to IBAN
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

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
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!supabaseUrl || !supabaseKey || !stripeSecretKey) return json({ error: "Server misconfigured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  let reservedTierId: string | null = null;
  let reservedQty = 0;
  let orderId: string | null = null;
  const releaseReservation = async () => {
    if (reservedTierId && reservedQty > 0) await supabase.rpc("release_tier_reservation", { p_tier_id: reservedTierId, p_qty: reservedQty });
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    interface AttendeeIn { first_name?: string; last_name?: string; email?: string; }
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

    const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_tier", { p_tier_id: tierId, p_qty: quantity });
    if (reserveErr) return json({ error: "Could not reserve seats." }, 500);
    if (!reserved) return json({ error: "Not enough tickets available." }, 409);
    reservedTierId = tierId;
    reservedQty = quantity;

    // Fee math: 5% on top for the buyer. The 8% on the organizer is
    // applied at withdrawal time, NOT here.
    const unitPrice = tier.price_cents;
    const subtotal = unitPrice * quantity;
    const buyerFeeCents = Math.round(subtotal * (BUYER_FEE_PERCENT / 100));
    const totalCents = subtotal + buyerFeeCents;   // what the buyer pays
    const orderFeeCents = buyerFeeCents;            // only the 5% lives on the order
    const unitAmountWithFee = unitPrice + Math.round(buyerFeeCents / quantity);

    const { data: order, error: orderErr } = await supabase
      .from("event_orders")
      .insert({
        event_id: ev.id, tier_id: tierId, organizer_id: org.id, buyer_id: user.id,
        quantity, unit_price_cents: unitPrice, total_cents: totalCents, fee_cents: orderFeeCents,
        currency: tier.currency ?? "EUR", status: "pending", buyer_email: user.email ?? "",
        attendees: attendees.length > 0 ? attendees : null,
      })
      .select("id").single();
    if (orderErr || !order) { await releaseReservation(); return json({ error: "Could not create order." }, 500); }
    orderId = order.id;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity,
        price_data: {
          currency: (tier.currency ?? "EUR").toLowerCase(),
          unit_amount: unitAmountWithFee,
          product_data: {
            name: `${ev.title} — ${tier.name}`,
            description: `Ticket × ${quantity} · includes ${BUYER_FEE_PERCENT}% service fee`,
          },
        },
      }],
      payment_intent_data: {
        metadata: {
          source: "studio_primary_sale",
          order_id: order.id, event_id: ev.id, tier_id: tierId, organizer_id: org.id,
          quantity: String(quantity),
          buyer_fee_cents: String(buyerFeeCents),
          organizer_fee_percent: String(ORGANIZER_FEE_PERCENT),
        },
      },
      metadata: {
        source: "studio_primary_sale",
        order_id: order.id, event_id: ev.id, tier_id: tierId, organizer_id: org.id,
        quantity: String(quantity),
        buyer_fee_cents: String(buyerFeeCents),
        organizer_fee_percent: String(ORGANIZER_FEE_PERCENT),
      },
      customer_email: user.email ?? undefined,
      success_url: `${siteUrl}/checkout/success?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/e/${ev.slug ?? ""}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await supabase.from("event_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    return json({ url: session.url, order_id: order.id });
  } catch (err) {
    console.error("[studio-create-checkout] unexpected:", err);
    await releaseReservation();
    if (orderId) await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", orderId);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
