/**
 * stripe-connect-resale-checkout — Resale buyer checkout via Stripe
 * (Deno).
 *
 * Unlike the Studio side, the seller has NO Stripe Connect account yet at
 * checkout time (per spec: "le vendeur n'a RIEN à faire pour mettre en
 * vente" — their account only gets created AFTER the sale, when they fill
 * the payout form). So this charge can't be a direct charge on anything —
 * it's a plain charge on the PLATFORM's own Stripe account. The commission
 * is simply the difference between what the buyer pays and what we later
 * transfer to the seller (stripe-connect-payout-cron does that transfer
 * once their account exists) — there's no application_fee_amount here
 * because there's no connected account in the charge to attach one to.
 *
 * Buyer-side UX is identical to the Studio flow: Stripe Checkout, no
 * account required, Apple Pay / Google Pay automatic.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { listing_id?: string; guest?: { name?: string; email?: string } };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const listingId = body.listing_id;
  if (!listingId || !/^[0-9a-f-]{36}$/i.test(listingId)) return json({ error: "Invalid listing_id" }, 400);

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
    if (guestName.length < 1 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return json({ error: "Name and a valid email are required." }, 400);
    const guestUserId = await getOrCreateGuestAccount(supabase, guestEmail, guestName);
    if (!guestUserId) return json({ error: "Could not start checkout." }, 500);
    buyerId = guestUserId;
    buyerEmail = guestEmail;
  }

  const { data: listing } = await supabase
    .from("tickets")
    .select("id, seller_id, selling_price, status, event:events(id, title, payment_provider)")
    .eq("id", listingId).maybeSingle();
  if (!listing) return json({ error: "Listing not found" }, 404);
  if (listing.status !== "available") return json({ error: "This ticket is no longer available." }, 409);
  if (listing.seller_id === buyerId) return json({ error: "You can't buy your own listing." }, 400);

  const ev = (listing as { event?: { id: string; title: string; payment_provider: string } | null }).event ?? null;
  if (ev && ev.payment_provider !== "stripe") {
    // Resale of a Revolut-side ticket is left on the Revolut resale path
    // entirely — this function only handles listings on Stripe events.
    return json({ error: "This listing uses a different payment provider." }, 409);
  }

  // Reserve the listing (same compare-and-swap the Revolut resale path uses).
  const { data: reservedRows } = await supabase
    .from("tickets").update({ status: "reserved" }).eq("id", listingId).eq("status", "available").select("id");
  if (!reservedRows || reservedRows.length === 0) return json({ error: "This ticket was just taken." }, 409);

  const priceCents = Math.round(Number(listing.selling_price) * 100);
  const { data: commissionResult } = await supabase.rpc("get_resale_commission_cents", { p_price_cents: priceCents });
  const commissionCents = Number(commissionResult ?? 0);

  const { data: tx, error: txErr } = await supabase.from("transactions").insert({
    buyer_id: buyerId,
    seller_id: listing.seller_id,
    ticket_id: listingId,
    amount: priceCents / 100,
    fee_amount: 0, // buyer pays listing price only — commission comes out of the seller's eventual payout
    commission_cents: commissionCents,
    status: "pending",
  }).select("id").single();
  if (txErr || !tx) {
    await supabase.from("tickets").update({ status: "available" }).eq("id", listingId);
    console.error("[stripe-connect-resale-checkout] transaction insert failed:", txErr);
    return json({ error: "Could not create order." }, 500);
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    await supabase.from("tickets").update({ status: "available" }).eq("id", listingId);
    console.error("[stripe-connect-resale-checkout] Stripe client init failed:", err);
    return json({ error: "Payments are not configured yet." }, 500);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "eur",
          unit_amount: priceCents,
          product_data: { name: `Resale ticket — ${ev?.title ?? "Ticket Safe"}` },
        },
        quantity: 1,
      }],
      success_url: `${SITE_URL}/checkout/success?transaction_id=${tx.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/marketplace/buy?checkout=cancelled`,
      customer_email: buyerEmail || undefined,
      metadata: { source: "stripe_connect_resale", transaction_id: tx.id, listing_id: listingId, buyer_id: buyerId },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await supabase.from("transactions").update({ stripe_checkout_session_id: session.id }).eq("id", tx.id);

    return json({ url: session.url, transaction_id: tx.id, provider: "stripe" });
  } catch (err) {
    await supabase.from("transactions").update({ status: "cancelled" }).eq("id", tx.id);
    await supabase.from("tickets").update({ status: "available" }).eq("id", listingId);
    console.error("[stripe-connect-resale-checkout] Stripe session creation failed:", err);
    const message = err instanceof Error ? err.message : "Could not start checkout.";
    return json({ error: message }, 502);
  }
});
