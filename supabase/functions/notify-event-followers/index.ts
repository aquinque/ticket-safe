/**
 * notify-event-followers — Supabase Edge Function (Deno)
 *
 * POST { event_id }
 *
 * Fired by a DB trigger (via pg_net) when an event becomes published. Emails
 * every user who follows the event's organizer (public.organizer_follows),
 * then stamps events.followers_notified_at so it fires only once per event,
 * even if the organizer unpublishes/republishes.
 *
 * verify_jwt = false (server-to-server). Idempotent + only contacts opted-in
 * followers.
 */

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

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);

  let eventId: string;
  try {
    ({ event_id: eventId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: ev } = await supabase
    .from("events")
    .select("id, title, slug, date, location, status, organizer_id, followers_notified_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return json({ error: "Event not found" }, 404);
  if (ev.status !== "published") return json({ ok: true, skipped: "not published" });
  if (ev.followers_notified_at) return json({ ok: true, skipped: "already notified" });
  if (!ev.organizer_id) return json({ ok: true, skipped: "no organizer" });

  // Claim the notification atomically: only the first caller to flip the guard
  // proceeds, so concurrent trigger fires can't double-send.
  const { data: claimed } = await supabase
    .from("events")
    .update({ followers_notified_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("followers_notified_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return json({ ok: true, skipped: "already claimed" });

  const { data: org } = await supabase
    .from("organizer_profiles")
    .select("id, name")
    .eq("id", ev.organizer_id)
    .maybeSingle();
  const orgName = (org as { name?: string } | null)?.name ?? "An organizer you follow";

  const { data: follows } = await supabase
    .from("organizer_follows")
    .select("user_id")
    .eq("organizer_id", ev.organizer_id);
  if (!follows || follows.length === 0) return json({ ok: true, followers: 0 });

  const userIds = [...new Set(follows.map((f) => f.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const profileById = new Map(
    ((profiles as { id: string; email: string | null; full_name: string | null }[]) ?? []).map((p) => [p.id, p]),
  );

  const eventUrl = ev.slug ? `${siteUrl}/e/${ev.slug}` : `${siteUrl}/tickets`;
  const eventDate = ev.date
    ? new Date(ev.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
    : "";

  let sent = 0;
  for (const f of follows) {
    const profile = profileById.get(f.user_id);
    const email = profile?.email ?? null;
    if (!email || !resendKey) continue;
    const firstName = (profile?.full_name ?? email.split("@")[0]).split(/\s+/)[0];

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08)">
  <div style="background:linear-gradient(135deg,#003399,#0066cc);padding:28px 32px;color:#fff">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;opacity:.85;font-weight:700">Ticket Safe · New event</div>
    <h1 style="margin:8px 0 0;font-size:23px;font-weight:800">${esc(orgName)} just dropped a new event</h1>
  </div>
  <div style="padding:28px 32px;font-size:15px;line-height:1.6">
    <p style="margin:0 0 14px">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 14px"><strong>${esc(orgName)}</strong>, who you follow on Ticket Safe, just published <strong>${esc(ev.title)}</strong>. Get your ticket before it sells out.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr><td style="padding:6px 0;color:#64748b;width:40%">Event</td><td style="padding:6px 0;font-weight:600">${esc(ev.title)}</td></tr>
      ${eventDate ? `<tr><td style="padding:6px 0;color:#64748b">When</td><td style="padding:6px 0">${esc(eventDate)}</td></tr>` : ""}
      ${ev.location ? `<tr><td style="padding:6px 0;color:#64748b">Where</td><td style="padding:6px 0">${esc(ev.location)}</td></tr>` : ""}
    </table>
    <p style="margin:22px 0 8px;text-align:center"><a href="${eventUrl}" style="display:inline-block;background:linear-gradient(135deg,#003399,#0066cc);color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:800">Get tickets</a></p>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">You're receiving this because you follow ${esc(orgName)} on Ticket Safe.</p>
  </div>
</div></body></html>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [email],
          subject: `${orgName} just published ${ev.title}`,
          html,
        }),
      });
      if (res.ok) sent += 1;
      else console.error("[notify-event-followers] resend error:", res.status, await res.text());
    } catch (err) {
      console.error("[notify-event-followers] fetch failed:", err);
    }
  }

  return json({ ok: true, followers: follows.length, sent });
});
