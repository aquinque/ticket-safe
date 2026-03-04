/**
 * stripe-onboard-seller — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-onboard-seller
 * Authorization: Bearer <user-jwt>
 *
 * Creates (or retrieves) a Stripe Connect Express account for the
 * authenticated seller, then returns a one-time onboarding link URL.
 *
 * The seller is redirected to that URL to complete KYC with Stripe.
 * After completing (or abandoning) the flow Stripe redirects back to:
 *   - return_url  : /stripe-return
 *   - refresh_url : /marketplace/sell?onboarding=refresh  (link expired)
 *
 * Returns:
 *   200 { url }        — Stripe onboarding URL
 *   401                — unauthenticated
 *   500                — internal error
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

    // ---- Stripe client -----------------------------------------------------
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ---- find or create Stripe Express account ----------------------------
    const { data: existingAccount } = await supabase
      .from("stripe_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let stripeAccountId: string;

    if (existingAccount?.stripe_account_id) {
      stripeAccountId = existingAccount.stripe_account_id;
    } else {
      // Pull email from profiles (fallback to auth email)
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      const email = profile?.email ?? user.email ?? undefined;

      const account = await stripe.accounts.create({
        type: "express",
        country: "FR",
        ...(email ? { email } : {}),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        settings: {
          payouts: {
            // Standard rolling payout schedule — simplest option
            schedule: { interval: "daily" },
          },
        },
      });

      stripeAccountId = account.id;

      const { error: insertError } = await supabase
        .from("stripe_accounts")
        .insert({
          user_id: user.id,
          stripe_account_id: stripeAccountId,
          onboarding_status: "pending",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        });

      if (insertError) {
        throw new Error("Failed to save stripe account: " + insertError.message);
      }
    }

    // ---- generate one-time onboarding link ---------------------------------
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${siteUrl}/marketplace/sell?onboarding=refresh`,
      return_url: `${siteUrl}/stripe-return`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-onboard-seller]", err);
    return new Response(
      JSON.stringify({
        error: "Failed to start onboarding. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
