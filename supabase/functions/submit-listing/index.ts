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

/**
 * Generate a signed HS256 JWT for admin one-click approve/reject actions.
 * Expires in 48 hours.
 */
async function generateActionJWT(
  ticketId: string,
  action: "approve" | "reject",
  secret: string
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({
    tid: ticketId,
    act: action,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 172800, // 48h
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sigB64}`;
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
    console.log("[submit-listing] auth header present:", !!authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[submit-listing] Missing or malformed Authorization header");
      return jsonResponse({ code: "INVALID_FORMAT", message: "Authentication required. Please log in and try again." }, 401);
    }

    const token = authHeader.slice(7);

    // Use service-role client + getUser(token) — the most reliable auth pattern
    // for Supabase Edge Functions (does not require SUPABASE_ANON_KEY).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("[submit-listing] Auth failed:", authError?.message ?? "no user");
      return jsonResponse({ code: "INVALID_FORMAT", message: "Session expired. Please log in again." }, 401);
    }
    console.log("[submit-listing] authenticated user:", user.id);

    // -----------------------------------------------------------------------
    // 2. Parse body
    // -----------------------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Request body must be valid JSON" }, 400);
    }

    const { eventId, sellingPrice, quantity, notes, qrText, extractedText } = body as {
      eventId?: unknown;
      sellingPrice?: unknown;
      quantity?: unknown;
      notes?: unknown;
      qrText?: unknown;
      extractedText?: unknown;
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
      .select("id, is_active, date, ends_at, campus, base_price, title")
      .eq("id", eventId.trim())
      .single();

    if (eventError || !event) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Event not found" }, 400);
    }

    if (!event.is_active) {
      return jsonResponse({ code: "EXPIRED", message: "This event is no longer active" }, 400);
    }

    // Use ends_at if available, otherwise start + 8 h, with a 6 h grace period.
    const startMs  = new Date(event.date).getTime();
    const endsAtMs = event.ends_at
      ? new Date(event.ends_at).getTime()
      : startMs + 8 * 60 * 60 * 1000;   // default: start + 8 h
    const graceMs  = 6 * 60 * 60 * 1000; // 6 h grace after event end
    const nowMs    = Date.now();

    console.log('[submit-listing] event expiry check', {
      event_id:  eventId,
      starts_at: new Date(startMs).toISOString(),
      ends_at:   new Date(endsAtMs).toISOString(),
      grace_end: new Date(endsAtMs + graceMs).toISOString(),
      now:       new Date(nowMs).toISOString(),
      expired:   nowMs > endsAtMs + graceMs,
    });

    if (nowMs > endsAtMs + graceMs) {
      return jsonResponse({ code: "EXPIRED", message: "Cannot sell tickets for past events" }, 400);
    }

    // -----------------------------------------------------------------------
    // 5b. Cross-event text validation (when PDF text is extracted client-side)
    // Only blocks if the ticket text CLEARLY belongs to a different event:
    // - at least 2 distinctive keywords (>=6 chars) from another event match
    // - AND zero keywords from the selected event match
    // This avoids false positives from shared words (e.g. "ticket", "escp").
    // -----------------------------------------------------------------------
    const rawExtractedText = typeof extractedText === "string" ? extractedText.toLowerCase().trim() : null;

    if (rawExtractedText && rawExtractedText.length > 50) {
      const { data: allEvents } = await supabase
        .from("events")
        .select("id, title, campus")
        .eq("is_active", true);

      if (allEvents && allEvents.length > 0) {
        // Only use long, distinctive words (>=6 chars) to avoid false positives
        const COMMON = new Set(["ticket", "billet", "soiree", "event", "events", "price", "euros", "place", "places"]);
        const selectedKeywords = event.title.toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length >= 6 && !COMMON.has(w));

        for (const otherEvent of allEvents as { id: string; title: string; campus: string | null }[]) {
          if (otherEvent.id === eventId.trim()) continue;

          const otherKeywords = otherEvent.title.toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length >= 6 && !COMMON.has(w));

          // Need at least 2 distinctive keyword matches to flag as wrong event
          const otherMatches = otherKeywords.filter((w: string) => rawExtractedText.includes(w));
          const selectedMatches = selectedKeywords.filter((k: string) => rawExtractedText.includes(k));

          if (otherMatches.length >= 2 && selectedMatches.length === 0) {
            console.log("[submit-listing] text cross-event mismatch", {
              selected: event.title,
              matched_other: otherEvent.title,
              other_matches: otherMatches,
            });
            return jsonResponse({
              code: "INVALID_FORMAT",
              message: `This ticket appears to be for "${otherEvent.title}", not "${event.title}". Please upload the correct ticket.`,
            }, 400);
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 6. QR Validation
    // -----------------------------------------------------------------------
    const qrHash = await sha256hex(trimmedQR);

    // 6a. Deduplication — same QR already active in marketplace?
    // Cancelled listings are excluded so the seller can relist the same ticket.
    const { data: duplicate } = await supabase
      .from("tickets")
      .select("id, status, seller_id")
      .eq("qr_hash", qrHash)
      .not("status", "eq", "cancelled")
      .maybeSingle();

    if (duplicate) {
      if (duplicate.status === "sold" || duplicate.status === "reserved") {
        // Ticket already sold or being purchased — hard block
        return jsonResponse({
          code: "ALREADY_LISTED",
          message: duplicate.status === "sold"
            ? "This ticket has already been sold on the marketplace"
            : "This ticket is currently being purchased by a buyer",
        }, 409);
      }

      if (duplicate.seller_id === user.id) {
        // Same seller relisting — cancel the old listing first, then proceed
        console.log("[submit-listing] same seller relisting — cancelling old listing", duplicate.id);
        await supabase
          .from("tickets")
          .update({ status: "cancelled" })
          .eq("id", duplicate.id);
        // Fall through to create new listing
      } else {
        // Different seller has the same QR — block
        return jsonResponse({
          code: "ALREADY_LISTED",
          message: "This ticket is already listed on the marketplace by another seller",
        }, 409);
      }
    }

    // 6b. Signature verification
    let qrVerified = false;
    let qrType = "plain"; // for debug logging
    const signingSecret = Deno.env.get("TICKET_SIGNING_SECRET");

    const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

    if (JWT_RE.test(trimmedQR)) {
      qrType = "jwt";
      // --- Platform JWT ---
      if (signingSecret) {
        const { valid, payload } = await verifyJWTHS256(trimmedQR, signingSecret);

        if (valid) {
          // This is a TicketSafe-signed JWT — verify it fully
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
              }
              // Not found in secure_tickets — may be an external JWT that happens to pass our signature (very unlikely), accept for review
            }
          }
          qrVerified = true;
        } else {
          // Signature doesn't match our key → external JWT from another platform
          // Accept it for manual review instead of rejecting outright
          console.log("[submit-listing] JWT signature mismatch — treating as external QR for review");
          qrType = "external_jwt";
          // qrVerified stays false → needsReview = true
        }
      }
      // No signing secret → accept the JWT as-is (deduplication only)

    } else {
      // --- JSON or plain-text QR ---
      try {
        const qrJson = JSON.parse(trimmedQR) as Record<string, unknown>;
        qrType = "json";

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
    // 7. Validate notes via allowlist (defense-in-depth)
    //
    // Notes are stored as plain text in Postgres and rendered as text in React
    // (auto-escaped), so HTML injection is already prevented at the display
    // layer.  We validate here with the same allowlist the frontend enforces
    // rather than attempting to strip HTML with regex, which CodeQL correctly
    // flags as an incomplete multi-character sanitization pattern.
    // -----------------------------------------------------------------------
    // Allowlist: letters, digits, whitespace, common punctuation.
    // Must match the notesSchema regex in src/pages/marketplace/Sell.tsx.
    const NOTES_ALLOWLIST = /^[\p{L}\p{N}\s.,!?'"()\-:;€@#]*$/u;
    const rawNotes = typeof notes === "string" ? notes.trim() : "";
    if (rawNotes.length > 1000) {
      return jsonResponse(
        { code: "INVALID_FORMAT", message: "Notes must be 1000 characters or fewer" },
        400
      );
    }
    if (rawNotes.length > 0 && !NOTES_ALLOWLIST.test(rawNotes)) {
      return jsonResponse(
        { code: "INVALID_FORMAT", message: "Notes contain invalid characters. Only letters, numbers, and basic punctuation are allowed." },
        400
      );
    }
    const sanitizedNotes: string | null = rawNotes.length > 0 ? rawNotes : null;

    // -----------------------------------------------------------------------
    // 8. Insert listing
    // -----------------------------------------------------------------------
    const needsReview = !qrVerified;

    console.log("[submit-listing] qr decision", {
      qr_type:      qrType,
      qr_verified:  qrVerified,
      needs_review: needsReview,
      event_id:     eventId,
      event_title:  event.title,
      seller_id:    user.id,
    });

    // ── Try full insert (with QR columns) ──────────────────────────────────
    // Falls back to minimal insert if optional columns don't exist yet (42703).
    let listing: Record<string, unknown> | null = null;

    const fullInsert = await supabase
      .from("tickets")
      .insert({
        event_id:            eventId.trim(),
        seller_id:           user.id,
        selling_price:       price,
        quantity:            qty,
        notes:               sanitizedNotes,
        status:              "available",
        qr_hash:             qrHash,
        qr_verified:         qrVerified,
        needs_review:        needsReview,
        verification_status: qrVerified ? "verified" : "pending",
      })
      .select(
        "id, event_id, seller_id, selling_price, quantity, notes, status, qr_verified, needs_review, created_at, updated_at, event:events(id, title, date, location, category, university, campus)"
      )
      .single();

    if (fullInsert.error) {
      // Duplicate QR hash
      if (fullInsert.error.code === "23505") {
        return jsonResponse({ code: "ALREADY_LISTED", message: "This ticket is already listed on the marketplace" }, 409);
      }
      // Column does not exist → schema not yet migrated, retry with minimal columns
      if (fullInsert.error.code === "42703") {
        console.warn("[submit-listing] Optional columns missing, falling back to minimal insert");
        const minInsert = await supabase
          .from("tickets")
          .insert({
            event_id:      eventId.trim(),
            seller_id:     user.id,
            selling_price: price,
            status:        "available",
          })
          .select(
            "id, event_id, seller_id, selling_price, status, created_at, updated_at, event:events(id, title, date, location, category, university, campus)"
          )
          .single();

        if (minInsert.error) {
          console.error("[submit-listing] Minimal insert also failed:", {
            pg_code:    minInsert.error.code,
            pg_message: minInsert.error.message,
          });
          return jsonResponse(
            { code: "INTERNAL_ERROR", message: `Database error: ${minInsert.error.message}` },
            500
          );
        }
        listing = minInsert.data as Record<string, unknown>;
      } else {
        console.error("[submit-listing] Insert failed:", {
          pg_code:    fullInsert.error.code,
          pg_message: fullInsert.error.message,
          pg_details: fullInsert.error.details,
          pg_hint:    fullInsert.error.hint,
        });
        return jsonResponse(
          { code: "INTERNAL_ERROR", message: `Database error: ${fullInsert.error.message}` },
          500
        );
      }
    } else {
      listing = fullInsert.data as Record<string, unknown>;
    }

    // -----------------------------------------------------------------------
    // 9. Notify admin of pending ticket (fire-and-forget)
    // -----------------------------------------------------------------------
    if (needsReview) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const actionSecret = Deno.env.get("TICKET_SIGNING_SECRET") ?? Deno.env.get("ADMIN_ACTION_SECRET");

      if (resendKey) {
        // Fetch seller profile for display
        const { data: sellerProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle() as { data: { full_name: string; email: string } | null };

        const sellerName = sellerProfile?.full_name ?? "Unknown";
        const sellerEmail = sellerProfile?.email ?? user.email ?? "";
        const listingId = listing?.id as string | undefined;

        // Generate one-click approve/reject URLs if signing secret is available
        let approveUrl = `${siteUrl}/admin/review`;
        let rejectUrl = `${siteUrl}/admin/review`;
        if (actionSecret && listingId) {
          const approveToken = await generateActionJWT(listingId, "approve", actionSecret);
          const rejectToken = await generateActionJWT(listingId, "reject", actionSecret);
          approveUrl = `${supabaseUrl}/functions/v1/admin-quick-action?token=${approveToken}`;
          rejectUrl = `${supabaseUrl}/functions/v1/admin-quick-action?token=${rejectToken}`;
        }

        // Ticket text preview (first 400 chars of extracted PDF text)
        const textPreview = rawExtractedText
          ? rawExtractedText.slice(0, 400).replace(/</g, "&lt;").replace(/>/g, "&gt;")
          : null;

        const qrBadge = qrType === "jwt"
          ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:12px">Platform QR</span>`
          : `<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:4px;font-size:12px">External QR</span>`;

        const eventDate = event.date
          ? new Date(event.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
          : "";

        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "TicketSafe <onboarding@resend.dev>",
            to: ["adrien.menard100@gmail.com"],
            subject: `[TicketSafe] Nouveau billet à vérifier — ${event.title}`,
            html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:#6366f1;padding:24px 32px">
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em">TicketSafe · Admin</p>
    <h1 style="margin:6px 0 0;font-size:20px;color:white;font-weight:600">Nouveau billet en attente de vérification</h1>
  </div>

  <!-- Ticket details -->
  <div style="padding:28px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="padding:8px 0;color:#888;width:40%;vertical-align:top">Événement</td>
        <td style="padding:8px 0;font-weight:600;color:#111">${event.title}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Date</td>
        <td style="padding:8px 0;color:#333;border-top:1px solid #f0f0f0">${eventDate}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Prix</td>
        <td style="padding:8px 0;color:#333;border-top:1px solid #f0f0f0">€${price} × ${qty} billet${qty > 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Vendeur</td>
        <td style="padding:8px 0;color:#333;border-top:1px solid #f0f0f0">${sellerName}<br><span style="font-size:12px;color:#999">${sellerEmail}</span></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">QR Code</td>
        <td style="padding:8px 0;border-top:1px solid #f0f0f0">${qrBadge}</td>
      </tr>
    </table>

    ${textPreview ? `
    <!-- Ticket text preview -->
    <div style="margin-top:20px;background:#f8f8f8;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:14px 16px">
      <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888;font-weight:600">Contenu extrait du billet (PDF)</p>
      <p style="margin:0;font-size:13px;color:#444;line-height:1.6;font-family:monospace;white-space:pre-wrap">${textPreview}${rawExtractedText && rawExtractedText.length > 400 ? "…" : ""}</p>
    </div>` : ""}

    <!-- Action buttons -->
    <div style="margin-top:28px;display:flex;gap:12px">
      <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-right:12px">
        ✓ Approuver
      </a>
      <a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
        ✗ Rejeter
      </a>
    </div>
    <p style="margin:12px 0 0;font-size:12px;color:#999">Ces liens sont valables 48h. Pour rejeter avec une raison personnalisée, utilisez le panneau admin.</p>
  </div>

  <!-- Footer -->
  <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center">
    <a href="${siteUrl}/admin/review" style="font-size:13px;color:#6366f1;text-decoration:none">Voir tous les billets en attente →</a>
  </div>

</div>
</body>
</html>`,
          }),
        }).catch((e: unknown) => console.warn("[submit-listing] email notification failed:", e));
      } else {
        console.log("[submit-listing] RESEND_API_KEY not set — skipping admin notification");
      }
    }

    return jsonResponse({ code: "VALID", listing }, 201);

  } catch (err) {
    console.error("[submit-listing] Unhandled error:", err);
    return jsonResponse({ code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." }, 500);
  }
});
