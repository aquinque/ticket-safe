/**
 * stripe-create-checkout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-create-checkout
 * Authorization: Bearer <user-jwt>
 * Body: { listingId: string }
 *
 * Creates a Stripe Checkout Session for a buyer to purchase a ticket
 * listing. Uses Destination Charges so the seller receives funds directly
 * (minus the platform fee).
 *
 * Flow:
 *  1. Authenticate buyer
 *  2. Fetch listing (must be status='available', not own listing)
 *  3. Fetch seller's Stripe account (must have charges_enabled)
 *  4. Mark listing as 'reserved' (prevents double-buy race condition)
 *  5. Create a pending transaction row
 *  6. Create Stripe Checkout Session with application_fee + transfer_data
 *  7. Store session ID on transaction
 *  8. Return { checkout_url, session_id }
 *
 * Returns:
 *   200 { checkout_url, session_id }
 *   400 — validation error (own listing, not available, seller not ready)
 *   401 — unauthenticated
 *   404 — listing not found / sold
 *   500 — internal error
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Platform commission percentage charged to the seller */
const PLATFORM_FEE_PERCENT = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- env ---------------------------------------------------------------
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

    if (!stripeSecretKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    // ---- auth --------------------------------------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- parse body --------------------------------------------------------
    let listingId: string;
    try {
      const body = await req.json();
      listingId = body.listingId;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!listingId || typeof listingId !== "string") {
      return new Response(
        JSON.stringify({ error: "listingId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- fetch listing (must be 'available') --------------------------------
    const { data: listing, error: listingError } = await supabase
      .from("tickets")
      .select("*, events(id, title, description)")
      .eq("id", listingId)
      .eq("status", "available")
      .maybeSingle();

    if (listingError || !listing) {
      return new Response(
        JSON.stringify({
          error: "This ticket is no longer available. It may have been sold.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- can't buy own ticket ----------------------------------------------
    if (listing.seller_id === user.id) {
      return new Response(
        JSON.stringify({ error: "You cannot purchase your own ticket listing." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- seller must have Stripe charges enabled ---------------------------
    const { data: sellerAccount } = await supabase
      .from("stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("user_id", listing.seller_id)
      .maybeSingle();

    if (!sellerAccount?.charges_enabled) {
      return new Response(
        JSON.stringify({
          error:
            "The seller has not completed their payment account setup. Please try again later.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- reserve the listing (prevents double-buy) -------------------------
    const { count: reservedCount } = await supabase
      .from("tickets")
      .update({ status: "reserved" })
      .eq("id", listingId)
      .eq("status", "available") // atomic guard
      .select("id", { count: "exact", head: true });

    if ((reservedCount ?? 0) === 0) {
      // Someone else grabbed it between our SELECT and UPDATE
      return new Response(
        JSON.stringify({ error: "This ticket was just purchased by someone else." }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- amounts in cents (EUR) --------------------------------------------
    const qty = listing.quantity ?? 1;
    const pricePerTicketCents = Math.round(listing.selling_price * 100);
    const totalAmountCents = pricePerTicketCents * qty;
    const feeAmountCents = Math.round(
      (totalAmountCents * PLATFORM_FEE_PERCENT) / 100
    );

    // ---- create pending transaction ----------------------------------------
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id,
        seller_id: listing.seller_id,
        ticket_id: listingId,
        amount: listing.selling_price * qty,
        fee_amount: feeAmountCents / 100,
        quantity: qty,
        status: "pending",
      })
      .select("id")
      .single();

    if (txError || !transaction) {
      // Revert reservation on failure
      await supabase
        .from("tickets")
        .update({ status: "available" })
        .eq("id", listingId);
      throw new Error("Failed to create transaction: " + txError?.message);
    }

    // ---- Stripe Checkout Session -------------------------------------------
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const eventTitle =
      (listing.events as { title?: string } | null)?.title ?? "Event Ticket";

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
              unit_amount: pricePerTicketCents,
            },
            quantity: qty,
          },
        ],
        payment_intent_data: {
          application_fee_amount: feeAmountCents,
          transfer_data: {
            destination: sellerAccount.stripe_account_id,
          },
          metadata: {
            listing_id: listingId,
            buyer_id: user.id,
            seller_id: listing.seller_id,
            transaction_id: transaction.id,
          },
        },
        mode: "payment",
        // {CHECKOUT_SESSION_ID} is replaced by Stripe at redirect time
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout/cancel?listing_id=${listingId}`,
        // Attach metadata to session as well (for checkout.session.completed event)
        metadata: {
          listing_id: listingId,
          buyer_id: user.id,
          seller_id: listing.seller_id,
          transaction_id: transaction.id,
        },
        // Session expires in 30 minutes; after expiry the listing reverts
        // to 'available' via the checkout.session.expired webhook event.
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      });
    } catch (stripeErr) {
      // Revert reservation + transaction on Stripe error
      await supabase
        .from("tickets")
        .update({ status: "available" })
        .eq("id", listingId);
      await supabase
        .from("transactions")
        .update({ status: "cancelled" })
        .eq("id", transaction.id);
      throw stripeErr;
    }

    // ---- store session ID on transaction -----------------------------------
    await supabase
      .from("transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({
        checkout_url: session.url,
        session_id: session.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[stripe-create-checkout]", err);
    return new Response(
      JSON.stringify({
        error: "Failed to create checkout session. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
