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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "adrien.menard@edu.escp.eu";
const SITE_URL = "https://ticket-safe.eu";

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

function shell(preTitle: string, title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1e293b">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.08)">
<tr><td style="background:linear-gradient(135deg,#003399 0%,#0066cc 100%);padding:28px 32px 26px;color:#ffffff">
<div style="display:inline-block;background:rgba(255,255,255,0.18);padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">${esc(preTitle)}</div>
<h1 style="margin:14px 0 0;font-size:24px;line-height:1.2;font-weight:800">${esc(title)}</h1>
</td></tr>
<tr><td style="padding:30px 32px 12px;font-size:15px;line-height:1.6;color:#1e293b">${bodyHtml}</td></tr>
<tr><td style="padding:0 32px"><div style="height:1px;background:#e2e8f0"></div></td></tr>
<tr><td style="padding:20px 32px 24px;font-size:12px;color:#64748b;line-height:1.5">
<p style="margin:0"><strong style="color:#475569">Ticket Safe Studio</strong> · The ticket platform built for student events</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function ctaButton(label: string, href: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:linear-gradient(135deg,#003399,#0066cc);color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 4px 12px rgba(0,51,153,0.25)">${esc(label)}</a>`;
}

async function sendEmail(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ticket Safe <noreply@ticket-safe.eu>",
      to: [to],
      subject,
      html,
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
  let body: { kind?: string; organizer_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const kind = body.kind;
  const orgId = body.organizer_id;
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) return json({ error: "Invalid organizer_id" }, 400);
  if (kind !== "new_application" && kind !== "approved" && kind !== "rejected") {
    return json({ error: "Invalid kind" }, 400);
  }

  // Fetch organizer
  const { data: org, error: orgErr } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name, slug, org_type, contact_name, contact_email, website, about, status, rejection_reason, created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "Organizer not found" }, 404);

  // Authorization per kind
  if (kind === "new_application") {
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
      const subject = `New Studio application: ${org.name}`;
      const html = shell(
        "Studio · New application",
        `New application from ${esc(org.name)}`,
        `
          <p style="margin:0 0 14px">A new organizer just applied to Ticket Safe Studio. Review and approve in the admin queue.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0">
            <tr><td style="padding:6px 0;color:#64748b;width:40%">Organization</td><td style="padding:6px 0;font-weight:600">${esc(org.name)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Type</td><td style="padding:6px 0">${esc(org.org_type)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Slug</td><td style="padding:6px 0"><code>${esc(org.slug)}</code></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Contact</td><td style="padding:6px 0">${esc(org.contact_name)} — <a href="mailto:${esc(org.contact_email)}" style="color:#003399">${esc(org.contact_email)}</a></td></tr>
            ${org.website ? `<tr><td style="padding:6px 0;color:#64748b">Website</td><td style="padding:6px 0"><a href="${esc(org.website)}" style="color:#003399">${esc(org.website)}</a></td></tr>` : ""}
          </table>
          ${org.about ? `<p style="margin:16px 0 0;padding:14px 16px;background:#f5f7fb;border-radius:10px;color:#475569;font-size:13px;line-height:1.5">${esc(org.about)}</p>` : ""}
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Open admin queue", `${SITE_URL}/admin/organizers`)}</p>
        `,
      );
      const r = await sendEmail(resendKey, ADMIN_EMAIL, subject, html, org.contact_email);
      if (!r.ok) console.error("[organizer-notify] admin send failed:", r.status, r.body);
      return json({ ok: r.ok, kind, to: ADMIN_EMAIL });
    }

    if (kind === "approved") {
      const subject = `Welcome to Ticket Safe Studio, ${org.name}`;
      const html = shell(
        "Studio · Approved",
        `You are in. Welcome to Studio.`,
        `
          <p style="margin:0 0 14px">Hi ${esc(org.contact_name.split(" ")[0])},</p>
          <p style="margin:0 0 14px">Your application for <strong>${esc(org.name)}</strong> has been approved. You now have full access to Ticket Safe Studio.</p>
          <p style="margin:0 0 14px">Your one-time application is done — from now on you can create as many events as you want, with full branding, ticket tiers, real-time sales, and door scanning.</p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Open my Studio", `${SITE_URL}/studio`)}</p>
          <p style="margin:24px 0 6px;font-weight:700;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:0.08em">Quick start</p>
          <ol style="margin:0 0 0 18px;padding:0;font-size:14px;color:#475569;line-height:1.7">
            <li>Connect your bank via Stripe Connect (one-time, ~2 min).</li>
            <li>Create your first event with branding + ticket tiers.</li>
            <li>Publish your branded page at <code>${SITE_URL}/e/your-slug</code>.</li>
            <li>Track sales live in your dashboard.</li>
          </ol>
        `,
      );
      const r = await sendEmail(resendKey, org.contact_email, subject, html);
      if (!r.ok) console.error("[organizer-notify] approval send failed:", r.status, r.body);
      return json({ ok: r.ok, kind, to: org.contact_email });
    }

    // rejected
    const reason = body.reason || org.rejection_reason || "We unfortunately cannot approve your application at this time.";
    const subject = `Your Ticket Safe Studio application`;
    const html = shell(
      "Studio · Application reviewed",
      "About your Studio application",
      `
        <p style="margin:0 0 14px">Hi ${esc(org.contact_name.split(" ")[0])},</p>
        <p style="margin:0 0 14px">Thank you for applying to Ticket Safe Studio with <strong>${esc(org.name)}</strong>. After reviewing your application, our team is unable to approve it at this time.</p>
        <p style="margin:16px 0;padding:14px 16px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px;color:#7f1d1d;font-size:13px;line-height:1.5">${esc(reason)}</p>
        <p style="margin:14px 0">If you think this is a mistake or would like to provide more information, please contact us at <a href="mailto:ticketsafe.friendly@gmail.com" style="color:#003399">ticketsafe.friendly@gmail.com</a>.</p>
      `,
    );
    const r = await sendEmail(resendKey, org.contact_email, subject, html);
    if (!r.ok) console.error("[organizer-notify] rejection send failed:", r.status, r.body);
    return json({ ok: r.ok, kind, to: org.contact_email });
  } catch (err) {
    console.error("[organizer-notify] unexpected:", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
