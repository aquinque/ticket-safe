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
 * Studio sales are destination charges since 2026-10-06, so their
 * checkout.session.* / payment_intent.* / charge.* events arrive on the
 * PLATFORM endpoint; resale checkouts are still direct charges and arrive on
 * the connected-accounts endpoint, as do account.updated and payout.*.
 *
 * Idempotency: reuses the existing stripe_webhook_events table (event_id
 * PK) — Stripe event ids are globally unique per account regardless of
 * which endpoint receives them.
 *
 *  checkout.session.completed (metadata.source = stripe_connect_studio_sale)
 *    → order: pending -> paid, tier: reserved -> sold, tickets issued,
 *      replay-order-email called with just the order_id (no email logic
 *      duplicated here).
 *
 *  checkout.session.completed (metadata.source = stripe_connect_resale)
 *    → transaction: pending -> completed, listing: reserved -> sold,
 *      Studio-ticket transfer (old ticket -> transferred, new nominative
 *      ticket issued) exactly like revolut-webhook's resale branch,
 *      sendResaleCompletionEmails(transaction_id) called (the shared
 *      module extracted from revolut-webhook earlier this session).
 *
 *  checkout.session.expired / payment_intent.payment_failed
 *    → release reservation, cancel order/transaction.
 *
 *  charge.refunded → mark refunded, re-list ticket if it was a resale.
 *  charge.dispute.created → flag + notify admin, block the event's payout job.
 *  account.updated → sync stripe_connect_accounts.
 *  payout.paid / payout.failed → update stripe_connect_payout_jobs, notify.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { signStudioTicketJWT } from "../_shared/ticketJwt.ts";
import { sendResaleCompletionEmails } from "../_shared/sendResaleCompletionEmails.ts";
import { renderEmail, ctaButton, ticketSummary } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

async function sendEmail(resendKey: string, to: string, subject: string, html: string, text: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html, text }),
    });
  } catch (e) { console.warn("[stripe-connect-webhook] email failed:", e); }
}

