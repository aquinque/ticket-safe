/**
 * event-statements-cron — Supabase Edge Function (Deno), scheduled hourly by pg_cron (see the migration
 * event_statements). Produces the financial statement of every Stripe event that ended more than 24 hours ago
 * and has none yet. The day's delay lets the end-of-event payout appear on Stripe first; a payout paid later
 * regenerates the statement through stripe-connect-webhook (payout.paid).
 *
 * Secured like stripe-connect-payout-cron: when STRIPE_PAYOUT_CRON_SECRET is set, the x-cron-secret header must
 * carry it. Idempotent: an event with a statement is never picked again here, and generateEventStatement itself
 * produces nothing new for unchanged data.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { generateEventStatement } from "../_shared/eventStatement.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Events per run, so the function stays within its time limit; the next hour takes the rest. */
const MAX_EVENTS_PER_RUN = 10;
const HOUR = 3_600_000;
/** Events older than this are left alone: a statement they never got would be noise, and they may predate Connect. */
const LOOKBACK_DAYS = 120;

serve(async (req) => {
  const cronSecret = Deno.env.get("STRIPE_PAYOUT_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (cronSecret && providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[event-statements-cron] Stripe client init failed:", err);
    return json({ error: "Stripe not configured" }, 500);
  }

  const now = Date.now();
  const cutoff = new Date(now - 24 * HOUR).toISOString();
  const since = new Date(now - LOOKBACK_DAYS * 24 * HOUR).toISOString();

  // Ended Stripe events: the end is ends_at when set, else the start date.
  const { data: candidates, error } = await supabase
    .from("events")
    .select("id, title, date, ends_at, organizer_id")
    .eq("payment_provider", "stripe")
    .in("status", ["published", "sold_out"])
    .not("organizer_id", "is", null)
    .gte("date", since)
    .lt("date", cutoff)
    .order("date", { ascending: true });
  if (error) return json({ error: error.message }, 500);

  const ended = (candidates ?? []).filter((ev) => new Date(ev.ends_at ?? ev.date).toISOString() < cutoff);
  const ids = ended.map((ev) => ev.id);
  const done = new Set<string>();
  if (ids.length) {
    const { data: existing } = await supabase.from("event_statements").select("event_id").in("event_id", ids);
    for (const row of existing ?? []) done.add(row.event_id);
  }
  const todo = ended.filter((ev) => !done.has(ev.id)).slice(0, MAX_EVENTS_PER_RUN);

  const results: Record<string, string> = {};
  for (const ev of todo) {
    try {
      const r = await generateEventStatement(
        { supabase, stripe, resendKey: Deno.env.get("RESEND_API_KEY"), siteUrl: Deno.env.get("SITE_URL") ?? undefined },
        { eventId: ev.id, trigger: "cron" },
      );
      results[ev.id] = r.outcome === "skipped" ? `skipped:${r.reason}` : `${r.outcome}:v${r.statement.version}`;
    } catch (err) {
      console.error(`[event-statements-cron] event ${ev.id} failed:`, err);
      results[ev.id] = `error:${err instanceof Error ? err.message : String(err)}`;
    }
  }

  console.log(`[event-statements-cron] ended=${ended.length} with_statement=${done.size} processed=${todo.length} ${JSON.stringify(results)}`);
  return json({ ok: true, ended: ended.length, processed: todo.length, remaining: Math.max(0, ended.length - done.size - todo.length), results });
});
