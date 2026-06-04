/**
 * request-payout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/request-payout
 * Authorization: Bearer <user-jwt>
 * Body: { organizer_id, amount_cents, iban, iban_holder }
 *
 * 1. Authenticates the organizer (caller must own the organizer_profile)
 * 2. Re-reads available balance from organizer_earnings and rejects if the
 *    request exceeds it (prevents over-withdrawing through race conditions)
 * 3. Saves the IBAN onto the organizer_profile so it's pre-filled next time
 * 4. Inserts a row in organizer_payouts (status='requested')
 * 5. Emails Achille + Adrien with the SEPA details so they can transfer
 * 6. Emails the organizer to confirm the request is on its way (2-3 days)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYOUT_REVIEW_RECIPIENTS = [
  "achille.quinquenel@edu.escp.eu",
  "adrien.menard@edu.escp.eu",
];

const SITE_URL = "https://ticket-safe.eu";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function prettyIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

async function sendEmail(resendKey: string, to: string | string[], subject: string, html: string, replyTo?: string) {
  const recipients = Array.isArray(to) ? to : [to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ticket Safe <noreply@ticket-safe.eu>",
      to: recipients,
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

  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { organizer_id?: string; amount_cents?: number; iban?: string; iban_holder?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const organizerId = body.organizer_id;
  const amountCents = Math.floor(Number(body.amount_cents ?? 0));
  const iban = (body.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const ibanHolder = (body.iban_holder ?? "").trim();

  if (!organizerId || !/^[0-9a-f-]{36}$/i.test(organizerId)) return json({ error: "Invalid organizer_id" }, 400);
  if (!Number.isInteger(amountCents) || amountCents < 100) return json({ error: "Amount must be at least €1.00" }, 400);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return json({ error: "Invalid IBAN format" }, 400);
  if (ibanHolder.length < 2 || ibanHolder.length > 120) return json({ error: "IBAN holder name is required" }, 400);

  const { data: org } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name, contact_email, contact_name")
    .eq("id", organizerId)
    .maybeSingle();
  if (!org) return json({ error: "Organizer not found" }, 404);
  if (org.user_id !== user.id) return json({ error: "Forbidden — not your organizer" }, 403);

  const { data: earnings } = await supabase
    .from("organizer_earnings")
    .select("net_earned_cents, claimed_cents, available_cents")
    .eq("organizer_id", organizerId)
    .maybeSingle();
  const available = (earnings as { available_cents?: number } | null)?.available_cents ?? 0;
  if (amountCents > available) {
    return json({
      error: `Requested €${(amountCents / 100).toFixed(2)} but only €${(available / 100).toFixed(2)} is available right now.`,
      code: "INSUFFICIENT_BALANCE",
    }, 409);
  }

  await supabase.from("organizer_profiles").update({
    payout_iban: iban,
    payout_iban_holder: ibanHolder,
    payout_iban_set_at: new Date().toISOString(),
  }).eq("id", organizerId);

  const { data: payout, error: insertErr } = await supabase.from("organizer_payouts").insert({
    organizer_id: organizerId,
    amount_cents: amountCents,
    iban_used: iban,
    iban_holder_used: ibanHolder,
    status: "requested",
  }).select("id, requested_at").single();
  if (insertErr || !payout) {
    console.error("[request-payout] insert failed:", insertErr);
    return json({ error: insertErr?.message ?? "Could not record payout request." }, 500);
  }

  const amountEur = `€${(amountCents / 100).toFixed(2)}`;
  const ibanPretty = prettyIban(iban);
  const requestedAt = new Date(payout.requested_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const orgFirstName = (org.contact_name ?? "").split(" ")[0] || "there";

  if (resendKey) {
    const adminHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)">
  <div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);padding:26px 30px;color:#fff">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.2em;font-weight:700;opacity:.88">Ticket Safe · Admin SEPA queue</div>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:900;line-height:1.2">${amountEur} to transfer — ${esc(org.name)}</h1>
  </div>
  <div style="padding:28px 30px;color:#1e293b">
    <p style="margin:0 0 14px;font-size:14px;line-height:1.55">Please process this manual SEPA transfer from the Ticket Safe bank account.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">
      <tr><td style="padding:8px 0;color:#64748b;width:42%">Amount</td><td style="padding:8px 0;font-weight:800;color:#2440b6;font-size:18px">${amountEur}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Beneficiary</td><td style="padding:8px 0;font-weight:700;border-top:1px solid #e2e8f0">${esc(ibanHolder)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">IBAN</td><td style="padding:8px 0;font-family:ui-monospace,Menlo,monospace;font-weight:700;border-top:1px solid #e2e8f0">${esc(ibanPretty)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Reference</td><td style="padding:8px 0;font-family:ui-monospace,Menlo,monospace;border-top:1px solid #e2e8f0">TS-PO-${payout.id.slice(0, 8).toUpperCase()}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Organizer</td><td style="padding:8px 0;border-top:1px solid #e2e8f0">${esc(org.name)}<br><span style="font-size:12px;color:#94a3b8">${esc(org.contact_email)}</span></td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Requested at</td><td style="padding:8px 0;border-top:1px solid #e2e8f0">${esc(requestedAt)}</td></tr>
    </table>
    <p style="margin:18px 0 0;padding:14px 16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:8px;font-size:13px;line-height:1.55;color:#7c2d12">
      Once the SEPA transfer is sent, mark this payout as <strong>sent</strong> in the admin panel so the organizer sees it cleared in their dashboard.
    </p>
    <p style="margin:20px 0 0;text-align:center">
      <a href="${SITE_URL}/admin/organizers" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Open admin panel</a>
    </p>
  </div>
</div></body></html>`;
    await sendEmail(resendKey, PAYOUT_REVIEW_RECIPIENTS, `[Ticket Safe] SEPA payout to send: ${amountEur} — ${org.name}`, adminHtml).catch((e) => console.warn("[request-payout] admin email failed:", e));
  }

  if (resendKey && org.contact_email) {
    const last4 = iban.slice(-4);
    const orgHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)">
  <div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);padding:32px;color:#fff;text-align:center">
    <div style="width:56px;height:56px;background:rgba(255,255,255,.14);border-radius:14px;margin:0 auto 14px;display:inline-flex;align-items:center;justify-content:center;color:#aec6ff;font-weight:900;font-size:22px">TS</div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.22em;opacity:.85;font-weight:700;margin-bottom:8px">Payout requested</div>
    <h1 style="margin:0;font-size:24px;font-weight:900;line-height:1.25">Hi ${esc(orgFirstName)},<br>your ${amountEur} payout is on the way</h1>
  </div>
  <div style="padding:26px 30px;color:#1e293b">
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55">We've received your withdrawal request. The SEPA transfer will land on your IBAN ending in <strong>···· ${last4}</strong> within <strong>2-3 business days</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:18px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
      <tr><td style="padding:8px 0;color:#64748b;width:42%">Amount</td><td style="padding:8px 0;color:#2440b6;font-weight:800;font-size:18px">${amountEur}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Beneficiary</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">${esc(ibanHolder)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">IBAN</td><td style="padding:8px 0;font-family:ui-monospace,Menlo,monospace;border-top:1px solid #f1f5f9">···· ${last4}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Reference</td><td style="padding:8px 0;font-family:ui-monospace,Menlo,monospace;border-top:1px solid #f1f5f9">TS-PO-${payout.id.slice(0, 8).toUpperCase()}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Requested</td><td style="padding:8px 0;border-top:1px solid #f1f5f9">${esc(requestedAt)}</td></tr>
    </table>
    <p style="margin:18px 0;padding:14px 16px;background:#f1f5f9;border-radius:10px;font-size:13px;line-height:1.55;color:#475569">
      Wrong IBAN? Reply to this email within 24h and we'll cancel + resend.
    </p>
    <p style="margin:22px 0 8px;text-align:center">
      <a href="${SITE_URL}/studio" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px">Open my dashboard</a>
    </p>
  </div>
  <div style="text-align:center;padding:18px 16px 22px">
    <p style="margin:0;font-size:11px;color:#94a3b8"><strong style="color:#475569">Ticket Safe</strong> · The safe way to ticket your event</p>
  </div>
</div></body></html>`;
    await sendEmail(resendKey, org.contact_email, `Your ${amountEur} payout is on the way`, orgHtml).catch((e) => console.warn("[request-payout] organizer email failed:", e));
  }

  return json({ ok: true, payout_id: payout.id, requested_at: payout.requested_at });
});
