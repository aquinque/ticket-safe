/**
 * admin-refund-order — refund a single buyer's order from the admin panel.
 *
 * POST /functions/v1/admin-refund-order
 * Authorization: Bearer <admin user JWT>   (must have user_roles.role='admin')
 * Body: { order_id: string, reason?: string }
 *
 * Flow:
 *   1. Authenticate caller, verify admin role.
 *   2. Lookup the order. Must be status='paid' (idempotent on 'refunded'/'expired').
 *   3. Issue refund via the right provider:
 *        • Revolut: stripe_checkout_session_id starts with "revolut:"
 *        • Stripe:  stripe_payment_intent_id is non-null
 *   4. Flip event_orders.status='refunded', refunded_at=now.
 *   5. Mark every still-valid event_tickets row status='refunded'.
 *   6. Email the buyer.
 *   7. audit_log the action with provider + reason.
 *
 * Response: { ok: true, refunded_amount_cents, provider } on success,
 *           { error: string } with the appropriate HTTP status on failure.
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

function buyerRefundEmail(args: { evTitle: string; refundAmount: number; reason: string | null }): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif;color:#1e293b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
<div style="background:linear-gradient(135deg,#dc2626,#f97316);padding:28px 32px;color:#fff">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.85;font-weight:700">Ticket Safe · Refund issued</div>
<h1 style="margin:8px 0 0;font-size:24px;font-weight:800">Your order for ${esc(args.evTitle)} has been refunded</h1>
</div>
<div style="padding:28px 32px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">We've issued a refund for your purchase. Your tickets are no longer valid for entry.</p>
${args.reason ? `<p style="margin:0 0 14px;padding:14px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;color:#7f1d1d;font-size:13px">Reason: ${esc(args.reason)}</p>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0">
<tr><td style="padding:6px 0;color:#64748b;width:50%">Refund amount</td><td style="padding:6px 0;color:#003399;font-weight:700">€${args.refundAmount.toFixed(2)}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Where</td><td style="padding:6px 0">Back to the card used at checkout</td></tr>
<tr><td style="padding:6px 0;color:#64748b">When</td><td style="padding:6px 0">3–10 business days, depending on your bank</td></tr>
</table>
<p style="margin:18px 0 0;font-size:13px;color:#64748b">If you didn't expect this refund or have any questions, just reply to this email.</p>
</div></div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const revolutSecret = Deno.env.get("REVOLUT_MERCHANT_SECRET_KEY");
    const revolutBase = (Deno.env.get("REVOLUT_MERCHANT_BASE") ?? "https://merchant.revolut.com/api").replace(/\/+$/, "");
    const revolutApiVersion = Deno.env.get("REVOLUT_API_VERSION") ?? "2024-09-01";
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "admin") return json({ error: "Admin access required" }, 403);

    let body: { order_id?: string; reason?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const orderId = body.order_id;
    const reason = body.reason?.trim().slice(0, 1000) || null;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Invalid order_id" }, 400);

    const { data: order } = await supabase
      .from("event_orders")
      .select("id, event_id, buyer_email, total_cents, currency, stripe_payment_intent_id, stripe_checkout_session_id, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.status === "refunded") return json({ ok: true, already_refunded: true });
    if (order.status === "refunding") return json({ ok: true, already_in_progress: true });
    if (order.status !== "paid") return json({ error: `Cannot refund order in status '${order.status}'` }, 400);

    // Atomic claim — flip 'paid' → 'refunding' in a single conditional UPDATE.
    // Two concurrent admin clicks race here; only one wins. The loser sees zero
    // rows updated and bails out before any provider call is made, so we never
    // issue duplicate refunds at Revolut/Stripe.
    const { data: claimed } = await supabase
      .from("event_orders")
      .update({ status: "refunding" })
      .eq("id", order.id)
      .eq("status", "paid")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      // Someone else (or a retried request) already claimed this row.
      return json({ ok: true, already_in_progress: true });
    }

    const { data: ev } = await supabase
      .from("events")
      .select("title")
      .eq("id", order.event_id)
      .maybeSingle();
    const eventTitle = ev?.title ?? "your event";

    // Count tickets the buyer already scanned into the venue. We still refund —
    // the admin pulled the trigger — but we surface this in the response and
    // the audit log so the admin tool can show a "refunding a USED ticket"
    // warning and post-incident review can spot scan-after-refund fraud.
    const { count: scannedCount } = await supabase
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("status", "scanned");

    // Issue refund via the right provider. Idempotency keys are bound to the
    // order id so a retried HTTP request hits the same provider transaction.
    const sid = order.stripe_checkout_session_id ?? "";
    const idemKey = `admin_refund_${order.id}`;
    let provider: "revolut" | "stripe";
    let providerOk = false;
    let providerFailureDetails = "";

    if (sid.startsWith("revolut:")) {
      provider = "revolut";
      if (!revolutSecret) {
        providerFailureDetails = "REVOLUT_MERCHANT_SECRET_KEY missing";
      } else {
        const revOrderId = sid.slice("revolut:".length);
        try {
          const res = await fetch(`${revolutBase}/orders/${revOrderId}/refund`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${revolutSecret}`,
              "Revolut-Api-Version": revolutApiVersion,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Idempotency-Key": idemKey,
            },
            body: JSON.stringify({
              amount: order.total_cents,
              currency: (order.currency || "EUR").toUpperCase(),
              merchant_order_ext_ref: `ts_admin_${order.id}`,
            }),
          });
          if (res.ok) {
            providerOk = true;
          } else {
            const text = await res.text().catch(() => "");
            providerFailureDetails = `revolut_${res.status}: ${text.slice(0, 200)}`;
          }
        } catch (err) {
          providerFailureDetails = `revolut_throw: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    } else if (order.stripe_payment_intent_id && stripeKey) {
      provider = "stripe";
      const stripe = new Stripe(stripeKey, {
        apiVersion: "2024-06-20",
        httpClient: Stripe.createFetchHttpClient(),
      });
      try {
        await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          metadata: {
            source: "admin_refund_order",
            order_id: order.id,
            admin_id: user.id,
          },
        }, { idempotencyKey: idemKey });
        providerOk = true;
      } catch (err) {
        providerFailureDetails = err instanceof Error ? err.message : String(err);
      }
    } else {
      provider = "stripe"; // best-effort tag; nothing to refund anyway
      providerFailureDetails = "Order has no usable payment reference";
    }

    if (!providerOk) {
      // Roll the claim back so the admin can retry once the underlying issue
      // is resolved. The atomic UPDATE guard prevents another concurrent
      // request from sneaking through while we do this.
      await supabase
        .from("event_orders")
        .update({ status: "paid" })
        .eq("id", order.id)
        .eq("status", "refunding");
      await supabase.rpc("audit_record", {
        p_action: "event_order.refund_admin_failed",
        p_target_kind: "event_order",
        p_target_id: order.id,
        p_meta: { provider, reason, event_id: order.event_id, details: providerFailureDetails },
        p_actor_id: user.id,
      });
      console.error("[admin-refund-order]", provider, "refund failed:", providerFailureDetails);
      return json({ error: `${provider} refund failed`, details: providerFailureDetails.slice(0, 200) }, 502);
    }

    // Provider call succeeded — finalize the order and the tickets.
    await supabase
      .from("event_orders")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", order.id);

    await supabase
      .from("event_tickets")
      .update({ status: "refunded" })
      .eq("order_id", order.id)
      .eq("status", "valid");

    await supabase.rpc("audit_record", {
      p_action: "event_order.refunded_admin",
      p_target_kind: "event_order",
      p_target_id: order.id,
      p_meta: {
        provider,
        reason,
        event_id: order.event_id,
        total_cents: order.total_cents,
        scanned_tickets_at_refund: scannedCount ?? 0,
      },
      p_actor_id: user.id,
    });

    // Notify the buyer (best effort)
    if (resendKey && order.buyer_email) {
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [order.buyer_email],
          subject: `Refund issued for ${eventTitle}`,
          html: buyerRefundEmail({
            evTitle: eventTitle,
            refundAmount: order.total_cents / 100,
            reason,
          }),
        }),
      }).catch((err) => console.warn("[admin-refund-order] buyer email failed:", err));
    }

    return json({
      ok: true,
      order_id: order.id,
      provider,
      refunded_amount_cents: order.total_cents,
      scanned_tickets_at_refund: scannedCount ?? 0,
    });
  } catch (err) {
    console.error("[admin-refund-order]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not refund order.", details: msg }, 500);
  }
});
