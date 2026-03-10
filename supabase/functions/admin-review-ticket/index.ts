/**
 * admin-review-ticket — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/admin-review-ticket
 * Body: { ticketId: string; action: "approve" | "reject"; reason?: string }
 *
 * Only callable by users with role = 'admin' in user_roles table.
 *
 * approve → verification_status = 'verified'  (ticket goes live)
 * reject  → verification_status = 'rejected', status = 'cancelled'
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify caller
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid session" }, 401);

    // Check admin role
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    // Parse body
    let body: { ticketId?: string; action?: string; reason?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { ticketId, action, reason } = body;
    if (!ticketId || (action !== "approve" && action !== "reject")) {
      return json({ error: "ticketId and action (approve|reject) are required" }, 400);
    }

    // Fetch ticket + seller info for email
    const { data: ticket } = await supabase
      .from("tickets")
      .select("seller_id, event:events(title, date, location)")
      .eq("id", ticketId)
      .maybeSingle();

    const { data: seller } = ticket?.seller_id
      ? await supabase.from("profiles").select("full_name, email").eq("id", ticket.seller_id).maybeSingle()
      : { data: null };

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const ev = ticket?.event as { title?: string; date?: string; location?: string } | null;
    const eventTitle = ev?.title ?? "your ticket";
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.vercel.app";

    if (action === "approve") {
      const { error } = await supabase
        .from("tickets")
        .update({ verification_status: "verified" })
        .eq("id", ticketId)
        .eq("verification_status", "pending");

      if (error) return json({ error: error.message }, 500);

      // Email seller: ticket approved
      if (resendKey && seller?.email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TicketSafe <onboarding@resend.dev>",
            to: [seller.email],
            subject: `Your ticket for ${eventTitle} is live on the marketplace!`,
            html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#22c55e;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:white;font-weight:600">Your ticket is approved!</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 16px">Hi ${seller.full_name ?? "there"},</p>
    <p style="font-size:15px;color:#333;margin:0 0 24px">
      Your ticket for <strong>${eventTitle}</strong> has been approved by our team and is now <strong>live on the marketplace</strong>.
      Buyers can now find and purchase it.
    </p>
    <a href="${siteUrl}/marketplace/buy"
       style="display:inline-block;background:#22c55e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
      View marketplace →
    </a>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p>
  </div>
</div>
</body></html>`,
          }),
        });
      }

      console.log("[admin-review-ticket] approved", { ticketId, adminId: user.id });
      return json({ success: true, action: "approved", ticketId });
    }

    // reject
    const { error } = await supabase
      .from("tickets")
      .update({
        verification_status: "rejected",
        status: "cancelled",
        notes: reason ? `[REJECTED] ${reason}` : "[REJECTED by admin]",
      })
      .eq("id", ticketId);

    if (error) return json({ error: error.message }, 500);

    // Email seller: ticket rejected
    if (resendKey && seller?.email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TicketSafe <onboarding@resend.dev>",
          to: [seller.email],
          subject: `Your ticket for ${eventTitle} could not be approved`,
          html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#ef4444;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe</p>
    <h1 style="margin:6px 0 0;font-size:22px;color:white;font-weight:600">Ticket not approved</h1>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:15px;color:#333;margin:0 0 16px">Hi ${seller.full_name ?? "there"},</p>
    <p style="font-size:15px;color:#333;margin:0 0 16px">
      Unfortunately, your ticket for <strong>${eventTitle}</strong> could not be approved.
    </p>
    ${reason ? `<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px">
      <p style="margin:0;font-size:14px;color:#7f1d1d"><strong>Reason:</strong> ${reason}</p>
    </div>` : ""}
    <p style="font-size:14px;color:#555;margin:0 0 24px">You can submit a new listing with the correct ticket. If you have questions, contact us.</p>
    <a href="${siteUrl}/marketplace/sell"
       style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
      Submit a new listing →
    </a>
  </div>
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0">
    <p style="margin:0;font-size:12px;color:#bbb;text-align:center">TicketSafe · Secure peer-to-peer ticket resale</p>
  </div>
</div>
</body></html>`,
        }),
      });
    }

    console.log("[admin-review-ticket] rejected", { ticketId, adminId: user.id, reason });
    return json({ success: true, action: "rejected", ticketId });

  } catch (err) {
    console.error("[admin-review-ticket] error:", err);
    return json({ error: "Server error" }, 500);
  }
});
