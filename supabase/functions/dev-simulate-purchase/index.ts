/**
 * dev-simulate-purchase — DEV ONLY
 *
 * Simulates a completed Stripe payment without touching Stripe.
 * Use on localhost to test nominative ticket assignment + confirmation email.
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

  // Auth
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let listingId: string;
  try {
    ({ listingId } = await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Fetch listing with event info
  const { data: listing } = await supabase
    .from("tickets")
    .select("id, seller_id, selling_price, quantity, status, file_url, event:events(title, date, location)")
    .eq("id", listingId)
    .in("status", ["available", "reserved"])
    .maybeSingle();

  if (!listing) return json({ error: "Listing not available" }, 404);
  if (listing.seller_id === user.id) return json({ error: "Cannot buy your own ticket" }, 400);

  const qty = listing.quantity ?? 1;
  const total = listing.selling_price * qty;
  const fee = Math.round(total * 5) / 100;

  // Create transaction
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      buyer_id: user.id,
      seller_id: listing.seller_id,
      ticket_id: listingId,
      amount: total,
      fee_amount: fee,
      quantity: qty,
      status: "completed",
    })
    .select("id")
    .single();

  // Mark ticket sold + nominative
  await supabase
    .from("tickets")
    .update({ status: "sold", buyer_id: user.id })
    .eq("id", listingId);

  // Fetch buyer profile + email
  const { data: buyerProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const buyerEmail = buyerProfile?.email ?? user.email;
  const buyerName = buyerProfile?.full_name ?? "there";

  // Send confirmation email
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (resendKey && buyerEmail) {
    const ev = listing.event as { title?: string; date?: string; location?: string } | null;
    const eventTitle = ev?.title ?? "Event Ticket";
    const eventDate = ev?.date
      ? new Date(ev.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "—";
    const eventLocation = ev?.location ?? "—";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "TicketSafe <noreply@ticket-safe.eu>",
        to: [buyerEmail],
        subject: `Your ticket for ${eventTitle} is confirmed!`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:white;font-weight:600">Your ticket is confirmed!</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 20px">Hi ${buyerName},</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px">Your purchase is confirmed. Here are your ticket details:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 0;color:#888;width:40%">Event</td>
        <td style="padding:10px 0;color:#111;font-weight:600">${eventTitle}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 0;color:#888">Date</td>
        <td style="padding:10px 0;color:#111">${eventDate}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 0;color:#888">Location</td>
        <td style="padding:10px 0;color:#111">${eventLocation}</td>
      </tr>
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 0;color:#888">Quantity</td>
        <td style="padding:10px 0;color:#111">${qty} ticket${qty > 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#888">Total paid</td>
        <td style="padding:10px 0;color:#6366f1;font-weight:700;font-size:16px">€${total.toFixed(2)}</td>
      </tr>
    </table>
    ${listing.file_url ? `
    <div style="background:#f0f0ff;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:13px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Your ticket file</p>
      <a href="${listing.file_url}" style="color:#6366f1;font-size:14px;text-decoration:none;font-weight:500">Download your ticket →</a>
    </div>` : ""}
    <p style="font-size:13px;color:#888;margin:0">This ticket is registered in your name. View all your purchases on <strong>TicketSafe → My Purchases</strong>.</p>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p>
  </div>
</div>
</body>
</html>`,
      }),
    });
  }

  console.log("[dev-simulate-purchase] ticket sold + email sent", { listingId, buyerId: user.id, txId: tx?.id });
  return json({ success: true, transactionId: tx?.id, buyerId: user.id });
});
