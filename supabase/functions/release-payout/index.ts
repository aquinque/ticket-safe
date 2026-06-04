/**
 * release-payout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/release-payout
 * Authorization: Bearer <user-jwt>
 * Body: { organizer_id }
 *
 * After-event payout flow:
 *   1. The organizer must already have a Stripe Connect Express account
 *      with charges_enabled+payouts_enabled. If not, we return
 *      { needs_onboarding: true, onboarding_url } and the FE redirects.
 *   2. We collect every paid_out_at IS NULL event_order whose event date
 *      has passed and create a Stripe Transfer per order to the
 *      organizer's connected account, using the buyer's charge as the
 *      source_transaction (keeps Stripe's reporting clean).
 *   3. Each successfully transferred order is marked paid_out_at + paid_out_transfer_id.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!supabaseUrl || !supabaseKey || !stripeKey) return json({ error: "Server misconfigured." }, 500);

  const supabase = createClient(supabaseUrl, supabaseKey);
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { organizer_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const organizerId = body.organizer_id;
  if (!organizerId || !/^[0-9a-f-]{36}$/i.test(organizerId)) return json({ error: "Invalid organizer_id" }, 400);

  const { data: org } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name, contact_email")
    .eq("id", organizerId)
    .maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  const { data: stripeAcct } = await supabase
    .from("stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!stripeAcct?.stripe_account_id || !stripeAcct.charges_enabled || !stripeAcct.payouts_enabled) {
    let acctId = stripeAcct?.stripe_account_id ?? null;
    if (!acctId) {
      const acct = await stripe.accounts.create({
        type: "express",
        country: "FR",
        email: org.contact_email ?? user.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { name: org.name },
      });
      acctId = acct.id;
      await supabase.from("stripe_accounts").upsert({
        user_id: user.id,
        stripe_account_id: acctId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        onboarding_status: "pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const link = await stripe.accountLinks.create({
      account: acctId!,
      refresh_url: `${siteUrl}/studio?stripe_refresh=1`,
      return_url: `${siteUrl}/studio?stripe_return=1`,
      type: "account_onboarding",
    });
    return json({ needs_onboarding: true, onboarding_url: link.url });
  }

  const { data: orders } = await supabase
    .from("event_orders")
    .select("id, total_cents, fee_cents, stripe_payment_intent_id, event:events!inner(id, title, date)")
    .eq("organizer_id", organizerId)
    .eq("status", "paid")
    .is("paid_out_at", null);

  const now = Date.now();
  const releasable = (orders ?? []).filter((o) => {
    const ev = Array.isArray(o.event) ? o.event[0] : o.event;
    return ev?.date && new Date(ev.date).getTime() < now;
  });
  if (releasable.length === 0) {
    return json({ ok: true, transferred_count: 0, message: "Nothing to release yet — wait until your event ends." });
  }

  const transferred: { order_id: string; transfer_id: string; amount_cents: number }[] = [];
  const failures: { order_id: string; error: string }[] = [];

  for (const o of releasable) {
    const payoutCents = (o.total_cents ?? 0) - (o.fee_cents ?? 0);
    if (payoutCents <= 0) continue;

    try {
      let sourceTransaction: string | undefined;
      if (o.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id, { expand: ["latest_charge"] });
        const ch = pi.latest_charge as Stripe.Charge | null;
        if (ch?.id) sourceTransaction = ch.id;
      }

      const transfer = await stripe.transfers.create({
        amount: payoutCents,
        currency: "eur",
        destination: stripeAcct.stripe_account_id,
        ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
        metadata: {
          order_id: o.id,
          organizer_id: organizerId,
          event_id: Array.isArray(o.event) ? o.event[0]?.id : (o.event as { id: string })?.id,
        },
      });

      await supabase.from("event_orders").update({
        paid_out_at: new Date().toISOString(),
        paid_out_transfer_id: transfer.id,
      }).eq("id", o.id);

      transferred.push({ order_id: o.id, transfer_id: transfer.id, amount_cents: payoutCents });
    } catch (e) {
      console.error("[release-payout] transfer failed:", o.id, e);
      failures.push({ order_id: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totalTransferred = transferred.reduce((a, t) => a + t.amount_cents, 0);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && org.contact_email && totalTransferred > 0) {
    const amountEur = `€${(totalTransferred / 100).toFixed(2)}`;
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)">
  <div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);padding:32px;color:#fff;text-align:center">
    <div style="width:56px;height:56px;background:rgba(255,255,255,.14);border-radius:14px;margin:0 auto 14px;display:inline-flex;align-items:center;justify-content:center;color:#aec6ff;font-weight:900;font-size:22px">TS</div>
    <h1 style="margin:0;font-size:24px;font-weight:900;line-height:1.25">${amountEur} released to your Stripe account</h1>
  </div>
  <div style="padding:26px 30px;color:#1e293b">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Your event has ended and we just transferred your share to your Stripe Express account. Stripe will pay it out to your bank on its next rolling-daily schedule (usually 1-2 business days).</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55"><strong>Transferred: ${amountEur}</strong> across ${transferred.length} order${transferred.length > 1 ? "s" : ""}.</p>
    <p style="margin:22px 0 8px;text-align:center">
      <a href="${siteUrl}/studio" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px">Open my dashboard</a>
    </p>
  </div>
</div></body></html>`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [org.contact_email], subject: `${amountEur} released to your Stripe account`, html }),
    }).catch((e) => console.warn("[release-payout] email failed:", e));
  }

  return json({ ok: true, transferred_count: transferred.length, total_cents: totalTransferred, failures });
});
