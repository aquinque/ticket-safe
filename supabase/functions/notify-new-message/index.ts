/**
 * notify-new-message — Supabase Edge Function
 * POST body: { conversationId: string; senderId: string; offerPrice?: number }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let conversationId: string, senderId: string, offerPrice: number | undefined;
  try {
    ({ conversationId, senderId, offerPrice } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  console.log("[notify] called", { conversationId, senderId, offerPrice });

  // Step 1: fetch conversation (buyer_id, seller_id, ticket_id) — no FK joins
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id, ticket_id")
    .eq("id", conversationId)
    .maybeSingle();

  console.log("[notify] conv:", conv, "err:", convErr?.message);
  if (!conv) return json({ ok: true });

  // Step 2: determine recipient
  const recipientId = conv.buyer_id === senderId ? conv.seller_id : conv.buyer_id;
  const senderIsbuyer = conv.buyer_id === senderId;

  // Step 3: get recipient email from auth (guaranteed, bypasses profiles)
  const { data: recipientAuth, error: authErr } = await supabase.auth.admin.getUserById(recipientId);
  const recipientEmail = recipientAuth?.user?.email ?? null;
  console.log("[notify] recipientEmail:", recipientEmail, "authErr:", authErr?.message);
  if (!recipientEmail) return json({ ok: true });

  // Step 4: get sender profile name
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", senderId)
    .maybeSingle();
  const senderName = (senderProfile as any)?.full_name ?? "Someone";

  // Step 5: get recipient profile name
  const { data: recipientProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", recipientId)
    .maybeSingle();
  const recipientName = (recipientProfile as any)?.full_name ?? recipientEmail.split("@")[0];

  // Step 6: get event title from ticket
  let eventTitle = "a ticket";
  if (conv.ticket_id) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("event_id")
      .eq("id", conv.ticket_id)
      .maybeSingle();
    if ((ticket as any)?.event_id) {
      const { data: event } = await supabase
        .from("events")
        .select("title")
        .eq("id", (ticket as any).event_id)
        .maybeSingle();
      if ((event as any)?.title) eventTitle = (event as any).title;
    }
  }

  console.log("[notify] sending to:", recipientEmail, "event:", eventTitle, "offer:", offerPrice);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("[notify] no RESEND_API_KEY");
    return json({ ok: true });
  }

  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
  const isOffer = !!offerPrice;

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TicketSafe <noreply@ticket-safe.eu>",
      to: [recipientEmail],
      subject: isOffer
        ? `New price offer €${offerPrice!.toFixed(2)} from ${senderName} — ${eventTitle}`
        : `New message from ${senderName} — ${eventTitle}`,
      html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:${isOffer ? "#f59e0b" : "#6366f1"};padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe · ${isOffer ? "Price Offer" : "Messages"}</p>
    <h1 style="margin:6px 0 0;font-size:20px;color:white;font-weight:600">${isOffer ? `New price offer: €${offerPrice!.toFixed(2)}` : "You have a new message"}</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 16px">Hi ${recipientName},</p>
    ${isOffer
      ? `<p style="font-size:15px;color:#333;margin:0 0 16px"><strong>${senderName}</strong> proposed a new price for <strong>${eventTitle}</strong>.</p>
         <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px 20px;margin-bottom:24px;text-align:center">
           <p style="margin:0;font-size:13px;color:#92400e;text-transform:uppercase;letter-spacing:.06em">Proposed price</p>
           <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#d97706">€${offerPrice!.toFixed(2)}</p>
         </div>`
      : `<p style="font-size:15px;color:#333;margin:0 0 24px"><strong>${senderName}</strong> sent you a message about <strong>${eventTitle}</strong>.</p>`
    }
    <a href="${siteUrl}/messages/${conversationId}"
       style="display:inline-block;background:${isOffer ? "#f59e0b" : "#6366f1"};color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
      ${isOffer ? "Accept or decline →" : "View message →"}
    </a>
    <p style="font-size:12px;color:#aaa;margin:24px 0 0">You received this because you have an active conversation on TicketSafe.</p>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p>
  </div>
</div>
</body></html>`,
    }),
  });

  const emailBody = await emailRes.json().catch(() => ({}));
  console.log("[notify] Resend result:", emailRes.status, JSON.stringify(emailBody));

  return json({ ok: true, resend: emailRes.status });
});
