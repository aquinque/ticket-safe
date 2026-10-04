/**
 * organizer-notify — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/organizer-notify
 * Authorization: Bearer <user-jwt>
 * Body:
 *   { kind: "new_application", organizer_id }   — notifies admin team
 *   { kind: "approved", organizer_id }          — notifies organizer
 *   { kind: "rejected", organizer_id, reason }  — notifies organizer
 *
 * Auth model:
 *   new_application : caller must own the organizer_profile (user_id = auth.uid())
 *   approved        : caller must be an admin (user_roles.role = 'admin')
 *   rejected        : caller must be an admin
 *
 * All emails are sent via Resend with the Ticket Safe brand shell.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderEmail, ctaButton, ticketSummary, escapeHtml as esc } from "../_shared/emailComponents.ts";
import { emailTokens, legalFooter } from "../_shared/emailTokens.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// A new Studio application must land in the shared Ticket Safe inbox (the one
// the team actually monitors) AND ring on Achille's + Adrien's phones so they
// act immediately. The shared inbox is listed first so it's the primary
// recipient; set it as a VIP / enable high-priority notifications on the phone
// to get the urgent ring.
const STUDIO_APPLICATION_RECIPIENTS = [
  "ticketsafe.friendly@gmail.com",
  "achille.quinquenel@edu.escp.eu",
  "adrien.menard@edu.escp.eu",
];

const SITE_URL = emailTokens.siteUrl;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sendEmail(
  resendKey: string,
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  replyTo?: string,
  highPriority = false,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const recipients = Array.isArray(to) ? to : [to];
  // High-importance headers so Gmail / Apple Mail flag the message as urgent
  // (and, with the inbox set as a VIP, push a priority notification to the
  // phone). Standard RFC + Microsoft + Resend-friendly header set.
  const priorityHeaders = highPriority
    ? { "X-Priority": "1 (Highest)", "X-MSMail-Priority": "High", Importance: "high" }
    : undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ticket Safe <noreply@ticket-safe.eu>",
      to: recipients,
      subject,
      html,
      text,
      ...(priorityHeaders ? { headers: priorityHeaders } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured." }, 500);
  if (!resendKey) {
    console.error("[organizer-notify] RESEND_API_KEY missing — skipping send");
    return json({ ok: true, skipped: "no RESEND_API_KEY" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  // Body
  let body: { kind?: string; organizer_id?: string; reason?: string; event_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const kind = body.kind;
  const orgId = body.organizer_id;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: "Invalid organizer_id" }, 400);
  if (
    kind !== "new_application" &&
    kind !== "approved" &&
    kind !== "rejected" &&
    kind !== "event_published"
  ) {
    return json({ error: "Invalid kind" }, 400);
  }

  // Fetch organizer (including new application-meta columns)
  const { data: org, error: orgErr } = await supabase
    .from("organizer_profiles")
    .select(
      "id, user_id, name, slug, org_type, contact_name, contact_email, website, about, primary_color, first_event_name, first_event_date, expected_attendees, status, rejection_reason, created_at",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "Organizer not found" }, 404);

  // Authorization per kind
  if (kind === "new_application" || kind === "event_published") {
    if (org.user_id !== user.id) return json({ error: "Forbidden" }, 403);
  } else {
    // approved | rejected → must be admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);
  }

  // ── Build + send email ───────────────────────────────────────────────────
  try {
    if (kind === "new_application") {
      const subject = `[URGENT] New Studio application — ${org.name} — action needed`;
      const fmtDate = (iso: string | null) =>
        iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "—";
      const bodyHtml = `
        <p style="margin:0 0 4px">A new organizer just applied to Ticket Safe Studio. Review and decide in the admin queue.</p>
        ${ticketSummary([
          ["Organization", org.name],
          ["Type", org.org_type],
          ["Public slug", org.slug],
          ["Website", org.website ?? "—"],
          ["Contact name", org.contact_name],
          ["Contact email", org.contact_email],
          ...(org.first_event_name || org.first_event_date || org.expected_attendees
            ? ([
                ["First event", org.first_event_name ?? "—"],
                ["First event date", fmtDate(org.first_event_date)],
                ["Expected attendees", org.expected_attendees ? String(org.expected_attendees) : "—"],
              ] as [string, string][])
            : []),
          ["Submitted", fmtDate(org.created_at)],
        ])}
        ${org.about ? `<p style="margin:0 0 16px;font-size:13px;color:${emailTokens.textMuted};white-space:pre-line">${esc(org.about)}</p>` : ""}
        ${ctaButton("Review in admin queue", `${SITE_URL}/admin/organizers`)}
      `;
      const text = `New Studio application from ${org.name}.\n\nType: ${org.org_type}\nContact: ${org.contact_name} <${org.contact_email}>\nSubmitted: ${fmtDate(org.created_at)}\n\nReview: ${SITE_URL}/admin/organizers`;
      const { html } = renderEmail({
        eyebrow: "Studio · New application",
        title: `New application from ${org.name}`,
        bodyHtml,
        preheader: `${org.name} just applied to Ticket Safe Studio.`,
        text,
      });
      const r = await sendEmail(resendKey, STUDIO_APPLICATION_RECIPIENTS, subject, html, text, org.contact_email, true);
      if (!r.ok) console.error("[organizer-notify] admin send failed:", r.status, r.body);
      return json({ ok: r.ok, kind, to: STUDIO_APPLICATION_RECIPIENTS });
    }

    if (kind === "event_published") {
      const eventId = body.event_id;
      if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);
      const { data: ev } = await supabase
        .from("events")
        .select("id, title, slug, date, location, organizer_id")
        .eq("id", eventId)
        .maybeSingle();
      if (!ev || ev.organizer_id !== org.id) return json({ error: "Event not found" }, 404);

      const subject = `${ev.title} is live on Ticket Safe`;
      const eventDate = ev.date
        ? new Date(ev.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
        : "—";
      const publicUrl = ev.slug ? `${SITE_URL}/e/${ev.slug}` : `${SITE_URL}/studio`;
      const firstName = org.contact_name.split(" ")[0];
      const bodyHtml = `
        <p style="margin:0 0 4px">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 4px"><strong>${esc(ev.title)}</strong> is now live on Ticket Safe. Share your page with your community to start selling.</p>
        ${ticketSummary([
          ["Event", ev.title],
          ["Date", eventDate],
          ...(ev.location ? ([["Location", ev.location]] as [string, string][]) : []),
          ["Public page", publicUrl],
        ])}
        ${ctaButton("Share my event", publicUrl)}
        <p style="margin:24px 0 0;font-size:13px;color:${emailTokens.textMuted}">Sales appear in your dashboard in real time. Need help promoting it? Just reply to this email.</p>
      `;
      const text = `${ev.title} is now live on Ticket Safe.\n\nDate: ${eventDate}\nPublic page: ${publicUrl}`;
      const { html, text: plain } = renderEmail({
        eyebrow: "Studio · Event live",
        title: "Your event is live",
        bodyHtml,
        preheader: `${ev.title} is now live — share your page to start selling.`,
        text,
      });
      const r = await sendEmail(resendKey, org.contact_email, subject, html, plain);
      if (!r.ok) console.error("[organizer-notify] publish send failed:", r.status, r.body);
      return json({ ok: r.ok, kind, to: org.contact_email });
    }

    if (kind === "approved") {
      const subject = `Welcome to Ticket Safe Studio, ${org.name}`;
      const firstName = org.contact_name.split(" ")[0];
      const bodyHtml = `
        <p style="margin:0 0 4px">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 4px">Your application for <strong>${esc(org.name)}</strong> has been approved — you now have full access to Ticket Safe Studio.</p>
        <p style="margin:0 0 4px">From here you can create as many events as you want, with full branding, ticket tiers, real-time sales, and door scanning.</p>
        ${ctaButton("Open my Studio", `${SITE_URL}/studio`)}
        <p style="margin:26px 0 8px;font-family:${emailTokens.fontHeading};font-size:13px;font-weight:700;color:${emailTokens.textPrimary}">Quick start</p>
        <ol style="margin:0;padding:0 0 0 18px;font-size:14px;color:${emailTokens.textMuted};line-height:1.7">
          <li>Add your payout details (IBAN) in Studio settings.</li>
          <li>Create your first event with branding + ticket tiers.</li>
          <li>Publish your page at ${SITE_URL}/e/your-slug.</li>
          <li>Track sales live in your dashboard.</li>
        </ol>
      `;
      const text = `Your application for ${org.name} has been approved. Open your Studio: ${SITE_URL}/studio\n\nQuick start:\n1. Add your payout details (IBAN) in Studio settings.\n2. Create your first event with branding + ticket tiers.\n3. Publish your page.\n4. Track sales live in your dashboard.`;
      const { html, text: plain } = renderEmail({
        eyebrow: "Studio · Approved",
        title: "You're in — welcome to Studio",
        bodyHtml,
        preheader: `${org.name} is approved for Ticket Safe Studio.`,
        text,
      });
      const r = await sendEmail(resendKey, org.contact_email, subject, html, plain);
      if (!r.ok) console.error("[organizer-notify] approval send failed:", r.status, r.body);
      return json({ ok: r.ok, kind, to: org.contact_email });
    }

    // rejected
    const reason = body.reason || org.rejection_reason || "We unfortunately cannot approve your application at this time.";
    const subject = `Your Ticket Safe Studio application`;
    const firstName = org.contact_name.split(" ")[0];
    const bodyHtml = `
      <p style="margin:0 0 4px">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 4px">Thank you for applying to Ticket Safe Studio with <strong>${esc(org.name)}</strong>. After review, we're unable to approve it at this time.</p>
      <p style="margin:16px 0;padding:14px 18px;background:${emailTokens.bodyBg};border-left:3px solid ${emailTokens.danger};color:${emailTokens.textPrimary};font-size:13px;line-height:1.55">${esc(reason)}</p>
      <p style="margin:14px 0 0">If you think this is a mistake or want to provide more information, contact us at <a href="mailto:${legalFooter.supportEmail}" style="color:${emailTokens.accent}">${legalFooter.supportEmail}</a>.</p>
    `;
    const text = `Your Ticket Safe Studio application for ${org.name} was not approved.\n\nReason: ${reason}\n\nContact ${legalFooter.supportEmail} if you think this is a mistake.`;
    const { html, text: plain } = renderEmail({
      eyebrow: "Studio · Application reviewed",
      title: "About your Studio application",
      bodyHtml,
      preheader: "An update on your Ticket Safe Studio application.",
      text,
    });
    const r = await sendEmail(resendKey, org.contact_email, subject, html, plain);
    if (!r.ok) console.error("[organizer-notify] rejection send failed:", r.status, r.body);
    return json({ ok: r.ok, kind, to: org.contact_email });
  } catch (err) {
    console.error("[organizer-notify] unexpected:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
