/**
 * stripe-connect-resale-checkout — resale buyer checkout via Stripe (Deno).
 *
 * The charge lands on the PLATFORM's Stripe account: the seller needs no
 * Stripe account to list or sell. They add their bank details after the sale
 * (stripe-connect-onboard-reseller), and stripe-connect-payout-cron transfers
 * their share once the event is over.
 *
 * Money (all on the transaction row):
 *   amount           = what the buyer pays, ticket price + buyer fee (euros)
 *   fee_amount       = buyer fee, 5 % of the ticket price (euros)
 *   commission_cents = seller fee, 5 % of the ticket price
 *   the seller receives amount - fee_amount - commission_cents.
 *
 * Same request and checks as the Revolut resale checkout it replaces:
 * verified listings only, the buyer's accepted offer price wins over the
 * listing price, the final price per ticket must be at or under the resale
 * cap (_shared/resalePriceCap.ts), guests can buy without an account.
 *
 * Reservation (_shared/resaleReservation.ts): reserve_resale_listing (SQL)
 * locks the listing, checks it is still on sale at the price this request
 * read, creates the pending transaction and holds the listing for that
 * transaction for 35 minutes (RESERVATION_HOLD_SECONDS), all at once. Two
 * buyers can't hold the same listing: the second gets 409 RESERVED. The same
 * buyer starting again takes their own hold back, and their previous Stripe
 * session is expired. Expired holds are released by
 * release_expired_resale_reservations, and a failure after reserving
 * releases only this request's hold (release_resale_reservation). The Stripe
 * session lives 30 minutes, so it always ends before the hold.
 *
 * Completion (complete_resale_purchase: mark sold, transfer the ticket,
 * emails, automatic refund if the ticket went elsewhere) is handled by
 * stripe-connect-webhook.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { getOrCreateGuestAccount } from "../_shared/getOrCreateGuestAccount.ts";
import { checkResalePrice, parseResaleCap } from "../_shared/resalePriceCap.ts";
import {
  RESERVATION_HOLD_SECONDS,
  parseReserveResult,
  reserveOutcomeResponse,
  stripeSessionExpiresAt,
} from "../_shared/resaleReservation.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
/** Buyer service fee on a resale, on top of the listing price (src/lib/fees.ts BUYER_FEE_RATE). */
const BUYER_FEE_PERCENT = 5;
const MAX_UNIT_PRICE_EUR = 5000;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_EUR = 0.5;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  /** Set once this request holds the listing; released if anything fails before the Stripe session is saved. */
  let reservedTransactionId: string | null = null;

  try {
    let body: { listingId?: string; listing_id?: string; guest?: { name?: string; email?: string } };
    try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
    const listingId = body.listingId ?? body.listing_id;
    if (!listingId || !UUID_V4.test(listingId)) return json({ error: "Invalid listing identifier." }, 400);

    let user: { id: string; email?: string | null } | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(authHeader.slice(7));
      user = data?.user ?? null;
    }
    if (!user) {
      const guestName = (body.guest?.name ?? "").trim();
      const guestEmail = (body.guest?.email ?? "").trim().toLowerCase();
      if (guestName.length < 1 || guestName.length > 200) return json({ error: "Please enter your name." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 254) return json({ error: "Please enter a valid email address." }, 400);
      const guestUserId = await getOrCreateGuestAccount(supabase, guestEmail, guestName);
      if (!guestUserId) return json({ error: "Could not start checkout. Please try again." }, 500);
      user = { id: guestUserId, email: guestEmail };
    }

    try {
      const { data: rlOk } = await supabase.rpc("rate_limit_consume", { p_bucket: "resale_checkout", p_key: user.id, p_max_hits: 12, p_window_sec: 60 });
      if (rlOk === false) return json({ error: "Too many checkout attempts. Please wait a minute and try again." }, 429);
    } catch { /* fail open */ }

    // Abandoned checkouts give their ticket back once their hold has expired.
    // Best effort: reserve_resale_listing also takes over an expired hold.
    try {
      const { error: sweepErr } = await supabase.rpc("release_expired_resale_reservations");
      if (sweepErr) console.warn("[stripe-connect-resale-checkout] release_expired_resale_reservations:", sweepErr.message);
    } catch (e) { console.warn("[stripe-connect-resale-checkout] release_expired_resale_reservations:", e); }

    // Only a listing an admin has verified can be paid for with real money.
    // A reserved listing is read too: its hold may have expired, or belong to
    // this buyer; reserve_resale_listing decides.
    const { data: listing } = await supabase
      .from("tickets")
      .select("id, seller_id, event_id, studio_ticket_id, selling_price, quantity, events(id, title)")
      .eq("id", listingId).in("status", ["available", "reserved"]).eq("verification_status", "verified")
      .maybeSingle();
    if (!listing) return json({ error: "This ticket is no longer available." }, 404);
    if (listing.seller_id === user.id) return json({ error: "You cannot purchase your own ticket." }, 400);

    // A price the seller accepted in chat wins over the listing price.
    let negotiatedPrice: number | null = null;
    {
      const { data: acceptedOffer } = await supabase
        .from("offers")
        .select("price, conversation:conversations!inner(ticket_id, buyer_id)")
        .eq("status", "accepted")
        .eq("conversations.ticket_id", listingId)
        .eq("conversations.buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (acceptedOffer && Number.isFinite(acceptedOffer.price) && acceptedOffer.price > 0) negotiatedPrice = acceptedOffer.price;
    }

    const qty = Math.min(Math.max(1, listing.quantity ?? 1), MAX_QUANTITY);
    const unitPrice = Math.min(Math.max(MIN_UNIT_PRICE_EUR, Number(negotiatedPrice ?? listing.selling_price) || 0), MAX_UNIT_PRICE_EUR);
    const unitCents = Math.round(unitPrice * 100);

    // The final price per ticket must stay under the resale cap (organizer's
    // maximum, else face value + the default markup). Checked before the
    // ticket is reserved, so a refused price holds nothing.
    {
      let tierId: string | null = null;
      if (listing.studio_ticket_id) {
        const { data: studioTicket } = await supabase.from("event_tickets").select("tier_id").eq("id", listing.studio_ticket_id).maybeSingle();
        tierId = (studioTicket as { tier_id?: string | null } | null)?.tier_id ?? null;
      }
      const eventId = listing.event_id ?? (listing.events as { id?: string } | null)?.id ?? null;
      if (eventId) {
        const { data: capRow, error: capErr } = await supabase.rpc("resale_price_cap", { p_event_id: eventId, p_tier_id: tierId });
        if (capErr) throw new Error("Resale price cap lookup failed: " + capErr.message);
        const check = checkResalePrice(unitCents, parseResaleCap(capRow), negotiatedPrice != null);
        if (!check.ok) return json({ error: check.error, code: "PRICE_ABOVE_CAP" }, 422);
      }
    }

    const subtotalCents = unitCents * qty;
    const buyerFeeCents = Math.round((subtotalCents * BUYER_FEE_PERCENT) / 100);
    const totalCents = subtotalCents + buyerFeeCents;
    const { data: commissionResult } = await supabase.rpc("get_resale_commission_cents", { p_price_cents: subtotalCents });
    const commissionCents = Number(commissionResult ?? 0);

    // Lock, re-check and hold the listing, and create the pending transaction,
    // in one SQL call. The listing price read above must still be the price.
    const { data: reserveRows, error: reserveErr } = await supabase.rpc("reserve_resale_listing", {
      p_listing_id: listingId,
      p_buyer_id: user.id,
      p_expected_unit_price: listing.selling_price,
      p_quantity: qty,
      p_amount_cents: totalCents,
      p_fee_cents: buyerFeeCents,
      p_commission_cents: commissionCents,
      p_hold_seconds: RESERVATION_HOLD_SECONDS,
    });
    if (reserveErr) throw new Error("reserve_resale_listing failed: " + reserveErr.message);
    const reservation = parseReserveResult(reserveRows);
    if (reservation.outcome !== "reserved" || !reservation.transactionId) {
      const refused = reserveOutcomeResponse(reservation);
      return json(refused.body, refused.status);
    }
    const tx = { id: reservation.transactionId };
    reservedTransactionId = tx.id;

    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "Ticket Safe";
    const stripe = getStripeClient();

    // The same buyer started again: their earlier session can no longer win
    // the listing, so close it on Stripe's side too.
    if (reservation.previousTransactionId) {
      try {
        const { data: prev } = await supabase.from("transactions").select("stripe_checkout_session_id").eq("id", reservation.previousTransactionId).maybeSingle();
        const prevSessionId = (prev as { stripe_checkout_session_id?: string | null } | null)?.stripe_checkout_session_id ?? null;
        if (prevSessionId && prevSessionId.startsWith("cs_")) await stripe.checkout.sessions.expire(prevSessionId);
      } catch (e) {
        console.warn("[stripe-connect-resale-checkout] could not expire the previous session:", e instanceof Error ? e.message : e);
      }
    }

    const metadata = { source: "stripe_connect_resale", transaction_id: tx.id, listing_id: listingId, buyer_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price_data: { currency: "eur", unit_amount: unitCents, product_data: { name: `Resale ticket — ${eventTitle}` } }, quantity: qty },
        { price_data: { currency: "eur", unit_amount: buyerFeeCents, product_data: { name: `Service fee (${BUYER_FEE_PERCENT}%)` } }, quantity: 1 },
      ],
      success_url: `${SITE_URL}/checkout/success?tx=${tx.id}&provider=stripe`,
      cancel_url: `${SITE_URL}/checkout?listing_id=${listingId}&checkout=cancelled`,
      customer_email: user.email || undefined,
      metadata,
      payment_intent_data: { metadata },
      expires_at: stripeSessionExpiresAt(Date.now()),
    });

    await supabase.from("transactions").update({ stripe_checkout_session_id: session.id }).eq("id", tx.id);
    reservedTransactionId = null;
    return json({ checkout_url: session.url, url: session.url, transaction_id: tx.id, provider: "stripe" });
  } catch (err) {
    console.error("[stripe-connect-resale-checkout]", err);
    if (reservedTransactionId) {
      try {
        await supabase.rpc("release_resale_reservation", { p_transaction_id: reservedTransactionId });
      } catch (e) { console.error("[stripe-connect-resale-checkout] release_resale_reservation failed:", e); }
    }
    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
