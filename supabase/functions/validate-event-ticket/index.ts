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
    if (!qrToken || qrToken.length < 16 || qrToken.length > 128) {
      return json({ result: "INVALID", message: "QR token format invalid." });
    }
    if (requestedEventId && !/^[0-9a-f-]{36}$/i.test(requestedEventId)) {
      return json({ result: "INVALID", message: "event_id format invalid." });
    }

    // Resolve ticket + its event + its organizer in one round-trip
    const { data: ticket, error: tErr } = await supabase
      .from("event_tickets")
      .select(
        `id, event_id, tier_id, buyer_id, qr_token, scanned_at, scanned_by, created_at,
         event:events!inner(title, organizer_id),
         tier:event_tiers(name)`,
      )
      .eq("qr_token", qrToken)
      .maybeSingle();

    if (tErr) {
      console.error("[validate-event-ticket] lookup failed:", tErr);
      return json({ error: "Lookup failed." }, 500);
    }
    if (!ticket) {
      // Best-effort audit of the failed scan
      await supabase.rpc("audit_record", {
        p_action: "scan.invalid_token",
        p_target_kind: "event_ticket",
        p_target_id: null,
        p_meta: { reason: "not_found" },
        p_actor_id: user.id,
      });
      return json({ result: "INVALID", message: "Ticket not found." });
    }

    const ev = Array.isArray((ticket as { event: unknown }).event)
      ? (ticket as { event: { title: string; organizer_id: string }[] }).event[0]
      : (ticket as { event: { title: string; organizer_id: string } }).event;

    // Authorize: must be the event's organizer (via stripe_accounts.user_id) or admin
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
      return json({ result: "INVALID", message: "Not allowed to scan this event." }, 403);
    }

    // Event mismatch
    if (requestedEventId && requestedEventId !== ticket.event_id) {
      await supabase.rpc("audit_record", {
        p_action: "scan.wrong_event",
        p_target_kind: "event_ticket",
        p_target_id: ticket.id,
        p_meta: { expected: requestedEventId, actual: ticket.event_id },
        p_actor_id: user.id,
      });
      return json({ result: "WRONG_EVENT", message: "This ticket is for a different event." });
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
        message: `Ticket already scanned at ${new Date(ticket.scanned_at).toLocaleString("en-GB")}.`,
        ticket_info: { event_title: ev?.title, scanned_at: ticket.scanned_at },
      });
    }

    // Atomic accept: only flip scanned_at if it's still NULL
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from("event_tickets")
      .update({ scanned_at: now, scanned_by: user.id })
      .eq("id", ticket.id)
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

    return json({
      result: "VALID",
      message: "Welcome! Ticket validated.",
      ticket_info: {
        event_title: ev?.title,
        tier_name: Array.isArray(ticket.tier) ? ticket.tier[0]?.name : (ticket as { tier?: { name?: string } }).tier?.name,
        scanned_at: now,
      },
    });
  } catch (err) {
    console.error("[validate-event-ticket]", err);
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: "Scan failed.", details: msg }, 500);
  }
});
