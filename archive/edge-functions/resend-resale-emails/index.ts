// resend-resale-emails — admin tool: re-send the seller 'sold' + buyer 'ticket'
// emails for a given resale transaction. Guarded by REPLAY_ADMIN_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="max-width:540px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#003399,#0066cc);padding:26px 30px;color:#fff"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.2em;font-weight:700;opacity:.85">Ticket Safe</div><h1 style="margin:8px 0 0;font-size:22px;font-weight:900;line-height:1.25">${title}</h1></div><div style="padding:26px 30px;color:#1e293b;font-size:14px;line-height:1.6">${bodyHtml}</div></div></body></html>`;
}
async function sendEmail(key: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html }) });
  const txt = await res.text();
  return { status: res.status, ok: res.ok, body: txt.slice(0, 200) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminSecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";
  const body = await req.json().catch(() => ({})) as { transaction_id?: string; admin_secret?: string };
  if (body.admin_secret !== adminSecret) return json({ error: "forbidden" }, 403);
  if (!body.transaction_id) return json({ error: "missing transaction_id" }, 400);
  if (!resendKey) return json({ error: "RESEND_API_KEY missing" }, 500);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: tx } = await supabase.from("transactions").select("id, buyer_id, seller_id, ticket_id, status, amount, fee_amount").eq("id", body.transaction_id).maybeSingle();
  if (!tx) return json({ error: "transaction not found" }, 404);

  const { data: listing } = await supabase.from("tickets").select("file_url, studio_ticket_id, event:events(title, date, location)").eq("id", tx.ticket_id).maybeSingle();
  const ev = (listing as { event?: { title?: string; date?: string; location?: string } } | null)?.event ?? null;
  const eventTitle = ev?.title ?? "your event";
  const eventWhen = ev?.date ? new Date(ev.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "";
  const fileUrl = (listing as { file_url?: string | null } | null)?.file_url ?? null;
  const studioTransfer = !!(listing as { studio_ticket_id?: string | null } | null)?.studio_ticket_id;
  const netSeller = Number(tx.amount ?? 0) - Number(tx.fee_amount ?? 0);

  const [{ data: buyerAuth }, { data: sellerAuth }, { data: sellerProfile }, { data: buyerProfile }] = await Promise.all([
    supabase.auth.admin.getUserById(tx.buyer_id),
    supabase.auth.admin.getUserById(tx.seller_id),
    supabase.from("profiles").select("full_name").eq("id", tx.seller_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", tx.buyer_id).maybeSingle(),
  ]);
  const buyerEmail = buyerAuth?.user?.email ?? null;
  const sellerEmail = sellerAuth?.user?.email ?? null;
  const buyerName = ((buyerProfile as { full_name?: string } | null)?.full_name ?? buyerEmail?.split("@")[0] ?? "there").split(" ")[0];
  const sellerName = ((sellerProfile as { full_name?: string } | null)?.full_name ?? sellerEmail?.split("@")[0] ?? "there").split(" ")[0];

  const out: Record<string, unknown> = { transaction: tx.id, studio_transfer: studioTransfer, net_seller: netSeller, buyer_email: buyerEmail, seller_email: sellerEmail };

  if (sellerEmail) {
    const html = shell(`Your ticket sold!`, `<p>Hi ${esc(sellerName)},</p><p>Good news — your ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} has just been <strong>bought</strong> on Ticket Safe.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px 0;color:#64748b">Added to your wallet</td><td style="padding:8px 0;text-align:right;font-weight:800;color:#003399;font-size:18px">€${netSeller.toFixed(2)}</td></tr></table><p style="font-size:13px;color:#64748b">The amount is in your wallet, ready to withdraw to your IBAN (a 5% Ticket Safe fee applies at withdrawal).</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/settings/listings" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open my wallet</a></p>`);
    out.seller_send = await sendEmail(resendKey, sellerEmail, `Your ticket for ${eventTitle} sold — €${netSeller.toFixed(2)} added`, html);
  }
  if (buyerEmail) {
    const ticketBlock = studioTransfer
      ? `<p>Your ticket is now in your name. Open <strong>My Tickets</strong> to show the QR at the door.</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open My Tickets</a></p>`
      : fileUrl
        ? `<p>Here is your ticket file from the seller:</p><p style="margin:18px 0;text-align:center"><a href="${esc(fileUrl)}" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Download my ticket</a></p><p style="font-size:13px;color:#64748b">It's also in <strong>My Tickets</strong> on Ticket Safe.</p>`
        : `<p>Your ticket is in <strong>My Tickets</strong> on Ticket Safe.</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open My Tickets</a></p>`;
    const html = shell(`Your ticket is confirmed!`, `<p>Hi ${esc(buyerName)},</p><p>Your purchase of a ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} is confirmed.</p>${ticketBlock}`);
    out.buyer_send = await sendEmail(resendKey, buyerEmail, `Your ticket for ${eventTitle} is confirmed`, html);
  }
  return json({ ok: true, ...out }, 200);
});
