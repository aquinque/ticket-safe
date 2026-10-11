/**
 * stripe-connect-onboard-reseller — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-onboard-reseller
 * Authorization: Bearer <seller-user-jwt>
 * Body: { action?: "onboard" | "refresh" | "dashboard" }
 *
 * The "Recevoir ton argent" step shown to a resale seller after their ticket
 * sells. Individuals only (private students). Same Express flow as
 * stripe-connect-onboard-organizer, keyed on the caller instead of an
 * organizer: Stripe hosts the identity and bank pages.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStripeClient,
  createExpressAccount,
  createOnboardingLink,
  createDashboardLink,
  deriveOnboardingStatus,
  accountStateColumns,
  accountHolderName,
} from "../_shared/stripeConnect.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const RETURN_PATH = "/my-tickets";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* empty body = onboard */ }
  const action = body.action ?? "onboard";
  if (!["onboard", "refresh", "dashboard"].includes(action)) return json({ error: "Invalid action" }, 400);

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[stripe-connect-onboard-reseller] Stripe client init failed:", err);
    return json({ error: "Payments are not configured yet. Please try again later." }, 500);
  }

  try {
    const { data: existing } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (action === "dashboard") {
      if (!existing) return json({ error: "No payment account yet." }, 404);
      return json({ url: await createDashboardLink(stripe, existing.stripe_account_id) });
    }

    if (action === "refresh") {
      if (!existing) return json({ error: "No payment account yet." }, 404);
      const account = await stripe.accounts.retrieve(existing.stripe_account_id);
      await supabase.from("stripe_connect_accounts").update({
        ...accountStateColumns(account),
        account_holder_name: accountHolderName(account, null),
      }).eq("id", existing.id);

      // The resale may have sold BEFORE the seller finished onboarding (the
      // typical order): queue the payout so the cron picks it up on its next run.
      if (account.charges_enabled && account.payouts_enabled) {
        const { data: pending } = await supabase
          .from("stripe_connect_payout_jobs")
          .select("id")
          .eq("stripe_connect_account_id", existing.id)
          .eq("kind", "reseller_payout")
          .eq("status", "scheduled")
          .limit(1);
        if (!pending || pending.length === 0) {
          await supabase.from("stripe_connect_payout_jobs").insert({
            stripe_connect_account_id: existing.id,
            kind: "reseller_payout",
            scheduled_for: new Date().toISOString(),
            status: "scheduled",
          });
        }
      }
      return json({ ok: true, status: deriveOnboardingStatus(account), charges_enabled: account.charges_enabled });
    }

    let stripeAccountId = existing?.stripe_account_id ?? null;
    if (!stripeAccountId) {
      const account = await createExpressAccount(stripe, {
        email: user.email ?? null,
        businessType: "individual",
        metadata: { user_id: user.id },
      });
      stripeAccountId = account.id;
      const { error: insertErr } = await supabase.from("stripe_connect_accounts").insert({
        owner_type: "reseller",
        organizer_id: null,
        user_id: user.id,
        stripe_account_id: account.id,
        business_type: "individual",
        ...accountStateColumns(account),
      });
      if (insertErr) {
        const { data: raced } = await supabase.from("stripe_connect_accounts").select("stripe_account_id").eq("user_id", user.id).maybeSingle();
        if (!raced) throw insertErr;
        await stripe.accounts.del(account.id).catch(() => {});
        stripeAccountId = raced.stripe_account_id;
      }
    }

    return json({ url: await createOnboardingLink(stripe, stripeAccountId, RETURN_PATH) });
  } catch (err) {
    console.error("[stripe-connect-onboard-reseller] Stripe error:", err);
    return json({ error: "Could not reach Stripe. Please try again in a moment." }, 502);
  }
});