serve(async (req) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecretAccount = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");
  const webhookSecretConnect = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET_CONNECTED");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";

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

          const { data: updRows } = await supabase
            .from("event_orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
            .eq("id", orderId).eq("status", "pending").select("id, event_id, buyer_id, attendees");
          if (!updRows || updRows.length === 0) break; // already processed or not pending

          const ord = updRows[0] as { id: string; event_id: string; buyer_id: string; attendees: unknown };
          await supabase.rpc("finalize_tier_sale", { p_tier_id: tierId, p_qty: qty });

          const { data: evForExp } = await supabase.from("events").select("date").eq("id", ord.event_id).maybeSingle();
          const expSeconds = evForExp?.date ? Math.floor(new Date(evForExp.date).getTime() / 1000) + 86_400 : Math.floor(Date.now() / 1000) + 30 * 86_400;
          const attendees = Array.isArray(ord.attendees) ? (ord.attendees as { first_name?: string; last_name?: string; email?: string }[]) : [];

          const ticketRows = await Promise.all(Array.from({ length: qty }).map(async (_, i) => {
            const att = attendees[i] ?? null;
            const ticketId = crypto.randomUUID();
            const signed = await signStudioTicketJWT({ ticket_id: ticketId, event_id: ord.event_id, exp_seconds: expSeconds });
            const qrToken = signed ?? (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8));
            return { id: ticketId, order_id: ord.id, event_id: ord.event_id, tier_id: tierId, buyer_id: ord.buyer_id, qr_token: qrToken, holder_first_name: att?.first_name ?? null, holder_last_name: att?.last_name ?? null, holder_email: att?.email ?? session.customer_email ?? null, status: "valid" as const };
          }));
          const { error: tixErr } = await supabase.from("event_tickets").insert(ticketRows);
          if (tixErr) console.error("[stripe-connect-webhook] event_tickets insert failed:", tixErr);

          try {
            await fetch(`${supabaseUrl}/functions/v1/replay-order-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({ order_id: ord.id, admin_secret: replaySecret }),
            });
          } catch (e) { console.warn("[stripe-connect-webhook] studio email failed:", e); }

          console.log(`[stripe-connect-webhook] studio sale finalized order=${ord.id} tickets=${ticketRows.length}`);
          break;
        }

        // ── Resale ──
        if (session.metadata?.source === "stripe_connect_resale") {
          const transactionId = session.metadata.transaction_id;
          const listingId = session.metadata.listing_id;
          const buyerId = session.metadata.buyer_id;
          if (!transactionId || !listingId) break;

          const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

          const { data: txUpd } = await supabase
            .from("transactions")
            .update({ status: "completed", payment_intent_id: paymentIntentId })
            .eq("id", transactionId).eq("status", "pending").select("id, ticket_id, buyer_id, seller_id");
          if (!txUpd || txUpd.length === 0) break;

          await supabase.from("tickets").update({ status: "sold", buyer_id: buyerId ?? null }).eq("id", listingId).in("status", ["available", "reserved"]);

          // Studio-ticket transfer — identical logic to revolut-webhook's
          // resale branch (old ticket -> transferred, new nominative ticket
          // issued to the buyer).
          try {
            const { data: xferListing } = await supabase.from("tickets").select("studio_ticket_id").eq("id", listingId).maybeSingle();
            const studioTicketId = (xferListing as { studio_ticket_id?: string | null } | null)?.studio_ticket_id ?? null;
            if (studioTicketId && buyerId) {
              const { data: oldTicket } = await supabase.from("event_tickets").select("id, event_id, tier_id, order_id, status").eq("id", studioTicketId).maybeSingle();
              if (oldTicket && oldTicket.status !== "transferred" && oldTicket.status !== "scanned") {
                await supabase.from("event_tickets").update({ status: "transferred" }).eq("id", oldTicket.id);
                const { data: buyerProfile } = await supabase.from("profiles").select("full_name, email").eq("id", buyerId).maybeSingle();
                const { data: evForExp } = await supabase.from("events").select("date").eq("id", oldTicket.event_id).maybeSingle();
                const expSeconds = evForExp?.date ? Math.floor(new Date(evForExp.date).getTime() / 1000) + 86_400 : Math.floor(Date.now() / 1000) + 30 * 86_400;
                const newTicketId = crypto.randomUUID();
                const signed = await signStudioTicketJWT({ ticket_id: newTicketId, event_id: oldTicket.event_id, exp_seconds: expSeconds });
                const newQr = signed ?? crypto.randomUUID().replace(/-/g, "");
                const fullName = ((buyerProfile as { full_name?: string } | null)?.full_name ?? "").trim();
                const parts = fullName.split(/\s+/).filter(Boolean);
                await supabase.from("event_tickets").insert({
                  id: newTicketId, order_id: oldTicket.order_id, event_id: oldTicket.event_id, tier_id: oldTicket.tier_id,
                  buyer_id: buyerId, qr_token: newQr,
                  holder_first_name: parts[0] ?? null, holder_last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
                  holder_email: (buyerProfile as { email?: string } | null)?.email ?? null, status: "valid",
                });
              }
            }
          } catch (err) { console.error("[stripe-connect-webhook] resale transfer failed:", err); }

          if (resendKey) {
            const result = await sendResaleCompletionEmails({ supabase, resendApiKey: resendKey, transactionId, provider: "stripe" });
            console.log("[stripe-connect-webhook] resale emails:", JSON.stringify(result));
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
          const listingId = session.metadata.listing_id;
          const transactionId = session.metadata.transaction_id;
          if (listingId) await supabase.from("tickets").update({ status: "available" }).eq("id", listingId).eq("status", "reserved");
          if (transactionId) await supabase.from("transactions").update({ status: "cancelled" }).eq("id", transactionId).eq("status", "pending");
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.source === "stripe_connect_studio_sale") {
          const orderId = pi.metadata.order_id;
          const tierId = pi.metadata.tier_id;
          const qty = parseInt(pi.metadata.quantity ?? "1", 10) || 1;
          if (orderId) await supabase.from("event_orders").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", orderId).eq("status", "pending");
          if (tierId) await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: qty });
        } else if (pi.metadata?.source === "stripe_connect_resale") {
          const listingId = pi.metadata.listing_id;
          const transactionId = pi.metadata.transaction_id;
          if (transactionId) await supabase.from("transactions").update({ status: "cancelled" }).eq("id", transactionId).eq("status", "pending");
          if (listingId) await supabase.from("tickets").update({ status: "available" }).eq("id", listingId).eq("status", "reserved");
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
          const { data: tx } = await supabase.from("transactions").select("id, ticket_id").eq("payment_intent_id", pi).maybeSingle();
          if (tx) {
            await supabase.from("transactions").update({ status: "refunded" }).eq("id", tx.id);
            await supabase.from("tickets").update({ status: "available" }).eq("id", tx.ticket_id).eq("status", "sold");
          }
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        console.error(`[stripe-connect-webhook] DISPUTE opened: ${dispute.id} amount=${dispute.amount} pi=${pi}`);
        if (resendKey) {
          const bodyHtml = `<p style="margin:0 0 4px">A Stripe dispute (chargeback) was just opened.</p>${ticketSummary([["Dispute amount", `€${(dispute.amount / 100).toFixed(2)}`, emailTokens.danger], ["Payment intent", pi ?? "—"], ["Reason", dispute.reason ?? "—"]])}<p style="margin:16px 0 0;font-size:13px;color:${emailTokens.textMuted}">Respond in the Stripe Dashboard before the evidence deadline. Any payout tied to this order should be held until resolved.</p>`;
          const text = `Dispute opened: €${(dispute.amount / 100).toFixed(2)}, payment_intent ${pi}, reason: ${dispute.reason}`;
          const { html } = renderEmail({ eyebrow: "Stripe dispute", title: "A payment was disputed", bodyHtml, preheader: `Dispute opened for €${(dispute.amount / 100).toFixed(2)}`, text });
          await sendEmail(resendKey, "ticketsafe.friendly@gmail.com", `[URGENT] Stripe dispute opened — €${(dispute.amount / 100).toFixed(2)}`, html, text);
        }
        // Block any pending payout job for the order tied to this payment_intent.
        if (pi) {
          const { data: order } = await supabase.from("event_orders").select("id, event_id").eq("stripe_payment_intent_id", pi).maybeSingle();
          if (order) {
            await supabase.from("stripe_connect_payout_jobs")
              .update({ status: "blocked", blocked_reason: `Dispute ${dispute.id} on event ${order.event_id}` })
              .eq("event_id", order.event_id).eq("status", "scheduled");
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await supabase.from("stripe_connect_accounts").update({
          charges_enabled: account.charges_enabled ?? false,
          payouts_enabled: account.payouts_enabled ?? false,
          details_submitted: account.details_submitted ?? false,
          requirements_currently_due: account.requirements?.currently_due ?? [],
          requirements_past_due: account.requirements?.past_due ?? [],
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
            const amountEur = `€${(payout.amount / 100).toFixed(2)}`;
            const title = status === "sent" ? "Your payout is on its way" : "Your payout failed — check your IBAN";
            const bodyHtml = status === "sent"
              ? `<p style="margin:0 0 4px">${amountEur} has been sent to your bank account. It typically lands within a few business days.</p>`
              : `<p style="margin:0 0 4px">We tried to send you ${amountEur} but it failed. This is usually an incorrect IBAN. Please check your payment details in Ticket Studio.</p>${ctaButton("Check my payout details", `${emailTokens.siteUrl}/studio/payouts`)}`;
            const text = status === "sent" ? `${amountEur} sent to your bank account.` : `Payout of ${amountEur} failed — check your IBAN.`;
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
