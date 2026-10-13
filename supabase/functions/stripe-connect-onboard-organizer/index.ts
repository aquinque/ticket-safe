/**
 * stripe-connect-onboard-organizer — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-onboard-organizer
 * Authorization: Bearer <organizer-user-jwt>
 * Body: { organizer_id, action?: "onboard" | "refresh" | "dashboard" | "balance",
 *         business_type?: "individual" | "company" | "non_profit" }
 *
 * Express onboarding: Stripe hosts the identity / legal-representative /
 * bank-account pages. This function only
 *   - "onboard" (default): creates the organizer's Express account if it does
 *     not exist yet, then returns a fresh single-use Account Link { url } to
 *     send the organizer to. Re-callable: used again to resume or fix
 *     onboarding, and on the Stripe "refresh" redirect.
 *     The account is created with the type the organizer picked on the
 *     payments page (default: individual, so a student needs no company) and
 *     pre-filled with everything we already know (name, email, address,
 *     SIREN, website, activity), so the hosted form only asks for what is
 *     missing: typically date of birth, phone, IBAN and sometimes an ID.
 *   - "refresh": reads the account back from Stripe and mirrors its state into
 *     stripe_connect_accounts (used when the organizer returns from Stripe,
 *     without waiting for the account.updated webhook).
 *   - "dashboard": returns a single-use login link to the Express dashboard.
 *   - "balance": pending / available / paid-out amounts and the next
 *     availability date, read live from Stripe for the payments page.
 *   - "reset": deletes an account that never got going (no details submitted,
 *     no charges) so the organizer can start again with another type.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import {
  getStripeClient,
  createExpressAccount,
  createOnboardingLink,
  createDashboardLink,
  deriveOnboardingStatus,
  accountStateColumns,
  accountHolderName,
  isConnectBusinessType,
  prefillExistingAccount,
  type ConnectBusinessType,
  type CreateExpressAccountArgs,
} from "../_shared/stripeConnect.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const RETURN_PATH = "/studio/payments";

/**
 * True when the connected account no longer exists at Stripe (deleted from
 * the dashboard or the CLI). Our row is then stale and must go.
 */
