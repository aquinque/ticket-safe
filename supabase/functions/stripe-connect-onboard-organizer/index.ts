/**
 * stripe-connect-onboard-organizer — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-onboard-organizer
 * Authorization: Bearer <organizer-user-jwt>
 * Body: { organizer_id, kyc: ConnectKyc, tos_accepted: true }
 *
 * Collects the minimum legal KYC Stripe requires (association/BDE: name,
 * SIREN/RNA, address, legal rep; company: equivalent; individual: identity
 * + address) directly in our own Ticket Studio form, creates a Stripe
 * Custom Connect account via the API (no Stripe-hosted screens), and
 * mirrors the result into stripe_connect_accounts.
 *
 * Re-callable: if the organizer already has an account, this UPDATES it
 * (e.g. they fix a typo'd IBAN) instead of creating a second one.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient, createOrUpdateConnectAccount, deriveOnboardingStatus, type ConnectKyc } from "../_shared/stripeConnect.ts";

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

  let body: { organizer_id?: string; kyc?: ConnectKyc; tos_accepted?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { organizer_id, kyc, tos_accepted } = body;
  if (!organizer_id || !/^[0-9a-f-]{36}$/i.test(organizer_id)) return json({ error: "Invalid organizer_id" }, 400);
  if (!tos_accepted) return json({ error: "You must accept the Stripe Connected Account Agreement to continue." }, 400);
  if (!kyc || !kyc.businessType) return json({ error: "Missing KYC data" }, 400);

  const { data: org } = await supabase.from("organizer_profiles").select("id, user_id, contact_email").eq("id", organizer_id).maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  if (kyc.businessType === "individual") {
    if (!kyc.firstName || !kyc.lastName || !kyc.dob || !kyc.addressLine1 || !kyc.addressPostalCode || !kyc.addressCity || !kyc.iban) {
      return json({ error: "Missing required individual fields." }, 400);
    }
  } else {
    if (!kyc.companyName || !kyc.registrationNumber || !kyc.repFirstName || !kyc.repLastName || !kyc.repDob || !kyc.iban) {
      return json({ error: "Missing required organization fields." }, 400);
    }
  }

  const { data: existing } = await supabase.from("stripe_connect_accounts").select("id, stripe_account_id").eq("organizer_id", organizer_id).maybeSingle();

  const forwardedFor = req.headers.get("x-forwarded-for");
  const tosIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "0.0.0.0";

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[stripe-connect-onboard-organizer] Stripe client init failed:", err);
    return json({ error: "Payments are not configured yet. Please try again later." }, 500);
  }

  try {
    const account = await createOrUpdateConnectAccount(stripe, kyc, tosIp, existing?.stripe_account_id);
    const status = deriveOnboardingStatus(account);
    const accountHolderName = kyc.businessType === "individual" ? `${kyc.firstName} ${kyc.lastName}` : kyc.companyName;

    const row = {
      owner_type: "organizer" as const,
      organizer_id,
      user_id: null,
      stripe_account_id: account.id,
      business_type: kyc.businessType,
      account_holder_name: accountHolderName,
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

    return json({ ok: true, status, charges_enabled: account.charges_enabled, requirements_due: account.requirements?.currently_due ?? [] });
  } catch (err) {
    console.error("[stripe-connect-onboard-organizer] Stripe error:", err);
    const message = err instanceof Error ? err.message : "Could not create your payment account.";
    return json({ error: message }, 400);
  }
});
