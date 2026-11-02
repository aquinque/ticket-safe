/**
 * stripe-connect-request-payout — Supabase Edge Function (Deno)
 *
 * Organizer-triggered (manual) payout for Stripe Connect organizers.
 * The connected accounts are created with payout schedule = manual
 * (see _shared/stripeConnect.ts), so money from direct charges just sits
 * in the organizer's own Stripe balance until a payout is created on their
 * behalf. stripe-connect-payout-cron does that automatically N days after
 * an event ends; this function lets the organizer do it on demand from
 * Ticket Studio ("Retirer mes fonds").
 *
 * POST /functions/v1/stripe-connect-request-payout
 * Authorization: Bearer <user-jwt>
 * Body: { organizer_id: string, amount_cents?: number, dry_run?: boolean }
 *   - amount_cents omitted → pays out the full available EUR balance
 *   - dry_run: true       → returns the balance only, creates nothing
 *
 * Money never touches the platform: stripe.payouts.create is called with
 * the Stripe-Account header, i.e. from the organizer's balance to the
 * organizer's bank account. Ticket Safe takes no fee here.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_PAYOUT_CENTS = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Same guard as _shared/stripeConnect.ts — kept inline so this function is
// self-contained. Refuses a live key unless STRIPE_ALLOW_LIVE_MODE=true.
function getStripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  const allowLive = Deno.env.get("STRIPE_ALLOW_LIVE_MODE") === "true";
  if (key.startsWith("sk_live_") && !allowLive) {
    throw new Error("Refusing to use a live Stripe key — STRIPE_ALLOW_LIVE_MODE is not set to true.");
  }
  return new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  // ── Body ──
  let body: { organizer_id?: string; amount_cents?: number; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const organizerId = body.organizer_id;
  if (!organizerId || !/^[0-9a-f-]{36}$/i.test(organizerId)) return json({ error: "Invalid organizer_id" }, 400);
  const dryRun = body.dry_run === true;

  // ── Ownership check ──
  const { data: org } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name")
    .eq("id", organizerId)
    .maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  // ── Connected account ──
  const { data: account } = await supabase
    .from("stripe_connect_accounts")
    .select("id, stripe_account_id, payouts_enabled, charges_enabled, requirements_currently_due")
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (!account) return json({ error: "No Stripe account connected for this organizer", code: "NO_STRIPE_ACCOUNT" }, 409);
  if (!account.payouts_enabled) {
    return json({
      error: "Your Stripe account is not ready for payouts yet (missing information or bank account).",
      code: "PAYOUTS_DISABLED",
      requirements_currently_due: account.requirements_currently_due ?? [],
    }, 409);
  }

  // A job blocked by the webhook (open dispute, etc.) freezes manual payouts too.
  const { data: blocked } = await supabase
    .from("stripe_connect_payout_jobs")
    .select("id, blocked_reason")
    .eq("stripe_connect_account_id", account.id)
    .eq("status", "blocked")
    .limit(1)
    .maybeSingle();
  if (blocked) {
    return json({ error: "Payouts are temporarily on hold for this account.", code: "PAYOUTS_BLOCKED", reason: blocked.blocked_reason }, 409);
  }

  let stripe: Stripe;
  try { stripe = getStripeClient(); } catch (err) {
    console.error("[stripe-connect-request-payout] Stripe init failed:", err);
    return json({ error: "Stripe not configured" }, 500);
  }

  // ── Balance on the organizer's own Stripe account ──
  let availableCents = 0;
  let pendingCents = 0;
  try {
    const balance = await stripe.balance.retrieve(undefined, { stripeAccount: account.stripe_account_id });
    availableCents = balance.available.find((b) => b.currency === "eur")?.amount ?? 0;
    pendingCents = balance.pending.find((b) => b.currency === "eur")?.amount ?? 0;
  } catch (err) {
    console.error("[stripe-connect-request-payout] balance.retrieve failed:", err);
    return json({ error: "Could not read Stripe balance" }, 502);
  }

  if (dryRun) {
    return json({ ok: true, dry_run: true, available_cents: availableCents, pending_cents: pendingCents, min_payout_cents: MIN_PAYOUT_CENTS });
  }

  // ── Amount ──
  const requested = body.amount_cents === undefined || body.amount_cents === null
    ? availableCents
    : Math.floor(Number(body.amount_cents));
  if (!Number.isInteger(requested) || requested < MIN_PAYOUT_CENTS) {
    return json({ error: `Minimum payout is €${(MIN_PAYOUT_CENTS / 100).toFixed(2)}`, code: "AMOUNT_TOO_LOW", available_cents: availableCents }, 400);
  }
  if (requested > availableCents) {
    return json({
      error: `Requested €${(requested / 100).toFixed(2)} but only €${(availableCents / 100).toFixed(2)} is available right now (€${(pendingCents / 100).toFixed(2)} still pending).`,
      code: "INSUFFICIENT_BALANCE",
      available_cents: availableCents,
      pending_cents: pendingCents,
    }, 409);
  }

  // ── Payout: organizer balance → organizer bank. Never via the platform. ──
  let payout: Stripe.Payout;
  try {
    payout = await stripe.payouts.create(
      {
        amount: requested,
        currency: "eur",
        description: "Ticket Safe — retrait manuel",
        metadata: { organizer_id: organizerId, source: "studio_manual", requested_by: user.id },
      },
      {
        stripeAccount: account.stripe_account_id,
        // One payout per organizer per minute-window at most, in case of double-click.
        idempotencyKey: `manual-payout-${organizerId}-${requested}-${Math.floor(Date.now() / 60_000)}`,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-connect-request-payout] payouts.create failed:", msg);
    await supabase.from("stripe_connect_payout_jobs").insert({
      event_id: null,
      stripe_connect_account_id: account.id,
      kind: "organizer_event_payout",
      scheduled_for: new Date().toISOString(),
      status: "failed",
      blocked_reason: `manual: ${msg}`,
      amount_cents: requested,
      attempted_at: new Date().toISOString(),
    });
    return json({ error: "Stripe refused the payout: " + msg, code: "STRIPE_ERROR" }, 502);
  }

  // ── Audit row, same table the cron uses so admin tooling sees it ──
  const { data: job } = await supabase.from("stripe_connect_payout_jobs").insert({
    event_id: null,
    stripe_connect_account_id: account.id,
    kind: "organizer_event_payout",
    scheduled_for: new Date().toISOString(),
    status: "sent",
    blocked_reason: "manual payout requested from Ticket Studio",
    stripe_payout_id: payout.id,
    amount_cents: requested,
    attempted_at: new Date().toISOString(),
  }).select("id").single();

  return json({
    ok: true,
    job_id: job?.id ?? null,
    stripe_payout_id: payout.id,
    amount_cents: requested,
    currency: "eur",
    arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
    remaining_available_cents: availableCents - requested,
    pending_cents: pendingCents,
  });
});
