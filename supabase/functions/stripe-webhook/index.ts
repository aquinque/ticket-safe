/**
 * stripe-webhook — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/stripe-webhook
 * (public endpoint — no auth header required, verified by Stripe signature)
 *
 * Handles Stripe webhook events:
 *
 *  checkout.session.completed
 *    → transaction: pending → completed
 *    → listing:     reserved → sold
 *
 *  checkout.session.expired
 *    → listing:     reserved → available  (buyer didn't complete checkout)
 *    → transaction: pending  → cancelled
 *
 *  payment_intent.payment_failed
 *    → transaction: pending  → cancelled
 *    → listing:     reserved → available
 *
 *  charge.refunded
 *    → transaction: completed → refunded
 *    → listing:     sold     → available  (re-list for resale)
 *
 *  account.updated (Connect webhook)
 *    → sync stripe_accounts row with latest charges/payouts flags
 *
 * Security: Stripe-Signature header is verified via constructEventAsync
 * using the Web Crypto API (Deno-compatible, no Node crypto needed).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

serve(async (req) => {
  // ---- env ----------------------------------------------------------------
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-webhook] Missing environment variables");
    return new Response("Server misconfiguration", { status: 500 });
  }

  // ---- verify Stripe signature (raw body required) ------------------------
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      // Use Web Crypto API (Deno doesn't have Node's crypto module)
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // ---- process event ------------------------------------------------------
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Idempotency guard: Stripe retries webhook events when the receiver returns 5xx
  // or times out. Without this guard, a single completed checkout would re-fire
  // confirmation emails on every retry. We insert into stripe_webhook_events on the
  // event_id (PK) — if it conflicts, we've already processed this event and bail.
  {
    const { error: idemErr } = await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });

    if (idemErr) {
      // Postgres unique violation = duplicate event, already processed — ack and exit.
      if (idemErr.code === "23505") {
        console.log(`[stripe-webhook] Duplicate event ${event.id} (${event.type}) — already processed, skipping.`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Other DB error — log but continue so Stripe retries. This avoids losing events.
      console.error("[stripe-webhook] Idempotency insert failed:", idemErr);
    }
  }

  try {
    switch (event.type) {
      // ---------------------------------------------------------------------
      // Buyer completed payment
      // ---------------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // ── Studio primary-sale branch ────────────────────────────────────
        if (session.metadata?.source === "studio_primary_sale") {
          const orderId = session.metadata.order_id;
          const tierId = session.metadata.tier_id;
          const eventId = session.metadata.event_id;
          const qty = parseInt(session.metadata.quantity ?? "1", 10) || 1;

          console.log(
            `[studio_primary_sale] checkout.session.completed session=${session.id} order=${orderId} tier=${tierId} qty=${qty}`,
          );

          if (session.payment_status === "paid" && orderId && tierId) {
            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

            // 1. Mark order paid
            await supabase
              .from("event_orders")
              .update({
                status: "paid",
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: paymentIntentId,
              })
              .eq("id", orderId)
              .eq("status", "pending");

            // 2. Finalize tier inventory: reserved → sold
            await supabase.rpc("finalize_tier_sale", { p_tier_id: tierId, p_qty: qty });

            // 3. Issue per-seat event_tickets rows with random QR token
            const ticketRows = Array.from({ length: qty }).map(() => ({
              order_id: orderId,
              event_id: eventId,
              tier_id: tierId,
              buyer_id: session.metadata!.buyer_id ?? session.customer_details?.email ?? null,
              qr_token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8),
            }));
            // We need a real buyer_id; fetch from event_orders if not in metadata
            const { data: ord } = await supabase
              .from("event_orders")
              .select("buyer_id, buyer_email, event_id")
              .eq("id", orderId)
              .maybeSingle();
            if (ord) {
              const finalRows = ticketRows.map((r) => ({
                ...r,
                buyer_id: ord.buyer_id,
                event_id: ord.event_id,
              }));
              const { error: tixErr } = await supabase.from("event_tickets").insert(finalRows);
              if (tixErr) {
                console.error("[studio_primary_sale] insert event_tickets failed:", tixErr);
              }
            }

            // 4. Send confirmation email to buyer + sale notification to organizer
            const resendKey = Deno.env.get("RESEND_API_KEY");
            if (resendKey && ord?.buyer_email) {
              const { data: evRow } = await supabase
                .from("events")
                .select("title, date, location, slug, organizer_id")
                .eq("id", ord.event_id)
                .maybeSingle();
              const evTitle = evRow?.title ?? "Your event";
              const evDate = evRow?.date
                ? new Date(evRow.date).toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";
              const total = (session.amount_total ?? 0) / 100;

              // ── Organizer sale notification (best-effort, parallel) ──
              if (evRow?.organizer_id) {
                supabase
                  .from("organizer_profiles")
                  .select("name, contact_email, contact_name")
                  .eq("id", evRow.organizer_id)
                  .maybeSingle()
                  .then(async ({ data: org }) => {
                    if (!org?.contact_email) return;
                    const feeCents = Math.round((session.amount_total ?? 0) * 0.05);
                    const payoutCents = (session.amount_total ?? 0) - feeCents;
                    const orgFirstName = (org.contact_name ?? "").split(" ")[0] || "there";
                    await fetch("https://api.resend.com/emails", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                      body: JSON.stringify({
                        from: "Ticket Safe <noreply@ticket-safe.eu>",
                        to: [org.contact_email],
                        subject: `New sale: ${qty} ticket${qty > 1 ? "s" : ""} for ${evTitle}`,
                        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif;color:#1e293b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
<div style="background:linear-gradient(135deg,#003399,#0066cc);padding:28px 32px;color:#fff">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.8;font-weight:700">Ticket Safe Studio · New sale</div>
<h1 style="margin:8px 0 0;font-size:24px;font-weight:800">+€${(payoutCents / 100).toFixed(2)} for ${evTitle}</h1>
</div>
<div style="padding:28px 32px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">Hi ${orgFirstName},</p>
<p style="margin:0 0 14px"><strong>${qty} ticket${qty > 1 ? "s" : ""}</strong> just sold for <strong>${evTitle}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0">
<tr><td style="padding:6px 0;color:#64748b;width:42%">Sale total</td><td style="padding:6px 0;font-weight:600">€${total.toFixed(2)}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Platform fee (5%)</td><td style="padding:6px 0;color:#64748b">−€${(feeCents / 100).toFixed(2)}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Your payout</td><td style="padding:6px 0;color:#003399;font-weight:700">€${(payoutCents / 100).toFixed(2)}</td></tr>
</table>
<p style="margin:24px 0 8px;text-align:center"><a href="https://ticket-safe.eu/studio/events/${evRow.id ?? ord.event_id}" style="display:inline-block;background:linear-gradient(135deg,#003399,#0066cc);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Open in Studio</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#64748b">Payouts go directly to your bank via Stripe Connect.</p>
</div></div></body></html>`,
                      }),
                    }).catch((err) => console.warn("[studio_primary_sale] organizer email failed:", err));
                  });
              }

              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: "Ticket Safe <noreply@ticket-safe.eu>",
                  to: [ord.buyer_email],
                  subject: `Your ticket for ${evTitle} is confirmed`,
                  html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
<div style="background:linear-gradient(135deg,#003399,#0066cc);padding:28px 32px;color:#fff">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.8;font-weight:700">Ticket Safe · Order confirmed</div>
<h1 style="margin:8px 0 0;font-size:24px;font-weight:800">${evTitle}</h1>
</div>
<div style="padding:28px 32px;font-size:15px;line-height:1.6;color:#1e293b">
<p style="margin:0 0 16px">Your purchase is confirmed. ${qty} ticket${qty > 1 ? "s" : ""} will be ready at the door.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
<tr><td style="padding:8px 0;color:#64748b">Event</td><td style="padding:8px 0;color:#1e293b;font-weight:600">${evTitle}</td></tr>
<tr><td style="padding:8px 0;color:#64748b">Date</td><td style="padding:8px 0">${evDate}</td></tr>
<tr><td style="padding:8px 0;color:#64748b">Location</td><td style="padding:8px 0">${evRow?.location ?? "—"}</td></tr>
<tr><td style="padding:8px 0;color:#64748b">Quantity</td><td style="padding:8px 0">${qty}</td></tr>
<tr><td style="padding:8px 0;color:#64748b">Total paid</td><td style="padding:8px 0;color:#003399;font-weight:700">€${total.toFixed(2)}</td></tr>
</table>
<p style="margin:24px 0 8px;text-align:center"><a href="https://ticket-safe.eu/settings/purchases" style="display:inline-block;background:linear-gradient(135deg,#003399,#0066cc);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">View my tickets</a></p>
<p style="margin:18px 0 0;font-size:12px;color:#64748b">Your QR ticket(s) will be in My Purchases on ticket-safe.eu and at the door. Need help? Reply to this email.</p>
</div></div></body></html>`,
                }),
              });
            }
          }
          break;
        }

        // ── Resale (existing) branch ──────────────────────────────────────
        const transactionId = session.metadata?.transaction_id;
        const listingId = session.metadata?.listing_id;

        console.log(
          `[checkout.session.completed] session=${session.id} tx=${transactionId} listing=${listingId} payment_status=${session.payment_status}`
        );

        if (session.payment_status === "paid" && transactionId && listingId) {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

          // Mark transaction as completed
          await supabase
            .from("transactions")
            .update({
              status: "completed",
              payment_intent_id: paymentIntentId,
            })
            .eq("id", transactionId);

          // Mark listing as sold and assign to buyer (nominative ticket)
          await supabase
            .from("tickets")
            .update({
              status: "sold",
              buyer_id: session.metadata?.buyer_id ?? null,
            })
            .eq("id", listingId)
            .in("status", ["available", "reserved"]);

          // Send confirmation email to buyer + notification to seller
          const buyerId = session.metadata?.buyer_id;
          if (buyerId) {
            const [{ data: buyerAuth }, { data: buyerProfile }, { data: ticketRow }] = await Promise.all([
              supabase.auth.admin.getUserById(buyerId),
              supabase.from("profiles").select("full_name").eq("id", buyerId).maybeSingle(),
              supabase.from("tickets").select("file_url, seller_id, event:events(title, date, location)").eq("id", listingId).maybeSingle(),
            ]);
            const buyerEmail = buyerAuth?.user?.email ?? null;
            const buyerName = buyerProfile?.full_name ?? buyerEmail?.split("@")[0] ?? "there";
            const resendKey = Deno.env.get("RESEND_API_KEY");
            console.log("[checkout.session.completed] buyer email:", buyerEmail, "resendKey set:", !!resendKey);
            if (resendKey && buyerEmail) {
              const ev = ticketRow?.event as { title?: string; date?: string; location?: string } | null;
              const eventTitle = ev?.title ?? "Event Ticket";
              const eventDate = ev?.date
                ? new Date(ev.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : "—";
              const qty = session.metadata ? (parseInt(session.metadata.qty ?? "1") || 1) : 1;
              const total = (session.amount_total ?? 0) / 100;
              const emailRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: "TicketSafe <noreply@ticket-safe.eu>",
                  to: [buyerEmail],
                  subject: `Your ticket for ${eventTitle} is confirmed!`,
                  html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:white;font-weight:600">Your ticket is confirmed!</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 20px">Hi ${buyerName},</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px">Your purchase is confirmed. Here are your ticket details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888;width:40%">Event</td><td style="padding:10px 0;color:#111;font-weight:600">${eventTitle}</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888">Date</td><td style="padding:10px 0;color:#111">${eventDate}</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888">Location</td><td style="padding:10px 0;color:#111">${ev?.location ?? "—"}</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888">Quantity</td><td style="padding:10px 0;color:#111">${qty} ticket${qty > 1 ? "s" : ""}</td></tr>
      <tr><td style="padding:10px 0;color:#888">Total paid</td><td style="padding:10px 0;color:#6366f1;font-weight:700;font-size:16px">€${total.toFixed(2)}</td></tr>
    </table>
    ${ticketRow?.file_url ? `<div style="background:#f0f0ff;border-radius:8px;padding:16px;margin-bottom:24px"><p style="margin:0 0 8px;font-size:13px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Your ticket file</p><a href="${ticketRow.file_url}" style="color:#6366f1;font-size:14px;text-decoration:none;font-weight:500">Download your ticket →</a></div>` : ""}
    <p style="font-size:13px;color:#888;margin:0">This ticket is registered in your name. View it in <strong>My Purchases</strong> on TicketSafe.</p>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0"><p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p></div>
</div></body></html>`,
                }),
              });
              const emailBody = await emailRes.json().catch(() => ({}));
              console.log("[checkout.session.completed] buyer Resend result:", emailRes.status, JSON.stringify(emailBody));
            }

            // Send notification email to seller
            const sellerId = (ticketRow as any)?.seller_id;
            if (resendKey && sellerId) {
              const [{ data: sellerAuth }, { data: sellerProfile }] = await Promise.all([
                supabase.auth.admin.getUserById(sellerId),
                supabase.from("profiles").select("full_name").eq("id", sellerId).maybeSingle(),
              ]);
              const sellerEmail = sellerAuth?.user?.email ?? null;
              const sellerName = (sellerProfile as any)?.full_name ?? sellerEmail?.split("@")[0] ?? "there";
              const ev = (ticketRow as any)?.event as { title?: string; date?: string; location?: string } | null;
              const eventTitle = ev?.title ?? "Event Ticket";
              const total = (session.amount_total ?? 0) / 100;
              const fee = total * 0.05;
              const payout = total - fee;
              console.log("[checkout.session.completed] seller email:", sellerEmail);
              if (sellerEmail) {
                const sellerRes = await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: "TicketSafe <noreply@ticket-safe.eu>",
                    to: [sellerEmail],
                    subject: `Your ticket for ${eventTitle} has been sold!`,
                    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#10b981;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:white;font-weight:600">Your ticket has been sold!</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 20px">Hi ${sellerName},</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px">Great news — your ticket for <strong>${eventTitle}</strong> has been purchased.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888;width:45%">Sale price</td><td style="padding:10px 0;color:#111;font-weight:600">€${total.toFixed(2)}</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 0;color:#888">Platform fee (5%)</td><td style="padding:10px 0;color:#888">−€${fee.toFixed(2)}</td></tr>
      <tr><td style="padding:10px 0;color:#888">Your payout</td><td style="padding:10px 0;color:#10b981;font-weight:700;font-size:16px">€${payout.toFixed(2)}</td></tr>
    </table>
    <p style="font-size:13px;color:#888;margin:0">The payout will be transferred to your Stripe account automatically. View your sales in <strong>My Listings</strong> on TicketSafe.</p>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0"><p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p></div>
</div></body></html>`,
                  }),
                });
                const sellerEmailBody = await sellerRes.json().catch(() => ({}));
                console.log("[checkout.session.completed] seller Resend result:", sellerRes.status, JSON.stringify(sellerEmailBody));
              }
            }
          }
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Buyer abandoned the Checkout session (30 min expiry)
      // ---------------------------------------------------------------------
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Studio primary-sale branch
        if (session.metadata?.source === "studio_primary_sale") {
          const orderId = session.metadata.order_id;
          const tierId = session.metadata.tier_id;
          const qty = parseInt(session.metadata.quantity ?? "1", 10) || 1;
          console.log(`[studio_primary_sale] expired order=${orderId} tier=${tierId} qty=${qty}`);
          if (orderId) {
            await supabase
              .from("event_orders")
              .update({ status: "expired", cancelled_at: new Date().toISOString() })
              .eq("id", orderId)
              .eq("status", "pending");
          }
          if (tierId) {
            await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: qty });
          }
          break;
        }

        const transactionId = session.metadata?.transaction_id;
        const listingId = session.metadata?.listing_id;

        console.log(
          `[checkout.session.expired] session=${session.id} tx=${transactionId} listing=${listingId}`
        );

        // Revert reservation
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "reserved");
        }
        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "cancelled" })
            .eq("id", transactionId)
            .eq("status", "pending");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Payment attempt failed (card declined, etc.)
      // ---------------------------------------------------------------------
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;

        if (pi.metadata?.source === "studio_primary_sale") {
          const orderId = pi.metadata.order_id;
          const tierId = pi.metadata.tier_id;
          const qty = parseInt(pi.metadata.quantity ?? "1", 10) || 1;
          console.log(`[studio_primary_sale] payment_failed order=${orderId}`);
          if (orderId) {
            await supabase
              .from("event_orders")
              .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
              .eq("id", orderId)
              .eq("status", "pending");
          }
          if (tierId) {
            await supabase.rpc("release_tier_reservation", { p_tier_id: tierId, p_qty: qty });
          }
          break;
        }

        const transactionId = pi.metadata?.transaction_id;
        const listingId = pi.metadata?.listing_id;

        console.log(
          `[payment_intent.payment_failed] pi=${pi.id} tx=${transactionId}`
        );

        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "cancelled" })
            .eq("id", transactionId)
            .eq("status", "pending");
        }
        // Restore listing to available so buyer/others can retry
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "reserved");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Refund issued (manually via Stripe Dashboard or API)
      // ---------------------------------------------------------------------
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const transactionId = charge.metadata?.transaction_id;
        const listingId = charge.metadata?.listing_id;

        console.log(
          `[charge.refunded] charge=${charge.id} tx=${transactionId} listing=${listingId}`
        );

        if (transactionId) {
          await supabase
            .from("transactions")
            .update({ status: "refunded" })
            .eq("id", transactionId);
        }

        // Re-open listing so seller can re-list (optional policy).
        // Comment out the block below if you prefer NOT to automatically re-list.
        if (listingId) {
          await supabase
            .from("tickets")
            .update({ status: "available" })
            .eq("id", listingId)
            .eq("status", "sold");
        }
        break;
      }

      // ---------------------------------------------------------------------
      // Seller completed / updated their Connect account (KYC changes)
      // ---------------------------------------------------------------------
      case "account.updated": {
        const account = event.data.object as Stripe.Account;

        const onboardingStatus = account.charges_enabled
          ? "complete"
          : account.details_submitted
          ? "restricted"
          : "pending";

        const { error: updateError } = await supabase
          .from("stripe_accounts")
          .update({
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted,
            onboarding_status: onboardingStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_account_id", account.id);

        if (updateError) {
          console.error("[account.updated] DB update failed:", updateError);
        }

        console.log(
          `[account.updated] account=${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled} status=${onboardingStatus}`
        );
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Processing error for event", event.type, err);
    // Return 500 so Stripe retries the event
    return new Response("Webhook handler failed", { status: 500 });
  }
});
