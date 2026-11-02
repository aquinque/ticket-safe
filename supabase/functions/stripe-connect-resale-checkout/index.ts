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
 * listing price, stale reservations are released, guests can buy without an
 * account. Completion (mark sold, transfer the ticket, emails) is handled by
 * stripe-connect-webhook.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { getOrCreateGuestAccount } from "../_shared/getOrCreateGuestAccount.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
/** Buyer service fee on a resale, on top of the listing price (src/lib/fees.ts BUYER_FEE_RATE). */
const BUYER_FEE_PERCENT = 5;
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const MAX_UNIT_PRICE_EUR = 5000;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_EUR = 0.5;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let reservedListingId: string | null = null;

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

    // Abandoned checkouts give their ticket back after 30 minutes.
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
    await supabase.from("tickets").update({ status: "available" }).eq("status", "reserved").lt("updated_at", cutoff);

    // Only a listing an admin has verified can be paid for with real money.
    const { data: listing } = await supabase
      .from("tickets")
      .select("id, seller_id, selling_price, quantity, events(id, title)")
      .eq("id", listingId).eq("status", "available").eq("verification_status", "verified")
      .maybeSingle();
    if (!listing) return json({ error: "This ticket is no longer available." }, 404);
    if (listing.seller_id === user.id) return json({ error: "You cannot purchase your own ticket." }, 400);

    const { data: reserved } = await supabase
      .from("tickets").update({ status: "reserved" })
      .eq("id", listingId).eq("status", "available").eq("verification_status", "verified").select("id");
    if (!reserved || reserved.length === 0) return json({ error: "This ticket was just purchased by someone else." }, 409);
    reservedListingId = listingId;

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
    const subtotalCents = unitCents * qty;
    const buyerFeeCents = Math.round((subtotalCents * BUYER_FEE_PERCENT) / 100);
    const totalCents = subtotalCents + buyerFeeCents;
    const { data: commissionResult } = await supabase.rpc("get_resale_commission_cents", { p_price_cents: subtotalCents });
    const commissionCents = Number(commissionResult ?? 0);

    const { data: tx, error: txErr } = await supabase.from("transactions").insert({
      buyer_id: user.id,
      seller_id: listing.seller_id,
      ticket_id: listingId,
      amount: totalCents / 100,
      fee_amount: buyerFeeCents / 100,
      commission_cents: commissionCents,
      quantity: qty,
      status: "pending",
    }).select("id").single();
    if (txErr || !tx) throw new Error("Failed to create transaction: " + txErr?.message);

    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "Ticket Safe";
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price_data: { currency: "eur", unit_amount: unitCents, product_data: { name: `Resale ticket — ${eventTitle}` } }, quantity: qty },
        { price_data: { currency: "eur", unit_amount: buyerFeeCents, product_data: { name: `Service fee (${BUYER_FEE_PERCENT}%)` } }, quantity: 1 },
      ],
      success_url: `${SITE_URL}/checkout/success?tx=${tx.id}&provider=stripe`,
      cancel_url: `${SITE_URL}/checkout?listing=${listingId}&checkout=cancelled`,
      customer_email: user.email || undefined,
      metadata: { source: "stripe_connect_resale", transaction_id: tx.id, listing_id: listingId, buyer_id: user.id },
      expires_at: Math.floor(Date.now() / 1000) + RESERVATION_TTL_MS / 1000,
    });

    await supabase.from("transactions").update({ stripe_checkout_session_id: session.id }).eq("id", tx.id);
    reservedListingId = null;
    return json({ checkout_url: session.url, url: session.url, transaction_id: tx.id, provider: "stripe" });
  } catch (err) {
    console.error("[stripe-connect-resale-checkout]", err);
    if (reservedListingId) await supabase.from("tickets").update({ status: "available" }).eq("id", reservedListingId);
    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
