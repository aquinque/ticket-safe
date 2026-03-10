/**
 * stripe-create-checkout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-create-checkout
 * Authorization: Bearer <user-jwt>
 * Body: { listingId: string }
 *
 * Standard Stripe Checkout (platform account — no Connect).
 * Buyer pays the platform. Platform pays seller separately.
 *
 * Flow:
 *  1. Authenticate buyer
 *  2. Fetch listing (must be status='available', not own listing)
 *  3. Reserve listing (prevents double-buy race condition)
 *  4. Create pending transaction row
 *  5. Create Stripe Checkout Session (standard charge, no transfer_data)
 *  6. Store session ID on transaction
 *  7. Return { checkout_url, session_id }
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl     = Deno.env.get("SUPABASE_URL");
    const supabaseKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl         = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

    if (!stripeSecretKey || !supabaseUrl || !supabaseKey) {
      throw new Error("Missing required environment variables");
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } =
      await supabase.auth.getUser(authHeader.slice(7));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let listingId: string;
    try {
      ({ listingId } = await req.json());
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!listingId || typeof listingId !== "string") {
      return new Response(JSON.stringify({ error: "listingId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Release stale reservations (>30 min) ──────────────────────────────────
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from("tickets")
      .update({ status: "available" })
      .eq("status", "reserved")
      .lt("updated_at", thirtyMinAgo);

    // ── Fetch listing ─────────────────────────────────────────────────────────
    const { data: listing, error: listingError } = await supabase
      .from("tickets")
      .select("*, events(id, title, description)")
      .eq("id", listingId)
      .eq("status", "available")
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(
        JSON.stringify({ error: "This ticket is no longer available." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (listing.seller_id === user.id) {
      return new Response(
        JSON.stringify({ error: "You cannot purchase your own ticket." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Reserve listing ───────────────────────────────────────────────────────
    const { count: reservedCount } = await supabase
      .from("tickets")
      .update({ status: "reserved" })
      .eq("id", listingId)
      .eq("status", "available")
      .select("id", { count: "exact", head: true });

    if ((reservedCount ?? 0) === 0) {
      return new Response(
        JSON.stringify({ error: "This ticket was just purchased by someone else." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Amounts ───────────────────────────────────────────────────────────────
    const qty                 = listing.quantity ?? 1;
    const pricePerTicketCents = Math.round(listing.selling_price * 100);
    const totalAmountCents    = pricePerTicketCents * qty;
    const feeAmountCents      = Math.round((totalAmountCents * PLATFORM_FEE_PERCENT) / 100);

    // ── Create transaction ────────────────────────────────────────────────────
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        buyer_id:  user.id,
        seller_id: listing.seller_id,
        ticket_id: listingId,
        amount:    listing.selling_price * qty,
        fee_amount: feeAmountCents / 100,
        quantity:  qty,
        status:    "pending",
      })
      .select("id")
      .single();

    if (txError || !transaction) {
      await supabase.from("tickets").update({ status: "available" }).eq("id", listingId);
      throw new Error("Failed to create transaction: " + txError?.message);
    }

    // ── Stripe Checkout Session (standard — no Connect) ───────────────────────
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const eventTitle = (listing.events as { title?: string } | null)?.title ?? "Event Ticket";

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
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
              unit_amount: Math.round(totalAmountCents / qty),
            },
            quantity: qty,
          },
        ],
        mode: "payment",
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout/cancel?listing_id=${listingId}`,
        metadata: {
          listing_id:     listingId,
          buyer_id:       user.id,
          seller_id:      listing.seller_id,
          transaction_id: transaction.id,
        },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });
    } catch (stripeErr) {
      await supabase.from("tickets").update({ status: "available" }).eq("id", listingId);
      await supabase.from("transactions").update({ status: "cancelled" }).eq("id", transaction.id);
      throw stripeErr;
    }

    // ── Store session ID ──────────────────────────────────────────────────────
    await supabase
      .from("transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({ checkout_url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[stripe-create-checkout]", err);
    return new Response(
      JSON.stringify({ error: "Failed to create checkout session. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
