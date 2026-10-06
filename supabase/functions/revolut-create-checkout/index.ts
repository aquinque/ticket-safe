/**
 * revolut-create-checkout — Studio primary sale via Revolut Merchant (Deno).
 * Mirrors studio-create-checkout but creates a Revolut order instead of a Stripe
 * session. Returns the hosted checkout_url to redirect the buyer to. Tickets are
 * issued later by revolut-webhook once Revolut confirms the order is completed.
 *
 * Fee model:
 *   Buyer pays the listed ticket price + a service fee PER TICKET, computed in
 *   the database by get_studio_commission_cents (4 % + 0,80 €, min 0,70 €,
 *   max 3,50 €, or the event's negotiated override). That's the only fee
 *   anywhere in this flow — Ticket Safe takes no fee from the organizer; they
 *   withdraw 100% of their gross balance.
 *
 * Guest checkout:
 *   No Ticket Safe account is required to buy. With a valid Authorization
 *   header we use the signed-in user as normal; otherwise the request must
 *   carry `guest: { name, email }` and we resolve (or silently create) a
 *   passwordless shadow account for that email via getOrCreateGuestAccount,
 *   so every downstream table (event_orders, event_tickets, RLS) keeps
 *   working exactly as it does for a logged-in buyer.
 *
 * Promo codes (optional `promo_code` in the body):
 *   Validated against event_promo_codes for this event, discounts the
 *   ticket subtotal only (never the buyer service fee), capped so the
 *   discount can never exceed the subtotal. used_count is bumped
 *   optimistically (same pattern as reserve_tier) and rolled back on any
 *   later failure.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrCreateGuestAccount } from "../_shared/getOrCreateGuestAccount.ts";
import { newAccessToken, hashAccessToken } from "../_shared/guestAccess.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The service fee is never defined here: it comes from the database function
// get_studio_commission_cents, shared with the Stripe checkout and the site.
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_CENTS = 50;
const MAX_UNIT_PRICE_CENTS = 500_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface AttendeeRow { first_name: string; last_name: string; email: string; gender: string; }

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Same token format revolut-webhook signs for studio tickets, so the door
// scanner accepts a free ticket exactly like a paid one.
async function signStudioTicketJWT(secret: string, p: { ticket_id: string; event_id: string; exp_seconds: number }): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: "ticket-safe.eu/studio", sub: p.ticket_id, evt: p.event_id, iat: Math.floor(Date.now() / 1000), exp: p.exp_seconds };
  const data = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

// Marks a €0 order paid, issues its tickets, moves the seats from reserved to
// sold, and sends the ticket email. Returns false when nothing was issued, in
// which case the order is left cancelled or pending for the caller to clean up.
async function issueFreeTickets(
  supabase: ReturnType<typeof createClient>,
  o: { orderId: string; eventId: string; tierId: string; quantity: number; buyerId: string; buyerEmail: string; attendees: AttendeeRow[] },
  env: { supabaseUrl: string; supabaseKey: string },
): Promise<boolean> {
  // Both secrets must be configured. Without them nothing is issued, so a
  // free ticket can never exist without its QR being signed or emailed.
  const signingSecret = Deno.env.get("TICKET_SIGNING_SECRET");
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET");
  if (!signingSecret || !replaySecret) {
    console.error("[revolut-create-checkout] TICKET_SIGNING_SECRET or REPLAY_ADMIN_SECRET missing; cannot issue free tickets");
    return false;
  }

  const { data: paidRows, error: paidErr } = await supabase
    .from("event_orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", o.orderId)
    .eq("status", "pending")
    .select("id");
  if (paidErr || !paidRows || paidRows.length === 0) return false;

  const { data: evRow } = await supabase.from("events").select("date").eq("id", o.eventId).maybeSingle();
  const expSeconds = evRow?.date
    ? Math.floor(new Date(evRow.date).getTime() / 1000) + 86_400
    : Math.floor(Date.now() / 1000) + 30 * 86_400;

  const ticketRows = await Promise.all(Array.from({ length: o.quantity }).map(async (_, i) => {
    const att = o.attendees[i] ?? null;
    const ticketId = crypto.randomUUID();
    const qrToken = await signStudioTicketJWT(signingSecret, { ticket_id: ticketId, event_id: o.eventId, exp_seconds: expSeconds });
    return {
      id: ticketId,
      order_id: o.orderId,
      event_id: o.eventId,
      tier_id: o.tierId,
      buyer_id: o.buyerId,
      qr_token: qrToken,
      holder_first_name: att?.first_name ?? null,
      holder_last_name: att?.last_name ?? null,
      holder_email: att?.email ?? o.buyerEmail ?? null,
      holder_gender: att?.gender ?? null,
      status: "valid",
    };
  }));

  const { error: tixErr } = await supabase.from("event_tickets").insert(ticketRows);
  if (tixErr) {
    console.error("[revolut-create-checkout] free event_tickets insert failed:", tixErr);
    await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", o.orderId);
    return false;
  }

  const { error: finErr } = await supabase.rpc("finalize_tier_sale", { p_tier_id: o.tierId, p_qty: o.quantity });
  if (finErr) console.error("[revolut-create-checkout] finalize_tier_sale failed:", finErr);

  try {
    await fetch(`${env.supabaseUrl}/functions/v1/replay-order-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
      body: JSON.stringify({ order_id: o.orderId, admin_secret: replaySecret }),
    });
  } catch (e) {
    console.warn("[revolut-create-checkout] free ticket email failed:", e);
  }
  return true;
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
  if (!revolutSecret) return json({ error: "Revolut not configured (REVOLUT_MERCHANT_SECRET_KEY missing)." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);

  let reservedTierId: string | null = null;
  let reservedQty = 0;
  let orderId: string | null = null;
  const releaseReservation = async () => {
    if (reservedTierId && reservedQty > 0) await supabase.rpc("release_tier_reservation", { p_tier_id: reservedTierId, p_qty: reservedQty });
  };
  let promoCodeId: string | null = null;
  let usedPromoCode = false;
  const releasePromoUse = async () => {
    if (usedPromoCode && promoCodeId) {
      const { data: current } = await supabase.from("event_promo_codes").select("used_count").eq("id", promoCodeId).maybeSingle();
      if (current) await supabase.from("event_promo_codes").update({ used_count: Math.max(0, current.used_count - 1) }).eq("id", promoCodeId);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    let user: { id: string; email?: string | null } | null = null;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      user = data?.user ?? null;
    }

    interface AttendeeIn { first_name?: string; last_name?: string; email?: string; gender?: string; }
    interface GuestIn { name?: string; email?: string; }
    let body: { tier_id?: string; quantity?: number; attendees?: AttendeeIn[]; guest?: GuestIn; promo_code?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    let buyerId: string;
    let buyerEmail: string;
    if (user) {
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

    try {
      const { data: rlOk } = await supabase.rpc("rate_limit_consume", { p_bucket: "studio_checkout", p_key: buyerId, p_max_hits: 12, p_window_sec: 60 });
      if (rlOk === false) return json({ error: "Too many checkout attempts. Please wait a minute and try again." }, 429);
    } catch { /* fail open */ }

    const tierId = body.tier_id;
    const quantity = Math.floor(body.quantity ?? 1);
    if (!tierId || typeof tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(tierId)) return json({ error: "Invalid tier_id" }, 400);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return json({ error: "Invalid quantity" }, 400);

    const attendees: { first_name: string; last_name: string; email: string; gender: string }[] = [];
    if (Array.isArray(body.attendees) && body.attendees.length > 0) {
      if (body.attendees.length !== quantity) return json({ error: "Attendee list must match the ticket quantity." }, 400);
      for (const a of body.attendees) {
        const first = (a?.first_name ?? "").trim();
        const last = (a?.last_name ?? "").trim();
        const email = (a?.email ?? "").trim().toLowerCase();
        const gender = (a?.gender ?? "").trim().toLowerCase();
        if (first.length < 1 || first.length > 100) return json({ error: "Each attendee needs a first name." }, 400);
        if (last.length < 1 || last.length > 100) return json({ error: "Each attendee needs a last name." }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Each attendee needs a valid email." }, 400);
        if (gender !== "female" && gender !== "male" && gender !== "other") return json({ error: "Each attendee needs a gender." }, 400);
        attendees.push({ first_name: first, last_name: last, email, gender });
      }
    }

    const { data: tier, error: tierErr } = await supabase
      .from("event_tiers")
      .select(`id, event_id, name, price_cents, currency, total_qty, sold_qty, reserved_qty, is_active,
               event:events!inner(id, title, slug, status, organizer_id, max_tickets_per_buyer, commission_override_cents,
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
    // €0 is a valid free tier. A paid tier must be at least MIN_UNIT_PRICE_CENTS.
    if (tier.price_cents < 0 || tier.price_cents > MAX_UNIT_PRICE_CENTS || (tier.price_cents > 0 && tier.price_cents < MIN_UNIT_PRICE_CENTS)) return json({ error: "Tier price out of bounds." }, 400);

    const maxPerBuyer = (ev as { max_tickets_per_buyer?: number | null }).max_tickets_per_buyer;
    if (Number.isInteger(maxPerBuyer) && maxPerBuyer && maxPerBuyer > 0) {
      const { data: alreadyOwned } = await supabase.rpc("buyer_ticket_count_for_event", { p_event_id: ev.id, p_buyer_id: buyerId });
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

    // Promo code (optional) — discounts the ticket price only, never the
    // flat buyer service tax. Validated against this event specifically.
    let discountCents = 0;
    const rawPromoCode = (body.promo_code ?? "").trim().toUpperCase();
    // Promo codes have nothing to discount on a free ticket, so they are ignored there.
    if (rawPromoCode && tier.price_cents > 0) {
      const { data: promo } = await supabase
        .from("event_promo_codes")
        .select("id, discount_type, discount_value, max_uses, used_count, is_active, expires_at")
        .eq("event_id", ev.id)
        .eq("code", rawPromoCode)
        .maybeSingle();
      if (!promo || !promo.is_active || (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) || (promo.max_uses != null && promo.used_count >= promo.max_uses)) {
        await releaseReservation();
        return json({ error: "This promo code is invalid or has expired." }, 400);
      }
      const subtotalForDiscount = tier.price_cents * quantity;
      discountCents = promo.discount_type === "percent"
        ? Math.round(subtotalForDiscount * (promo.discount_value / 100))
        : Math.min(promo.discount_value, subtotalForDiscount);
      promoCodeId = promo.id;
      // Optimistic increment, mirroring reserve_tier's optimistic hold — rolled
      // back via releasePromoUse() if anything downstream fails.
      const { error: incErr } = await supabase
        .from("event_promo_codes")
        .update({ used_count: promo.used_count + 1 })
        .eq("id", promo.id)
        .eq("used_count", promo.used_count);
      if (incErr) { await releaseReservation(); return json({ error: "This promo code was just claimed by someone else. Please try again." }, 409); }
      usedPromoCode = true;
    }

    // Service fee: one ticket at the list price, from the database formula
    // (negotiated override applied there), times the quantity. The promo
    // discount does not change it. A free ticket gets 0. Ticket Safe takes no
    // fee from the organizer, at checkout or withdrawal.
    const unitPrice = tier.price_cents;
    const subtotal = unitPrice * quantity;
    const { data: feeResult, error: feeErr } = await supabase.rpc("get_studio_commission_cents", {
      p_price_cents: unitPrice,
      p_override_cents: (ev as { commission_override_cents?: number | null }).commission_override_cents ?? null,
    });
    if (feeErr || typeof feeResult !== "number") {
      console.error("[revolut-create-checkout] service fee lookup failed:", feeErr);
      await releaseReservation();
      await releasePromoUse();
      return json({ error: "Could not compute the service fee. Please try again." }, 500);
    }
    const buyerFeeCents = feeResult * quantity;
    const totalCents = subtotal - discountCents + buyerFeeCents;
    const orderFeeCents = buyerFeeCents;

    const { data: order, error: orderErr } = await supabase
      .from("event_orders")
      .insert({
        event_id: ev.id, tier_id: tierId, organizer_id: org.id, buyer_id: buyerId,
        quantity, unit_price_cents: unitPrice, total_cents: totalCents, fee_cents: orderFeeCents,
        currency: tier.currency ?? "EUR", status: "pending", buyer_email: buyerEmail,
        attendees: attendees.length > 0 ? attendees : null,
        promo_code_id: promoCodeId, discount_cents: discountCents,
      })
      .select("id").single();
    if (orderErr || !order) { await releaseReservation(); await releasePromoUse(); return json({ error: "Could not create order." }, 500); }
    orderId = order.id;

    // Access for the buyer who has no account: a secret that opens only this order's
    // tickets, on the success page. A failure here must never block the purchase.
    let orderToken: string | null = null;
    try {
      const candidate = newAccessToken();
      const { error: tokErr } = await supabase.from("guest_access_tokens").insert({
        token_hash: await hashAccessToken(candidate),
        scope: "order",
        order_id: order.id,
      });
      if (!tokErr) orderToken = candidate;
      else console.warn("[revolut-create-checkout] order access token not saved:", tokErr);
    } catch (e) {
      console.warn("[revolut-create-checkout] order access token skipped:", e);
    }

    // Free ticket (€0): nothing to charge, so no Revolut order. The tickets are
    // issued right here, with the same steps revolut-webhook runs once a paid
    // order completes.
    if (unitPrice === 0) {
      const issued = await issueFreeTickets(
        supabase,
        {
          orderId: order.id,
          eventId: ev.id,
          tierId,
          quantity,
          buyerId,
          buyerEmail,
          attendees,
        },
        { supabaseUrl, supabaseKey },
      );
      if (!issued) {
        await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pending");
        await releaseReservation();
        return json({ error: "Could not issue your free ticket. Please try again." }, 500);
      }
      // The seats were moved to sold by issueFreeTickets, so there is nothing to release.
      reservedTierId = null;
      reservedQty = 0;
      return json({ free: true, order_id: order.id, provider: "free", order_token: orderToken });
    }

    // Create the Revolut order (hosted checkout). We verify completion later
    // server-side via GET /orders/{id} in revolut-webhook, so no signature
    // secret is required.
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
        description: `${ev.title} — ${tier.name} x${quantity}`,
        merchant_order_data: { reference: order.id },
        metadata: { order_id: order.id, source: "studio_primary_sale", event_id: ev.id, tier_id: tierId },
        redirect_url: `${siteUrl}/checkout/success?order_id=${order.id}&provider=revolut${orderToken ? `&t=${orderToken}` : ""}`,
      }),
    });
    const revText = await revRes.text();
    let revOrder: { id?: string; checkout_url?: string } = {};
    try { revOrder = JSON.parse(revText); } catch { /* keep empty */ }
    if (!revRes.ok || !revOrder.checkout_url || !revOrder.id) {
      console.error("[revolut-create-checkout] revolut order failed:", revRes.status, revText);
      await releaseReservation();
      await releasePromoUse();
      if (orderId) await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", orderId);
      return json({ error: "Could not start the Revolut checkout. Please try again." }, 502);
    }

    // Store the Revolut order id so the webhook can match it back to this order.
    await supabase.from("event_orders").update({ stripe_checkout_session_id: `revolut:${revOrder.id}` }).eq("id", order.id);

    return json({ url: revOrder.checkout_url, order_id: order.id, provider: "revolut" });
  } catch (err) {
    console.error("[revolut-create-checkout] unexpected:", err);
    await releaseReservation();
    await releasePromoUse();
    if (orderId) await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", orderId);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
