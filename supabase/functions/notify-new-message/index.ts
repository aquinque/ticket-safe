/**
 * notify-new-message — Supabase Edge Function
 *
 * Called after a message is inserted in a conversation.
 * Sends an email notification to the recipient.
 *
 * POST body: { conversationId: string; senderId: string }
 * Auth: Bearer <user-jwt>
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

  let conversationId: string, senderId: string;
  try {
    ({ conversationId, senderId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Fetch conversation with participants + ticket/event info
  const { data: conv } = await supabase
    .from("conversations")
    .select(`
      id, buyer_id, seller_id,
      ticket:tickets(selling_price, quantity, event:events(title, date)),
      buyer:profiles!conversations_buyer_id_fkey(full_name, email),
      seller:profiles!conversations_seller_id_fkey(full_name, email)
    `)
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return json({ ok: true }); // silently ignore if not found

  // Determine recipient (the other party)
  const isSenderBuyer = conv.buyer_id === senderId;
  const recipient = isSenderBuyer
    ? (conv.seller as { full_name: string; email: string } | null)
    : (conv.buyer as { full_name: string; email: string } | null);
  const sender = isSenderBuyer
    ? (conv.buyer as { full_name: string; email: string } | null)
    : (conv.seller as { full_name: string; email: string } | null);

  if (!recipient?.email) return json({ ok: true });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ ok: true });

  const ev = (conv.ticket as { event?: { title?: string; date?: string } } | null)?.event;
  const eventTitle = ev?.title ?? "a ticket";
  const senderName = sender?.full_name ?? "Someone";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.vercel.app";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "TicketSafe <onboarding@resend.dev>",
      to: [recipient.email],
      subject: `New message from ${senderName} — ${eventTitle}`,
      html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe · Messages</p>
    <h1 style="margin:6px 0 0;font-size:20px;color:white;font-weight:600">You have a new message</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 16px">Hi ${recipient.full_name ?? "there"},</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px"><strong>${senderName}</strong> sent you a message about <strong>${eventTitle}</strong>.</p>
    <a href="${siteUrl}/messages/${conversationId}"
       style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
      View message →
    </a>
    <p style="font-size:12px;color:#aaa;margin:24px 0 0">You received this because you have an active conversation on TicketSafe.</p>
  </div>
</div>
</body></html>`,
    }),
  });

  return json({ ok: true });
});
