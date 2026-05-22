/**
 * studio-create-checkout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/studio-create-checkout
 * Authorization: Bearer <user-jwt>
 * Body: { tier_id: string, quantity: number }
 *
 * Flow (primary direct sale from an organizer to a buyer):
 *  1. Authenticate buyer
 *  2. Resolve tier → event → organizer + their stripe_account
 *  3. Atomically reserve qty seats via reserve_tier(tier_id, qty)
 *  4. Create event_orders row (status='pending')
 *  5. Create Stripe Checkout Session as a Destination Charge with
 *     application_fee_amount = 5% → funds settle on organizer's Connect acct
 *  6. Return { url } for the client to redirect to
 *  On any failure after reservation → release_tier_reservation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_FEE_PERCENT = 5;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_CENTS = 50;     // €0.50
const MAX_UNIT_PRICE_CENTS = 500_000; // €5,000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";

  if (!supabaseUrl || !supabaseKey || !stripeSecretKey) {
    return json({ error: "Server misconfigured." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let reservedTierId: string | null = null;
  let reservedQty = 0;
  let orderId: string | null = null;

  const releaseReservation = async () => {
    if (reservedTierId && reservedQty > 0) {
      await supabase.rpc("release_tier_reservation", { p_tier_id: reservedTierId, p_qty: reservedQty });
    }
  };

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Body ──────────────────────────────────────────────────────────────
    let body: { tier_id?: string; quantity?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const tierId = body.tier_id;
    const quantity = Math.floor(body.quantity ?? 1);
    if (!tierId || typeof tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(tierId)) {
      return json({ error: "Invalid tier_id" }, 400);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return json({ error: "Invalid quantity" }, 400);
    }

    // ── Fetch tier + event + organizer + Stripe Connect account ──────────
    const { data: tier, error: tierErr } = await supabase
      .from("event_tiers")
      .select(
        `id, event_id, name, price_cents, currency, total_qty, sold_qty, reserved_qty, is_active,
         event:events!inner(id, title, slug, status, organizer_id,
           organizer:organizer_profiles!events_organizer_id_fkey(id, user_id, name, status))`,
      )
      .eq("id", tierId)
      .maybeSingle();

    if (tierErr || !tier) return json({ error: "Tier not found" }, 404);

    const evRaw = (tier as { event: unknown }).event;
    const ev = Array.isArray(evRaw) ? evRaw[0] : evRaw;
    if (!ev) return json({ error: "Event not found" }, 404);
    if (ev.status !== "published") return json({ error: "Event is not available for sale." }, 400);

    const orgRaw = ev.organizer;
    const org = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw;
    if (!org || org.status !== "approved") {
      return json({ error: "Organizer not active." }, 400);
    }
    if (!tier.is_active) return json({ error: "Tier is not on sale." }, 400);
    if (tier.price_cents < MIN_UNIT_PRICE_CENTS || tier.price_cents > MAX_UNIT_PRICE_CENTS) {
      return json({ error: "Tier price out of bounds." }, 400);
    }

    const { data: stripeAcct } = await supabase
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("user_id", org.user_id)
      .maybeSingle();
    if (!stripeAcct?.stripe_account_id || !stripeAcct.charges_enabled) {
      return json({ error: "Organizer is not ready to accept payments." }, 400);
    }

    // ── Reserve seats atomically ─────────────────────────────────────────
    const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_tier", {
      p_tier_id: tierId,
      p_qty: quantity,
    });
    if (reserveErr) {
      console.error("[studio-create-checkout] reserve_tier error:", reserveErr);
      return json({ error: "Could not reserve seats." }, 500);
    }
    if (!reserved) {
      return json({ error: "Not enough tickets available." }, 409);
    }
    reservedTierId = tierId;
    reservedQty = quantity;

    // ── Create event_orders row (pending) ────────────────────────────────
    const unitPrice = tier.price_cents;
    const subtotal = unitPrice * quantity;
    const feeCents = Math.round(subtotal * (PLATFORM_FEE_PERCENT / 100));
    const grandTotal = subtotal + feeCents;

    const { data: order, error: orderErr } = await supabase
      .from("event_orders")
      .insert({
        event_id: ev.id,
        tier_id: tierId,
        organizer_id: org.id,
        buyer_id: user.id,
        quantity,
        unit_price_cents: unitPrice,
        total_cents: grandTotal,
        fee_cents: feeCents,
        currency: tier.currency ?? "EUR",
        status: "pending",
        buyer_email: user.email ?? "",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[studio-create-checkout] create order error:", orderErr);
      await releaseReservation();
      return json({ error: "Could not create order." }, 500);
    }
    orderId = order.id;

    // ── Create Stripe Checkout Session (Destination Charge) ──────────────
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity,
          price_data: {
            currency: (tier.currency ?? "EUR").toLowerCase(),
            unit_amount: unitPrice + Math.round(feeCents / quantity), // include fee in unit so Stripe shows the right per-ticket total
            product_data: {
              name: `${ev.title} — ${tier.name}`,
              description: `Ticket × ${quantity}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: stripeAcct.stripe_account_id },
        metadata: {
          source: "studio_primary_sale",
          order_id: order.id,
          event_id: ev.id,
          tier_id: tierId,
          quantity: String(quantity),
        },
      },
      metadata: {
        source: "studio_primary_sale",
        order_id: order.id,
        event_id: ev.id,
        tier_id: tierId,
        quantity: String(quantity),
      },
      customer_email: user.email ?? undefined,
      success_url: `${siteUrl}/checkout/success?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/e/${ev.slug ?? ""}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    });

    // Save session id on order
    await supabase
      .from("event_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return json({ url: session.url, order_id: order.id });
  } catch (err) {
    console.error("[studio-create-checkout] unexpected:", err);
    await releaseReservation();
    if (orderId) {
      await supabase
        .from("event_orders")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", orderId);
    }
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
