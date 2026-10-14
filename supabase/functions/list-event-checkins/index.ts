/**
 * list-event-checkins — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/list-event-checkins
 * Auth — same dual path as validate-event-ticket:
 *   Authorization: Bearer <user-jwt>   (the event's organizer or a global admin)
 *   Body { staff_token }               (a door-staff link from event_scan_staff —
 *                                        event is server-determined, not client-supplied)
 * Body: { event_id?: string, staff_token?: string }
 *
 * Powers the live guest list on the door-scan screens (OrganizerScan.tsx,
 * ScanStaff.tsx): everyone holding a ticket, checked in or not, so a door
 * agent can find a name and check a guest in by hand when the QR is lost
 * (see manual-checkin). Polled every few seconds by the
 * client rather than pushed via Realtime — a staff-token caller has no
 * Supabase Auth session, so a postgres_changes subscription would hit the
 * exact same RLS wall a direct table read would; one plain endpoint that
 * both caller types can hit keeps this simple and correct for both.
 *
 * Returns only what a door agent needs to recheck a name — the full email
 * is never sent, only a hint ("a•••@edu.escp.eu") to tell two namesakes
 * apart. `checkins` (scanned only, newest first) is kept for older clients;
 * `guests` is the whole list, alphabetical.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { event_id?: string; staff_token?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  let eventId: string;
  const authHeader = req.headers.get("Authorization") ?? "";

  if (authHeader.startsWith("Bearer ")) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);
    if (!body.event_id || !/^[0-9a-f-]{36}$/i.test(body.event_id)) return json({ error: "Invalid event_id" }, 400);
    eventId = body.event_id;

    const { data: event } = await supabase.from("events").select("organizer_id").eq("id", eventId).maybeSingle();
    if (!event) return json({ error: "Event not found" }, 404);
    const { data: org } = await supabase.from("organizer_profiles").select("user_id").eq("id", event.organizer_id).maybeSingle();
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (org?.user_id !== user.id && !roleRow) return json({ error: "Forbidden — not your event" }, 403);
  } else {
    const staffToken = (body.staff_token ?? "").trim();
    if (!staffToken || staffToken.length < 16 || staffToken.length > 200) return json({ error: "Unauthorized" }, 401);
    const { data: staffRow } = await supabase
      .from("event_scan_staff")
      .select("event_id, revoked_at")
      .eq("token", staffToken)
      .maybeSingle();
    if (!staffRow || staffRow.revoked_at) return json({ error: "This scan link is invalid or has been revoked." }, 403);
    eventId = staffRow.event_id;
  }

  const { data: tickets } = await supabase
    .from("event_tickets")
    .select("id, holder_first_name, holder_last_name, holder_email, scanned_at, status, tier:event_tiers(name)")
    .eq("event_id", eventId);

  const rows = (tickets ?? []) as {
    id: string;
    holder_first_name: string | null;
    holder_last_name: string | null;
    holder_email: string | null;
    scanned_at: string | null;
    status: string;
    tier: { name: string } | { name: string }[] | null;
  }[];

  const emailHint = (email: string | null): string | null => {
    if (!email) return null;
    const at = email.indexOf("@");
    if (at < 1) return null;
    return `${email[0]}•••${email.slice(at)}`;
  };
  const nameOf = (t: typeof rows[number]) => [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ") || "Unnamed ticket";
  const tierOf = (t: typeof rows[number]) => { const tier = Array.isArray(t.tier) ? t.tier[0] : t.tier; return tier?.name ?? null; };

  // Everyone who can walk in: cancelled / refunded / transferred tickets are
  // not on the list at all (a transferred ticket has a new row for the buyer).
  const live = rows.filter((t) => t.status === "valid" || t.status === "scanned");

  const guests = live
    .map((t) => ({
      id: t.id,
      name: nameOf(t),
      tier_name: tierOf(t),
      email_hint: emailHint(t.holder_email),
      status: t.scanned_at ? "scanned" : "valid",
      scanned_at: t.scanned_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  const checkins = guests
    .filter((g) => g.scanned_at != null)
    .map(({ id, name, tier_name, scanned_at }) => ({ id, name, tier_name, scanned_at }))
    .sort((a, b) => new Date(b.scanned_at as string).getTime() - new Date(a.scanned_at as string).getTime());

  return json({ ok: true, guests, checkins, total_scanned: checkins.length, total_tickets: live.length });
});
