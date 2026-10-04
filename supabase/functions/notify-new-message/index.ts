/**
 * notify-new-message — Supabase Edge Function
 * POST body: { conversationId: string; senderId: string; offerPrice?: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderEmail, ctaButton, escapeHtml as esc } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

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

  const messageUrl = `${siteUrl}/messages/${conversationId}`;
  const bodyHtml = `
    <p style="margin:0 0 4px">Hi ${esc(recipientName)},</p>
    ${isOffer
      ? `<p style="margin:0 0 4px"><strong>${esc(senderName)}</strong> proposed a new price for <strong>${esc(eventTitle)}</strong>.</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:${emailTokens.bodyBg};border:1px solid ${emailTokens.border}"><tr><td style="padding:16px 20px;text-align:center">
           <div style="font-family:${emailTokens.fontBody};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${emailTokens.textMuted}">Proposed price</div>
           <div style="font-family:${emailTokens.fontHeading};font-size:26px;font-weight:700;color:${emailTokens.accent};margin-top:4px">€${offerPrice!.toFixed(2)}</div>
         </td></tr></table>`
      : `<p style="margin:0 0 4px"><strong>${esc(senderName)}</strong> sent you a message about <strong>${esc(eventTitle)}</strong>.</p>`
    }
    ${ctaButton(isOffer ? "Accept or decline" : "View message", messageUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:${emailTokens.textMuted}">You're receiving this because you have an active conversation on Ticket Safe.</p>
  `;
  const text = isOffer
    ? `${senderName} proposed €${offerPrice!.toFixed(2)} for ${eventTitle}.\n${messageUrl}`
    : `${senderName} sent you a message about ${eventTitle}.\n${messageUrl}`;
  const { html, text: plain } = renderEmail({
    eyebrow: isOffer ? "Price offer" : "Messages",
    title: isOffer ? `New price offer: €${offerPrice!.toFixed(2)}` : "You have a new message",
    bodyHtml,
    preheader: isOffer ? `${senderName} proposed €${offerPrice!.toFixed(2)} for ${eventTitle}.` : `${senderName} sent you a message about ${eventTitle}.`,
    text,
  });

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Ticket Safe <noreply@ticket-safe.eu>",
      to: [recipientEmail],
      subject: isOffer
        ? `New price offer €${offerPrice!.toFixed(2)} from ${senderName} — ${eventTitle}`
        : `New message from ${senderName} — ${eventTitle}`,
      html,
      text: plain,
    }),
  });

  const emailBody = await emailRes.json().catch(() => ({}));
  console.log("[notify] Resend result:", emailRes.status, JSON.stringify(emailBody));

  return json({ ok: true, resend: emailRes.status });
});
