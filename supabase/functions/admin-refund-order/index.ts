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
import { planResaleAwareRefund, refundResaleBuyers } from "../_shared/resaleAwareRefund.ts";
import { renderEmail, ticketSummary, escapeHtml as esc } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

function buyerRefundEmail(args: { evTitle: string; refundAmount: number; reason: string | null }): { html: string; text: string } {
  const bodyHtml = `
    <p style="margin:0 0 4px">We've issued a refund for your purchase. Your tickets are no longer valid for entry.</p>
    ${args.reason ? `<p style="margin:12px 0;padding:14px 18px;background:${emailTokens.bodyBg};border-left:3px solid ${emailTokens.danger};color:${emailTokens.textPrimary};font-size:13px;line-height:1.55">Reason: ${esc(args.reason)}</p>` : ""}
    ${ticketSummary([
      ["Refund amount", `€${args.refundAmount.toFixed(2)}`, emailTokens.accent],
      ["Where", "Back to the card used at checkout"],
      ["When", "3–10 business days, depending on your bank"],
    ])}
    <p style="margin:24px 0 0;font-size:13px;color:${emailTokens.textMuted}">Didn't expect this refund, or have questions? Just reply to this email.</p>
  `;
  const text = `Your order for ${args.evTitle} has been refunded.\n\n${args.reason ? `Reason: ${args.reason}\n\n` : ""}Refund amount: €${args.refundAmount.toFixed(2)}\nBack to the card used at checkout, 3–10 business days.`;
  return renderEmail({
    eyebrow: "Refund issued",
    title: `Your order for ${args.evTitle} has been refunded`,
    bodyHtml,
    preheader: `€${args.refundAmount.toFixed(2)} refunded for ${args.evTitle}.`,
    text,
  });
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
      .select("id, event_id, buyer_email, total_cents, currency, quantity, unit_price_cents, fee_cents, stripe_payment_intent_id, stripe_checkout_session_id, status")
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
      .select("title, organizer_id")
      .eq("id", order.event_id)
      .maybeSingle();
    const eventTitle = ev?.title ?? "your event";

    // Stripe Connect: same reasoning as cancel-event — a direct charge on
    // this order lives on the organizer's connected account, so the refund
    // needs {stripeAccount: ...}. NULL (and therefore byte-identical
    // behavior to before this change) for every Revolut event.
    let stripeConnectAccountId: string | null = null;
    let refundApplicationFee = true;
    if (stripeKey && ev?.organizer_id) {
      const { data: connectAcct } = await supabase
        .from("stripe_connect_accounts")
        .select("stripe_account_id")
        .eq("organizer_id", ev.organizer_id)
        .maybeSingle();
      stripeConnectAccountId = connectAcct?.stripe_account_id ?? null;
      if (stripeConnectAccountId) {
        const { data: settings } = await supabase.from("billing_settings").select("refund_application_fee_on_refund").eq("id", true).maybeSingle();
        refundApplicationFee = settings?.refund_application_fee_on_refund ?? true;
      }
    }

    // Count tickets the buyer already scanned into the venue. We still refund —
    // the admin pulled the trigger — but we surface this in the response and
    // the audit log so the admin tool can show a "refunding a USED ticket"
    // warning and post-incident review can spot scan-after-refund fraud.
    const { count: scannedCount } = await supabase
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id)
      .eq("status", "scanned");

    // Some of this order's tickets may have been resold since purchase —
    // the resale buyer paid via a separate transaction, not this order, so
    // they need their own refund and the original buyer must NOT be
    // refunded for a seat they already sold and were paid for.
    const { keptCount, originalBuyerRefundCents, resaleRefunds } = await planResaleAwareRefund(supabase, order);
    const revolutCredsForResale = revolutSecret ? { secret: revolutSecret, base: revolutBase, apiVersion: revolutApiVersion } : null;
    const stripeForResale = stripeKey ? new Stripe(stripeKey, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() }) : null;
    const resaleRefundResults = await refundResaleBuyers(resaleRefunds, revolutCredsForResale, stripeForResale, "admin_refund");
    for (const r of resaleRefundResults) {
      if (!r.ok) console.error("[admin-refund-order] resale buyer refund failed:", r.transactionId, r.details);
    }

    // Issue refund via the right provider. Idempotency keys are bound to the
    // order id so a retried HTTP request hits the same provider transaction.
    // Amount is prorated down to only the tickets still held by this buyer
    // (see planResaleAwareRefund) — resold tickets are refunded above instead.
    const sid = order.stripe_checkout_session_id ?? "";
    const idemKey = `admin_refund_${order.id}`;
    let provider: "revolut" | "stripe";
    let providerOk = keptCount === 0; // nothing owed to the original buyer
    let providerFailureDetails = "";

    if (keptCount === 0) {
      provider = sid.startsWith("revolut:") ? "revolut" : "stripe";
    } else if (sid.startsWith("revolut:")) {
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
              amount: originalBuyerRefundCents,
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
          amount: originalBuyerRefundCents,
          ...(stripeConnectAccountId ? { refund_application_fee: refundApplicationFee } : {}),
          metadata: {
            source: "admin_refund_order",
            order_id: order.id,
            admin_id: user.id,
          },
        }, { idempotencyKey: idemKey, ...(stripeConnectAccountId ? { stripeAccount: stripeConnectAccountId } : {}) });
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
        original_buyer_refund_cents: originalBuyerRefundCents,
        resale_refunds: resaleRefundResults.map((r) => ({ transaction_id: r.transactionId, amount_cents: r.amountCents, ok: r.ok })),
        scanned_tickets_at_refund: scannedCount ?? 0,
      },
      p_actor_id: user.id,
    });

    // Notify the original buyer (best effort) — only if they're actually
    // owed something; if every ticket on this order was resold, they
    // already have nothing left to be refunded for.
    if (resendKey && order.buyer_email && originalBuyerRefundCents > 0) {
      const { html, text } = buyerRefundEmail({
        evTitle: eventTitle,
        refundAmount: originalBuyerRefundCents / 100,
        reason,
      });
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [order.buyer_email],
          subject: `Refund issued for ${eventTitle}`,
          html,
          text,
        }),
      }).catch((err) => console.warn("[admin-refund-order] buyer email failed:", err));
    }

    // Notify each resold ticket's current holder (best effort).
    if (resendKey) {
      for (const r of resaleRefundResults) {
        if (!r.ok) continue;
        const { data: buyerAuth } = await supabase.auth.admin.getUserById(r.buyerId);
        const resaleBuyerEmail = buyerAuth?.user?.email;
        if (!resaleBuyerEmail) continue;
        const { html, text } = buyerRefundEmail({ evTitle: eventTitle, refundAmount: r.amountCents / 100, reason });
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Ticket Safe <noreply@ticket-safe.eu>",
            to: [resaleBuyerEmail],
            subject: `Refund issued for ${eventTitle}`,
            html,
            text,
          }),
        }).catch((err) => console.warn("[admin-refund-order] resale buyer email failed:", err));
      }
    }

    return json({
      ok: true,
      order_id: order.id,
      provider,
      refunded_amount_cents: originalBuyerRefundCents,
      resale_refunds: resaleRefundResults.map((r) => ({ transaction_id: r.transactionId, amount_cents: r.amountCents, ok: r.ok })),
      scanned_tickets_at_refund: scannedCount ?? 0,
    });
  } catch (err) {
    console.error("[admin-refund-order]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not refund order.", details: msg }, 500);
  }
});
