/**
 * event-statements — Supabase Edge Function (Deno). The one place that generates financial statements; the
 * light functions (event-statement for the Studio page, event-statement-webhook for Stripe) call it over HTTP.
 *
 * POST /functions/v1/event-statements
 * x-cron-secret: <STRIPE_PAYOUT_CRON_SECRET>   (required when that secret is set, as for stripe-connect-payout-cron)
 * Body, one of:
 *   { source: "pg_cron" }                         hourly sweep: every Stripe event that ended more than 24 h ago
 *                                                 and has no statement yet (the day's delay lets the end-of-event
 *                                                 payout appear on Stripe first). `dry_run: true` only lists them.
 *   { event_id, trigger, force?, allow_empty? }   one event (manual regeneration from the Studio page, or ops).
 *   { payout_id, account?, trigger: "webhook" }   after payout.paid: the event our payout job sent it for, or,
 *                                                 for a cash-out without a job, every recent statement of that
 *                                                 connected account; only the ones whose figures changed get a
 *                                                 new version (generateEventStatement is idempotent on its data).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { generateEventStatement, type GenerateOutcome, type StatementTrigger } from "../_shared/eventStatement.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Events per sweep, so the function stays within its time limit; the next hour takes the rest. */
const MAX_EVENTS_PER_SWEEP = 10;
/** Events per payout refresh (a cash-out without a job). */
const MAX_EVENTS_PER_PAYOUT = 10;
const HOUR = 3_600_000;
/** Older events are left alone: a statement they never got would be noise, and they may predate Connect. */
const LOOKBACK_DAYS = 120;
const TRIGGERS = new Set<string>(["cron", "webhook", "manual"]);

const describe = (r: GenerateOutcome) => (r.outcome === "skipped" ? `skipped:${r.reason}` : `${r.outcome}:v${r.statement.version}`);

interface Body {
  source?: string;
  dry_run?: boolean;
  event_id?: string;
  trigger?: string;
  force?: boolean;
  allow_empty?: boolean;
  payout_id?: string;
  account?: string | null;
}

/** The ended Stripe events of the last LOOKBACK_DAYS days, those with a statement marked. */
async function endedEvents(supabase: SupabaseClient) {
  const now = Date.now();
  const cutoff = new Date(now - 24 * HOUR).toISOString();
  const since = new Date(now - LOOKBACK_DAYS * 24 * HOUR).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, ends_at, organizer_id")
    .eq("payment_provider", "stripe")
    .in("status", ["published", "sold_out"])
    .not("organizer_id", "is", null)
    .gte("date", since)
    .lt("date", cutoff)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  const ended = (data ?? []).filter((ev) => new Date(ev.ends_at ?? ev.date).toISOString() < cutoff);
  const done = new Set<string>();
  if (ended.length) {
    const { data: existing } = await supabase.from("event_statements").select("event_id").in("event_id", ended.map((ev) => ev.id));
    for (const row of existing ?? []) done.add(row.event_id);
  }
  return { ended, done };
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cronSecret = Deno.env.get("STRIPE_PAYOUT_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* an empty body is the sweep */ }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[event-statements] Stripe client init failed:", err);
    return json({ error: "Stripe not configured" }, 500);
  }
  const deps = { supabase, stripe, resendKey: Deno.env.get("RESEND_API_KEY"), siteUrl: Deno.env.get("SITE_URL") ?? undefined };

  try {
    // ── One event ──
    if (body.event_id) {
      if (!/^[0-9a-f-]{36}$/i.test(body.event_id)) return json({ error: "Invalid event_id" }, 400);
      const trigger = (TRIGGERS.has(body.trigger ?? "") ? body.trigger : "manual") as StatementTrigger;
      const result = await generateEventStatement(deps, { eventId: body.event_id, trigger, force: body.force === true, allowEmpty: body.allow_empty === true });
      return json({ ok: true, result });
    }

    // ── After a payout ──
    if (body.payout_id) {
      const eventIds = new Set<string>();
      const { data: jobs } = await supabase.from("stripe_connect_payout_jobs").select("event_id").eq("stripe_payout_id", body.payout_id).not("event_id", "is", null);
      for (const j of jobs ?? []) eventIds.add(j.event_id);
      if (eventIds.size === 0 && body.account) {
        const { data: acct } = await supabase.from("stripe_connect_accounts").select("organizer_id").eq("stripe_account_id", body.account).maybeSingle();
        if (acct?.organizer_id) {
          const { data: statements } = await supabase
            .from("event_statements")
            .select("event_id")
            .eq("organizer_id", acct.organizer_id)
            .gte("generated_at", new Date(Date.now() - LOOKBACK_DAYS * 24 * HOUR).toISOString());
          for (const row of statements ?? []) eventIds.add(row.event_id);
        }
      }
      const results: Record<string, string> = {};
      for (const eventId of [...eventIds].slice(0, MAX_EVENTS_PER_PAYOUT)) {
        try {
          results[eventId] = describe(await generateEventStatement(deps, { eventId, trigger: "webhook" }));
        } catch (err) {
          console.error(`[event-statements] payout ${body.payout_id}: event ${eventId} failed:`, err);
          results[eventId] = `error:${err instanceof Error ? err.message : String(err)}`;
        }
      }
      console.log(`[event-statements] payout ${body.payout_id} account=${body.account ?? "?"}: ${JSON.stringify(results)}`);
      return json({ ok: true, events: results });
    }

    // ── Hourly sweep ──
    const { ended, done } = await endedEvents(supabase);
    const todo = ended.filter((ev) => !done.has(ev.id));
    if (body.dry_run) {
      return json({ ok: true, dry_run: true, ended: ended.length, with_statement: done.size, candidates: todo.map((ev) => ({ id: ev.id, title: ev.title, ends_at: ev.ends_at ?? ev.date })) });
    }
    const batch = todo.slice(0, MAX_EVENTS_PER_SWEEP);
    const results: Record<string, string> = {};
    for (const ev of batch) {
      try {
        results[ev.id] = describe(await generateEventStatement(deps, { eventId: ev.id, trigger: "cron" }));
      } catch (err) {
        console.error(`[event-statements] sweep: event ${ev.id} failed:`, err);
        results[ev.id] = `error:${err instanceof Error ? err.message : String(err)}`;
      }
    }
    console.log(`[event-statements] sweep: ended=${ended.length} with_statement=${done.size} processed=${batch.length} ${JSON.stringify(results)}`);
    return json({ ok: true, ended: ended.length, processed: batch.length, remaining: Math.max(0, todo.length - batch.length), results });
  } catch (err) {
    console.error("[event-statements] failed:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
