/**
 * stripe-connect-payout-cron — Supabase Edge Function (Deno), scheduled.
 *
 * Two passes, run on every invocation:
 *
 *  1. SCHEDULE — for every published, non-cancelled Stripe-provider event
 *     whose end date has passed and that doesn't have a payout job yet,
 *     create a 'scheduled' stripe_connect_payout_jobs row dated
 *     (event end + billing_settings.stripe_payout_delay_days).
 *
 *  2. PROCESS — for every job whose scheduled_for has arrived:
 *       - organizer_event_payout: stripe.payouts.create on behalf of the
 *         connected account (the money already sits in THEIR Stripe
 *         balance — this just pushes it to their bank), then keeps a
 *         follow-up job while sales are still settling at Stripe, until the
 *         event's organizer share has all been paid out. One payout at the
 *         event's end would leave the last days' sales in the balance.
 *       - reseller_payout: stripe.transfers.create from the platform
 *         balance to the seller's connected account (separate-charges
 *         pattern — the resale charge landed on the platform, not on any
 *         connected account, since the seller's account didn't exist at
 *         checkout time), THEN stripe.payouts.create on their account to
 *         push it on to their bank in the same pass.
 *     A cancelled event, or any job already 'blocked' (e.g. by an open
 *     dispute, set in stripe-connect-webhook), is never processed here.
 *
 *  Reminder emails (3-day / 7-day) for resellers who haven't completed
 *  onboarding run in the same invocation as a third pass.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { eventEnd } from "../_shared/eventTime.ts";
import { renderEmail, ctaButton } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type StripeClient = ReturnType<typeof getStripeClient>;
/** Stripe money rows (balance entries, balance transactions) as far as this file reads them. */
type MoneyRow = { currency: string; amount: number };
type SettlingRow = MoneyRow & { available_on: number };

/**
 * Balance rows that hold money, in any currency: an organizer's Stripe account
 * in the UK holds pounds from London sales, a French one holds euros. Resale
 * stays in euros (reseller_payout below).
 */
const withMoney = (rows: MoneyRow[]) => rows.filter((b) => b.amount > 0);
const sum = (rows: MoneyRow[]) => rows.reduce((s, b) => s + b.amount, 0);

/** Safety cap on follow-up jobs per event, so a chain can never run forever. */
const MAX_SWEEPS_PER_EVENT = 30;

/**
 * Whether this event still has money to send: the organizer's share of its
 * paid Stripe orders, minus what the event's payout chain has already sent.
 * Keeps a chain from sweeping a later event's money on an account that keeps
 * selling, and bounds the number of follow-ups.
 */
async function eventStillOwed(supabase: SupabaseClient, eventId: string): Promise<boolean> {
  const [{ data: orders }, { data: jobs }] = await Promise.all([
    supabase
      .from("event_orders")
      .select("total_cents, fee_cents")
      .eq("event_id", eventId)
      .eq("status", "paid")
      .like("stripe_checkout_session_id", "cs_%"),
    supabase
      .from("stripe_connect_payout_jobs")
      .select("amount_cents, status")
      .eq("event_id", eventId)
      .eq("kind", "organizer_event_payout"),
  ]);
  const owed = ((orders ?? []) as { total_cents: number | null; fee_cents: number | null }[])
    .reduce((sum, o) => sum + (o.total_cents ?? 0) - (o.fee_cents ?? 0), 0);
  const rows = ((jobs ?? []) as { amount_cents: number | null; status: string }[]);
  if (rows.length >= MAX_SWEEPS_PER_EVENT) return false;
  const paid = rows.filter((j) => j.status === "sent").reduce((sum, j) => sum + (j.amount_cents ?? 0), 0);
  return paid < owed;
}

/**
 * When the next pending sale on the account becomes available, so the sweep
 * fires right after it lands instead of polling; six hours out when Stripe
 * gives no date.
 */
async function nextSettlementIso(stripe: StripeClient, stripeAccountId: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  let nextSec = nowSec + 6 * 3600;
  try {
    const txs = await stripe.balanceTransactions.list({ limit: 100 }, { stripeAccount: stripeAccountId });
    const upcoming = (txs.data as SettlingRow[])
      .filter((t) => t.amount > 0 && t.available_on > nowSec)
      .map((t) => t.available_on);
    if (upcoming.length > 0) nextSec = Math.min(...upcoming) + 5 * 60;
  } catch (e) {
    console.warn("[stripe-connect-payout-cron] settlement lookup failed:", e);
  }
  return new Date(nextSec * 1000).toISOString();
}

