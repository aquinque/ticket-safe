/**
 * replay-order-email — sends (or re-sends) the Studio purchase confirmation:
 * order summary email + one ticket.pdf (one page per ticket in the order).
 *
 * Two callers, two auth paths:
 *   1. revolut-webhook, right after payment confirms — no user session in a
 *      webhook, so it authenticates via `admin_secret` (REPLAY_ADMIN_SECRET).
 *   2. The "Resend email" button on /my-tickets (ResendEmailButton in
 *      MyTickets.tsx) — authenticates as the signed-in buyer and we verify
 *      they actually own the order before sending anything to their inbox.
 *
 * Re-sends reuse the EXISTING event_tickets rows (real qr_token values) —
 * never regenerates new tickets/tokens, so a resend can never produce a
 * ticket that scans differently from the one already issued.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateTicketsPDFServer, type ServerTicketData } from "../_shared/ticketPdfServer.ts";
import { renderEmail, ctaButton, ticketSummary, textLine } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  return btoa(binary);
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
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const replaySecret = Deno.env.get("REPLAY_ADMIN_SECRET") ?? "ts-replay-secret-2026";
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { order_id?: string; admin_secret?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const orderId = body.order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Invalid order_id" }, 400);

  const { data: order } = await supabase
    .from("event_orders")
    .select("id, event_id, tier_id, buyer_id, buyer_email, quantity, total_cents, fee_cents, status, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return json({ error: "Order not found" }, 404);
  if (order.status !== "paid") return json({ error: "This order has not been paid." }, 400);

  // Auth: admin_secret (webhook/internal) OR the signed-in buyer themself.
  const isAdminCall = !!body.admin_secret && body.admin_secret === replaySecret;
  if (!isAdminCall) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user || user.id !== order.buyer_id) return json({ error: "Unauthorized" }, 403);
  }

  if (!resendKey) return json({ error: "Email not configured" }, 500);

  const [{ data: event }, { data: tier }, { data: tickets }, { data: buyerProfile }] = await Promise.all([
    supabase.from("events").select("title, date, location, organizer_id, banner_url").eq("id", order.event_id).maybeSingle(),
    supabase.from("event_tiers").select("name, price_cents").eq("id", order.tier_id).maybeSingle(),
    supabase.from("event_tickets").select("id, qr_token, holder_first_name, holder_last_name, status").eq("order_id", order.id).order("created_at", { ascending: true }),
    supabase.from("profiles").select("full_name").eq("id", order.buyer_id).maybeSingle(),
  ]);
  if (!event) return json({ error: "Event not found" }, 404);
  const { data: organizer } = event.organizer_id
    ? await supabase.from("organizer_profiles").select("name").eq("id", event.organizer_id).maybeSingle()
    : { data: null as { name?: string } | null };

  const issuedTickets = tickets ?? [];
  if (issuedTickets.length === 0) return json({ error: "No tickets have been issued for this order yet." }, 409);

  const fullName = (buyerProfile?.full_name ?? "").trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const fallbackFirst = nameParts[0] ?? "there";
  const fallbackLast = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const orderNumber = `TS-${order.id.slice(0, 8).toUpperCase()}`;

  const ticketData: ServerTicketData[] = issuedTickets.map((t, i) => ({
    eventName: event.title,
    eventDate: event.date,
    eventTime: formatTime(event.date),
    eventLocation: event.location ?? "",
    eventImageUrl: event.banner_url ?? null,
    organizerName: organizer?.name ?? "Ticket Safe",
    buyerFirstName: t.holder_first_name || fallbackFirst,
    buyerLastName: t.holder_last_name || fallbackLast,
    buyerEmail: order.buyer_email,
    ticketType: tier?.name ?? "Standard",
    pricePaid: `${(order.total_cents / 100 / order.quantity).toFixed(2)}€`,
    ticketId: t.id,
    orderNumber,
    qrToken: t.qr_token,
    status: t.status === "valid" ? "Valid" : t.status === "scanned" ? "Used" : "Cancelled",
    ticketIndex: i + 1,
    ticketTotal: issuedTickets.length,
  }));

  let ticketPdfBytes: Uint8Array;
  try {
    ticketPdfBytes = await generateTicketsPDFServer(ticketData);
  } catch (err) {
    console.error("[replay-order-email] PDF generation failed:", err);
    return json({ error: "Could not generate the ticket PDF." }, 500);
  }

  const subtotalCents = order.total_cents - order.fee_cents;
  const eventDateLong = formatLongDate(event.date);
  const eventTimeStr = formatTime(event.date);

  const bodyHtml = `
    <p style="margin:0 0 4px">Hi ${fallbackFirst ? fallbackFirst : "there"},</p>
    <p style="margin:0 0 4px">Your order for <strong>${event.title}</strong> is confirmed. ${issuedTickets.length > 1 ? `Your ${issuedTickets.length} tickets are` : "Your ticket is"} attached, ready to show at the door.</p>
    ${ticketSummary([
      ["Event", event.title],
      ["Date", eventDateLong],
      ["Time", eventTimeStr],
      ["Location", event.location ?? ""],
      ["Ticket type", tier?.name ?? "Standard"],
      ["Quantity", String(order.quantity)],
      ["Subtotal", `€${(subtotalCents / 100).toFixed(2)}`],
      ["Service fee", `€${(order.fee_cents / 100).toFixed(2)}`],
      ["Total paid", `€${(order.total_cents / 100).toFixed(2)}`, emailTokens.accent],
      ["Order number", orderNumber],
    ])}
    ${ctaButton("View my tickets", `${emailTokens.siteUrl}/my-tickets/${order.id}`)}
    <p style="margin:24px 0 0;font-size:13px;color:${emailTokens.textMuted}">The attached PDF holds the QR code to show at the door. One ticket = one entry — it's nominative, keep it safe, and it can only be resold through Ticket Safe.</p>
  `;

  const textBody = [
    `Your order for ${event.title} is confirmed.`,
    "",
    textLine("Event", event.title),
    textLine("Date", eventDateLong),
    textLine("Time", eventTimeStr),
    textLine("Location", event.location ?? ""),
    textLine("Ticket type", tier?.name ?? "Standard"),
    textLine("Quantity", String(order.quantity)),
    textLine("Total paid", `€${(order.total_cents / 100).toFixed(2)}`),
    textLine("Order number", orderNumber),
    "",
    `Your tickets are attached as a PDF. You can also find them at ${emailTokens.siteUrl}/my-tickets/${order.id}`,
  ].join("\n");

  const { html, text } = renderEmail({
    eyebrow: "Order confirmation",
    title: "Your ticket is confirmed",
    bodyHtml,
    preheader: `${event.title} — ${eventDateLong}. Your ticket is attached.`,
    text: textBody,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Ticket Safe <noreply@ticket-safe.eu>",
        to: [order.buyer_email],
        subject: `Your ticket for ${event.title} is confirmed`,
        html,
        text,
        attachments: [
          { filename: `TicketSafe-${(event.title ?? "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${orderNumber}.pdf`, content: bytesToBase64(ticketPdfBytes) },
        ],
        tags: [{ name: "type", value: "studio_purchase_confirmation" }],
      }),
    });
    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[replay-order-email] Resend non-200:", res.status, resBody);
      return json({ error: (resBody as { message?: string }).message ?? "Email provider error" }, 502);
    }
    return json({ ok: true, resend_id: (resBody as { id?: string }).id });
  } catch (err) {
    console.error("[replay-order-email] Resend fetch failed:", err);
    return json({ error: "Could not send the email." }, 500);
  }
});
