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
import { renderEmail, ctaButton, escapeHtml as esc } from "../_shared/emailComponents.ts";
import { emailTokens } from "../_shared/emailTokens.ts";

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
    const { data: ticket, error: ticketFetchErr } = await supabase
      .from("tickets")
      .select("seller_id, event:events(title, date, location)")
      .eq("id", ticketId)
      .maybeSingle();

    console.log("[admin-review-ticket] ticket fetch:", { ticket, ticketFetchErr });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const ev = ticket?.event as { title?: string; date?: string; location?: string } | null;
    const eventTitle = ev?.title ?? "your ticket";
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.vercel.app";

    // Get seller email from auth (guaranteed) + name from profiles
    let sellerEmail: string | null = null;
    let sellerName = "there";
    if (ticket?.seller_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(ticket.seller_id);
      sellerEmail = authUser?.user?.email ?? null;
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", ticket.seller_id).maybeSingle();
      sellerName = profile?.full_name ?? sellerEmail?.split("@")[0] ?? "there";
      console.log("[admin-review-ticket] seller:", { sellerEmail, sellerName });
    }

    if (action === "approve") {
      const { error } = await supabase
        .from("tickets")
        .update({ verification_status: "verified" })
        .eq("id", ticketId)
        .eq("verification_status", "pending");

      if (error) return json({ error: error.message }, 500);

      // Email seller: ticket approved
      if (resendKey && sellerEmail) {
        console.log("[admin-review-ticket] sending approval email to", sellerEmail);
        const bodyHtml = `
          <p style="margin:0 0 4px">Hi ${sellerName},</p>
          <p style="margin:0 0 4px">Your ticket for <strong>${eventTitle}</strong> has been approved by our team and is now live on the marketplace. Buyers can find and purchase it right away.</p>
          ${ctaButton("View marketplace", `${siteUrl}/marketplace/buy`)}
        `;
        const text = `Your ticket for ${eventTitle} has been approved and is now live on the marketplace.\n${siteUrl}/marketplace/buy`;
        const { html, text: plain } = renderEmail({
          eyebrow: "Resale · Listing approved",
          title: "Your ticket is live",
          bodyHtml,
          preheader: `Your ticket for ${eventTitle} is now live on the marketplace.`,
          text,
        });
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Ticket Safe <noreply@ticket-safe.eu>",
            to: [sellerEmail],
            subject: `Your ticket for ${eventTitle} is live on the marketplace!`,
            html,
            text: plain,
          }),
        });
        console.log("[admin-review-ticket] approval email result:", emailRes.status);
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
    if (resendKey && sellerEmail) {
      const bodyHtml = `
        <p style="margin:0 0 4px">Hi ${sellerName},</p>
        <p style="margin:0 0 4px">Unfortunately, your ticket for <strong>${eventTitle}</strong> could not be approved.</p>
        ${reason ? `<p style="margin:12px 0;padding:14px 18px;background:${emailTokens.bodyBg};border-left:3px solid ${emailTokens.danger};color:${emailTokens.textPrimary};font-size:13px;line-height:1.55">Reason: ${esc(reason)}</p>` : ""}
        <p style="margin:0 0 4px;font-size:13px;color:${emailTokens.textMuted}">You can submit a new listing with the correct ticket. If you have questions, contact us.</p>
        ${ctaButton("Submit a new listing", `${siteUrl}/marketplace/sell`)}
      `;
      const text = `Your ticket for ${eventTitle} could not be approved.\n${reason ? `Reason: ${reason}\n` : ""}\nSubmit a new listing: ${siteUrl}/marketplace/sell`;
      const { html, text: plain } = renderEmail({
        eyebrow: "Resale · Listing reviewed",
        title: "Ticket not approved",
        bodyHtml,
        preheader: `Your ticket for ${eventTitle} could not be approved.`,
        text,
      });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Ticket Safe <noreply@ticket-safe.eu>",
          to: [sellerEmail],
          subject: `Your ticket for ${eventTitle} could not be approved`,
          html,
          text: plain,
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