async function accountGone(stripe: ReturnType<typeof getStripeClient>, accountId: string): Promise<boolean> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return (account as unknown as { deleted?: boolean }).deleted === true;
  } catch (err) {
    const e = err as { code?: string; statusCode?: number };
    return e.code === "resource_missing" || e.code === "account_invalid" || e.statusCode === 404 || e.statusCode === 403;
  }
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

  let body: { organizer_id?: string; action?: string; business_type?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const organizerId = body.organizer_id;
  const action = body.action ?? "onboard";
  if (!organizerId || !/^[0-9a-f-]{36}$/i.test(organizerId)) return json({ error: "Invalid organizer_id" }, 400);
  if (!["onboard", "refresh", "dashboard", "balance", "reset"].includes(action)) return json({ error: "Invalid action" }, 400);
  if (body.business_type !== undefined && !isConnectBusinessType(body.business_type)) return json({ error: "Invalid business_type" }, 400);

  const { data: org } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name, org_type, contact_name, contact_email, website, siren, billing_address_line1, billing_postal_code, billing_city, billing_country")
    .eq("id", organizerId)
    .maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  // What we already know about the person, so Stripe's form arrives filled in.
  const { data: profile } = await supabase.from("profiles").select("first_name, last_name, full_name").eq("id", user.id).maybeSingle();
  const [fallbackFirst, ...fallbackRest] = (profile?.full_name ?? org.contact_name ?? "").trim().split(/\s+/);
  const person = {
    first_name: profile?.first_name || fallbackFirst || null,
    last_name: profile?.last_name || (fallbackRest.length ? fallbackRest.join(" ") : null),
  };
  // Default type: individual, for everyone. It is the only type Stripe
  // activates without a SIREN, and most organizers are students with none.
  // Association and company are opt-in from the payments page.
  const businessType: ConnectBusinessType = isConnectBusinessType(body.business_type) ? body.business_type : "individual";
  const prefill: CreateExpressAccountArgs = {
    email: org.contact_email ?? user.email ?? null,
    name: businessType === "individual" ? null : org.name,
    businessType,
    person,
    company: { tax_id: org.siren },
    address: { line1: org.billing_address_line1, postal_code: org.billing_postal_code, city: org.billing_city, country: org.billing_country },
    website: org.website,
    metadata: { organizer_id: organizerId, organizer_name: org.name },
  };

  let stripe: ReturnType<typeof getStripeClient>;
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

    if (action === "reset") {
      // Stripe locks the account type at creation, so an organizer who picked
      // "association" without a SIREN is stuck. The only way out is a fresh
      // account. Allowed only while nothing has happened on the old one.
      if (!existing) return json({ ok: true });
      if (!(await accountGone(stripe, existing.stripe_account_id))) {
        const account = await stripe.accounts.retrieve(existing.stripe_account_id);
        if (account.charges_enabled || account.details_submitted) {
          return json({ error: "This account is already set up and can't be started over. Contact us and we'll sort it out." }, 409);
        }
        await stripe.accounts.del(existing.stripe_account_id);
      }
      await supabase.from("stripe_connect_accounts").delete().eq("id", existing.id);
      return json({ ok: true });
    }

    if (action === "balance") {
      // Where the organizer's money is right now, straight from Stripe:
      // pending (sold, not yet available), available (waiting for the
      // post-event payout), paid out so far, and the date the next pending
      // amount frees up. The payments page draws its money track from this.
      if (!existing) return json({ error: "No payment account yet." }, 404);
      const opts = { stripeAccount: existing.stripe_account_id };
      const [balance, recentTx, payouts] = await Promise.all([
        stripe.balance.retrieve(undefined, opts),
        stripe.balanceTransactions.list({ limit: 50 }, opts),
        stripe.payouts.list({ limit: 50 }, opts),
      ]);
      const { data: settings } = await supabase.from("billing_settings").select("stripe_payout_delay_days").eq("id", true).maybeSingle();
      const eur = (rows: { amount: number; currency: string }[]) => rows.filter((b) => b.currency === "eur").reduce((s, b) => s + b.amount, 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const nextAvailable = (recentTx.data as Stripe.BalanceTransaction[])
        .filter((t) => t.currency === "eur" && t.amount > 0 && t.available_on > nowSec)
        .map((t) => t.available_on)
        .sort((a, b) => a - b)[0];
      const paidOutCents = (payouts.data as Stripe.Payout[])
        .filter((p) => p.currency === "eur" && (p.status === "paid" || p.status === "pending" || p.status === "in_transit"))
        .reduce((s, p) => s + p.amount, 0);
      return json({
        available_cents: eur(balance.available),
        pending_cents: eur(balance.pending),
        paid_out_cents: paidOutCents,
        next_available_on: nextAvailable ? new Date(nextAvailable * 1000).toISOString() : null,
        payout_delay_days: settings?.stripe_payout_delay_days ?? 2,
      });
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
    if (existing && stripeAccountId && (await accountGone(stripe, stripeAccountId))) {
      // The Stripe account was deleted behind our back: drop the stale row and
      // create a fresh account below, with the type chosen now.
      await supabase.from("stripe_connect_accounts").delete().eq("id", existing.id);
      stripeAccountId = null;
    }
    if (stripeAccountId) {
      // Resuming: push the prefill again in case the type was chosen (or the
      // profile completed) after the account was first created, then mirror
      // what Stripe actually kept: it locks the type once verification starts,
      // so the row must reflect Stripe, not the choice made on the page.
      await prefillExistingAccount(stripe, stripeAccountId, prefill);
      const account = await stripe.accounts.retrieve(stripeAccountId);
      await supabase.from("stripe_connect_accounts").update(accountStateColumns(account)).eq("id", existing!.id);
    } else {
      const account = await createExpressAccount(stripe, prefill);
      stripeAccountId = account.id;
      const { error: insertErr } = await supabase.from("stripe_connect_accounts").insert({
        owner_type: "organizer",
        organizer_id: organizerId,
        user_id: null,
        stripe_account_id: account.id,
        account_holder_name: org.name,
        business_type: businessType,
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