/**
 * A seller's resale sales that are ready to pay: paid through Stripe (the
 * money sits on the platform account; wallet-era Revolut sales stay in the
 * wallet), not paid out yet, and whose event ended at least delayDays ago, so
 * a fake or already-used ticket can still be refunded to the buyer first.
 * The seller gets what the buyer paid, minus the buyer fee and the 5 % seller
 * fee.
 */
async function maturedResaleSales(supabase: SupabaseClient, sellerId: string, delayDays: number) {
  const { data } = await supabase
    .from("transactions")
    .select("id, amount, fee_amount, commission_cents, ticket:tickets(event:events(date, ends_at))")
    .eq("seller_id", sellerId)
    .eq("status", "completed")
    .is("payout_job_id", null)
    .like("stripe_checkout_session_id", "cs_%");
  const cutoff = Date.now() - delayDays * 86_400_000;
  const rows = ((data ?? []) as unknown as {
    id: string; amount: number | string; fee_amount: number | string | null; commission_cents: number | null;
    ticket: { event: { date: string | null; ends_at: string | null } | null } | null;
  }[]).filter((t) => {
    const ev = t.ticket?.event;
    const end = ev ? eventEnd(ev) : null;
    return !!end && end.getTime() <= cutoff;
  });
  const owedCents = rows.reduce(
    (sum, t) => sum + Math.round(Number(t.amount) * 100) - Math.round(Number(t.fee_amount ?? 0) * 100) - (t.commission_cents ?? 0),
    0,
  );
  return { ids: rows.map((t) => t.id), owedCents };
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string, text: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html, text }),
    });
  } catch (e) { console.warn("[stripe-connect-payout-cron] email failed:", e); }
}

