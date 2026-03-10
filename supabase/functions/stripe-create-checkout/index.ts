/**
 * stripe-create-checkout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-create-checkout
 * Authorization: Bearer <user-jwt>
 * Body: { listingId: string }
 *
 * Flow:
 *  1. Authenticate buyer
 *  2. Release stale reservations (>5 min)
 *  3. Fetch listing (must be status='available')
 *  4. Reserve listing atomically (prevents double-buy)
 *  5. Create Stripe Checkout Session
 *  6. Return { checkout_url }
 *  On any failure after reservation → restore ticket to 'available'
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_FEE_PERCENT = 5;
const RESERVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

  if (!stripeSecretKey || !supabaseUrl || !supabaseKey) {
    return json({ error: "Server misconfigured." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let reservedListingId: string | null = null;

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: authError } =
      await supabase.auth.getUser(authHeader.slice(7));

    if (authError || !user) {
      return json({ error: "Session expired. Please log in again." }, 401);
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let listingId: string;
    try {
      ({ listingId } = await req.json());
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    if (!listingId || typeof listingId !== "string") {
      return json({ error: "listingId is required." }, 400);
    }

    // ── Release stale reservations ────────────────────────────────────────
    const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
    await supabase
      .from("tickets")
      .update({ status: "available" })
      .eq("status", "reserved")
      .lt("updated_at", cutoff);

    // ── Fetch listing ─────────────────────────────────────────────────────
    const { data: listing, error: listingError } = await supabase
      .from("tickets")
      .select("*, events(id, title, description)")
      .eq("id", listingId)
      .eq("status", "available")
      .maybeSingle();

    if (listingError || !listing) {
      return json({ error: "This ticket is no longer available." }, 404);
    }

    if (listing.seller_id === user.id) {
      return json({ error: "You cannot purchase your own ticket." }, 400);
    }

    // ── Reserve (atomic) ──────────────────────────────────────────────────
    const { count } = await supabase
      .from("tickets")
      .update({ status: "reserved" })
      .eq("id", listingId)
      .eq("status", "available")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) === 0) {
      return json({ error: "This ticket was just purchased by someone else." }, 409);
    }
    reservedListingId = listingId; // track for cleanup on error

    // ── Amounts ───────────────────────────────────────────────────────────
    const qty = listing.quantity ?? 1;
    const totalCents = Math.round(listing.selling_price * 100) * qty;
    const feeCents = Math.round((totalCents * PLATFORM_FEE_PERCENT) / 100);

    // ── Transaction row ───────────────────────────────────────────────────
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id,
        seller_id: listing.seller_id,
        ticket_id: listingId,
        amount: listing.selling_price * qty,
        fee_amount: feeCents / 100,
        quantity: qty,
        status: "pending",
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      throw new Error("Failed to create transaction: " + txErr?.message);
    }

    // ── Stripe Checkout ───────────────────────────────────────────────────
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const eventTitle =
      (listing.events as { title?: string } | null)?.title ?? "Event Ticket";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: eventTitle,
              description: listing.notes
                ? `${qty} ticket(s) — ${listing.notes}`
                : `${qty} ticket(s)`,
            },
            unit_amount: Math.round(totalCents / qty),
          },
          quantity: qty,
        },
      ],
      mode: "payment",
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel?listing_id=${listingId}`,
      metadata: {
        listing_id: listingId,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        transaction_id: tx.id,
      },
      expires_at: Math.floor(Date.now() / 1000) + 5 * 60, // 5 min expiry
    });

    // Store session ID
    await supabase
      .from("transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", tx.id);

    reservedListingId = null; // success — don't release
    return json({ checkout_url: session.url, session_id: session.id });

  } catch (err) {
    console.error("[stripe-create-checkout]", err);

    // Always release reservation on any error
    if (reservedListingId) {
      await supabase
        .from("tickets")
        .update({ status: "available" })
        .eq("id", reservedListingId);
    }

    return json({ error: "Failed to create checkout session. Please try again." }, 500);
  }
});
