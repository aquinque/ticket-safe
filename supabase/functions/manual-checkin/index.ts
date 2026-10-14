/**
 * manual-checkin — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/manual-checkin
 * Auth — same dual path as validate-event-ticket:
 *   Authorization: Bearer <user-jwt>   (the event's organizer or a global admin)
 *   Body { staff_token }               (a door-staff link from event_scan_staff —
 *                                        the event is server-determined)
 * Body: { ticket_id: string, undo?: boolean, event_id?: string, staff_token?: string }
 *
 * Checks a guest in from the guest list, without a QR: the person lost
 * their ticket, their phone died, the mail never arrived. Same end state
 * as a scan (scanned_at / scanned_by / status = scanned), same guards
 * (cancelled event, refunded order, already in), same atomic flip, and an
 * audit row that says it was manual and which door-staff link did it.
 *
 * `undo: true` reverses a check-in (mis-tap on the wrong name). Also
 * audited. Only the organizer, an admin, or a staff link for that event
 * can do either.
 *
 * Returns { ok, result: "CHECKED_IN" | "UNDONE" | "ALREADY_IN" | "NOT_IN" | "REVOKED",
 *           message, guest: { id, name, tier_name, status, scanned_at } }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface TicketRow {
  id: string;
  event_id: string;
  tier_id: string | null;
  order_id: string | null;
  scanned_at: string | null;
  status: string;
  holder_first_name: string | null;
  holder_last_name: string | null;
  event: { title: string; status: string; organizer_id: string } | { title: string; status: string; organizer_id: string }[] | null;
  tier: { name: string } | { name: string }[] | null;
  order: { status: string } | { status: string }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Server misconfigured." }, 500);
    const supabase = createClient(url, key);

    let body: { ticket_id?: string; undo?: boolean; event_id?: string; staff_token?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    // ── Auth: organizer/admin session, or a door-staff link ──
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
      if (!staffToken || staffToken.length < 16 || staffToken.length > 200) return json({ error: "Unauthorized" }, 401);
      const { data: staffRow } = await supabase
        .from("event_scan_staff")
        .select("id, event_id, organizer_id, label, revoked_at")
        .eq("token", staffToken)
        .maybeSingle();
      if (!staffRow || staffRow.revoked_at) return json({ result: "FORBIDDEN", message: "This scan link is invalid or has been revoked." }, 403);
      const { data: staffOrg } = await supabase.from("organizer_profiles").select("user_id").eq("id", staffRow.organizer_id).maybeSingle();
      if (!staffOrg?.user_id) return json({ error: "Server error resolving scan link." }, 500);
      actorUserId = staffOrg.user_id;
      staffLabel = staffRow.label;
      staffLockedEventId = staffRow.event_id;
      rateLimitKey = `staff:${staffRow.id}`;
      supabase.from("event_scan_staff").update({ last_used_at: new Date().toISOString() }).eq("id", staffRow.id)
        .then(({ error: e }) => { if (e) console.warn("[manual-checkin] staff usage update failed:", e); });
    }

    const { data: allowed } = await supabase.rpc("rate_limit_consume", {
      p_bucket: "manual_checkin", p_key: rateLimitKey, p_max_hits: 5, p_window_sec: 1,
    });
    if (allowed === false) return json({ result: "RATE_LIMITED", message: "Too fast, try again." }, 429);

    const ticketId = (body.ticket_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return json({ error: "Invalid ticket_id" }, 400);
    const undo = body.undo === true;

    const { data: ticketRaw, error: tErr } = await supabase
      .from("event_tickets")
      .select(`id, event_id, tier_id, order_id, scanned_at, status, holder_first_name, holder_last_name,
               event:events!inner(title, status, organizer_id), tier:event_tiers(name), order:event_orders(status)`)
      .eq("id", ticketId)
      .maybeSingle();
    if (tErr) { console.error("[manual-checkin] lookup failed:", tErr); return json({ error: "Lookup failed." }, 500); }
    if (!ticketRaw) return json({ result: "NOT_FOUND", message: "This ticket doesn't exist." }, 404);
    const ticket = ticketRaw as unknown as TicketRow;
    const ev = one(ticket.event);
    const tier = one(ticket.tier);
    const ord = one(ticket.order);

    // ── Authorize against the ticket's own event ──
    if (staffLockedEventId) {
      if (staffLockedEventId !== ticket.event_id) return json({ result: "FORBIDDEN", message: "This guest is not on this event's list." }, 403);
    } else {
      if (body.event_id && body.event_id !== ticket.event_id) return json({ result: "FORBIDDEN", message: "This guest is not on this event's list." }, 403);
      const { data: org } = await supabase.from("organizer_profiles").select("user_id").eq("id", ev?.organizer_id).maybeSingle();
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", actorUserId).eq("role", "admin").maybeSingle();
      if (org?.user_id !== actorUserId && !roleRow) return json({ result: "FORBIDDEN", message: "You are not allowed to check guests in for this event." }, 403);
    }

    const name = [ticket.holder_first_name, ticket.holder_last_name].filter(Boolean).join(" ") || "Unnamed ticket";
    const guest = (status: string, scannedAt: string | null) => ({ id: ticket.id, name, tier_name: tier?.name ?? null, status, scanned_at: scannedAt });
    const auditMeta = { event_id: ticket.event_id, tier_id: ticket.tier_id, staff_label: staffLabel, manual: true };

    if (ev?.status === "cancelled" || ord?.status === "refunded" || ["cancelled", "refunded", "transferred"].includes(ticket.status)) {
      return json({ ok: false, result: "REVOKED", message: "This ticket is no longer valid (cancelled, refunded or transferred).", guest: guest(ticket.status, ticket.scanned_at) });
    }

    const now = new Date().toISOString();

    if (undo) {
      const { data: updated } = await supabase
        .from("event_tickets")
        .update({ scanned_at: null, scanned_by: null, status: "valid" })
        .eq("id", ticket.id)
        .eq("status", "scanned")
        .select("id")
        .maybeSingle();
      if (!updated) return json({ ok: false, result: "NOT_IN", message: `${name} wasn't checked in.`, guest: guest(ticket.status, ticket.scanned_at) });
      await supabase.rpc("audit_record", {
        p_action: "scan.manual_undo", p_target_kind: "event_ticket", p_target_id: ticket.id,
        p_meta: { ...auditMeta, previous_scanned_at: ticket.scanned_at }, p_actor_id: actorUserId,
      });
      return json({ ok: true, result: "UNDONE", message: `${name} is no longer checked in.`, guest: guest("valid", null) });
    }

    const { data: updated } = await supabase
      .from("event_tickets")
      .update({ scanned_at: now, scanned_by: actorUserId, status: "scanned" })
      .eq("id", ticket.id)
      .eq("status", "valid")
      .is("scanned_at", null)
      .select("id")
      .maybeSingle();
    if (!updated) {
      const { data: re } = await supabase.from("event_tickets").select("status, scanned_at").eq("id", ticket.id).maybeSingle();
      return json({ ok: false, result: "ALREADY_IN", message: `${name} is already checked in.`, guest: guest(re?.status ?? "scanned", re?.scanned_at ?? ticket.scanned_at) });
    }
    await supabase.rpc("audit_record", {
      p_action: "scan.manual_checkin", p_target_kind: "event_ticket", p_target_id: ticket.id,
      p_meta: auditMeta, p_actor_id: actorUserId,
    });
    return json({ ok: true, result: "CHECKED_IN", message: `${name} checked in.`, guest: guest("scanned", now) });
  } catch (err) {
    console.error("[manual-checkin]", err);
    return json({ error: "Check-in failed.", details: err instanceof Error ? err.message : String(err) }, 500);
  }
});
