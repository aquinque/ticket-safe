/**
 * stripe-account-status — Supabase Edge Function (Deno)
 *
 * GET /functions/v1/stripe-account-status
 * Authorization: Bearer <user-jwt>
 *
 * Retrieves the seller's Stripe account status from Stripe directly,
 * syncs the result to stripe_accounts in the DB, and returns it.
 *
 * Returns:
 *   200 { has_account, charges_enabled, payouts_enabled,
 *          details_submitted, onboarding_status, stripe_account_id }
 *   401 — unauthenticated
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

    // ---- lookup DB record --------------------------------------------------
    const { data: accountRecord } = await supabase
      .from("stripe_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!accountRecord) {
      return new Response(
        JSON.stringify({
          has_account: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          onboarding_status: "pending",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---- sync from Stripe --------------------------------------------------
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const account = await stripe.accounts.retrieve(
      accountRecord.stripe_account_id
    );

    const onboardingStatus = account.charges_enabled
      ? "complete"
      : account.details_submitted
      ? "restricted"
      : "pending";

    await supabase
      .from("stripe_accounts")
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted,
        onboarding_status: onboardingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        has_account: true,
        stripe_account_id: accountRecord.stripe_account_id,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted,
        onboarding_status: onboardingStatus,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[stripe-account-status]", err);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve account status." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
