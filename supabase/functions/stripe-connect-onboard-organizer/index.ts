/**
 * stripe-connect-onboard-organizer — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-onboard-organizer
 * Authorization: Bearer <organizer-user-jwt>
 * Body: { organizer_id, action?: "onboard" | "refresh" | "dashboard" }
 *
 * Express onboarding: Stripe hosts the identity / legal-representative /
 * bank-account pages. This function only
 *   - "onboard" (default): creates the organizer's Express account if it does
 *     not exist yet, then returns a fresh single-use Account Link { url } to
 *     send the organizer to. Re-callable: used again to resume or fix
 *     onboarding, and on the Stripe "refresh" redirect.
 *   - "refresh": reads the account back from Stripe and mirrors its state into
 *     stripe_connect_accounts (used when the organizer returns from Stripe,
 *     without waiting for the account.updated webhook).
 *   - "dashboard": returns a single-use login link to the Express dashboard.
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

const RETURN_PATH = "/studio/payments";

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

  let body: { organizer_id?: string; action?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const organizerId = body.organizer_id;
  const action = body.action ?? "onboard";
  if (!organizerId || !/^[0-9a-f-]{36}$/i.test(organizerId)) return json({ error: "Invalid organizer_id" }, 400);
  if (!["onboard", "refresh", "dashboard"].includes(action)) return json({ error: "Invalid action" }, 400);

  const { data: org } = await supabase.from("organizer_profiles").select("id, user_id, name, contact_email").eq("id", organizerId).maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[stripe-connect-onboard-organizer] Stripe client init failed:", err);
    return json({ error: "Payments are not configured yet. Please try again later." }, 500);
  }

  try {
    const { data: existing } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id")
      .eq("organizer_id", organizerId)
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
        account_holder_name: accountHolderName(account, org.name),
      }).eq("id", existing.id);
      return json({ ok: true, status: deriveOnboardingStatus(account), charges_enabled: account.charges_enabled, requirements_due: account.requirements?.currently_due ?? [] });
    }

    // action === "onboard"
    let stripeAccountId = existing?.stripe_account_id ?? null;
    if (!stripeAccountId) {
      const account = await createExpressAccount(stripe, {
        email: org.contact_email,
        name: org.name,
        metadata: { organizer_id: organizerId },
      });
      stripeAccountId = account.id;
      const { error: insertErr } = await supabase.from("stripe_connect_accounts").insert({
        owner_type: "organizer",
        organizer_id: organizerId,
        user_id: null,
        stripe_account_id: account.id,
        account_holder_name: org.name,
        ...accountStateColumns(account),
      });
      if (insertErr) {
        // A concurrent click already created the row: reuse that account instead of leaving an orphan.
        const { data: raced } = await supabase.from("stripe_connect_accounts").select("stripe_account_id").eq("organizer_id", organizerId).maybeSingle();
        if (!raced) throw insertErr;
        await stripe.accounts.del(account.id).catch(() => {});
        stripeAccountId = raced.stripe_account_id;
      }
    }

    return json({ url: await createOnboardingLink(stripe, stripeAccountId, RETURN_PATH) });
  } catch (err) {
    console.error("[stripe-connect-onboard-organizer] Stripe error:", err);
    return json({ error: "Could not reach Stripe. Please try again in a moment." }, 502);
  }
});
