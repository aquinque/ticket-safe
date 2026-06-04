/**
 * validate-event-ticket — door scan validator for Studio primary-sale tickets.
 *
 * POST /functions/v1/validate-event-ticket
 * Authorization: Bearer <user-jwt>   (scanner = organizer or admin)
 * Body: { qr_token: string, event_id?: string }
 *
 * Behaviour:
 *   1. Verify the caller is either the organizer of the event OR a global admin.
 *   2. Look up event_tickets by qr_token. 404 if not found.
 *   3. If event_id is provided, reject mismatches (WRONG_EVENT).
 *   4. If scanned_at is already set, reject as ALREADY_USED with the prior scan time.
 *   5. Otherwise atomically set scanned_at = now and return VALID with ticket details.
 *
 * Audited: every accept and every reject lands in audit_log so disputes
 * can be traced. Rate-limited per scanner (10/sec) to mitigate flood scans.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { looksLikeJWT, verifyStudioTicketJWT } from "../_shared/ticketJwt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Server misconfigured." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(url, key);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);

    // Rate limit: 10 scans/sec per scanner — defense-in-depth against runaway scans
    const { data: allowed } = await supabase.rpc("rate_limit_consume", {
      p_bucket: "validate_event_ticket",
      p_key: user.id,
      p_max_hits: 10,
      p_window_sec: 1,
    });
    if (allowed === false) return json({ result: "RATE_LIMITED", message: "Too many scans." }, 429);

    let body: { qr_token?: string; event_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const qrToken = (body.qr_token ?? "").trim();
    const requestedEventId = body.event_id;
    // JWTs are 200-400+ chars; legacy random-hex tokens are 40. Allow up to 600
    // so a bigger payload (future extra claims) doesn't push us over the limit.
    if (!qrToken || qrToken.length < 16 || qrToken.length > 600) {
      return json({ result: "INVALID", message: "QR token format invalid." });
    }
    if (requestedEventId && !/^[0-9a-f-]{36}$/i.test(requestedEventId)) {
      return json({ result: "INVALID", message: "event_id format invalid." });
    }

    // ── Signature pre-check ───────────────────────────────────────────────
    // If the token *shape* says JWT, verify the HMAC before we touch the DB.
    // This:
    //   • catches forged QRs instantly (no DB query, no audit row generated
    //     by the lookup path),
    //   • lets us return a precise reason ("bad signature" vs "expired"),
    //   • is the prerequisite for offline scanning later (a scanner cache
    //     can do the same check without network).
    // Legacy random-hex tokens (issued before TICKET_SIGNING_SECRET was set)
    // fall through to the DB lookup so existing tickets keep working.
    if (looksLikeJWT(qrToken)) {
      const verify = await verifyStudioTicketJWT(qrToken);
      if (!verify.ok) {
        // secret_missing is a server-side misconfig — fall through to DB lookup
        // so a forgotten env var doesn't lock everyone out at the door. The
        // lookup-by-token path still works and we log loudly.
        if (verify.reason === "secret_missing") {
          console.error("[validate-event-ticket] TICKET_SIGNING_SECRET not set, skipping signature check");
        } else if (verify.reason === "expired") {
          await supabase.rpc("audit_record", {
            p_action: "scan.jwt_expired",
            p_target_kind: "event_ticket",
            p_target_id: verify.payload?.sub ?? null,
            p_meta: { scanned_event_id: requestedEventId ?? null },
            p_actor_id: user.id,
          });
          return json({
            result: "REVOKED",
            message: "This ticket token has expired.",
          });
        } else {
          await supabase.rpc("audit_record", {
            p_action: "scan.jwt_forged",
            p_target_kind: "event_ticket",
            p_target_id: null,
            p_meta: { reason: verify.reason, scanned_event_id: requestedEventId ?? null },
            p_actor_id: user.id,
          });
          return json({
            result: "FORGED",
            message: "This QR is not a valid Ticket Safe ticket (signature mismatch).",
          });
        }
      }
    }

    // Resolve ticket + its event + its organizer + its order in one round-trip
    const { data: ticket, error: tErr } = await supabase
      .from("event_tickets")
      .select(
        `id, event_id, tier_id, buyer_id, order_id, qr_token, scanned_at, scanned_by, status,
         holder_first_name, holder_last_name, holder_email, created_at,
         event:events!inner(title, date, status, organizer_id),
         tier:event_tiers(name),
         order:event_orders(status)`,
      )
      .eq("qr_token", qrToken)
      .maybeSingle();

    if (tErr) {
      console.error("[validate-event-ticket] lookup failed:", tErr);
      return json({ error: "Lookup failed." }, 500);
    }
    if (!ticket) {
      // FORGED / FAKE QR: token doesn't exist in our DB at all.
      // Audit the attempt so we can spot patterns of forged scans.
      await supabase.rpc("audit_record", {
        p_action: "scan.forged_or_unknown",
        p_target_kind: "event_ticket",
        p_target_id: null,
        p_meta: { reason: "not_found", scanned_event_id: requestedEventId ?? null, token_prefix: qrToken.slice(0, 8) },
        p_actor_id: user.id,
      });
      return json({
        result: "FORGED",
        message: "This QR is not a valid Ticket Safe ticket.",
      });
    }

    const ev = Array.isArray((ticket as { event: unknown }).event)
      ? (ticket as { event: { title: string; date: string; status: string; organizer_id: string }[] }).event[0]
      : (ticket as { event: { title: string; date: string; status: string; organizer_id: string } }).event;
    const ord = Array.isArray((ticket as { order: unknown }).order)
      ? (ticket as { order: { status: string }[] }).order[0]
      : (ticket as { order: { status: string } | null }).order;

    // Authorize: must be the event's organizer or a global admin
    const { data: org } = await supabase
      .from("organizer_profiles")
      .select("user_id")
      .eq("id", ev?.organizer_id)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isOwner = org?.user_id === user.id;
    const isAdmin = !!roleRow;
    if (!isOwner && !isAdmin) {
      return json({
        result: "FORBIDDEN",
        message: "You are not allowed to scan tickets for this event.",
      }, 403);
    }

    // Look up the event the scanner *selected* in the UI, so we can show
    // its title in the WRONG_EVENT response.
    let expectedEventTitle: string | null = null;
    if (requestedEventId && requestedEventId !== ticket.event_id) {
      const { data: expected } = await supabase
        .from("events")
        .select("title")
        .eq("id", requestedEventId)
        .maybeSingle();
      expectedEventTitle = expected?.title ?? null;

      await supabase.rpc("audit_record", {
        p_action: "scan.wrong_event",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: {
          expected_event_id: requestedEventId,
          expected_event_title: expectedEventTitle,
          actual_event_id: ticket.event_id,
          actual_event_title: ev?.title,
        },
        p_actor_id: user.id,
      });
      return json({
        result: "WRONG_EVENT",
        message: `This ticket is for "${ev?.title ?? "another event"}", not "${expectedEventTitle ?? "the selected event"}".`,
        ticket_info: {
          actual_event_title: ev?.title,
          actual_event_date: ev?.date,
          expected_event_title: expectedEventTitle,
        },
      });
    }

    // Cancelled event: organizer cancelled and buyer was already refunded.
    // The ticket is void even if it was never scanned.
    if (ev?.status === "cancelled") {
      await supabase.rpc("audit_record", {
        p_action: "scan.event_cancelled",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: { event_id: ticket.event_id },
        p_actor_id: user.id,
      });
      return json({
        result: "REVOKED",
        message: "This event was cancelled — buyer was refunded. Deny entry.",
        ticket_info: { event_title: ev?.title },
      });
    }

    // Refunded order: cancellation may not have touched events.status
    // (e.g. partial refund) but this specific order was refunded.
    if (ord?.status === "refunded") {
      await supabase.rpc("audit_record", {
        p_action: "scan.order_refunded",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: { order_id: ticket.order_id, event_id: ticket.event_id },
        p_actor_id: user.id,
      });
      return json({
        result: "REVOKED",
        message: "This ticket was refunded. Deny entry.",
        ticket_info: { event_title: ev?.title },
      });
    }

    // Already used
    if (ticket.scanned_at) {
      await supabase.rpc("audit_record", {
        p_action: "scan.already_used",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: { scanned_at: ticket.scanned_at },
        p_actor_id: user.id,
      });
      return json({
        result: "ALREADY_USED",
        message: `Already scanned at ${new Date(ticket.scanned_at).toLocaleString("en-GB")}. Deny entry.`,
        ticket_info: { event_title: ev?.title, scanned_at: ticket.scanned_at },
      });
    }

    // Atomic accept: only flip if it's still 'valid' AND scanned_at is NULL.
    // The double guard prevents races where two scanners hit the same QR
    // milliseconds apart — exactly one wins.
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("event_tickets")
      .update({ scanned_at: now, scanned_by: user.id, status: "scanned" })
      .eq("id", ticket.id)
      .eq("status", "valid")
      .is("scanned_at", null)
      .select("id, scanned_at")
      .maybeSingle();

    if (updErr || !updated) {
      // Race condition — someone else just scanned. Re-read and report.
      const { data: re } = await supabase
        .from("event_tickets")
        .select("scanned_at")
        .eq("id", ticket.id)
        .maybeSingle();
      // IMPORTANT: log this case explicitly. Without it a coordinated double-scan
      // (two phones presenting the same QR to two doormen simultaneously) leaves
      // no trace in audit_log for the losing scanner — only the winner's
      // scan.valid row appears. With this entry we can spot "1 ticket → 2
      // attempted entries inside Δt ms" patterns and flag bad actors.
      await supabase.rpc("audit_record", {
        p_action: "scan.race_lost",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: {
          event_id: ticket.event_id,
          winner_scanned_at: re?.scanned_at ?? null,
          err: updErr ? String(updErr.message ?? updErr) : null,
        },
        p_actor_id: user.id,
      });
      return json({
        result: "ALREADY_USED",
        message: "Ticket already scanned moments ago.",
        ticket_info: { event_title: ev?.title, scanned_at: re?.scanned_at ?? null },
      });
    }

    await supabase.rpc("audit_record", {
      p_action: "scan.valid",
      p_target_kind: "event_ticket",
      p_target_id: ticket.id,
      p_meta: { event_id: ticket.event_id, tier_id: ticket.tier_id },
      p_actor_id: user.id,
    });

    const holderName = [ticket.holder_first_name, ticket.holder_last_name].filter(Boolean).join(" ");
    return json({
      result: "VALID",
      message: holderName ? `Welcome, ${holderName}!` : "Welcome! Ticket validated.",
      ticket_info: {
        event_title: ev?.title,
        tier_name: Array.isArray(ticket.tier) ? ticket.tier[0]?.name : (ticket as { tier?: { name?: string } }).tier?.name,
        holder_name: holderName || null,
        holder_email: ticket.holder_email ?? null,
        scanned_at: now,
      },
    });
  } catch (err) {
    console.error("[validate-event-ticket]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Scan failed.", details: msg }, 500);
  }
});
