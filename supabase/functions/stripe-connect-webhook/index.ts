/**
 * stripe-connect-webhook — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-connect-webhook
 * (public endpoint — no auth header, verified by Stripe-Signature)
 *
 * Handles BOTH platform-account events and connected-account events —
 * same dual-secret pattern as the legacy stripe-webhook
 * (STRIPE_CONNECT_WEBHOOK_SECRET for the platform endpoint,
 * STRIPE_CONNECT_WEBHOOK_SECRET_CONNECTED for "events on connected accounts").
 * Studio sales are destination charges since 2026-10-06, and resale sales are
 * charged on the platform account itself (stripe-connect-resale-checkout:
 * separate charges and transfers, the seller is paid later by
 * stripe-connect-payout-cron). So the checkout.session.* / payment_intent.* /
 * charge.* events of both arrive on the PLATFORM endpoint. account.updated and
 * payout.* (payouts made from connected accounts) arrive on the
 * connected-accounts endpoint.
 *
 * Idempotency: reuses the existing stripe_webhook_events table (event_id
 * PK) — Stripe event ids are globally unique per account regardless of
 * which endpoint receives them. When a resale completion or refund fails,
 * its row is deleted before answering 500, so Stripe's retry runs it again
 * (both SQL functions and the conflict refund are idempotent).
 *
 *  checkout.session.completed (metadata.source = stripe_connect_studio_sale)
 *    → order: pending -> paid, tier: reserved -> sold, tickets issued,
 *      replay-order-email called with just the order_id (no email logic
 *      duplicated here).
 *
 *  checkout.session.completed (metadata.source = stripe_connect_resale)
 *    → completeResaleCheckout (_shared/resaleCheckoutCompletion.ts):
 *      complete_resale_purchase (SQL) marks the listing sold, transfers the
 *      Studio ticket (old ticket -> transferred, new nominative ticket with
 *      a QR signed here) and completes the transaction in one go, only if
 *      this transaction still holds the listing; then
 *      sendResaleCompletionEmails(transaction_id). If the ticket went
 *      elsewhere (sold, hold taken over after expiry, withdrawn, Studio
 *      ticket scanned), the buyer is refunded in full automatically and
 *      emailed, and the admin is alerted.
 *
 *  checkout.session.expired → Studio: expire the order, release the seats.
 *    Resale: release_resale_reservation(transaction), which only frees the
 *    listing if this transaction still holds it.
 *  payment_intent.payment_failed → log only: Stripe's page keeps the session
 *    open so the buyer can try another card; expiry releases it.
 *
 *  charge.refunded → Studio order: refunded. Resale: record_resale_refund
 *    (SQL) marks the transaction refunded and re-lists the ticket only if it
 *    was this transaction's completed sale of an external listing. A refunded
 *    Studio resale is not re-listed (the seller's ticket is already
 *    transferred) and the admin is alerted.
 *  charge.dispute.created → notify admin; Studio order: block the event's
 *    payout job; resale: transaction -> 'disputed', which keeps it out of the
 *    seller's payout, or, if the seller was already paid, flags it so the
 *    admin recovers the money (_shared/resaleDispute.ts).
 *  charge.dispute.closed → a won resale dispute puts the sale back to
 *    'completed' so the seller is paid; a lost one stays 'disputed'.
 *  account.updated → sync stripe_connect_accounts.
 *  payout.paid / payout.failed → update stripe_connect_payout_jobs, notify.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { finalizeStudioOrder } from "../_shared/finalizeStudioOrder.ts";
import { signStudioTicketJWT } from "../_shared/ticketJwt.ts";
import { sendResaleCompletionEmails } from "../_shared/sendResaleCompletionEmails.ts";
import { renderEmail, ctaButton, ticketSummary, escapeHtml } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";
import { formatMinor } from "../_shared/money.ts";
import { holdResaleOnDispute, releaseResaleDispute, resaleDisputeAlert } from "../_shared/resaleDispute.ts";
import { completeResaleCheckout, type CompleteResaleCheckoutDeps } from "../_shared/resaleCheckoutCompletion.ts";
import { parseRefundRecordResult, refundNeedsAdminReview } from "../_shared/resaleReservation.ts";

const ADMIN_EMAIL = "ticketsafe.friendly@gmail.com";

async function sendEmail(resendKey: string, to: string, subject: string, html: string, text: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html, text }),
    });
  } catch (e) { console.warn("[stripe-connect-webhook] email failed:", e); }
}

/** Admin alert from a plain-text body (one paragraph per line). */
async function sendAdminAlert(resendKey: string | undefined, subject: string, text: string) {
  if (!resendKey) { console.error(`[stripe-connect-webhook] admin alert (no RESEND_API_KEY): ${subject}\n${text}`); return; }
  const bodyHtml = text.split("\n").filter((l) => l.trim()).map((l) => `<p style="margin:0 0 8px">${escapeHtml(l)}</p>`).join("");
  const { html } = renderEmail({ eyebrow: "Resale", title: subject, bodyHtml, preheader: subject, text });
  await sendEmail(resendKey, ADMIN_EMAIL, subject, html, text);
}

