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
 *        a. Issue a refund through the correct provider:
 *             • Revolut order (stripe_checkout_session_id starts with
 *               "revolut:") → POST /orders/{id}/refund
 *             • Stripe order (stripe_payment_intent_id non-null) →
 *               stripe.refunds.create
 *        b. Mark the order status = 'refunded' with refunded_at.
 *        c. Set event_tickets.status = 'refunded' for every still-valid
 *           ticket on the order (preserves scanned/transferred history).
 *        d. Send the buyer a refund-notification email via Resend.
 *   4. Email the organizer a summary.
 *   5. audit_log every step.
 *
 * Pending orders (Checkout still open) are NOT refunded — they are just
 * cancelled by the provider when the session expires, and the webhook
 * releases the tier reservation.
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

function buyerCancellationEmail(args: { evTitle: string; refundAmount: number; reason: string | null }): { html: string; text: string } {
  const bodyHtml = `
    <p style="margin:0 0 4px">The organizer has cancelled this event. Your purchase has been automatically refunded.</p>
    ${args.reason ? `<p style="margin:12px 0;padding:14px 18px;background:${emailTokens.bodyBg};border-left:3px solid ${emailTokens.danger};color:${emailTokens.textPrimary};font-size:13px;line-height:1.55">Reason: ${esc(args.reason)}</p>` : ""}
    ${ticketSummary([
      ["Refund amount", `€${args.refundAmount.toFixed(2)}`, emailTokens.accent],
      ["Where", "Back to the card used at checkout"],
      ["When", "3–10 business days, depending on your bank"],
    ])}
    <p style="margin:24px 0 0;font-size:13px;color:${emailTokens.textMuted}">Questions? Just reply to this email.</p>
  `;
  const text = `${args.evTitle} has been cancelled.\n\nYour purchase has been automatically refunded.\n${args.reason ? `Reason: ${args.reason}\n` : ""}\nRefund amount: €${args.refundAmount.toFixed(2)}\nBack to the card used at checkout, 3–10 business days.`;
  return renderEmail({
    eyebrow: "Event cancelled",
    title: `${args.evTitle} has been cancelled`,
    bodyHtml,
    preheader: `Your purchase for ${args.evTitle} has been refunded.`,
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

    const stripe = stripeKey ? new Stripe(stripeKey, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    }) : null;
    const revolutCredsForResale = revolutSecret ? { secret: revolutSecret, base: revolutBase, apiVersion: revolutApiVersion } : null;
    const stripeForResale = stripe;

    // Stripe Connect: direct charges on this event (if any) live on the
    // organizer's connected account, not the platform — refunds must be
    // issued with the {stripeAccount: ...} option or Stripe can't find the
    // charge. NULL for Revolut events (the common case today), which keeps
    // the refundOrder Stripe branch below byte-identical in behavior for
    // every event that isn't on Stripe Connect.
    let stripeConnectAccountId: string | null = null;
    let refundApplicationFee = true;
    if (stripe) {
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

    /**
     * Refund a single paid order through the right provider.
     * Returns { ok: true } on success, { ok: false, reason } on failure.
     */
    async function refundOrder(order: {
      id: string;
      total_cents: number;
      currency: string;
      stripe_payment_intent_id: string | null;
      stripe_checkout_session_id: string | null;
    }): Promise<{ ok: true } | { ok: false; reason: string }> {
      // Revolut: stripe_checkout_session_id stores "revolut:<rev_order_id>"
      const sid = order.stripe_checkout_session_id ?? "";
      if (sid.startsWith("revolut:")) {
        if (!revolutSecret) return { ok: false, reason: "REVOLUT_MERCHANT_SECRET_KEY missing" };
        const revOrderId = sid.slice("revolut:".length);
        try {
          const res = await fetch(`${revolutBase}/orders/${revOrderId}/refund`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${revolutSecret}`,
              "Revolut-Api-Version": revolutApiVersion,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              amount: order.total_cents,
              currency: (order.currency || "EUR").toUpperCase(),
              merchant_order_ext_ref: `ts_cancel_${order.id}`,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { ok: false, reason: `revolut_refund_${res.status}: ${text.slice(0, 200)}` };
          }
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: `revolut_refund_throw: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      // Stripe (platform-account legacy charge, OR a Connect direct charge
      // when stripeConnectAccountId is set — see where it's resolved above).
      if (order.stripe_payment_intent_id && stripe) {
        try {
          await stripe.refunds.create(
            {
              payment_intent: order.stripe_payment_intent_id,
              ...(stripeConnectAccountId ? { refund_application_fee: refundApplicationFee } : {}),
              metadata: {
                source: "event_cancellation",
                order_id: order.id,
                event_id: eventId,
              },
            },
            stripeConnectAccountId ? { stripeAccount: stripeConnectAccountId } : undefined,
          );
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: err instanceof Error ? err.message : String(err) };
        }
      }
      return { ok: false, reason: "No usable payment reference (neither revolut: session nor stripe payment_intent)" };
    }

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

    // 1.5. Close the pending-orders race window.
    //
    // Without this step there's a window between "event.status = cancelled"
    // and the paid-orders sweep where a buyer mid-checkout could complete
    // their payment via the Stripe webhook → end up with a 'paid' ticket for
    // a cancelled event with no refund issued.
    //
    // Strategy:
    //   • for each currently-pending order, try to flip it to 'expired' with
    //     a status guard. If the webhook just won and the row is already 'paid',
    //     the update no-ops and the paid-orders sweep below catches it instead.
    //   • when we do successfully cancel a pending row, release the tier
    //     reservation so inventory stays accurate (mirror of what the webhook
    //     would have done on a normal checkout.session.expired event).
    const { data: pendingOrders } = await supabase
      .from("event_orders")
      .select("id, tier_id, quantity")
      .eq("event_id", eventId)
      .eq("status", "pending");

    let pendingClosed = 0;
    for (const po of pendingOrders ?? []) {
      const { data: closed } = await supabase
        .from("event_orders")
        .update({ status: "expired", cancelled_at: new Date().toISOString() })
        .eq("id", po.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!closed) {
        // Race lost — the webhook beat us and the order is now 'paid'.
        // It'll be picked up by the paid-orders query below.
        continue;
      }
      if (po.tier_id && (po.quantity ?? 0) > 0) {
        await supabase.rpc("release_tier_reservation", {
          p_tier_id: po.tier_id,
          p_qty: po.quantity,
        });
      }
      await supabase.rpc("audit_record", {
        p_action: "event_order.expired_cancellation",
        p_target_kind: "event_order",
        p_target_id: po.id,
        p_meta: { event_id: eventId },
        p_actor_id: user.id,
      });
      pendingClosed += 1;
    }

    // 2. Iterate paid orders and refund.
    // (Re-queried *after* the pending sweep above so any pending → paid
    // transition that won its race is automatically included here.)
    const { data: orders } = await supabase
      .from("event_orders")
      .select("id, buyer_email, total_cents, currency, quantity, unit_price_cents, fee_cents, stripe_payment_intent_id, stripe_checkout_session_id, status")
      .eq("event_id", eventId)
      .eq("status", "paid");

    let refundedCount = 0;
    let refundedTotalCents = 0;
    const failures: { order_id: string; reason: string }[] = [];

    for (const order of orders ?? []) {
      // Some of this order's tickets may have been resold since purchase —
      // the resale buyer paid via a separate transaction, not this order,
      // so they need their own refund and the original buyer must NOT be
      // refunded for a seat they already sold and were paid for.
      const { keptCount, originalBuyerRefundCents, resaleRefunds } = await planResaleAwareRefund(supabase, order);
      const resaleRefundResults = await refundResaleBuyers(resaleRefunds, revolutCredsForResale, stripeForResale, "cancel_event");
      for (const r of resaleRefundResults) {
        if (!r.ok) console.error("[cancel-event] resale buyer refund failed:", r.transactionId, r.details);
      }

      const result = keptCount === 0
        ? { ok: true as const }
        : await refundOrder({ ...order, total_cents: originalBuyerRefundCents });
      if (!result.ok) {
        console.error("[cancel-event] refund failed for order", order.id, result.reason);
        failures.push({ order_id: order.id, reason: result.reason });
        continue;
      }

      await supabase
        .from("event_orders")
        .update({ status: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", order.id);

      // Mark every still-valid ticket as refunded. Scanned/transferred/already-
      // refunded tickets are left alone so their history is preserved.
      await supabase
        .from("event_tickets")
        .update({ status: "refunded" })
        .eq("order_id", order.id)
        .eq("status", "valid");

      await supabase.rpc("audit_record", {
        p_action: "event_order.refunded_cancellation",
        p_target_kind: "event_order",
        p_target_id: order.id,
        p_meta: {
          event_id: eventId,
          provider: (order.stripe_checkout_session_id ?? "").startsWith("revolut:") ? "revolut" : "stripe",
          original_buyer_refund_cents: originalBuyerRefundCents,
          resale_refunds: resaleRefundResults.map((r) => ({ transaction_id: r.transactionId, amount_cents: r.amountCents, ok: r.ok })),
        },
        p_actor_id: user.id,
      });

      refundedCount += 1;
      refundedTotalCents += originalBuyerRefundCents + resaleRefundResults.filter((r) => r.ok).reduce((a, r) => a + r.amountCents, 0);

      if (resendKey && order.buyer_email && originalBuyerRefundCents > 0) {
        const { html, text } = buyerCancellationEmail({
          evTitle: ev.title,
          refundAmount: originalBuyerRefundCents / 100,
          reason,
        });
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Ticket Safe <noreply@ticket-safe.eu>",
            to: [order.buyer_email],
            subject: `${ev.title} cancelled — refund issued`,
            html,
            text,
          }),
        }).catch((err) => console.warn("[cancel-event] buyer email failed:", err));
      }

      // Notify each resold ticket's current holder (best effort).
      if (resendKey) {
        for (const r of resaleRefundResults) {
          if (!r.ok) continue;
          const { data: buyerAuth } = await supabase.auth.admin.getUserById(r.buyerId);
          const resaleBuyerEmail = buyerAuth?.user?.email;
          if (!resaleBuyerEmail) continue;
          const { html, text } = buyerCancellationEmail({ evTitle: ev.title, refundAmount: r.amountCents / 100, reason });
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Ticket Safe <noreply@ticket-safe.eu>",
              to: [resaleBuyerEmail],
              subject: `${ev.title} cancelled — refund issued`,
              html,
              text,
            }),
          }).catch((err) => console.warn("[cancel-event] resale buyer email failed:", err));
        }
      }
    }

    // 3. Summary email to organizer (best effort)
    if (resendKey && org.contact_email) {
      const summaryBody = `
        <p style="margin:0 0 4px">Event <strong>${esc(ev.title)}</strong> has been cancelled.</p>
        ${ticketSummary([
          ["Orders refunded", String(refundedCount)],
          ["Total returned to buyers", `€${(refundedTotalCents / 100).toFixed(2)}`, emailTokens.accent],
          ...(failures.length > 0 ? ([["Failed refunds (need review)", String(failures.length), emailTokens.danger]] as [string, string, string][]) : []),
        ])}
      `;
      const summaryText = `Event ${ev.title} has been cancelled.\n\nOrders refunded: ${refundedCount}\nTotal returned to buyers: €${(refundedTotalCents / 100).toFixed(2)}${failures.length > 0 ? `\nFailed refunds (need review): ${failures.length}` : ""}`;
      const { html, text } = renderEmail({
        eyebrow: "Event cancelled",
        title: `${ev.title} — cancellation summary`,
        bodyHtml: summaryBody,
        preheader: `${refundedCount} refund${refundedCount !== 1 ? "s" : ""} issued for ${ev.title}.`,
        text: summaryText,
      });
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [org.contact_email],
          subject: `${ev.title} cancelled — ${refundedCount} refund${refundedCount !== 1 ? "s" : ""} issued`,
          html,
          text,
        }),
      }).catch(() => {});
    }

    return json({
      ok: true,
      event_id: eventId,
      refunded_count: refundedCount,
      refunded_total_cents: refundedTotalCents,
      pending_closed: pendingClosed,
      failures,
    });
  } catch (err) {
    console.error("[cancel-event]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Could not cancel.", details: msg }, 500);
  }
});