serve(async (req) => {
  const cronSecret = Deno.env.get("STRIPE_PAYOUT_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (cronSecret && providedSecret !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    console.error("[stripe-connect-payout-cron] Stripe client init failed:", err);
    return json({ error: "Stripe not configured" }, 500);
  }

  const { data: settings } = await supabase.from("billing_settings").select("stripe_payout_delay_days").eq("id", true).maybeSingle();
  const delayDays = settings?.stripe_payout_delay_days ?? 2;

  // ── Pass 1: schedule organizer payout jobs for events that just ended ──
  let scheduled = 0;
  {
    const { data: dueEvents } = await supabase
      .from("events")
      .select("id, ends_at, date, organizer_id")
      .eq("payment_provider", "stripe")
      .eq("status", "published")
      .lt("date", new Date().toISOString());

    for (const ev of dueEvents ?? []) {
      // The end from the product's one rule (ends_at, else start + 8 h); without a readable date the event is not ended, so no job.
      const end = eventEnd(ev);
      if (!end) continue;
      // One chain of jobs per event: the first row is created here, follow-up
      // rows (for money still settling) by pass 2, so look for any row at all.
      const { data: existingJobs } = await supabase.from("stripe_connect_payout_jobs").select("id").eq("event_id", ev.id).eq("kind", "organizer_event_payout").limit(1);
      if (existingJobs && existingJobs.length > 0) continue;

      const { data: account } = await supabase.from("stripe_connect_accounts").select("id").eq("organizer_id", ev.organizer_id).maybeSingle();
      if (!account) continue;

      const scheduledFor = new Date(end.getTime() + delayDays * 86_400_000).toISOString();
      await supabase.from("stripe_connect_payout_jobs").insert({
        event_id: ev.id,
        stripe_connect_account_id: account.id,
        kind: "organizer_event_payout",
        scheduled_for: scheduledFor,
        status: "scheduled",
      });
      scheduled++;
    }
  }

  // ── Pass 1b: queue a payout for every reseller whose sales are ready ──
  // (event over + delay). Sellers who haven't added their bank details yet
  // are picked up the moment they do (stripe-connect-onboard-reseller).
  {
    const { data: resellers } = await supabase
      .from("stripe_connect_accounts")
      .select("id, user_id")
      .eq("owner_type", "reseller")
      .eq("payouts_enabled", true);
    for (const r of resellers ?? []) {
      if (!r.user_id) continue;
      const { owedCents } = await maturedResaleSales(supabase, r.user_id, delayDays);
      if (owedCents <= 0) continue;
      const { data: queued } = await supabase.from("stripe_connect_payout_jobs").select("id")
        .eq("stripe_connect_account_id", r.id).eq("kind", "reseller_payout").eq("status", "scheduled").limit(1);
      if (queued && queued.length > 0) continue;
      await supabase.from("stripe_connect_payout_jobs").insert({
        stripe_connect_account_id: r.id, kind: "reseller_payout", scheduled_for: new Date().toISOString(), status: "scheduled",
      });
      scheduled++;
    }
  }

  // ── Pass 2: process due, non-blocked jobs ──
  let sent = 0;
  let failed = 0;
  {
    const { data: dueJobs } = await supabase
      .from("stripe_connect_payout_jobs")
      .select("id, event_id, stripe_connect_account_id, kind")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString());

    for (const job of dueJobs ?? []) {
      // Re-check the event isn't cancelled since the job was scheduled.
      if (job.event_id) {
        const { data: ev } = await supabase.from("events").select("status").eq("id", job.event_id).maybeSingle();
        if (ev?.status === "cancelled") {
          await supabase.from("stripe_connect_payout_jobs").update({ status: "cancelled", blocked_reason: "Event was cancelled" }).eq("id", job.id);
          continue;
        }
      }

      const { data: account } = await supabase.from("stripe_connect_accounts").select("id, stripe_account_id, charges_enabled, payouts_enabled").eq("id", job.stripe_connect_account_id).maybeSingle();
      if (!account || !account.payouts_enabled) {
        await supabase.from("stripe_connect_payout_jobs").update({ status: "blocked", blocked_reason: "Connected account not payout-ready" }).eq("id", job.id);
        continue;
      }

      try {
        const balance = await stripe.balance.retrieve(undefined, { stripeAccount: account.stripe_account_id });
        const availableRows = withMoney(balance.available as MoneyRow[]);
        const available = sum(availableRows);

        if (job.kind === "reseller_payout") {
          // Separate-charges pattern: transfer from platform balance to the
          // connected account first (the resale charge landed on the
          // platform, not on this account), THEN payout from their account
          // to their bank. Amount = their Stripe resale sales whose event is
          // over (maturedResaleSales), minus the buyer fee and the 5 % seller fee.
          const { data: sellerRow } = await supabase.from("stripe_connect_accounts").select("user_id").eq("id", account.id).maybeSingle();
          if (!sellerRow?.user_id) throw new Error("Reseller account has no user_id");
          const { ids: txIds, owedCents } = await maturedResaleSales(supabase, sellerRow.user_id, delayDays);
          if (owedCents <= 0) {
            await supabase.from("stripe_connect_payout_jobs").update({ status: "cancelled", blocked_reason: "Nothing owed" }).eq("id", job.id);
            continue;
          }
          await stripe.transfers.create({ amount: owedCents, currency: "eur", destination: account.stripe_account_id });
          const payout = await stripe.payouts.create({ amount: owedCents, currency: "eur" }, { stripeAccount: account.stripe_account_id });
          await supabase.from("stripe_connect_payout_jobs").update({ status: "sent", stripe_payout_id: payout.id, amount_cents: owedCents, attempted_at: new Date().toISOString() }).eq("id", job.id);
          // Mark these transactions as paid out so they aren't double-counted next run.
          if (txIds.length > 0) {
            await supabase.from("transactions").update({ payout_job_id: job.id }).in("id", txIds);
          }
          sent++;
        } else {
          // organizer_event_payout: the money already sits on the connected
          // account (destination charges). Push what is available now, then
          // keep sweeping: sales from the last days before the event are still
          // settling at Stripe, so a single payout at the event's end would
          // leave them in the balance until some later event. The chain stops
          // once nothing is pending, once this event's sales have all been
          // paid out, or at the safety cap.
          const pending = sum(withMoney(balance.pending as MoneyRow[]));
          const nowIso = new Date().toISOString();

          if (available > 0) {
            // One payout per currency held (normally just one: pounds on a UK
            // account, euros on a French one), each on its own row so the
            // webhook can match it by id.
            for (const [i, b] of availableRows.entries()) {
              const payout = await stripe.payouts.create({ amount: b.amount, currency: b.currency }, { stripeAccount: account.stripe_account_id });
              const sentRow = { status: "sent", stripe_payout_id: payout.id, amount_cents: b.amount, attempted_at: nowIso };
              if (i === 0) await supabase.from("stripe_connect_payout_jobs").update(sentRow).eq("id", job.id);
              else await supabase.from("stripe_connect_payout_jobs").insert({ ...sentRow, event_id: job.event_id, stripe_connect_account_id: account.id, kind: "organizer_event_payout", scheduled_for: nowIso });
            }
            sent++;
          }

          const keepSweeping = pending > 0 && !!job.event_id && (await eventStillOwed(supabase, job.event_id));
          if (keepSweeping) {
            const nextAt = await nextSettlementIso(stripe, account.stripe_account_id);
            if (available > 0) {
              // This row is done; a fresh row waits for the next settlement.
              await supabase.from("stripe_connect_payout_jobs").insert({
                event_id: job.event_id,
                stripe_connect_account_id: account.id,
                kind: "organizer_event_payout",
                scheduled_for: nextAt,
                status: "scheduled",
              });
            } else {
              // Nothing available yet: wait on this same row.
              await supabase.from("stripe_connect_payout_jobs").update({ scheduled_for: nextAt, attempted_at: nowIso }).eq("id", job.id);
            }
          } else if (available <= 0) {
            await supabase.from("stripe_connect_payout_jobs").update({ status: "cancelled", blocked_reason: "Nothing left to pay out" }).eq("id", job.id);
          }
        }
      } catch (err) {
        console.error(`[stripe-connect-payout-cron] payout failed for job ${job.id}:`, err);
        await supabase.from("stripe_connect_payout_jobs").update({ status: "failed", blocked_reason: err instanceof Error ? err.message : String(err), attempted_at: new Date().toISOString() }).eq("id", job.id);
        failed++;
      }
    }
  }

  // ── Pass 3: reseller onboarding reminders (3d / 7d) ──
  let reminded3 = 0;
  let reminded7 = 0;
  if (resendKey) {
    const now = Date.now();
    const { data: pendingResellers } = await supabase
      .from("stripe_connect_accounts")
      .select("id, user_id, created_at, reminder_3d_sent_at, reminder_7d_sent_at, payouts_enabled")
      .eq("owner_type", "reseller")
      .eq("payouts_enabled", false);

    for (const r of pendingResellers ?? []) {
      const ageMs = now - new Date(r.created_at).getTime();
      const { data: authUser } = await supabase.auth.admin.getUserById(r.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      if (ageMs >= 7 * 86_400_000 && !r.reminder_7d_sent_at) {
        const { html, text } = renderEmail({
          eyebrow: "Action needed",
          title: "Your resale payment is still waiting",
          bodyHtml: `<p style="margin:0 0 4px">It's been a week — your resale money is still waiting for your bank details.</p>${ctaButton("Receive my money", `${emailTokens.siteUrl}/settings/listings`)}`,
          preheader: "Your resale payment is still waiting for your bank details.",
          text: "Your resale payment is still waiting for your bank details.",
        });
        await sendEmail(resendKey, email, "Your resale payment is still waiting", html, text);
        await supabase.from("stripe_connect_accounts").update({ reminder_7d_sent_at: new Date().toISOString() }).eq("id", r.id);
        reminded7++;
      } else if (ageMs >= 3 * 86_400_000 && !r.reminder_3d_sent_at) {
        const { html, text } = renderEmail({
          eyebrow: "Reminder",
          title: "Don't forget to claim your resale money",
          bodyHtml: `<p style="margin:0 0 4px">Your ticket sold a few days ago — fill in your bank details to receive the money.</p>${ctaButton("Receive my money", `${emailTokens.siteUrl}/settings/listings`)}`,
          preheader: "Fill in your bank details to receive your resale money.",
          text: "Fill in your bank details to receive your resale money.",
        });
        await sendEmail(resendKey, email, "Don't forget to claim your resale money", html, text);
        await supabase.from("stripe_connect_accounts").update({ reminder_3d_sent_at: new Date().toISOString() }).eq("id", r.id);
        reminded3++;
      }
    }
  }

  return json({ ok: true, scheduled, sent, failed, reminded3, reminded7 });
});
