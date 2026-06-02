/**
 * stripe-express-dashboard — Supabase Edge Function (Deno)
 *
 * Returns a single-use login link to the authenticated organizer's Stripe
 * Express dashboard so they can manage their payouts, payment methods, and
 * tax forms. Express accounts do NOT have access to the main Stripe
 * dashboard — this is the only correct entry point.
 *
 * POST /functions/v1/stripe-express-dashboard
 * Authorization: Bearer <user-jwt>
 * Response: { url }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey || !supabaseUrl || !supabaseKey) {
      return json({ error: "Server misconfigured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

    const { data: acct } = await supabase
      .from("stripe_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!acct?.stripe_account_id) {
      return json({ error: "Stripe account not found. Complete onboarding first." }, 404);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });
    const link = await stripe.accounts.createLoginLink(acct.stripe_account_id);
    return json({ url: link.url });
  } catch (err) {
    console.error("[stripe-express-dashboard]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not generate dashboard link.", details: msg }, 500);
  }
});
