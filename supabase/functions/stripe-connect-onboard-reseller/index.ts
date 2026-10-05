/**
 * stripe-connect-onboard-reseller — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-onboard-reseller
 * Authorization: Bearer <seller-user-jwt>
 * Body: { kyc: IndividualKyc, tos_accepted: true }
 *
 * The "Recevoir ton argent" screen shown to a resale seller after their
 * ticket sells. Individual accounts only — resale sellers are private
 * students, never a business. Creates/updates a Custom Connect account for
 * the CALLER (no organizer_id involved), same no-Stripe-screens pattern as
 * the organizer onboarding function.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient, createOrUpdateConnectAccount, deriveOnboardingStatus, type IndividualKyc } from "../_shared/stripeConnect.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

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

  let body: { kyc?: IndividualKyc; tos_accepted?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { kyc, tos_accepted } = body;
  if (!tos_accepted) return json({ error: "You must accept the Stripe terms to continue." }, 400);
  if (!kyc || kyc.businessType !== "individual") return json({ error: "Invalid KYC payload" }, 400);
  if (!kyc.firstName || !kyc.lastName || !kyc.dob || !kyc.addressLine1 || !kyc.addressPostalCode || !kyc.addressCity || !kyc.iban) {
    return json({ error: "Missing required fields." }, 400);
  }

  const { data: existing } = await supabase.from("stripe_connect_accounts").select("id, stripe_account_id").eq("user_id", user.id).maybeSingle();

  const forwardedFor = req.headers.get("x-forwarded-for");
  const tosIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "0.0.0.0";

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[stripe-connect-onboard-reseller] Stripe client init failed:", err);
    return json({ error: "Payments are not configured yet. Please try again later." }, 500);
  }

  try {
    const account = await createOrUpdateConnectAccount(stripe, kyc, tosIp, existing?.stripe_account_id);
    const status = deriveOnboardingStatus(account);

    const row = {
      owner_type: "reseller" as const,
      organizer_id: null,
      user_id: user.id,
      stripe_account_id: account.id,
      business_type: "individual" as const,
      account_holder_name: `${kyc.firstName} ${kyc.lastName}`,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      requirements_currently_due: account.requirements?.currently_due ?? [],
      requirements_past_due: account.requirements?.past_due ?? [],
      tos_accepted_at: existing ? undefined : new Date().toISOString(),
      tos_accepted_ip: existing ? undefined : tosIp,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("stripe_connect_accounts").update(row).eq("id", existing.id);
    } else {
      await supabase.from("stripe_connect_accounts").insert(row);
    }

    // Trigger an immediate payout job if there's an uncollected balance
    // waiting on this seller (the resale sold BEFORE they filled this form
    // — the typical order). The job queue will actually move the money;
    // this just makes sure a job exists so the cron can process it on its
    // next run rather than waiting for the next scheduled pass to notice.
    if (account.charges_enabled && account.payouts_enabled) {
      const { data: accountRow } = await supabase.from("stripe_connect_accounts").select("id").eq("user_id", user.id).maybeSingle();
      if (accountRow) {
        await supabase.from("stripe_connect_payout_jobs").insert({
          stripe_connect_account_id: accountRow.id,
          kind: "reseller_payout",
          scheduled_for: new Date().toISOString(),
          status: "scheduled",
        });
      }
    }

    return json({ ok: true, status, charges_enabled: account.charges_enabled });
  } catch (err) {
    console.error("[stripe-connect-onboard-reseller] Stripe error:", err);
    const message = err instanceof Error ? err.message : "Could not create your payment account.";
    return json({ error: message }, 400);
  }
});
