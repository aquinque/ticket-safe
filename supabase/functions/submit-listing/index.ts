/**
 * submit-listing — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/submit-listing
 *
 * Body: { eventId, sellingPrice, quantity?, notes?, qrText }
 *
 * 1. Authenticates the seller
 * 2. Validates all inputs
 * 3. Validates the QR code:
 *    - Platform JWT  → full HMAC-SHA256 verification + secure_tickets status check
 *    - JSON with sig → HMAC-SHA256 verification
 *    - JSON / plain  → structural + deduplication check (unverified external ticket)
 * 4. Checks no duplicate qr_hash in tickets table (409 ALREADY_LISTED)
 * 5. Inserts the listing with status='available'
 *
 * Returns:
 *   201 { code: 'VALID', listing }
 *   400 { code, message }   — validation / QR error
 *   409 { code, message }   — duplicate
 *   429 { code, message }   — rate limit
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QRValidationCode =
  | "VALID"
  | "INVALID_FORMAT"
  | "UNKNOWN_TICKET"
  | "ALREADY_LISTED"
  | "ALREADY_USED"
  | "CANCELLED"
  | "REFUNDED"
  | "EXPIRED"
  | "INTERNAL_ERROR";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(
  body: unknown,
  status = 200
): Response {
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

function base64urlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "==".slice(0, 4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Verify an HS256 JWT and return the decoded payload on success.
 */
async function verifyJWTHS256(
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

    const sigBytes = base64urlToBytes(signatureB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );

    if (!valid) return { valid: false, payload: null };

    const payloadJson = new TextDecoder().decode(base64urlToBytes(payloadB64));
    return { valid: true, payload: JSON.parse(payloadJson) };
  } catch {
    return { valid: false, payload: null };
  }
}

/**
 * Verify a hex-encoded HMAC-SHA256 signature over dataStr.
 */
