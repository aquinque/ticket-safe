/**
 * check-ticket-entry — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/check-ticket-entry
 * Body: { qrText: string; eventId: string }
 *
 * Validates a marketplace ticket at event entry:
 *  1. Auth check (organizer must be logged in)
 *  2. SHA-256 hash the raw QR text
 *  3. Look up the ticket in the `tickets` table by qr_hash + event_id
 *  4. Return validation result
 *
 * Returns:
 *   { valid: boolean; result: ResultCode; message: string; ticket_info?: {...} }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ResultCode =
  | "VALID"
  | "INVALID"
  | "WRONG_EVENT"
  | "NOT_PURCHASED"
  | "ALREADY_USED"
  | "REVOKED"
  | "EXPIRED";

interface CheckResult {
  valid: boolean;
  result: ResultCode;
  message: string;
  ticket_info?: {
    event_title: string;
    selling_price: number;
    quantity: number;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, result: "INVALID", message: "Method not allowed" }, 405);

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ valid: false, result: "INVALID", message: "Authentication required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ valid: false, result: "INVALID", message: "Invalid or expired session" }, 401);

    // ── 2. Parse body ────────────────────────────────────────────────────────
    let body: { qrText?: string; eventId?: string };
    try { body = await req.json(); } catch {
      return json({ valid: false, result: "INVALID", message: "Invalid request body" }, 400);
    }

    const qrText = (body.qrText ?? "").trim();
    const eventId = (body.eventId ?? "").trim();

    if (!qrText || qrText.length < 3) {
      return json({ valid: false, result: "INVALID", message: "QR code is empty or too short" });
    }
    if (!eventId) {
      return json({ valid: false, result: "INVALID", message: "Event ID is required" });
    }

    console.log("[check-ticket-entry] checking", { qrLen: qrText.length, eventId, userId: user.id });

    // ── 3. Hash + lookup ─────────────────────────────────────────────────────
    const qrHash = await sha256hex(qrText);

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        id,
        status,
        event_id,
        selling_price,
        quantity,
        qr_verified,
        event:events(id, title, is_active)
      `)
      .eq("qr_hash", qrHash)
      .maybeSingle();

    if (ticketError) {
      console.error("[check-ticket-entry] db error:", ticketError.message);
      return json({ valid: false, result: "INVALID", message: "Database error" }, 500);
    }

    // ── 4. Not found ─────────────────────────────────────────────────────────
    if (!ticket) {
      return json<CheckResult>({
        valid: false,
        result: "INVALID",
        message: "This QR code is not registered in the Ticket Safe marketplace",
      });
    }

    // ── 5. Wrong event ───────────────────────────────────────────────────────
    if (ticket.event_id !== eventId) {
      const ev = ticket.event as { title?: string } | null;
      return json<CheckResult>({
        valid: false,
        result: "WRONG_EVENT",
        message: `This ticket is for a different event${ev?.title ? `: "${ev.title}"` : ""}`,
      });
    }

    // ── 6. Status checks ─────────────────────────────────────────────────────
    if (ticket.status === "cancelled") {
      return json<CheckResult>({
        valid: false,
        result: "REVOKED",
        message: "This listing was cancelled by the seller",
      });
    }

    if (ticket.status === "available" || ticket.status === "reserved") {
      return json<CheckResult>({
        valid: false,
        result: "NOT_PURCHASED",
        message: "This ticket has not been purchased yet",
      });
    }

    // ── 7. Valid — status is "sold" ──────────────────────────────────────────
    if (ticket.status === "sold") {
      const ev = ticket.event as { title?: string } | null;
      console.log("[check-ticket-entry] VALID entry", { ticketId: ticket.id, eventId });
      return json<CheckResult>({
        valid: true,
        result: "VALID",
        message: "Ticket valid — entry granted",
        ticket_info: {
          event_title: ev?.title ?? "Unknown event",
          selling_price: ticket.selling_price,
          quantity: ticket.quantity,
        },
      });
    }

    // Fallback
    return json<CheckResult>({
      valid: false,
      result: "INVALID",
      message: `Unexpected ticket status: ${ticket.status}`,
    });

  } catch (err) {
    console.error("[check-ticket-entry] unexpected error:", err);
    return json({ valid: false, result: "INVALID", message: "Server error. Please try again." }, 500);
  }
});
