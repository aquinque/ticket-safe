/**
 * check-ticket-entry — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/check-ticket-entry
 * Body: { qrText: string; eventId: string }
 *
 * Deep validation of a marketplace ticket at event entry:
 *  1. Auth check
 *  2. SHA-256 hash the QR text
 *  3. Look up ticket by qr_hash, join event + transaction + buyer profile
 *  4. Verify event matches
 *  5. Verify event date/time window (not too early, not too late)
 *  6. Verify ticket was purchased (status = sold)
 *  7. Return buyer identity for manual ID check
 *
 * Returns:
 *   { valid, result, message, buyer_info?, event_info?, ticket_info? }
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
  | "REVOKED"
  | "EVENT_NOT_STARTED"
  | "EVENT_ENDED";

interface CheckResult {
  valid: boolean;
  result: ResultCode;
  message: string;
  buyer_info?: {
    full_name: string;
    email: string;
    campus: string | null;
    university: string;
  };
  event_info?: {
    title: string;
    date: string;
    location: string | null;
  };
  ticket_info?: {
    selling_price: number;
    quantity: number;
    qr_verified: boolean;
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

    if (!qrText || qrText.length < 3)
      return json({ valid: false, result: "INVALID", message: "QR code is empty or too short" });
    if (!eventId)
      return json({ valid: false, result: "INVALID", message: "Event ID is required" });

    console.log("[check-ticket-entry]", { qrLen: qrText.length, eventId, userId: user.id });

    // ── 3. Hash + lookup ticket with full joins ──────────────────────────────
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
        event:events(id, title, date, ends_at, location, is_active),
        transactions(buyer_id, status, buyer:profiles(full_name, email, campus, university))
      `)
      .eq("qr_hash", qrHash)
      .maybeSingle();

    if (ticketError) {
      console.error("[check-ticket-entry] db error:", ticketError.message);
      return json({ valid: false, result: "INVALID", message: "Database error" }, 500);
    }

    // ── 4. Not in marketplace ────────────────────────────────────────────────
    if (!ticket) {
      return json<CheckResult>({
        valid: false,
        result: "INVALID",
        message: "This QR code is not registered in the Ticket Safe marketplace",
      });
    }

    const ev = ticket.event as {
      id: string; title: string; date: string; ends_at: string | null;
      location: string | null; is_active: boolean;
    } | null;

    // ── 5. Wrong event ───────────────────────────────────────────────────────
    if (ticket.event_id !== eventId) {
      return json<CheckResult>({
        valid: false,
        result: "WRONG_EVENT",
        message: ev?.title
          ? `Wrong event — this ticket is for "${ev.title}"`
          : "This ticket is for a different event",
        event_info: ev ? { title: ev.title, date: ev.date, location: ev.location } : undefined,
      });
    }

    // ── 6. Event date/time window ────────────────────────────────────────────
    if (ev) {
      const now = Date.now();
      const startMs = new Date(ev.date).getTime();
      const endsAtMs = ev.ends_at
        ? new Date(ev.ends_at).getTime()
        : startMs + 8 * 60 * 60 * 1000; // default 8h

      const earlyMs = 3 * 60 * 60 * 1000;  // allow entry 3h before start
      const graceMs = 4 * 60 * 60 * 1000;  // allow entry 4h after end

      if (now < startMs - earlyMs) {
        const hoursUntil = Math.ceil((startMs - now) / (60 * 60 * 1000));
        return json<CheckResult>({
          valid: false,
          result: "EVENT_NOT_STARTED",
          message: `Event not started yet — entry opens in ~${hoursUntil}h`,
          event_info: { title: ev.title, date: ev.date, location: ev.location },
        });
      }

      if (now > endsAtMs + graceMs) {
        return json<CheckResult>({
          valid: false,
          result: "EVENT_ENDED",
          message: "This event has ended — ticket is no longer valid for entry",
          event_info: { title: ev.title, date: ev.date, location: ev.location },
        });
      }
    }

    // ── 7. Status checks ─────────────────────────────────────────────────────
    if (ticket.status === "cancelled") {
      return json<CheckResult>({
        valid: false,
        result: "REVOKED",
        message: "This listing was cancelled — ticket is no longer valid",
      });
    }

    if (ticket.status === "available" || ticket.status === "reserved") {
      return json<CheckResult>({
        valid: false,
        result: "NOT_PURCHASED",
        message: "This ticket has not been purchased yet on the marketplace",
      });
    }

    // ── 8. Valid (status = sold) — build buyer identity ──────────────────────
    if (ticket.status === "sold") {
      // Find the completed transaction to get buyer
      const transactions = ticket.transactions as Array<{
        buyer_id: string;
        status: string;
        buyer: { full_name: string; email: string; campus: string | null; university: string } | null;
      }> | null;

      const completedTx = transactions?.find((tx) => tx.status === "completed");
      const buyer = completedTx?.buyer ?? null;

      console.log("[check-ticket-entry] VALID", { ticketId: ticket.id, eventId, buyer: buyer?.email });

      return json<CheckResult>({
        valid: true,
        result: "VALID",
        message: "Ticket valid — entry granted",
        buyer_info: buyer
          ? {
              full_name: buyer.full_name || "Unknown",
              email: buyer.email,
              campus: buyer.campus,
              university: buyer.university,
            }
          : undefined,
        event_info: ev ? { title: ev.title, date: ev.date, location: ev.location } : undefined,
        ticket_info: {
          selling_price: ticket.selling_price,
          quantity: ticket.quantity,
          qr_verified: ticket.qr_verified,
        },
      });
    }

    return json<CheckResult>({
      valid: false,
      result: "INVALID",
      message: `Unexpected ticket status: ${ticket.status}`,
    });

  } catch (err) {
    console.error("[check-ticket-entry] error:", err);
    return json({ valid: false, result: "INVALID", message: "Server error. Please try again." }, 500);
  }
});
