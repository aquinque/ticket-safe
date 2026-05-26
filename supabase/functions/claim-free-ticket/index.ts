/**
 * claim-free-ticket — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/claim-free-ticket
 * Authorization: Bearer <user-jwt>
 * Body: { tier_id: string }
 *
 * Beta flow for €0 tiers — no Stripe, no payment intent. Mirrors the same
 * atomic-reservation pattern as studio-create-checkout but resolves the
 * order to `paid` immediately and issues the QR ticket in one shot.
 *
 *  1. Authenticate buyer
 *  2. Resolve tier → event → organizer; require tier.price_cents === 0
 *  3. Cap: one free claim per user per tier (prevents abuse)
 *  4. Atomically reserve 1 seat via reserve_tier()
 *  5. Create event_orders row with status='paid', paid_at=now, unit_price_cents=0
 *  6. Finalize the reservation (reserved_qty → sold_qty)
 *  7. Insert event_tickets row with random qr_token
 *  8. Send confirmation email via Resend with the buyer's full_name
 *  9. Return { ok: true, order_id, ticket_id, qr_token, event }
 *  On any failure after reservation → release_tier_reservation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function makeQrToken(): string {
  // 40-char hex token (uniqueness enforced by event_tickets.qr_token unique index)
  return (
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Server misconfigured." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let reservedTierId: string | null = null;
  let reservedQty = 0;
  let orderId: string | null = null;

  const releaseReservation = async () => {
    if (reservedTierId && reservedQty > 0) {
      await supabase.rpc("release_tier_reservation", {
        p_tier_id: reservedTierId,
        p_qty: reservedQty,
      });
    }
  };

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // Email-confirmation guard (matches the Auth.tsx defense)
    if (!user.email_confirmed_at) {
      return json(
        { error: "Please confirm your email before claiming a beta ticket." },
        403,
      );
    }

    // ── Body ──────────────────────────────────────────────────────────────
    let body: { tier_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const tierId = body.tier_id;
    if (!tierId || typeof tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(tierId)) {
      return json({ error: "Invalid tier_id" }, 400);
    }

    // ── Fetch tier + event + organizer ────────────────────────────────────
    const { data: tier, error: tierErr } = await supabase
      .from("event_tiers")
      .select(
        `id, event_id, name, price_cents, currency, total_qty, sold_qty, reserved_qty, is_active,
         event:events!inner(id, title, slug, status, location, date, ends_at, organizer_id,
           organizer:organizer_profiles!events_organizer_id_fkey(id, name))`,
      )
      .eq("id", tierId)
      .maybeSingle();

    if (tierErr || !tier) return json({ error: "Tier not found" }, 404);
    if (!tier.is_active) return json({ error: "This tier is no longer available." }, 400);
    if (tier.price_cents !== 0) {
      return json({ error: "This tier is not free — use the regular checkout." }, 400);
    }

    // event is nested; supabase-js sometimes returns an array
    const ev = Array.isArray(tier.event) ? tier.event[0] : tier.event;
    if (!ev) return json({ error: "Event not found" }, 404);
    if (ev.status !== "published") {
      return json({ error: "This event is not on sale." }, 400);
    }

    const organizer = Array.isArray(ev.organizer) ? ev.organizer[0] : ev.organizer;
    if (!organizer) return json({ error: "Event has no organizer" }, 500);

    // ── Per-user cap: one free claim per tier ──────────────────────────────
    const { count: existingCount } = await supabase
      .from("event_orders")
      .select("id", { count: "exact", head: true })
      .eq("tier_id", tierId)
      .eq("buyer_id", user.id)
      .in("status", ["pending", "paid"]);

    if ((existingCount ?? 0) > 0) {
      return json(
        { error: "You've already claimed a free seat for this event." },
        409,
      );
    }

    // ── Reserve atomically ────────────────────────────────────────────────
    const { data: reserved, error: reserveErr } = await supabase.rpc(
      "reserve_tier",
      { p_tier_id: tierId, p_qty: 1 },
    );
    if (reserveErr || !reserved) {
      return json({ error: "Sold out or unavailable." }, 409);
    }
    reservedTierId = tierId;
    reservedQty = 1;

    // ── Fetch buyer profile for email personalisation ─────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const buyerName =
      profile?.full_name?.trim() ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "there";
    const buyerEmail = profile?.email || user.email || null;

    if (!buyerEmail) {
      await releaseReservation();
      return json({ error: "No email on file." }, 400);
    }

    // ── Create order (already paid, since it's free) ──────────────────────
    const { data: order, error: orderErr } = await supabase
      .from("event_orders")
      .insert({
        event_id: ev.id,
        tier_id: tierId,
        organizer_id: organizer.id,
        buyer_id: user.id,
        buyer_email: buyerEmail,
        quantity: 1,
        unit_price_cents: 0,
        total_cents: 0,
        fee_cents: 0,
        currency: tier.currency,
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[claim-free-ticket] order insert failed:", orderErr);
      await releaseReservation();
      return json({ error: "Could not create your order." }, 500);
    }
    orderId = order.id;

    // ── Finalize: move reserved → sold atomically ─────────────────────────
    const { error: finErr } = await supabase.rpc("finalize_tier_sale", {
      p_tier_id: tierId,
      p_qty: 1,
    });
    if (finErr) {
      console.error("[claim-free-ticket] finalize_tier_sale failed:", finErr);
      // We can't easily roll back the order; mark it cancelled and bail.
      await supabase
        .from("event_orders")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", orderId);
      await releaseReservation();
      return json({ error: "Could not finalize the claim." }, 500);
    }
    // Reservation has been consumed by finalize; don't release it on later errors.
    reservedTierId = null;
    reservedQty = 0;

    // ── Issue the QR ticket ───────────────────────────────────────────────
    const qrToken = makeQrToken();
    const { data: ticket, error: tixErr } = await supabase
      .from("event_tickets")
      .insert({
        order_id: orderId,
        event_id: ev.id,
        tier_id: tierId,
        buyer_id: user.id,
        qr_token: qrToken,
      })
      .select("id, qr_token")
      .single();

    if (tixErr || !ticket) {
      console.error("[claim-free-ticket] event_tickets insert failed:", tixErr);
      return json({ error: "Could not issue your ticket." }, 500);
    }

    // ── Send confirmation email ───────────────────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const siteUrl = (Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu").replace(/\/+$/, "");
      const evDate = ev.date
        ? new Date(ev.date).toLocaleString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      const safeName = String(buyerName).replace(/[<>]/g, "");
      const safeTitle = String(ev.title ?? "Your event").replace(/[<>]/g, "");
      const safeLocation = String(ev.location ?? "—").replace(/[<>]/g, "");

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [buyerEmail],
          subject: `[BETA] Your free ticket for ${safeTitle} is confirmed`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif;color:#1e293b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
  <div style="background:linear-gradient(135deg,#1E5EFF,#0066cc);padding:28px 32px;color:#fff">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.8;font-weight:700">Ticket Safe · Beta ticket</div>
    <h1 style="margin:8px 0 0;font-size:24px;font-weight:800">${safeTitle}</h1>
  </div>
  <div style="padding:28px 32px;font-size:15px;line-height:1.6">
    <p style="margin:0 0 18px">Hi <strong>${safeName}</strong>,</p>
    <p style="margin:0 0 18px">Your free beta ticket is confirmed. Here are the details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
      <tr><td style="padding:8px 0;color:#64748b;width:30%">Event</td><td style="padding:8px 0;font-weight:600">${safeTitle}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Date</td><td style="padding:8px 0">${evDate}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Location</td><td style="padding:8px 0">${safeLocation}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Holder</td><td style="padding:8px 0">${safeName}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">Price</td><td style="padding:8px 0;color:#1E5EFF;font-weight:700">Free (Beta)</td></tr>
    </table>
    <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:18px;text-align:center;margin:18px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#64748b;font-weight:600">QR token</div>
      <code style="display:inline-block;margin-top:6px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;color:#0f172a;word-break:break-all">${qrToken}</code>
    </div>
    <p style="margin:24px 0 8px;text-align:center">
      <a href="${siteUrl}/profile" style="display:inline-block;background:linear-gradient(135deg,#1E5EFF,#0066cc);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">View my ticket</a>
    </p>
    <p style="margin:18px 0 0;font-size:12px;color:#64748b">
      This is a beta test ticket so you can experience the full purchase flow end-to-end without paying.
      The full QR-code rendering + door scanning will land before the first real event.
    </p>
  </div>
</div></body></html>`,
        }),
      });
      const emailBody = await emailRes.json().catch(() => ({}));
      console.log(
        "[claim-free-ticket] resend status:",
        emailRes.status,
        JSON.stringify(emailBody),
      );
    } else {
      console.warn(
        "[claim-free-ticket] RESEND_API_KEY not set — skipping confirmation email",
      );
    }

    return json({
      ok: true,
      order_id: orderId,
      ticket_id: ticket.id,
      qr_token: ticket.qr_token,
      event: {
        id: ev.id,
        title: ev.title,
        slug: ev.slug,
        date: ev.date,
        location: ev.location,
      },
    });
  } catch (e) {
    console.error("[claim-free-ticket] unexpected:", e);
    await releaseReservation();
    return json({ error: "Unexpected server error." }, 500);
  }
});