/** "Your payment was refunded": the resale ticket went to someone else before this payment completed. */
function buyerRefundEmail(amountCents: number, eventTitle: string | null) {
  const amount = formatMinor(amountCents, "eur", "prefix");
  const what = eventTitle ? `the ticket for <strong>${escapeHtml(eventTitle)}</strong>` : "this ticket";
  const whatText = eventTitle ? `the ticket for ${eventTitle}` : "this ticket";
  const subject = "Your payment was refunded";
  const bodyHtml = `
    <p style="margin:0 0 4px">Hi,</p>
    <p style="margin:0 0 4px">Sorry, ${what} sold a moment before your payment went through, so we couldn't complete your purchase.</p>
    ${ticketSummary([["Refunded", amount, emailTokens.accent]])}
    <p style="margin:0 0 24px;font-size:13px;color:${emailTokens.textMuted}">We've refunded you in full, to the card you paid with. It can take 5–10 days to appear on your statement.</p>
    ${ctaButton("See other resale tickets", `${emailTokens.siteUrl}/marketplace/buy`)}
  `;
  const text = `Sorry, ${whatText} sold a moment before your payment went through, so we couldn't complete your purchase. We've refunded ${amount} in full, to the card you paid with. It can take 5–10 days to appear on your statement. Other resale tickets: ${emailTokens.siteUrl}/marketplace/buy`;
  const { html } = renderEmail({ eyebrow: "Refund", title: subject, bodyHtml, preheader: `We've refunded ${amount} in full.`, text });
  return { subject, html, text };
}

/** Forget this event so Stripe's retry of it is processed instead of skipped as a duplicate. */
async function allowRetry(supabase: ReturnType<typeof createClient>, eventId: string) {
  const { error } = await supabase.from("stripe_webhook_events").delete().eq("event_id", eventId);
  if (error) console.error(`[stripe-connect-webhook] could not delete idempotency row for ${eventId}:`, error.message);
}

