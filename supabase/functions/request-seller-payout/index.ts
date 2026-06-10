/**
 * request-seller-payout — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/request-seller-payout
 * Authorization: Bearer <user-jwt>
 * Body: { amount_cents, iban, iban_holder }
 *
 * Resale-seller equivalent of request-payout. The seller IS the caller —
 * we authenticate them via getUser(token) and use user.id as the seller_id.
 *
 * Fee model: 5% Ticket Safe fee deducted at withdrawal. Net wired to IBAN
 * within 2-3 business days via manual SEPA from Ticket Safe bank.
 *
 * (Full body deployed via MCP — kept here as the on-disk twin. See the
 *  deployed version for the polished email templates.)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SELLER_FEE_PERCENT = 5;
const PAYOUT_REVIEW_RECIPIENTS = ["achille.quinquenel@edu.escp.eu", "adrien.menard@edu.escp.eu", "ticketsafe.friendly@gmail.com"];
const SITE_URL = "https://ticket-safe.eu";

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function prettyIban(i: string): string { return i.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim(); }

async function sendEmail(key: string, to: string | string[], subject: string, html: string) {
  const recipients = Array.isArray(to) ? to : [to];
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: recipients, subject, html }),
  });
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  // Rate limit: cap payout requests per seller so the endpoint can't be used to
  // flood the admin SEPA queue. Fails open if the limiter is unreachable.
  try {
    const { data: rlOk } = await supabase.rpc("rate_limit_consume", {
      p_bucket: "seller_payout", p_key: user.id, p_max_hits: 6, p_window_sec: 300,
    });
    if (rlOk === false) return json({ error: "Too many payout requests. Please wait a few minutes." }, 429);
  } catch { /* fail open */ }

  let body: { amount_cents?: number; iban?: string; iban_holder?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const grossCents = Math.floor(Number(body.amount_cents ?? 0));
  const iban = (body.iban ?? "").replace(/\s+/g, "").toUpperCase();
  const ibanHolder = (body.iban_holder ?? "").trim();

  if (!Number.isInteger(grossCents) || grossCents < 100) return json({ error: "Amount must be at least €1.00" }, 400);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return json({ error: "Invalid IBAN format" }, 400);
  if (ibanHolder.length < 2 || ibanHolder.length > 120) return json({ error: "IBAN holder name is required" }, 400);

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const sellerName = profile?.full_name ?? user.email ?? "Unknown seller";
  const sellerEmail = profile?.email ?? user.email ?? null;

  const { data: earnings } = await supabase.from("seller_earnings").select("net_earned_cents, claimed_cents, available_cents").eq("seller_id", user.id).maybeSingle();
  const available = (earnings as { available_cents?: number } | null)?.available_cents ?? 0;
  if (grossCents > available) return json({ error: `Requested €${(grossCents / 100).toFixed(2)} but only €${(available / 100).toFixed(2)} is available right now.`, code: "INSUFFICIENT_BALANCE" }, 409);

  const feeCents = Math.round(grossCents * (SELLER_FEE_PERCENT / 100));
  const netCents = grossCents - feeCents;

  await supabase.from("profiles").update({
    payout_iban: iban,
    payout_iban_holder: ibanHolder,
    payout_iban_set_at: new Date().toISOString(),
  }).eq("id", user.id);

  const { data: payout, error: insertErr } = await supabase.from("seller_payouts").insert({
    seller_id: user.id,
    amount_cents: netCents,
    gross_cents: grossCents,
    fee_cents: feeCents,
    iban_used: iban,
    iban_holder_used: ibanHolder,
    status: "requested",
  }).select("id, requested_at").single();
  if (insertErr || !payout) return json({ error: insertErr?.message ?? "Could not record payout request." }, 500);

  const grossEur = `€${(grossCents / 100).toFixed(2)}`;
  const feeEur = `€${(feeCents / 100).toFixed(2)}`;
  const netEur = `€${(netCents / 100).toFixed(2)}`;
  const ibanPretty = prettyIban(iban);
  const requestedAt = new Date(payout.requested_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const ref = `TS-RS-${payout.id.slice(0, 8).toUpperCase()}`;

  if (resendKey) {
    const adminHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);padding:26px 30px;color:#fff"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.2em;font-weight:700;opacity:.88">Ticket Safe · Resale SEPA queue</div><h1 style="margin:8px 0 0;font-size:22px;font-weight:900">${netEur} to wire — ${esc(sellerName)}</h1></div><div style="padding:28px 30px;color:#1e293b"><p style="margin:0 0 14px;font-size:14px;line-height:1.55">Resale-seller withdrawal. Process the SEPA below — amount is already net of 5% seller fee.</p><table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0"><tr><td style="padding:8px 0;color:#64748b;width:42%">Gross requested</td><td style="padding:8px 0;font-weight:600">${grossEur}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Ticket Safe fee (5%)</td><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">−${feeEur}</td></tr><tr><td style="padding:8px 0;color:#0f172a;font-weight:800;border-top:2px solid #0f172a">Wire this</td><td style="padding:8px 0;font-weight:800;color:#2440b6;font-size:18px;border-top:2px solid #0f172a">${netEur}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Beneficiary</td><td style="padding:8px 0;font-weight:700;border-top:1px solid #e2e8f0">${esc(ibanHolder)}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">IBAN</td><td style="padding:8px 0;font-family:monospace;font-weight:700;border-top:1px solid #e2e8f0">${esc(ibanPretty)}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Reference</td><td style="padding:8px 0;font-family:monospace;border-top:1px solid #e2e8f0">${ref}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Seller</td><td style="padding:8px 0;border-top:1px solid #e2e8f0">${esc(sellerName)}<br><span style="font-size:12px;color:#94a3b8">${esc(sellerEmail ?? "")}</span></td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #e2e8f0">Requested at</td><td style="padding:8px 0;border-top:1px solid #e2e8f0">${esc(requestedAt)}</td></tr></table><p style="margin:18px 0 0;padding:14px 16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:8px;font-size:13px;line-height:1.55;color:#7c2d12">Use the reference <strong>${ref}</strong> as the SEPA label.</p></div></div></body></html>`;
    await sendEmail(resendKey, PAYOUT_REVIEW_RECIPIENTS, `[Ticket Safe · Resale] SEPA payout to send: ${netEur} — ${sellerName}`, adminHtml).catch((e) => console.warn("[request-seller-payout] admin email failed:", e));
  }

  if (resendKey && sellerEmail) {
    const last4 = iban.slice(-4);
    const orgFirstName = (sellerName ?? "").split(" ")[0] || "there";
    const sellerHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);padding:32px;color:#fff;text-align:center"><h1 style="margin:0;font-size:24px;font-weight:900">Hi ${esc(orgFirstName)},<br>${netEur} on its way to your IBAN</h1></div><div style="padding:26px 30px;color:#1e293b"><table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0"><tr><td style="padding:8px 0;color:#64748b">Gross withdrawal</td><td style="padding:8px 0;text-align:right">${grossEur}</td></tr><tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Ticket Safe fee (5%)</td><td style="padding:8px 0;text-align:right;color:#64748b;border-top:1px solid #f1f5f9">−${feeEur}</td></tr><tr><td style="padding:10px 0;color:#0f172a;font-weight:800;border-top:2px solid #0f172a">You will receive</td><td style="padding:10px 0;text-align:right;font-weight:800;color:#2440b6;font-size:18px;border-top:2px solid #0f172a">${netEur}</td></tr></table><p style="margin:14px 0;font-size:14px;line-height:1.55">SEPA will land on IBAN ending in <strong>···· ${last4}</strong> within 2-3 business days.</p><p style="margin:22px 0 8px;text-align:center"><a href="${SITE_URL}/settings/listings" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:800">Open my listings</a></p></div></div></body></html>`;
    await sendEmail(resendKey, sellerEmail, `Your ${netEur} payout is on the way`, sellerHtml).catch((e) => console.warn("[request-seller-payout] seller email failed:", e));
  }

  return json({ ok: true, payout_id: payout.id, gross_cents: grossCents, fee_cents: feeCents, net_cents: netCents });
});