async function verifyHMACHex(
  dataStr: string,
  sigHex: string,
  secret: string
): Promise<boolean> {
  try {
    const sigBytes = new Uint8Array(
      (sigHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(dataStr)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ code: "INTERNAL_ERROR", message: "Method not allowed" }, 405);
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authentication
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Authentication required" }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Invalid or expired authentication" }, 401);
    }

    // Service-role client for privileged DB operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // -----------------------------------------------------------------------
    // 2. Parse body
    // -----------------------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Request body must be valid JSON" }, 400);
    }

    const { eventId, sellingPrice, quantity, notes, qrText } = body as {
      eventId?: unknown;
      sellingPrice?: unknown;
      quantity?: unknown;
      notes?: unknown;
      qrText?: unknown;
    };

    // -----------------------------------------------------------------------
    // 3. Input validation
    // -----------------------------------------------------------------------
    if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
      return jsonResponse({ code: "INVALID_FORMAT", message: "eventId is required" }, 400);
    }

    if (!qrText || typeof qrText !== "string" || qrText.trim() === "") {
      return jsonResponse({ code: "INVALID_FORMAT", message: "QR code text is required" }, 400);
    }

    const trimmedQR = qrText.trim();
    if (trimmedQR.length > 10_000) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "QR code text is too long (max 10 000 characters)" }, 400);
    }

    const price = typeof sellingPrice === "number"
      ? sellingPrice
      : parseFloat(String(sellingPrice ?? ""));
    if (!isFinite(price) || price <= 0 || price > 10_000) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Selling price must be between €0.01 and €10,000" }, 400);
    }

    const qty = Number.isInteger(quantity)
      ? (quantity as number)
      : parseInt(String(quantity ?? "1"), 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Quantity must be between 1 and 10" }, 400);
    }

    // -----------------------------------------------------------------------
    // 4. Rate limiting — max 10 listings per seller per hour
    // -----------------------------------------------------------------------
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recentCount } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id)
      .gte("created_at", oneHourAgo);

    if ((recentCount ?? 0) >= 10) {
      return jsonResponse(
        { code: "INTERNAL_ERROR", message: "Rate limit exceeded: max 10 listings per hour. Please wait before listing again." },
        429
      );
    }

    // -----------------------------------------------------------------------
    // 5. Validate event
    // -----------------------------------------------------------------------
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, is_active, date, campus, base_price, title")
      .eq("id", eventId.trim())
      .single();

    if (eventError || !event) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Event not found" }, 400);
    }

    if (!event.is_active) {
      return jsonResponse({ code: "EXPIRED", message: "This event is no longer active" }, 400);
    }

    if (new Date(event.date) < new Date()) {
      return jsonResponse({ code: "EXPIRED", message: "Cannot sell tickets for past events" }, 400);
    }

    // Price cap: base_price + €1
    if (event.base_price !== null && price > event.base_price + 1) {
      return jsonResponse(
        { code: "INVALID_FORMAT", message: `Selling price cannot exceed €${(event.base_price + 1).toFixed(2)} (original price + €1)` },
        400
      );
    }

    // -----------------------------------------------------------------------
    // 6. QR Validation
    // -----------------------------------------------------------------------
    const qrHash = await sha256hex(trimmedQR);

    // 6a. Deduplication — same QR already in marketplace?
    const { data: duplicate } = await supabase
      .from("tickets")
      .select("id, status")
      .eq("qr_hash", qrHash)
      .maybeSingle();

    if (duplicate) {
      const msg =
        duplicate.status === "sold"
          ? "This ticket has already been sold on the marketplace"
          : "This ticket is already listed on the marketplace";
      return jsonResponse({ code: "ALREADY_LISTED", message: msg }, 409);
    }

    // 6b. Signature verification
    let qrVerified = false;
    const signingSecret = Deno.env.get("TICKET_SIGNING_SECRET");

    const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

    if (JWT_RE.test(trimmedQR)) {
      // --- Platform JWT ---
      if (signingSecret) {
        const { valid, payload } = await verifyJWTHS256(trimmedQR, signingSecret);
        if (!valid) {
          return jsonResponse(
            { code: "INVALID_FORMAT", message: "Invalid ticket signature — this ticket may be fraudulent" },
            400
          );
        }

        // JWT expiry
        if (
          payload &&
          typeof payload.exp === "number" &&
          payload.exp < Math.floor(Date.now() / 1000)
        ) {
          return jsonResponse({ code: "EXPIRED", message: "This ticket token has expired" }, 400);
        }

        // Look up ticket in secure_tickets
        if (payload) {
          const ticketRef = (payload.tid ?? payload.sub ?? payload.ticket_id) as string | undefined;
          if (ticketRef) {
            const { data: secTkt } = await supabase
              .from("secure_tickets")
              .select("id, status, is_revoked")
              .eq("ticket_number", ticketRef)
              .maybeSingle();

            if (secTkt) {
              if (secTkt.is_revoked || secTkt.status === "REVOKED") {
                return jsonResponse({ code: "CANCELLED", message: "This ticket has been revoked or cancelled" }, 400);
              }
              if (secTkt.status === "USED") {
                return jsonResponse({ code: "ALREADY_USED", message: "This ticket has already been used at the event" }, 400);
              }
              if (secTkt.status === "EXPIRED") {
                return jsonResponse({ code: "EXPIRED", message: "This ticket has expired" }, 400);
              }
            } else {
              // Signed by our key but not found — could be a forged ID
              return jsonResponse(
                { code: "UNKNOWN_TICKET", message: "Ticket not found in our system" },
                400
              );
            }
          }
        }

        qrVerified = true;
      }
      // No signing secret → accept the JWT as-is (deduplication only)

    } else {
      // --- JSON or plain-text QR ---
      try {
        const qrJson = JSON.parse(trimmedQR) as Record<string, unknown>;

        if (typeof qrJson !== "object" || qrJson === null || Array.isArray(qrJson)) {
          return jsonResponse({ code: "INVALID_FORMAT", message: "QR code contains an invalid data format" }, 400);
        }

        // If a hex 'sig' field is present, verify it
        if (typeof qrJson.sig === "string" && signingSecret) {
          const { sig, ...rest } = qrJson;
          const valid = await verifyHMACHex(JSON.stringify(rest), sig as string, signingSecret);
          if (!valid) {
            return jsonResponse(
              { code: "INVALID_FORMAT", message: "Invalid ticket signature — this ticket may be fraudulent" },
              400
            );
          }
          qrVerified = true;
        }

        // JSON without sig: structural check — must have at least one identifier field
        if (!qrVerified) {
          const idFields = ["id", "tid", "ticket_id", "ticketId", "number", "code", "ref", "token"];
          const hasId = idFields.some((k) => typeof qrJson[k] === "string" && (qrJson[k] as string).length > 0);
          if (!hasId && Object.keys(qrJson).length < 2) {
            return jsonResponse(
              { code: "INVALID_FORMAT", message: "QR code does not contain recognizable ticket information" },
              400
            );
          }
        }
      } catch {
        // Plain text QR — accept if non-trivial length
        if (trimmedQR.length < 5) {
          return jsonResponse(
            { code: "INVALID_FORMAT", message: "QR code text is too short to be a valid ticket" },
            400
          );
        }
        // Accepted as unverified external ticket — qrVerified stays false
      }
    }

    // -----------------------------------------------------------------------
    // 7. Sanitize notes (strip HTML/JS injection vectors)
    // -----------------------------------------------------------------------
    const sanitizedNotes =
      typeof notes === "string" && notes.trim().length > 0
        ? notes.trim().slice(0, 1000).replace(/<[^>]*>/g, "").replace(/on\w+\s*=/gi, "")
        : null;

    // -----------------------------------------------------------------------
    // 8. Insert listing
    // -----------------------------------------------------------------------
    const { data: listing, error: insertError } = await supabase
      .from("tickets")
      .insert({
        event_id: eventId.trim(),
        seller_id: user.id,
        original_price: event.base_price ?? 0,
        selling_price: price,
        quantity: qty,
        notes: sanitizedNotes,
        status: "available",
        qr_hash: qrHash,
        qr_verified: qrVerified,
      })
      .select(
        "id, event_id, seller_id, original_price, selling_price, quantity, notes, status, qr_verified, created_at, updated_at, event:events(id, title, date, location, category, university, campus)"
      )
      .single();

    if (insertError) {
      // Race condition: another insert with same qr_hash won
      if (insertError.code === "23505") {
        return jsonResponse({ code: "ALREADY_LISTED", message: "This ticket is already listed on the marketplace" }, 409);
      }
      throw insertError;
    }

    // Return without exposing the raw hash
    return jsonResponse({ code: "VALID", listing }, 201);

  } catch (err) {
    console.error("[submit-listing] Unhandled error:", err);
    return jsonResponse({ code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." }, 500);
  }
});
