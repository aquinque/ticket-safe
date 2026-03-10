/**
 * stripe-webhook — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-webhook
 * (public endpoint — no auth header required, verified by Stripe signature)
 *
 * Handles Stripe webhook events:
 *
 *  checkout.session.completed
 *    → transaction: pending → completed
 *    → listing:     reserved → sold
 *
 *  checkout.session.expired
 *    → listing:     reserved → available  (buyer didn't complete checkout)
 *    → transaction: pending  → cancelled
 *
 *  payment_intent.payment_failed
 *    → transaction: pending  → cancelled
 *    → listing:     reserved → available
 *
 *  charge.refunded
 *    → transaction: completed → refunded
 *    → listing:     sold     → available  (re-list for resale)
 *
 *  account.updated (Connect webhook)
 *    → sync stripe_accounts row with latest charges/payouts flags
 *
 * Security: Stripe-Signature header is verified via constructEventAsync
 * using the Web Crypto API (Deno-compatible, no Node crypto needed).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

serve(async (req) => {
  // ---- env ----------------------------------------------------------------
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-webhook] Missing environment variables");
    return new Response("Server misconfiguration", { status: 500 });
  }

  // ---- verify Stripe signature (raw body required) ------------------------
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      // Use Web Crypto API (Deno doesn't have Node's crypto module)
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // ---- process event ------------------------------------------------------
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (event.type) {
      // ---------------------------------------------------------------------
      // Buyer completed payment
      // ---------------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const transactionId = session.metadata?.transaction_id;
        const listingId = session.metadata?.listing_id;

        console.log(
          `[checkout.session.completed] session=${session.id} tx=${transactionId} listing=${listingId} payment_status=${session.payment_status}`
        );

        if (session.payment_status === "paid" && transactionId && listingId) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

          // Mark transaction as completed
          await supabase
            .from("transactions")
            .update({
              status: "completed",
              payment_intent_id: paymentIntentId,
            })
            .eq("id", transactionId);

          // Mark listing as sold and assign to buyer (nominative ticket)
          await supabase
            .from("tickets")
            .update({
              status: "sold",
              buyer_id: session.metadata?.buyer_id ?? null,
            })
            .eq("id", listingId)
            .in("status", ["available", "reserved"]);
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Buyer abandoned the Checkout session (30 min expiry)
      // ---------------------------------------------------------------------
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const transactionId = session.metadata?.transaction_id;
        const listingId = session.metadata?.listing_id;

        console.log(
          `[checkout.session.expired] session=${session.id} tx=${transactionId} listing=${listingId}`
        );

        // Revert reservation
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "reserved");
        }
        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "cancelled" })
            .eq("id", transactionId)
            .eq("status", "pending");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Payment attempt failed (card declined, etc.)
      // ---------------------------------------------------------------------
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const transactionId = pi.metadata?.transaction_id;
        const listingId = pi.metadata?.listing_id;

        console.log(
          `[payment_intent.payment_failed] pi=${pi.id} tx=${transactionId}`
        );

        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "cancelled" })
            .eq("id", transactionId)
            .eq("status", "pending");
        }
        // Restore listing to available so buyer/others can retry
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "reserved");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Refund issued (manually via Stripe Dashboard or API)
      // ---------------------------------------------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const transactionId = charge.metadata?.transaction_id;
        const listingId = charge.metadata?.listing_id;

        console.log(
          `[charge.refunded] charge=${charge.id} tx=${transactionId} listing=${listingId}`
        );

        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "refunded" })
            .eq("id", transactionId);
        }

        // Re-open listing so seller can re-list (optional policy).
        // Comment out the block below if you prefer NOT to automatically re-list.
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "sold");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Seller completed / updated their Connect account (KYC changes)
      // ---------------------------------------------------------------------
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        const onboardingStatus = account.charges_enabled
          ? "complete"
          : account.details_submitted
          ? "restricted"
          : "pending";

        const { error: updateError } = await supabase
          .from("stripe_accounts")
          .update({
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted,
            onboarding_status: onboardingStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id);

        if (updateError) {
          console.error("[account.updated] DB update failed:", updateError);
        }

        console.log(
          `[account.updated] account=${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled} status=${onboardingStatus}`
        );
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Processing error for event", event.type, err);
    // Return 500 so Stripe retries the event
    return new Response("Webhook handler failed", { status: 500 });
  }
});