serve(async (req) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecretAccount = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
  const webhookSecretConnect = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET_CONNECTED");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "";

  if (!stripeSecretKey || (!webhookSecretAccount && !webhookSecretConnect) || !supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-connect-webhook] Missing environment variables");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });
  const body = await req.text();

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const candidateSecrets = [webhookSecretAccount, webhookSecretConnect].filter(Boolean) as string[];
  let event: Stripe.Event | null = null;
  let lastErr: unknown = null;
  for (const secret of candidateSecrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
      break;
    } catch (err) { lastErr = err; }
  }
  if (!event) {
    console.error("[stripe-connect-webhook] Signature verification failed:", lastErr);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Idempotency — shared table with the legacy stripe-webhook (event ids
  // are globally unique per Stripe account).
  {
    const { error: idemErr } = await supabase.from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });
    if (idemErr) {
      if (idemErr.code === "23505") {
        console.log(`[stripe-connect-webhook] Duplicate event ${event.id} — skipping.`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      console.error("[stripe-connect-webhook] Idempotency insert failed:", idemErr);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;

        // ── Studio primary sale ──
        if (session.metadata?.source === "stripe_connect_studio_sale") {
          const orderId = session.metadata.order_id;
          const tierId = session.metadata.tier_id;
          const qty = parseInt(session.metadata.quantity ?? "1", 10) || 1;
          if (!orderId || !tierId) break;

          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;
          const result = await finalizeStudioOrder({
            supabase, supabaseUrl, supabaseServiceKey, replaySecret,
            orderId, tierId, qty, paymentIntentId, customerEmail: session.customer_email ?? null,
          });
          console.log(`[stripe-connect-webhook] studio sale order=${orderId}: ${result.outcome}${result.tickets ? ` tickets=${result.tickets}` : ""}`);
          break;
        }

        // ── Resale ──
        if (session.metadata?.source === "stripe_connect_resale") {
          const transactionId = session.metadata.transaction_id;
          if (!transactionId) break;

          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

          try {
            const result = await completeResaleCheckout({
              supabase: supabase as unknown as CompleteResaleCheckoutDeps["supabase"],
              stripe: { refunds: { create: (params, opts) => stripe.refunds.create(params, opts) } },
              signQr: signStudioTicketJWT,
              newId: () => crypto.randomUUID(),
              nowMs: () => Date.now(),
              sendCompletionEmails: async (txId) => {
                if (!resendKey) return null;
                const emails = await sendResaleCompletionEmails({ supabase, resendApiKey: resendKey, transactionId: txId, provider: "stripe" });
                console.log("[stripe-connect-webhook] resale emails:", JSON.stringify(emails));
                return emails;
              },
              sendBuyerRefundEmail: async ({ buyerId, amountCents, eventTitle }) => {
                if (!resendKey) return;
                const { data: buyerAuth } = await supabase.auth.admin.getUserById(buyerId);
                const to = buyerAuth?.user?.email ?? null;
                if (!to) return;
                const { subject, html, text } = buyerRefundEmail(amountCents, eventTitle);
                await sendEmail(resendKey, to, subject, html, text);
              },
              sendAdminAlert: (subject, text) => sendAdminAlert(resendKey, subject, text),
            }, { transactionId, paymentIntentId });
            console.log(`[stripe-connect-webhook] resale tx=${transactionId}: ${result.outcome}${result.refunded ? " (refunded)" : ""}`);
          } catch (err) {
            await allowRetry(supabase, event.id);
            throw err;
          }
          break;
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source === "stripe_connect_studio_sale") {
          const orderId = session.metadata.order_id;
          const tierId = session.metadata.tier_id;
          const qty = parseInt(session.metadata.quantity ?? "1", 10) || 1;
          if (orderId) await supabase.from("event_orders").update({ status: "expired", cancelled_at: new Date().toISOString() }).eq("id", orderId).eq("status", "pending");
          if (tierId) await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: qty });
        } else if (session.metadata?.source === "stripe_connect_resale") {
          // Releases the listing only if this transaction still holds it (a
          // later buyer may have taken over an expired hold).
          const transactionId = session.metadata.transaction_id;
          if (transactionId) {
            const { data: released, error: releaseErr } = await supabase.rpc("release_resale_reservation", { p_transaction_id: transactionId });
            if (releaseErr) console.error("[stripe-connect-webhook] release_resale_reservation failed:", releaseErr.message);
            else console.log(`[stripe-connect-webhook] resale session expired tx=${transactionId}: ${released ? "listing released" : "nothing held"}`);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.source === "stripe_connect_studio_sale") {
          // A declined attempt is not the end of the checkout: Stripe's page
          // keeps the same session and payment intent and lets the buyer try
          // another card. Keep the order pending and its seats reserved; the
          // session's own expiry (checkout.session.expired, 30 min) and the
          // stuck-orders cleanup release them if the buyer gives up.
          console.log(`[stripe-connect-webhook] payment attempt failed for order ${pi.metadata.order_id ?? "?"}: ${pi.last_payment_error?.message ?? "no detail"}`);
        } else if (pi.metadata?.source === "stripe_connect_resale") {
          // Same as a Studio sale: the session stays open for another card,
          // the hold stays, and checkout.session.expired releases it.
          console.log(`[stripe-connect-webhook] payment attempt failed for resale tx ${pi.metadata.transaction_id ?? "?"}: ${pi.last_payment_error?.message ?? "no detail"}`);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (!pi) break;
        // Find by payment_intent on either side — covers Connect direct
        // charges (event is on the connected account) and resale platform
        // charges alike.
        const { data: order } = await supabase.from("event_orders").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
        if (order) {
          await supabase.from("event_orders").update({ status: "refunded" }).eq("id", order.id);
        } else {
          // Resale: re-listed only when it was this transaction's completed
          // sale of an external listing (never after a conflict refund).
          try {
            const { data: refundRows, error: refundErr } = await supabase.rpc("record_resale_refund", { p_payment_intent_id: pi });
            if (refundErr) throw new Error("record_resale_refund failed: " + refundErr.message);
            const refund = parseRefundRecordResult(refundRows);
            console.log(`[stripe-connect-webhook] resale refund pi=${pi}: ${refund.outcome}${refund.relisted ? " (re-listed)" : ""}`);
            if (refundNeedsAdminReview(refund)) {
              await sendAdminAlert(
                resendKey,
                "Refunded resale not re-listed — check the buyer's ticket",
                `A completed resale was refunded and its listing was not put back on sale. If it was a Ticket Studio resale, the buyer's new ticket is still valid and the seller's old one is transferred: cancel the buyer's ticket if needed.\n\nTransaction: ${refund.transactionId ?? "—"}\nPayment intent: ${pi}`,
              );
            }
          } catch (err) {
            await allowRetry(supabase, event.id);
            throw err;
          }
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        console.error(`[stripe-connect-webhook] DISPUTE opened: ${dispute.id} amount=${dispute.amount} pi=${pi}`);

        // Studio order: block any pending payout job for its event.
        // Resale: hold the sale out of the seller's payout, or flag it if the
        // seller was already paid.
        let resale: ReturnType<typeof resaleDisputeAlert> = null;
        if (pi) {
          const { data: order } = await supabase.from("event_orders").select("id, event_id").eq("stripe_payment_intent_id", pi).maybeSingle();
          if (order) {
            await supabase.from("stripe_connect_payout_jobs")
              .update({ status: "blocked", blocked_reason: `Dispute ${dispute.id} on event ${order.event_id}` })
              .eq("event_id", order.event_id).eq("status", "scheduled");
          } else {
            const hold = await holdResaleOnDispute(supabase, { paymentIntentId: pi, disputeId: dispute.id });
            console.log(`[stripe-connect-webhook] resale dispute ${dispute.id}: ${hold.kind}`);
            resale = resaleDisputeAlert(hold);
          }
        }

        if (resendKey) {
          // In the charge's currency: pounds for a London event (Stripe sends it lowercase, e.g. "gbp").
          const disputeAmount = formatMinor(dispute.amount, dispute.currency, "prefix");
          const rows: [string, string, string?][] = [["Dispute amount", disputeAmount, emailTokens.danger], ["Payment intent", pi ?? "—"], ["Reason", dispute.reason ?? "—"]];
          for (const [label, value] of resale?.rows ?? []) rows.push([label, value]);
          const note = resale?.note ?? "Any payout tied to this order should be held until resolved.";
          const bodyHtml = `<p style="margin:0 0 4px">A Stripe dispute (chargeback) was just opened.</p>${ticketSummary(rows)}<p style="margin:16px 0 0;font-size:13px;color:${emailTokens.textMuted}">Respond in the Stripe Dashboard before the evidence deadline. ${note}</p>`;
          const text = `Dispute opened: ${disputeAmount}, payment_intent ${pi}, reason: ${dispute.reason}. ${(resale?.rows ?? []).map(([l, v]) => `${l}: ${v}`).join(". ")} ${note}`;
          const subject = resale?.urgent
            ? `[URGENT] Stripe dispute on a resale already paid out — ${disputeAmount}`
            : `[URGENT] Stripe dispute opened — ${disputeAmount}`;
          const { html } = renderEmail({ eyebrow: "Stripe dispute", title: "A payment was disputed", bodyHtml, preheader: `Dispute opened for ${disputeAmount}`, text });
          await sendEmail(resendKey, "ticketsafe.friendly@gmail.com", subject, html, text);
        }
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const result = await releaseResaleDispute(supabase, { disputeId: dispute.id, disputeStatus: dispute.status });
        console.log(`[stripe-connect-webhook] dispute ${dispute.id} closed (${dispute.status}): ${result.kind}`);
        break;
      }

      case "account.updated": {
        // Stripe retries and reorders deliveries, so the event body can be
        // older than what the row already holds (a retried batch once
        // flipped an active account back to "action needed"). Mirror the
        // live account instead; the event is only the trigger.
        const evAccount = event.data.object as Stripe.Account;
        let account = evAccount;
        try {
          account = await stripe.accounts.retrieve(evAccount.id);
        } catch (err) {
          console.warn("[stripe-connect-webhook] could not re-read account, using event body:", err instanceof Error ? err.message : err);
        }
        if ((account as unknown as { deleted?: boolean }).deleted) break;
        const bt = account.business_type;
        await supabase.from("stripe_connect_accounts").update({
          charges_enabled: account.charges_enabled ?? false,
          payouts_enabled: account.payouts_enabled ?? false,
          details_submitted: account.details_submitted ?? false,
          requirements_currently_due: account.requirements?.currently_due ?? [],
          requirements_past_due: account.requirements?.past_due ?? [],
          ...(bt === "individual" || bt === "company" || bt === "non_profit" ? { business_type: bt } : {}),
          updated_at: new Date().toISOString(),
        }).eq("stripe_account_id", account.id);
        break;
      }

      case "payout.paid":
      case "payout.failed": {
        const payout = event.data.object as Stripe.Payout;
        const status = event.type === "payout.paid" ? "sent" : "failed";
        const { data: job } = await supabase
          .from("stripe_connect_payout_jobs")
          .update({ status, stripe_payout_id: payout.id, attempted_at: new Date().toISOString() })
          .eq("stripe_payout_id", payout.id)
          .select("id, kind, stripe_connect_account_id")
          .maybeSingle();
        if (job && resendKey) {
          const { data: acct } = await supabase.from("stripe_connect_accounts").select("account_holder_name, user_id, organizer_id").eq("id", job.stripe_connect_account_id).maybeSingle();
          let toEmail: string | null = null;
          if (acct?.organizer_id) {
            const { data: org } = await supabase.from("organizer_profiles").select("contact_email").eq("id", acct.organizer_id).maybeSingle();
            toEmail = org?.contact_email ?? null;
          } else if (acct?.user_id) {
            const { data: authUser } = await supabase.auth.admin.getUserById(acct.user_id);
            toEmail = authUser?.user?.email ?? null;
          }
          if (toEmail) {
            const amountEur = formatMinor(payout.amount, payout.currency, "prefix"); // "€…", or "£…" for a payout in pounds
            const title = status === "sent" ? "Your payout is on its way" : "Your payout failed — check your bank details";
            const bodyHtml = status === "sent"
              ? `<p style="margin:0 0 4px">${amountEur} has been sent to your bank account. It typically lands within a few business days.</p>`
              : `<p style="margin:0 0 4px">We tried to send you ${amountEur} but it failed. This is usually incorrect bank details (IBAN, or sort code and account number for a UK account). Please check your payment details in Ticket Studio.</p>${ctaButton("Check my payout details", `${emailTokens.siteUrl}/studio/payouts`)}`;
            const text = status === "sent" ? `${amountEur} sent to your bank account.` : `Payout of ${amountEur} failed — check your bank details.`;
            const { html } = renderEmail({ eyebrow: "Payout", title, bodyHtml, preheader: text, text });
            await sendEmail(resendKey, toEmail, title, html, text);
          }
        }
        break;
      }

      default:
        console.log(`[stripe-connect-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[stripe-connect-webhook] Processing error for event", event.type, err);
    return new Response("Webhook handler failed", { status: 500 });
  }
});
