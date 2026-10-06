/**
 * stripe-connect-create-checkout — Studio primary sale via Stripe Connect
 * DESTINATION CHARGES (Deno).
 *
 * Mirrors revolut-create-checkout's reservation/guest/promo-code logic
 * exactly (same tables, same RPCs, same guest-shadow-account pattern) but
 * creates a Stripe Checkout Session on TicketSafe's platform account instead
 * of a Revolut order. The buyer pays ticket price + service fee. At payment
 * time Stripe transfers the ticket price to the organizer's connected account
 * (`transfer_data.destination`) and keeps the service fee on the platform
 * (`application_fee_amount`). Stripe's processing fee is charged to the
 * platform, never to the organizer, who receives the full ticket price.
 * The organizer's money never reaches TicketSafe's bank account: it only
 * passes through the platform's Stripe balance for the duration of the
 * transfer. Refunds go through _shared/stripeRefund.ts (reverse_transfer).
 *
 * Stripe-hosted Checkout (not embedded Payment Element) — same UX pattern
 * as the existing Revolut flow (redirect to a hosted page, return via
 * success_url/cancel_url). Apple Pay / Google Pay are automatic payment
 * methods Stripe Checkout enables itself; no separate wiring needed for
 * the hosted-Checkout path. (If this later moves to an embedded Payment
 * Element for a fully white-labeled checkout, the ticket-safe.eu Apple Pay
 * domain registration below becomes load-bearing — it's registered now so
 * that migration has one less step.)
 *
 * Ticket issuance happens in stripe-connect-webhook on
 * checkout.session.completed, exactly like revolut-webhook does for
 * revolut-create-checkout.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { getOrCreateGuestAccount } from "../_shared/getOrCreateGuestAccount.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MAX_QUANTITY = 10;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";

interface AttendeeIn { first_name?: string; last_name?: string; email?: string; gender?: string }
interface GuestIn { name?: string; email?: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let reservedTierId: string | null = null;
  let reservedQty = 0;

  const bail = async (status: number, error: string) => {
    if (reservedTierId && reservedQty > 0) {
      await supabase.rpc("release_tier_reservation", { p_tier_id: reservedTierId, p_qty: reservedQty });
    }
    return json({ error }, status);
  };

  try {
    let body: { tier_id?: string; quantity?: number; attendees?: AttendeeIn[]; guest?: GuestIn; promo_code?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const tierId = body.tier_id;
    const quantity = Math.floor(body.quantity ?? 1);
    if (!tierId || typeof tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(tierId)) return json({ error: "Invalid tier_id" }, 400);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return json({ error: "Invalid quantity" }, 400);

    // ── Buyer identity: logged-in session OR guest (same as revolut-create-checkout) ──
    let buyerId: string;
    let buyerEmail: string;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return json({ error: "Invalid session" }, 401);
      buyerId = user.id;
      buyerEmail = user.email ?? "";
    } else {
      const guestName = (body.guest?.name ?? "").trim();
      const guestEmail = (body.guest?.email ?? "").trim().toLowerCase();
      if (guestName.length < 1 || guestName.length > 200) return json({ error: "Please enter your name." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 254) return json({ error: "Please enter a valid email address." }, 400);
      const guestUserId = await getOrCreateGuestAccount(supabase, guestEmail, guestName);
      if (!guestUserId) return json({ error: "Could not start checkout. Please try again." }, 500);
      buyerId = guestUserId;
      buyerEmail = guestEmail;
    }

    if (body.attendees && body.attendees.length !== quantity) {
      return json({ error: "Attendee list must match the ticket quantity." }, 400);
    }

    const { data: tier } = await supabase
      .from("event_tiers")
      .select(`id, event_id, name, price_cents, currency, total_qty, sold_qty, reserved_qty, is_active,
               event:events(id, title, status, is_active, date, organizer_id, max_tickets_per_buyer, payment_provider, commission_override_cents)`)
      .eq("id", tierId).maybeSingle();
    if (!tier) return json({ error: "Ticket tier not found" }, 404);
    const ev = (tier as { event?: { id: string; title: string; status: string; is_active: boolean; date: string; organizer_id: string; max_tickets_per_buyer: number | null; payment_provider: string; commission_override_cents: number | null } | null }).event ?? null;
    if (!ev) return json({ error: "Event not found" }, 404);
    if (ev.payment_provider !== "stripe") return json({ error: "This event is not on Stripe Connect." }, 409);
    if (ev.status !== "published" || !ev.is_active) return json({ error: "This event is not on sale." }, 409);
    if (!tier.is_active) return json({ error: "This ticket type is no longer available." }, 409);

    const available = tier.total_qty - tier.sold_qty - tier.reserved_qty;
    if (available < quantity) return json({ error: `Only ${Math.max(0, available)} left.` }, 409);

    if (ev.max_tickets_per_buyer) {
      const { data: alreadyOwned } = await supabase.rpc("buyer_ticket_count_for_event", { p_event_id: ev.id, p_buyer_id: buyerId });
      const already = Number(alreadyOwned ?? 0);
      if (already + quantity > ev.max_tickets_per_buyer) {
        return json({ error: `You can only buy ${ev.max_tickets_per_buyer} ticket(s) for this event.` }, 409);
      }
    }

    // ── Connected account must be ready to accept charges ──
    const { data: connectAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("organizer_id", ev.organizer_id)
      .maybeSingle();
    if (!connectAccount || !connectAccount.charges_enabled) {
      return json({ error: "This organizer isn't ready to accept payments yet." }, 409);
    }

    // ── Reserve stock atomically (same RPC as Revolut path) ──
    const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_tier", { p_tier_id: tierId, p_qty: quantity });
    if (reserveErr || reserved === false) return json({ error: "Could not reserve tickets — try again." }, 409);
    reservedTierId = tierId;
    reservedQty = quantity;

    // ── Promo code (subtotal discount only, mirrors revolut-create-checkout) ──
    let unitPriceCents = tier.price_cents;
    let promoCodeId: string | null = null;
    const rawPromoCode = (body.promo_code ?? "").trim().toUpperCase();
    if (rawPromoCode && tier.price_cents > 0) {
      const { data: promo } = await supabase
        .from("event_promo_codes")
        .select("id, code, discount_type, discount_value, max_uses, used_count, is_active")
        .eq("event_id", ev.id).eq("code", rawPromoCode).maybeSingle();
      if (promo && promo.is_active && (promo.max_uses === null || promo.used_count < promo.max_uses)) {
        const discountCents = promo.discount_type === "percent"
          ? Math.round(tier.price_cents * (promo.discount_value / 100))
          : Math.round(promo.discount_value * 100);
        unitPriceCents = Math.max(0, tier.price_cents - Math.min(discountCents, tier.price_cents));
        promoCodeId = promo.id;
        await supabase.from("event_promo_codes").update({ used_count: promo.used_count + 1 }).eq("id", promo.id);
      }
    }

    // ── Commission: per-ticket, from the price band (or the event's override) ──
    const { data: commissionResult } = await supabase.rpc("get_studio_commission_cents", {
      p_price_cents: unitPriceCents,
      p_override_cents: ev.commission_override_cents,
    });
    // The fee is paid by the buyer on top of the ticket price (4 % + 0,80 €,
    // min 0,70 €, max 3,50 €, or the event's negotiated override). The
    // organizer receives the full ticket price. The database function is the
    // only place the fee is computed.
    if (typeof commissionResult !== "number") {
      await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: quantity });
      return json({ error: "Could not compute the service fee. Please try again." }, 500);
    }
    const commissionPerTicket = commissionResult;
    const totalTicketCents = unitPriceCents * quantity;
    const totalCommissionCents = commissionPerTicket * quantity;

    // ── Create the order row (pending) before the Stripe call ──
    const { data: order, error: orderErr } = await supabase.from("event_orders").insert({
      event_id: ev.id,
      tier_id: tierId,
      buyer_id: buyerId,
      buyer_email: buyerEmail,
      quantity,
      // Same meaning as the Revolut orders: total paid by the buyer, of which fee_cents is the service fee.
      total_cents: totalTicketCents + totalCommissionCents,
      fee_cents: totalCommissionCents,
      commission_cents: totalCommissionCents,
      attendees: body.attendees ?? null,
      status: "pending",
    }).select("id").single();
    if (orderErr || !order) {
      await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: quantity });
      console.error("[stripe-connect-create-checkout] order insert failed:", orderErr);
      return json({ error: "Could not create order." }, 500);
    }

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (err) {
      await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: quantity });
      console.error("[stripe-connect-create-checkout] Stripe client init failed:", err);
      return bail(500, "Payments are not configured yet.");
    }

    // Free tickets (unitPriceCents === 0) never reach Stripe at all — same
    // policy as the Revolut side ("Free tickets: issue directly, no
    // payment step"). The webhook-equivalent finalize path runs inline
    // here instead of waiting for a Stripe event that will never arrive.
    if (totalTicketCents === 0) {
      const { data: upd } = await supabase.from("event_orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id).eq("status", "pending").select("id");
      if (upd && upd.length > 0) {
        await supabase.rpc("finalize_tier_sale", { p_tier_id: tierId, p_qty: quantity });
        try {
          await fetch(`${supabaseUrl}/functions/v1/replay-order-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify({ order_id: order.id, admin_secret: Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026" }),
          });
        } catch (e) { console.warn("[stripe-connect-create-checkout] free-ticket email failed:", e); }
      }
      return json({ free: true, order_id: order.id });
    }

    try {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: (tier.currency ?? "eur").toLowerCase(),
                unit_amount: unitPriceCents,
                product_data: { name: `${ev.title} — ${tier.name}` },
              },
              quantity,
            },
            // Shown as its own line so the buyer sees ticket price + service fee + total.
            ...(commissionPerTicket > 0
              ? [{
                  price_data: {
                    currency: (tier.currency ?? "eur").toLowerCase(),
                    unit_amount: commissionPerTicket,
                    product_data: { name: "Frais de service Ticket Safe" },
                  },
                  quantity,
                }]
              : []),
          ],
          payment_intent_data: {
            // The service fee stays on the platform; the ticket price goes to
            // the organizer. Stripe's processing fee is taken from the platform.
            application_fee_amount: totalCommissionCents,
            transfer_data: { destination: connectAccount.stripe_account_id },
            metadata: { source: "stripe_connect_studio_sale", order_id: order.id, event_id: ev.id },
          },
          success_url: `${SITE_URL}/checkout/success?order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SITE_URL}/e/${ev.id}?checkout=cancelled`,
          customer_email: buyerEmail || undefined,
          metadata: { source: "stripe_connect_studio_sale", order_id: order.id, tier_id: tierId, event_id: ev.id, quantity: String(quantity) },
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min, matches the existing reservation TTL
        },
        // Created on the platform account (destination charge), not on the connected account.
      );

      await supabase.from("event_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);

      return json({ url: session.url, order_id: order.id, provider: "stripe" });
    } catch (err) {
      await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.id);
      await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: quantity });
      console.error("[stripe-connect-create-checkout] Stripe session creation failed:", err);
      const message = err instanceof Error ? err.message : "Could not start checkout.";
      return json({ error: message }, 502);
    }
  } catch (err) {
    console.error("[stripe-connect-create-checkout] unexpected error:", err);
    return bail(500, "Something went wrong. Please try again.");
  }
});
