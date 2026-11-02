/**
 * event-statement-webhook — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/event-statement-webhook
 * (public endpoint, no auth header: verified by Stripe-Signature with EVENT_STATEMENT_WEBHOOK_SECRET)
 *
 * A dedicated Stripe webhook endpoint, "events on connected accounts", subscribed to payout.paid only: when a
 * payout reaches an organizer's bank, the statement of the event it belongs to is regenerated so it lists the
 * payout (the work itself is done by the event-statements function). Kept apart from stripe-connect-webhook,
 * which also receives payout.paid to update the payout jobs, so neither handler's idempotency record blocks the
 * other: this one keeps its own (event_statement_webhook_events).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { callStatementGenerator } from "../_shared/eventStatementRow.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("EVENT_STATEMENT_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("[event-statement-webhook] Missing environment variables (STRIPE_SECRET_KEY, EVENT_STATEMENT_WEBHOOK_SECRET)");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });
  const body = await req.text();
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    console.error("[event-statement-webhook] Signature verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (event.type !== "payout.paid") return json({ received: true, ignored: event.type });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error: idemErr } = await supabase.from("event_statement_webhook_events").insert({ event_id: event.id, event_type: event.type });
  if (idemErr) {
    if (idemErr.code === "23505") return json({ received: true, duplicate: true });
    console.error("[event-statement-webhook] Idempotency insert failed:", idemErr);
  }

  const payout = event.data.object as Stripe.Payout;
  const account = (event as unknown as { account?: string }).account ?? null;
  try {
    const r = await callStatementGenerator({ payout_id: payout.id, account, trigger: "webhook" });
    if (!r.ok) {
      console.error(`[event-statement-webhook] generator answered ${r.status}:`, r.body);
      return new Response("Statement refresh failed", { status: 500 }); // Stripe retries
    }
    console.log(`[event-statement-webhook] ${payout.id} (${account ?? "?"}): ${JSON.stringify(r.body.events ?? r.body)}`);
    return json({ received: true, ...r.body });
  } catch (err) {
    console.error("[event-statement-webhook] failed:", err);
    return new Response("Statement refresh failed", { status: 500 });
  }
});
