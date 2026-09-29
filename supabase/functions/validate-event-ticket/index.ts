/**
 * validate-event-ticket — door scan validator for Studio primary-sale tickets.
 *
 * POST /functions/v1/validate-event-ticket
 * Auth — one of:
 *   Authorization: Bearer <user-jwt>     (scanner = the event's organizer or a global admin)
 *   Body { staff_token }                 (a door-staff link from event_scan_staff — no
 *                                          Supabase Auth session needed; see the Studio
 *                                          "Scan staff" panel. Locked server-side to the
 *                                          one event the link was created for.)
 * Body: { qr_token: string, event_id?: string, staff_token?: string }
 *
 * Behaviour:
 *   1. Authenticate: Bearer session (owner/admin check further down) OR a
 *      valid, non-revoked staff_token (event is then server-determined, not
 *      client-supplied).
 *   2. Look up event_tickets by qr_token. 404 if not found.
 *   3. If event_id is provided, reject mismatches (WRONG_EVENT).
 *   4. If scanned_at is already set, reject as ALREADY_USED with the prior scan time.
 *   5. Otherwise atomically set scanned_at = now and return VALID with ticket details.
 *
 * Audited: every accept and every reject lands in audit_log so disputes
 * can be traced (staff-link scans are attributed to the organizer's own id
 * for the FK-constrained columns, with the staff link's label kept in the
 * audit row's metadata). Rate-limited per scanner (10/sec) to mitigate flood
 * scans — staff links are rate-limited per-link, not per-organizer, so one
 * busy door doesn't throttle another.
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
    const supabase = createClient(url, key);

    // Body is parsed up front — the staff-link auth path (below) needs
    // `staff_token` from it before we know who's scanning.
    let body: { qr_token?: string; event_id?: string; staff_token?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    // ── Auth: either a normal organizer/admin session, or a staff scan
    // link (event_scan_staff) that needs no Supabase Auth login at all —
    // this is how an organizer hands door-scanning to bouncers/volunteers
    // without sharing their own account. Either way we end up with
    // `actorUserId`, a real auth.users id to attribute the scan to (for the
    // FK-constrained scanned_by/audit columns) and, for the staff path,
    // `staffLockedEventId` which forces which event this request is allowed
    // to scan for — the client cannot override it.
    const authHeader = req.headers.get("Authorization") ?? "";
    let actorUserId: string;
    let staffLabel: string | null = null;
    let staffLockedEventId: string | null = null;
    let rateLimitKey: string;

    if (authHeader.startsWith("Bearer ")) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
      if (authErr || !user) return json({ error: "Invalid or expired token" }, 401);
      actorUserId = user.id;
      rateLimitKey = user.id;
    } else {
      const staffToken = (body.staff_token ?? "").trim();
      if (!staffToken || staffToken.length < 16 || staffToken.length > 200) {
        return json({ error: "Unauthorized" }, 401);
      }

      const { data: staffRow, error: staffErr } = await supabase
        .from("event_scan_staff")
        .select("id, event_id, organizer_id, label, revoked_at, scan_count")
        .eq("token", staffToken)
        .maybeSingle();
      if (staffErr || !staffRow || staffRow.revoked_at) {
        return json({ result: "FORBIDDEN", message: "This scan link is invalid or has been revoked." }, 403);
      }

      const { data: staffOrg } = await supabase
        .from("organizer_profiles")
        .select("user_id")
        .eq("id", staffRow.organizer_id)
        .maybeSingle();
      if (!staffOrg?.user_id) return json({ error: "Server error resolving scan link." }, 500);

      actorUserId = staffOrg.user_id;
      staffLabel = staffRow.label;
      staffLockedEventId = staffRow.event_id;
      rateLimitKey = `staff:${staffRow.id}`;

      // Best-effort usage tracking — never blocks or fails the scan itself.
      supabase
        .from("event_scan_staff")
        .update({ last_used_at: new Date().toISOString(), scan_count: (staffRow.scan_count ?? 0) + 1 })
        .eq("id", staffRow.id)
        .then(({ error: e }) => { if (e) console.warn("[validate-event-ticket] staff usage update failed:", e); });
    }

    // Rate limit: 10 scans/sec per scanner — defense-in-depth against runaway scans
    const { data: allowed } = await supabase.rpc("rate_limit_consume", {
      p_bucket: "validate_event_ticket",
      p_key: rateLimitKey,
      p_max_hits: 10,
      p_window_sec: 1,
    });
    if (allowed === false) return json({ result: "RATE_LIMITED", message: "Too many scans." }, 429);

    const qrToken = (body.qr_token ?? "").trim();
    // A staff link's event is server-determined and cannot be overridden by
    // the client; a normal session still passes whatever event_id the UI's
    // event selector has chosen.
    const requestedEventId = staffLockedEventId ?? body.event_id;
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
            p_actor_id: actorUserId,
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
            p_actor_id: actorUserId,
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
        p_actor_id: actorUserId,
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
      .eq("user_id", actorUserId)
      .eq("role", "admin")
      .maybeSingle();

    const isOwner = org?.user_id === actorUserId;
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
        p_actor_id: actorUserId,
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
        p_actor_id: actorUserId,
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
        p_actor_id: actorUserId,
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
        p_actor_id: actorUserId,
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
      .update({ scanned_at: now, scanned_by: actorUserId, status: "scanned" })
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
        p_actor_id: actorUserId,
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
      // staff_label distinguishes "the organizer scanned this personally"
      // (null) from "scanned via the door-staff link named X" — scanned_by/
      // p_actor_id above is always the organizer's own id either way (a
      // staff link has no real auth.users row of its own), so this is the
      // only place that trail survives.
      p_meta: { event_id: ticket.event_id, tier_id: ticket.tier_id, staff_label: staffLabel },
      p_actor_id: actorUserId,
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
