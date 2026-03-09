/**
 * admin-quick-action — Supabase Edge Function (Deno)
 *
 * GET /functions/v1/admin-quick-action?token=xxx
 *
 * Called from the approve/reject buttons in the admin notification email.
 * Validates a signed JWT (TICKET_SIGNING_SECRET), performs the action,
 * and returns a styled HTML confirmation page.
 *
 * Token payload: { tid: ticketId, act: "approve" | "reject", exp: unixTs }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// JWT helpers (reused from submit-listing pattern)
// ---------------------------------------------------------------------------

function base64urlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "==".slice(0, 4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifyJWT(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload: Record<string, unknown> | null }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, payload: null };
    const [headerB64, payloadB64, signatureB64] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return { valid: false, payload: null };
    const json = new TextDecoder().decode(base64urlToBytes(payloadB64));
    return { valid: true, payload: JSON.parse(json) };
  } catch {
    return { valid: false, payload: null };
  }
}

// ---------------------------------------------------------------------------
// HTML response helper
// ---------------------------------------------------------------------------

function htmlPage(title: string, message: string, success: boolean, adminUrl: string): Response {
  const color = success ? "#16a34a" : "#dc2626";
  const icon = success ? "✓" : "✗";
  const bg = success ? "#f0fdf4" : "#fef2f2";
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TicketSafe Admin — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 16px; padding: 48px 40px;
            max-width: 420px; width: 100%; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon-circle { width: 72px; height: 72px; border-radius: 50%;
                   background: ${bg}; display: flex; align-items: center;
                   justify-content: center; margin: 0 auto 24px; font-size: 32px; color: ${color}; }
    h1 { font-size: 22px; color: #111; margin-bottom: 12px; }
    p  { color: #555; line-height: 1.6; margin-bottom: 28px; }
    a  { display: inline-block; background: #6366f1; color: white;
         padding: 11px 28px; border-radius: 8px; text-decoration: none;
         font-size: 14px; font-weight: 500; }
    a:hover { background: #4f46e5; }
    .brand { margin-top: 32px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-circle">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${adminUrl}">Open admin panel</a>
    <p class="brand">TicketSafe administration</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticketsafe.fr";
  const adminUrl = `${siteUrl}/admin/review`;
  const secret = Deno.env.get("TICKET_SIGNING_SECRET") ?? Deno.env.get("ADMIN_ACTION_SECRET");

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return htmlPage("Invalid link", "This link is missing a token. Please go to the admin panel.", false, adminUrl);
  }

  if (!secret) {
    return htmlPage("Not configured", "TICKET_SIGNING_SECRET is not set. Please go to the admin panel.", false, adminUrl);
  }

  // Validate JWT
  const { valid, payload } = await verifyJWT(token, secret);
  if (!valid || !payload) {
    return htmlPage("Invalid or expired link", "This approval link has expired or is invalid. Please use the admin panel.", false, adminUrl);
  }

  // Check expiry
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    return htmlPage("Link expired", "This link expired after 48 hours. Please go to the admin panel to review the ticket.", false, adminUrl);
  }

  const ticketId = payload.tid as string;
  const action = payload.act as string;

  if (!ticketId || (action !== "approve" && action !== "reject")) {
    return htmlPage("Invalid action", "The action in this link is invalid.", false, adminUrl);
  }

  // Connect with service role
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Fetch ticket
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, verification_status, event:events(title)")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    return htmlPage("Not found", "This ticket no longer exists.", false, adminUrl);
  }

  const eventTitle = (ticket.event as { title: string } | null)?.title ?? "Unknown event";

  if (ticket.verification_status === "verified") {
    return htmlPage("Already approved", `The ticket for "${eventTitle}" was already approved and is live on the marketplace.`, true, adminUrl);
  }
  if (ticket.verification_status === "rejected") {
    return htmlPage("Already rejected", `The ticket for "${eventTitle}" was already rejected.`, false, adminUrl);
  }

  // Perform action
  if (action === "approve") {
    const { error } = await supabase
      .from("tickets")
      .update({ verification_status: "verified" })
      .eq("id", ticketId)
      .eq("verification_status", "pending");

    if (error) {
      console.error("[admin-quick-action] approve error:", error);
      return htmlPage("Error", `Database error: ${error.message}`, false, adminUrl);
    }

    console.log("[admin-quick-action] approved ticket", ticketId);
    return htmlPage(
      "Ticket approved!",
      `The ticket for "<strong>${eventTitle}</strong>" is now live on the marketplace.`,
      true,
      adminUrl
    );
  }

  // reject (via email — no reason collected, uses default)
  const { error } = await supabase
    .from("tickets")
    .update({
      verification_status: "rejected",
      status: "cancelled",
      notes: "[REJECTED by admin via email]",
    })
    .eq("id", ticketId)
    .eq("verification_status", "pending");

  if (error) {
    console.error("[admin-quick-action] reject error:", error);
    return htmlPage("Error", `Database error: ${error.message}`, false, adminUrl);
  }

  console.log("[admin-quick-action] rejected ticket", ticketId);
  return htmlPage(
    "Ticket rejected",
    `The ticket for "<strong>${eventTitle}</strong>" has been rejected and cancelled.`,
    false,
    adminUrl
  );
});
