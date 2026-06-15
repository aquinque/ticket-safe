/**
 * revolut-webhook — finalizes a paid Revolut order. Studio (event_orders) and
 * Resale (transactions). Re-verifies via Revolut API. Idempotent. Sends emails.
 *
 * Bug A fix (resale buyer PDF): when a Studio ticket is successfully
 * transferred to a resale buyer, send the SAME premium email the primary
 * Studio buyer receives (navy header/footer HTML + ticket.pdf +
 * order-summary.pdf), via the shared sendTicketConfirmationEmail orchestrator.
 *
 * Legacy non-Studio resale (uploaded file_url, no studio_ticket_id) keeps the
 * existing lightweight email with the seller's file link.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTicketConfirmationEmail } from "../_shared/sendTicketConfirmationEmail.ts";
import { generateTicketsPDFServer, type ServerTicketData } from "../_shared/ticketPdfServer.ts";
import type { OrderSummaryData } from "../_shared/orderSummaryPdf.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }
function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string { let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function signStudioTicketJWT(p: { ticket_id: string; event_id: string; exp_seconds: number }): Promise<string | null> {
  const secret = Deno.env.get("TICKET_SIGNING_SECRET"); if (!secret) return null;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: "ticket-safe.eu/studio", sub: p.ticket_id, evt: p.event_id, iat: Math.floor(Date.now() / 1000), exp: p.exp_seconds };
  const data = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}
async function sendEmail(key: string, to: string, subject: string, html: string) {
  try { await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html }) }); }
  catch (e) { console.warn("[revolut-webhook] email failed:", e); }
}
function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="max-width:540px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.08)"><div style="background:linear-gradient(135deg,#003399,#0066cc);padding:26px 30px;color:#fff"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.2em;font-weight:700;opacity:.85">Ticket Safe</div><h1 style="margin:8px 0 0;font-size:22px;font-weight:900;line-height:1.25">${title}</h1></div><div style="padding:26px 30px;color:#1e293b;font-size:14px;line-height:1.6">${bodyHtml}</div></div></body></html>`;
}

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const revolutSecret = Deno.env.get("REVOLUT_MERCHANT_SECRET_KEY");
  const revolutBase = (Deno.env.get("REVOLUT_MERCHANT_BASE") ?? "https://merchant.revolut.com/api").replace(/\/+$/, "");
  const revolutApiVersion = Deno.env.get("REVOLUT_API_VERSION") ?? "2024-09-01";
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
  const revOrderId = (payload.order_id ?? (payload.data as { id?: string } | undefined)?.id ?? payload.id) as string | undefined;
  if (!revOrderId) return json({ ok: true, skipped: "no order id" }, 200);
  if (!revolutSecret) return json({ ok: false, error: "REVOLUT_MERCHANT_SECRET_KEY missing" }, 500);

  let revState = "";
  try {
    const r = await fetch(`${revolutBase}/orders/${revOrderId}`, { headers: { "Authorization": `Bearer ${revolutSecret}`, "Revolut-Api-Version": revolutApiVersion, "Accept": "application/json" } });
    if (!r.ok) { console.warn("[revolut-webhook] lookup non-2xx", r.status); return json({ ok: true, note: "lookup failed, will retry" }, 200); }
    revState = String((await r.json()).state ?? "");
  } catch (e) { console.error("[revolut-webhook] lookup error", e); return json({ ok: true, note: "lookup error" }, 200); }
  if (revState !== "completed") return json({ ok: true, state: revState }, 200);

  const matchKey = `revolut:${revOrderId}`;

  // ===== STUDIO primary sale =====
  const { data: ord } = await supabase.from("event_orders").select("id, buyer_id, buyer_email, event_id, tier_id, quantity, attendees, status").eq("stripe_checkout_session_id", matchKey).maybeSingle();
  if (ord) {
    if (ord.status === "paid") return json({ ok: true, already_paid: true }, 200);
    const { data: upd } = await supabase.from("event_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", ord.id).eq("status", "pending").select("id");
    if (!upd || upd.length === 0) return json({ ok: true, already_handled: true }, 200);
    await supabase.rpc("finalize_tier_sale", { p_tier_id: ord.tier_id, p_qty: ord.quantity });
    const { data: evForExp } = await supabase.from("events").select("date").eq("id", ord.event_id).maybeSingle();
    const expSeconds = evForExp?.date ? Math.floor(new Date(evForExp.date).getTime() / 1000) + 86_400 : Math.floor(Date.now() / 1000) + 30 * 86_400;
    const attendees = Array.isArray((ord as { attendees?: unknown }).attendees) ? (ord as { attendees: { first_name?: string; last_name?: string; email?: string }[] }).attendees : [];
    const qty = ord.quantity ?? 1;
    const ticketRows = await Promise.all(Array.from({ length: qty }).map(async (_, i) => {
      const att = attendees[i] ?? null; const ticketId = crypto.randomUUID();
      const signed = await signStudioTicketJWT({ ticket_id: ticketId, event_id: ord.event_id, exp_seconds: expSeconds });
      const qrToken = signed ?? (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8));
      return { id: ticketId, order_id: ord.id, event_id: ord.event_id, tier_id: ord.tier_id, buyer_id: ord.buyer_id, qr_token: qrToken, holder_first_name: att?.first_name ?? null, holder_last_name: att?.last_name ?? null, holder_email: att?.email ?? ord.buyer_email ?? null, status: "valid" as const };
    }));
    const { error: tixErr } = await supabase.from("event_tickets").insert(ticketRows);
    if (tixErr) console.error("[revolut-webhook] event_tickets insert failed:", tixErr);
    try { await fetch(`${supabaseUrl}/functions/v1/replay-order-email`, { method: "POST", headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }, body: JSON.stringify({ order_id: ord.id, admin_secret: replaySecret }) }); } catch (e) { console.warn("[revolut-webhook] studio email failed:", e); }
    return json({ ok: true, studio: true, issued: ticketRows.length, order_id: ord.id }, 200);
  }

  // ===== RESALE =====
  const { data: tx } = await supabase.from("transactions").select("id, buyer_id, seller_id, ticket_id, status, amount, fee_amount").eq("stripe_checkout_session_id", matchKey).maybeSingle();
  if (!tx) return json({ ok: true, skipped: "no matching order/transaction" }, 200);
  if (tx.status === "completed") return json({ ok: true, already: true }, 200);
  const { data: txu } = await supabase.from("transactions").update({ status: "completed" }).eq("id", tx.id).eq("status", "pending").select("id");
  if (!txu || txu.length === 0) return json({ ok: true, already_handled: true }, 200);

  await supabase.from("tickets").update({ status: "sold", buyer_id: tx.buyer_id }).eq("id", tx.ticket_id).in("status", ["available", "reserved"]);

  // Studio transfer + capture details for the premium email path. We only
  // promote a resale into the PDF pipeline when the INSERT of the new
  // event_tickets row actually succeeded — otherwise the buyer would get a
  // pretty PDF with a QR token that doesn't exist in the database.
  let resaleXfer: {
    newTicketId: string;
    newQrToken: string;
    eventId: string;
    tierId: string;
    orderId: string;
    buyerFirstName: string;
    buyerLastName: string;
    buyerEmailHolder: string | null;
  } | null = null;

  try {
    const { data: xferListing } = await supabase.from("tickets").select("studio_ticket_id").eq("id", tx.ticket_id).maybeSingle();
    const studioTicketId = (xferListing as { studio_ticket_id?: string | null } | null)?.studio_ticket_id ?? null;
    if (studioTicketId && tx.buyer_id) {
      const { data: oldTicket } = await supabase.from("event_tickets").select("id, event_id, tier_id, order_id, status").eq("id", studioTicketId).maybeSingle();
      if (oldTicket && oldTicket.status !== "transferred" && oldTicket.status !== "scanned") {
        await supabase.from("event_tickets").update({ status: "transferred" }).eq("id", oldTicket.id);
        const { data: buyerForXfer } = await supabase.from("profiles").select("full_name, email").eq("id", tx.buyer_id).maybeSingle();
        const { data: evForExp } = await supabase.from("events").select("date").eq("id", oldTicket.event_id).maybeSingle();
        const expSeconds = evForExp?.date ? Math.floor(new Date(evForExp.date).getTime() / 1000) + 86_400 : Math.floor(Date.now() / 1000) + 30 * 86_400;
        const newTicketId = crypto.randomUUID();
        const signed = await signStudioTicketJWT({ ticket_id: newTicketId, event_id: oldTicket.event_id, exp_seconds: expSeconds });
        const newQr = signed ?? crypto.randomUUID().replace(/-/g, "");
        const fullName = ((buyerForXfer as { full_name?: string } | null)?.full_name ?? "").trim();
        const parts = fullName.split(/\s+/).filter(Boolean);
        const buyerFirstName = parts[0] ?? "";
        const buyerLastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
        const buyerEmailHolder = (buyerForXfer as { email?: string } | null)?.email ?? null;
        const { error: insertErr } = await supabase.from("event_tickets").insert({
          id: newTicketId,
          order_id: oldTicket.order_id,
          event_id: oldTicket.event_id,
          tier_id: oldTicket.tier_id,
          buyer_id: tx.buyer_id,
          qr_token: newQr,
          holder_first_name: buyerFirstName || null,
          holder_last_name: buyerLastName || null,
          holder_email: buyerEmailHolder,
          status: "valid",
        });
        if (insertErr) {
          console.error("[revolut-webhook] resale event_tickets INSERT failed; falling back to legacy email:", insertErr);
        } else {
          resaleXfer = {
            newTicketId,
            newQrToken: newQr,
            eventId: oldTicket.event_id,
            tierId: oldTicket.tier_id,
            orderId: oldTicket.order_id,
            buyerFirstName,
            buyerLastName,
            buyerEmailHolder,
          };
        }
      }
    }
  } catch (err) { console.error("[revolut-webhook] resale transfer failed:", err); }

  // ===== Resale emails: seller 'sold' + buyer 'your ticket' =====
  try {
    const { data: listing } = await supabase.from("tickets").select("file_url, selling_price, event:events(title, date, location)").eq("id", tx.ticket_id).maybeSingle();
    const ev = (listing as { event?: { title?: string; date?: string; location?: string } } | null)?.event ?? null;
    const eventTitle = ev?.title ?? "your event";
    const eventWhen = ev?.date ? new Date(ev.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "";
    const fileUrl = (listing as { file_url?: string | null } | null)?.file_url ?? null;
    const netSeller = (Number(tx.amount ?? 0) - Number(tx.fee_amount ?? 0));
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

    // Seller "your ticket sold" — unchanged behaviour
    if (resendKey && sellerEmail) {
      const html = shell(`Your ticket sold!`, `<p>Hi ${esc(sellerName)},</p><p>Good news — your ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} has just been <strong>bought</strong> on Ticket Safe.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px 0;color:#64748b">Added to your wallet</td><td style="padding:8px 0;text-align:right;font-weight:800;color:#003399;font-size:18px">€${netSeller.toFixed(2)}</td></tr></table><p style="font-size:13px;color:#64748b">The amount is in your wallet, ready to withdraw to your IBAN (a 5% Ticket Safe fee applies at withdrawal).</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/settings/listings" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open my wallet</a></p>`);
      await sendEmail(resendKey, sellerEmail, `Your ticket for ${eventTitle} sold — €${netSeller.toFixed(2)} added`, html);
    }

    // Buyer
    if (resendKey && buyerEmail) {
      // premiumOk tracks whether the premium PDF email actually shipped.
      // If we tried the premium path and it failed at any step (PDF generation,
      // Resend), we fall through to the legacy lightweight email so the buyer
      // is never left without a confirmation.
      let premiumOk = false;
      if (resaleXfer) {
        // ===== Bug A fix: premium email + ticket.pdf + order-summary.pdf =====
        const xfer = resaleXfer; // capture for closure narrowing
        try {
          const { data: eventFull } = await supabase
            .from("events")
            .select("id, title, date, location, organizer_id")
            .eq("id", xfer.eventId)
            .maybeSingle();
          const [{ data: tier }, { data: organizer }] = await Promise.all([
            supabase.from("event_tiers").select("name, price_cents").eq("id", xfer.tierId).maybeSingle(),
            eventFull?.organizer_id
              ? supabase.from("organizer_profiles").select("name").eq("id", eventFull.organizer_id).maybeSingle()
              : Promise.resolve({ data: null as { name?: string } | null }),
          ]);

          const buyerFirst = xfer.buyerFirstName || buyerName;
          const buyerLast = xfer.buyerLastName || "";
          const ticketTypeName = (tier as { name?: string } | null)?.name ?? "Resale";
          // tx.amount is stored in euros (decimal) — keep consistent with the
          // existing seller netSeller calc above which does .toFixed(2) directly.
          const pricePaidEuro = `${Number(tx.amount ?? 0).toFixed(2)}€`;

          const eventTitleRich = (eventFull as { title?: string } | null)?.title ?? eventTitle;
          const eventDateRich = (eventFull as { date?: string } | null)?.date ?? null;
          const eventLocationRich = (eventFull as { location?: string } | null)?.location ?? "";
          const organizerNameRich = (organizer as { name?: string } | null)?.name ?? "Ticket Safe";

          const ticketData: ServerTicketData = {
            eventName: eventTitleRich,
            eventDate: eventDateRich ?? new Date().toISOString(),
            eventTime: eventDateRich ? formatTime(eventDateRich) : undefined,
            eventLocation: eventLocationRich,
            organizerName: organizerNameRich,
            buyerFirstName: buyerFirst,
            buyerLastName: buyerLast,
            buyerEmail: xfer.buyerEmailHolder ?? buyerEmail,
            ticketType: ticketTypeName,
            pricePaid: pricePaidEuro,
            ticketId: xfer.newTicketId,
            qrToken: xfer.newQrToken,
            status: "Valid",
            ticketIndex: 1,
            ticketTotal: 1,
          };

          const ticketBytes = await generateTicketsPDFServer([ticketData]);

          const orderData: OrderSummaryData = {
            orderNumber: `TS-RESALE-${tx.id.slice(0, 8).toUpperCase()}`,
            purchaseDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
            buyerFirstName: buyerFirst,
            buyerLastName: buyerLast,
            buyerEmail: buyerEmail,
            eventName: eventTitleRich,
            eventDate: eventDateRich ? formatLongDate(eventDateRich) : "",
            eventTime: eventDateRich ? formatTime(eventDateRich) : "",
            eventLocation: eventLocationRich,
            ticketType: ticketTypeName,
            quantity: 1,
            unitPrice: pricePaidEuro,
            totalPaid: pricePaidEuro,
            paymentMethod: "Card (Revolut)",
            paymentStatus: "Paid",
            transactionId: `revolut:${revOrderId}`,
            organizerName: organizerNameRich,
            ticketId: xfer.newTicketId,
          };

          const sendRes = await sendTicketConfirmationEmail({
            resendApiKey: resendKey,
            to: buyerEmail,
            order: orderData,
            ticketPdfBytes: ticketBytes,
            tags: [
              { name: "type", value: "resale_buyer_confirmation" },
              { name: "provider", value: "revolut" },
            ],
          });
          if (!sendRes.ok) {
            console.error("[revolut-webhook] resale premium email failed:", sendRes.error);
          } else {
            console.log("[revolut-webhook] resale premium email sent", { transaction_id: tx.id, resend_id: sendRes.resendId });
            premiumOk = true;
          }
        } catch (err) {
          console.error("[revolut-webhook] resale premium email pipeline error:", err);
        }
      }
      if (!premiumOk) {
        // Legacy lightweight email — used when (a) there is no Studio transfer
        // (uploaded file_url path or transfer failed), or (b) the premium PDF
        // path threw / Resend returned !ok. The buyer always gets *something*.
        const ticketBlock = resaleXfer
          ? `<p>Your ticket is now in your name. Open <strong>My Tickets</strong> to show the QR at the door.</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open My Tickets</a></p>`
          : fileUrl
            ? `<p>Here is your ticket file from the seller:</p><p style="margin:18px 0;text-align:center"><a href="${esc(fileUrl)}" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Download my ticket</a></p><p style="font-size:13px;color:#64748b">It's also in <strong>My Tickets</strong> on Ticket Safe.</p>`
            : `<p>Your ticket is in <strong>My Tickets</strong> on Ticket Safe.</p><p style="margin:22px 0 0;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:#003399;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:800">Open My Tickets</a></p>`;
        const html = shell(`Your ticket is confirmed!`, `<p>Hi ${esc(buyerName)},</p><p>Your purchase of a ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} is confirmed.</p>${ticketBlock}`);
        await sendEmail(resendKey, buyerEmail, `Your ticket for ${eventTitle} is confirmed`, html);
      }
    }
  } catch (err) { console.error("[revolut-webhook] resale emails failed:", err); }

  return json({ ok: true, resale: true, transaction_id: tx.id, studio_transferred: resaleXfer !== null });
});
