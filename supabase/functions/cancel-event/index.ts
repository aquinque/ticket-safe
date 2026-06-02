/**
 * cancel-event — organizer cancels a published event; we issue refunds.
 *
 * POST /functions/v1/cancel-event
 * Authorization: Bearer <user-jwt>   (must be the event's organizer)
 * Body: { event_id: string, reason?: string }
 *
 * Sequence:
 *   1. Authenticate caller → look up event → check the caller is the
 *      event's organizer.
 *   2. Flip events.status = 'cancelled' and set cancelled_at.
 *   3. For every paid event_orders row tied to this event:
 *        a. Issue a Stripe refund on the saved payment_intent_id
 *           (reverses the destination charge AND the platform fee).
 *        b. Mark the order status = 'refunded' with refunded_at.
 *        c. Mark every event_tickets row invalidated.
 *        d. Send the buyer a refund-notification email via Resend.
 *   4. Email the organizer a summary.
 *   5. audit_log every step.
 *
 * Pending orders (Checkout still open) are NOT refunded — they are just
 * cancelled by Stripe when the session expires, and our webhook releases
 * the tier reservation.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buyerCancellationEmail(args: { evTitle: string; refundAmount: number; reason: string | null }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif;color:#1e293b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
<div style="background:linear-gradient(135deg,#dc2626,#f97316);padding:28px 32px;color:#fff">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.85;font-weight:700">Ticket Safe · Event cancelled</div>
<h1 style="margin:8px 0 0;font-size:24px;font-weight:800">${esc(args.evTitle)} has been cancelled</h1>
</div>
<div style="padding:28px 32px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">The organizer has cancelled this event. Your purchase has been automatically refunded.</p>
${args.reason ? `<p style="margin:0 0 14px;padding:14px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;color:#7f1d1d;font-size:13px">Reason: ${esc(args.reason)}</p>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0">
<tr><td style="padding:6px 0;color:#64748b;width:50%">Refund amount</td><td style="padding:6px 0;color:#003399;font-weight:700">€${args.refundAmount.toFixed(2)}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Where</td><td style="padding:6px 0">Back to the card used at checkout</td></tr>
<tr><td style="padding:6px 0;color:#64748b">When</td><td style="padding:6px 0">3–10 business days, depending on your bank</td></tr>
</table>
<p style="margin:18px 0 0;font-size:13px;color:#64748b">If you have any questions, just reply to this email.</p>
</div></div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !supabaseKey || !stripeKey) return json({ error: "Server misconfigured." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

    let body: { event_id?: string; reason?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const eventId = body.event_id;
    const reason = body.reason?.trim().slice(0, 1000) || null;
    if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);

    // Resolve event + organizer
    const { data: ev } = await supabase
      .from("events")
      .select("id, title, status, organizer_id, slug")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return json({ error: "Event not found" }, 404);
    if (ev.status === "cancelled") return json({ error: "Event already cancelled" }, 400);

    const { data: org } = await supabase
      .from("organizer_profiles")
      .select("user_id, name, contact_email")
      .eq("id", ev.organizer_id)
      .maybeSingle();
    if (!org || org.user_id !== user.id) {
      return json({ error: "Only the event's organizer can cancel this event." }, 403);
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 1. Flip event status
    await supabase
      .from("events")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", eventId);

    await supabase.rpc("audit_record", {
      p_action: "event.cancelled",
      p_target_kind: "event",
      p_target_id: eventId,
      p_meta: { reason },
      p_actor_id: user.id,
    });

    // 2. Iterate paid orders and refund
    const { data: orders } = await supabase
      .from("event_orders")
      .select("id, buyer_email, total_cents, stripe_payment_intent_id, status")
      .eq("event_id", eventId)
      .eq("status", "paid");

    let refundedCount = 0;
    let refundedTotalCents = 0;
    const failures: { order_id: string; reason: string }[] = [];

    for (const order of orders ?? []) {
      if (!order.stripe_payment_intent_id) {
        failures.push({ order_id: order.id, reason: "Missing payment_intent_id" });
        continue;
      }
      try {
        // refund_application_fee=true claws back the 5% platform fee too
        await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          refund_application_fee: true,
          reverse_transfer: true,
          metadata: {
            source: "event_cancellation",
            order_id: order.id,
            event_id: eventId,
          },
        });

        await supabase
          .from("event_orders")
          .update({ status: "refunded", refunded_at: new Date().toISOString() })
          .eq("id", order.id);

        // Invalidate any unscanned tickets
        await supabase
          .from("event_tickets")
          .update({ scanned_at: new Date().toISOString(), scanned_by: user.id })
          .eq("order_id", order.id)
          .is("scanned_at", null);

        await supabase.rpc("audit_record", {
          p_action: "event_order.refunded_cancellation",
          p_target_kind: "event_order",
          p_target_id: order.id,
          p_meta: { event_id: eventId },
          p_actor_id: user.id,
        });

        refundedCount += 1;
        refundedTotalCents += order.total_cents;

        // Notify the buyer
        if (resendKey && order.buyer_email) {
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Ticket Safe <noreply@ticket-safe.eu>",
              to: [order.buyer_email],
              subject: `${ev.title} cancelled — refund issued`,
              html: buyerCancellationEmail({
                evTitle: ev.title,
                refundAmount: order.total_cents / 100,
                reason,
              }),
            }),
          }).catch((err) => console.warn("[cancel-event] buyer email failed:", err));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cancel-event] refund failed for order", order.id, msg);
        failures.push({ order_id: order.id, reason: msg });
      }
    }

    // 3. Summary email to organizer (best effort)
    if (resendKey && org.contact_email) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [org.contact_email],
          subject: `${ev.title} cancelled — ${refundedCount} refund${refundedCount !== 1 ? "s" : ""} issued`,
          html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#1e293b;padding:24px">
<h2>Event cancelled: ${esc(ev.title)}</h2>
<p>${refundedCount} order${refundedCount !== 1 ? "s" : ""} refunded — €${(refundedTotalCents / 100).toFixed(2)} returned to buyers (including platform fees).</p>
${failures.length > 0 ? `<p style="color:#b91c1c">${failures.length} refund${failures.length !== 1 ? "s" : ""} failed and need manual review.</p>` : ""}
</body></html>`,
        }),
      }).catch(() => {});
    }

    return json({
      ok: true,
      event_id: eventId,
      refunded_count: refundedCount,
      refunded_total_cents: refundedTotalCents,
      failures,
    });
  } catch (err) {
    console.error("[cancel-event]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not cancel.", details: msg }, 500);
  }
});
