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
 *         connected account (direct-charge money already sits in THEIR
 *         Stripe balance — this just pushes it to their bank).
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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStripeClient } from "../_shared/stripeConnect.ts";
import { renderEmail, ctaButton } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
      const endRef = ev.ends_at ?? ev.date;
      const { data: existingJob } = await supabase.from("stripe_connect_payout_jobs").select("id").eq("event_id", ev.id).eq("kind", "organizer_event_payout").maybeSingle();
      if (existingJob) continue;

      const { data: account } = await supabase.from("stripe_connect_accounts").select("id").eq("organizer_id", ev.organizer_id).maybeSingle();
      if (!account) continue;

      const scheduledFor = new Date(new Date(endRef).getTime() + delayDays * 86_400_000).toISOString();
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
        const available = balance.available.find((b) => b.currency === "eur")?.amount ?? 0;

        if (job.kind === "reseller_payout") {
          // Separate-charges pattern: transfer from platform balance to the
          // connected account first (the resale charge landed on the
          // platform, not on this account), THEN payout from their account
          // to their bank. Amount = whatever the seller is actually owed
          // right now, computed from their completed, un-transferred resale
          // transactions.
          const { data: sellerRow } = await supabase.from("stripe_connect_accounts").select("user_id").eq("id", account.id).maybeSingle();
          if (!sellerRow?.user_id) throw new Error("Reseller account has no user_id");
          const { data: txs } = await supabase
            .from("transactions")
            .select("id, amount, commission_cents")
            .eq("seller_id", sellerRow.user_id)
            .eq("status", "completed")
            .is("payout_job_id", null);
          const owedCents = (txs ?? []).reduce((sum, t) => sum + Math.round(Number(t.amount) * 100) - (t.commission_cents ?? 0), 0);
          if (owedCents <= 0) {
            await supabase.from("stripe_connect_payout_jobs").update({ status: "cancelled", blocked_reason: "Nothing owed" }).eq("id", job.id);
            continue;
          }
          await stripe.transfers.create({ amount: owedCents, currency: "eur", destination: account.stripe_account_id });
          const payout = await stripe.payouts.create({ amount: owedCents, currency: "eur" }, { stripeAccount: account.stripe_account_id });
          await supabase.from("stripe_connect_payout_jobs").update({ status: "sent", stripe_payout_id: payout.id, amount_cents: owedCents, attempted_at: new Date().toISOString() }).eq("id", job.id);
          // Mark these transactions as paid out so they aren't double-counted next run.
          if (txs && txs.length > 0) {
            await supabase.from("transactions").update({ payout_job_id: job.id }).in("id", txs.map((t) => t.id));
          }
          sent++;
        } else {
          // organizer_event_payout: money already sits on the connected
          // account from direct charges — just push the available balance.
          if (available <= 0) {
            await supabase.from("stripe_connect_payout_jobs").update({ status: "cancelled", blocked_reason: "Zero balance" }).eq("id", job.id);
            continue;
          }
          const payout = await stripe.payouts.create({ amount: available, currency: "eur" }, { stripeAccount: account.stripe_account_id });
          await supabase.from("stripe_connect_payout_jobs").update({ status: "sent", stripe_payout_id: payout.id, amount_cents: available, attempted_at: new Date().toISOString() }).eq("id", job.id);
          sent++;
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
