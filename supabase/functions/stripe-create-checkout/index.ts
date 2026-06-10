/**
 * stripe-create-checkout — resale marketplace (Deno)
 *
 * Fee model (resale):
 *   Buyer pays the seller's listing price + 6% service fee at checkout.
 *   The 6% is taken immediately into transactions.fee_amount.
 *   The 5% Ticket Safe fee on the seller is applied LATER, when the
 *   seller requests a payout via request-seller-payout.
 *
 *   Per €10 listing:
 *     buyer pays              €10.60
 *     buyer fee (6%)          €0.60  → Ticket Safe immediately
 *     seller balance          €10.00 (gross they see in their listings page)
 *     on withdrawal of €10 → 5% = €0.50 deducted, €9.50 wired to IBAN
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUYER_FEE_PERCENT = 6;
const SELLER_FEE_PERCENT = 5;
// 30 min: matches the Stripe Checkout Session expiry below (Stripe's minimum is
// 30 min, so the reservation is held exactly as long as the payment window).
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const MAX_UNIT_PRICE_EUR = 5000;
const MAX_QUANTITY = 50;
const MIN_UNIT_PRICE_EUR = 0.5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!stripeSecretKey || !supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  let reservedListingId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Session expired. Please log in again." }, 401);

    let listingId: string;
    let agreedPrice: number | null = null;
    try {
      const body = await req.json();
      listingId = body.listingId;
      if (body.agreedPrice !== undefined && typeof body.agreedPrice === "number" && Number.isFinite(body.agreedPrice) && body.agreedPrice >= MIN_UNIT_PRICE_EUR && body.agreedPrice <= MAX_UNIT_PRICE_EUR) {
        agreedPrice = body.agreedPrice;
      }
    } catch { return json({ error: "Invalid request." }, 400); }
    if (!listingId || typeof listingId !== "string") return json({ error: "listingId is required." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Invalid listing identifier." }, 400);

    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
    await supabase.from("tickets").update({ status: "available" }).eq("status", "reserved").lt("updated_at", cutoff);
    await supabase.from("tickets").update({ status: "available" }).eq("id", listingId).eq("status", "reserved");

    const { data: listing, error: listingError } = await supabase.from("tickets").select("*, events(id, title, description, date, location)").eq("id", listingId).eq("status", "available").maybeSingle();
    if (listingError || !listing) return json({ error: "This ticket is no longer available." }, 404);
    if (listing.seller_id === user.id) return json({ error: "You cannot purchase your own ticket." }, 400);

    const { data: reserved } = await supabase.from("tickets").update({ status: "reserved" }).eq("id", listingId).eq("status", "available").select("id");
    if (!reserved || reserved.length === 0) return json({ error: "This ticket was just purchased by someone else." }, 409);
    reservedListingId = listingId;

    // Always honor the buyer's accepted offer on this listing: they pay the
    // negotiated price regardless of which "Buy" button they came from. The DB
    // offer is the source of truth (the client `agreedPrice` hint is ignored,
    // so a tampered URL can't change the price either way).
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
      if (acceptedOffer && Number.isFinite(acceptedOffer.price) && acceptedOffer.price > 0) {
        negotiatedPrice = acceptedOffer.price;
      }
    }
    void agreedPrice; // kept for backward-compat in the request body, no longer used

    const qty = Math.min(Math.max(1, listing.quantity ?? 1), MAX_QUANTITY);
    const rawUnitPrice = negotiatedPrice ?? listing.selling_price;
    const unitPrice = Math.min(Math.max(MIN_UNIT_PRICE_EUR, Number(rawUnitPrice) || 0), MAX_UNIT_PRICE_EUR);

    // Fee math: 6% on top for the buyer; 5% deferred to seller payout.
    const subtotalCents = Math.round(unitPrice * 100) * qty;
    const buyerFeeCents = Math.round(subtotalCents * (BUYER_FEE_PERCENT / 100));
    const totalCents = subtotalCents + buyerFeeCents;     // what the buyer pays
    const unitAmountWithFee = Math.round(unitPrice * 100) + Math.round(buyerFeeCents / qty);

    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id,
        seller_id: listing.seller_id,
        ticket_id: listingId,
        amount: totalCents / 100,
        fee_amount: buyerFeeCents / 100,
        quantity: qty,
        status: "pending",
      })
      .select("id")
      .single();
    if (txErr || !tx) throw new Error("Failed to create transaction: " + txErr?.message);

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "Event Ticket";

    // NOTE: Checkout Sessions do NOT accept `automatic_payment_methods` (that's
    // a PaymentIntent-only param) — passing it makes Stripe reject the request.
    // Payment methods are controlled by the Stripe Dashboard settings, like the
    // Studio checkout. mode:"payment" + line_items is all that's needed.
    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: eventTitle,
            description: `${qty} ticket${qty > 1 ? "s" : ""} · includes ${BUYER_FEE_PERCENT}% service fee${listing.notes ? ` — ${listing.notes}` : ""}`,
          },
          unit_amount: unitAmountWithFee,
        },
        quantity: qty,
      }],
      mode: "payment",
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel?listing_id=${listingId}`,
      metadata: {
        source: "resale",
        listing_id: listingId,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        transaction_id: tx.id,
        qty: String(qty),
        buyer_fee_cents: String(buyerFeeCents),
        seller_fee_percent: String(SELLER_FEE_PERCENT),
        ...(negotiatedPrice ? { agreed_price: String(negotiatedPrice) } : {}),
      },
      // Stripe requires expires_at to be at least 30 minutes in the future.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    await supabase.from("transactions").update({ stripe_checkout_session_id: session.id }).eq("id", tx.id);
    reservedListingId = null;
    return json({ checkout_url: session.url, session_id: session.id });
  } catch (err) {
    console.error("[stripe-create-checkout]", err);
    if (reservedListingId) await supabase.from("tickets").update({ status: "available" }).eq("id", reservedListingId);
    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
