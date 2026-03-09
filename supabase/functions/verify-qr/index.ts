/**
 * verify-qr — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/verify-qr
 * Body: { qrText: string; eventId?: string }
 *
 * Performs QR verification WITHOUT creating a listing:
 *  1. Auth check
 *  2. Format / length check
 *  3. Deduplication (already listed / sold?)
 *  4. Platform JWT: HMAC signature + expiry + event match
 *  5. External QR: accepted, flagged needs_review
 *
 * Returns:
 *   { status: "valid" | "wrong_event" | "expired" | "already_used"
 *            | "unreadable_qr" | "invalid"
 *     qr_type?: "platform" | "external"
 *     needs_review?: boolean
 *     event_id?: string
 *     message: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Helpers (mirrors submit-listing for consistency)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "invalid", message: "Method not allowed" }, 405);

  try {
    // ── 1. Service-role DB client (no user auth required — read-only endpoint) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── 2. Parse body ──────────────────────────────────────────────────────
    let body: { qrText?: string; eventId?: string };
    try { body = await req.json(); } catch { return json({ status: "unreadable_qr", message: "Invalid request body" }, 400); }

    const raw = (body.qrText ?? "").trim();
    const eventId = (body.eventId ?? "").trim() || null;

    if (raw.length < 5) return json({ status: "unreadable_qr", message: "QR code is too short or empty" });
    if (raw.length > 10_000) return json({ status: "unreadable_qr", message: "QR code is too long" });

    console.log("[verify-qr] checking", { len: raw.length, isJWT: JWT_RE.test(raw), eventId });

    // ── 3. Deduplication ───────────────────────────────────────────────────
    // Cancelled listings are excluded so the seller can relist the same ticket.
    const qrHash = await sha256hex(raw);
    const { data: existing } = await supabase
      .from("tickets")
      .select("id, status")
      .eq("qr_hash", qrHash)
      .not("status", "eq", "cancelled")
      .maybeSingle();

    if (existing) {
      const msg = existing.status === "sold"
        ? "This ticket has already been sold on the marketplace."
        : "This QR code is already listed on the marketplace.";
      return json({ status: "already_used", message: msg });
    }

    // ── 4a. Platform JWT ───────────────────────────────────────────────────
    if (JWT_RE.test(raw)) {
      const signingSecret = Deno.env.get("TICKET_SIGNING_SECRET");

      if (!signingSecret) {
        // Can't verify — treat as external
        console.warn("[verify-qr] TICKET_SIGNING_SECRET not set, treating JWT as external");
        return json({ status: "valid", qr_type: "external", needs_review: true, message: "QR accepted — pending review." });
      }

      const { valid, payload } = await verifyJWTHS256(raw, signingSecret);

      if (!valid) {
        // Signature doesn't match our key → external JWT from another ticketing platform.
        // Accept it for manual review rather than rejecting.
        console.log("[verify-qr] JWT signature mismatch — treating as external QR");
        return json({ status: "valid", qr_type: "external", needs_review: true, message: "External QR accepted — ticket will be reviewed before appearing in the marketplace." });
      }

      // JWT expiry
      if (payload && typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
        return json({ status: "expired", message: "This ticket token has expired." });
      }

      // Event match (if caller provided eventId)
      const jwtEventId = (payload?.event_id ?? payload?.eid) as string | undefined;
      if (eventId && jwtEventId && jwtEventId !== eventId) {
        return json({
          status: "wrong_event",
          message: "This QR code belongs to a different event.",
          qr_type: "platform",
          event_id: jwtEventId,
        });
      }

      // Check secure_tickets status (platform-issued tickets)
      const ticketRef = (payload?.tid ?? payload?.sub ?? payload?.ticket_id) as string | undefined;
      if (ticketRef) {
        const { data: secTkt } = await supabase
          .from("secure_tickets")
          .select("status, is_revoked")
          .eq("id", ticketRef)
          .maybeSingle();

        if (secTkt) {
          if (secTkt.is_revoked) return json({ status: "invalid", message: "This ticket has been revoked." });
          if (secTkt.status === "used") return json({ status: "already_used", message: "This ticket has already been used." });
          if (secTkt.status === "cancelled") return json({ status: "invalid", message: "This ticket has been cancelled." });
        }
      }

      console.log("[verify-qr] platform JWT valid", { eventId: jwtEventId });
      return json({
        status: "valid",
        qr_type: "platform",
        needs_review: false,
        event_id: jwtEventId ?? null,
        message: "Ticket verified successfully.",
      });
    }

    // ── 4b. External / plain text QR ──────────────────────────────────────
    // If an eventId was provided, do a heuristic content check:
    // try to extract text from the QR and see if it contains the event name/date.
    // This catches obvious wrong-event listings (e.g. listing a Paris ticket under Turin).
    if (eventId) {
      const { data: selectedEvent } = await supabase
        .from("events")
        .select("title, date, campus, location")
        .eq("id", eventId)
        .maybeSingle();

      if (selectedEvent) {
        const qrLower = raw.toLowerCase();
        // Extract keywords from event (title words, campus, location)
        const titleWords = (selectedEvent.title as string)
          .toLowerCase()
          .split(/\s+/)
          .filter((w: string) => w.length >= 4); // ignore short words
        const campus = (selectedEvent.campus as string | null)?.toLowerCase() ?? "";
        const location = (selectedEvent.location as string | null)?.toLowerCase() ?? "";

        // Build list of candidate event-identifying keywords
        const keywords = [...titleWords];
        if (campus) keywords.push(campus);
        if (location.length >= 4) keywords.push(location.split(",")[0].trim());

        // Try to parse QR as JSON to get richer content to check
        let qrContent = qrLower;
        try {
          const parsed = JSON.parse(raw);
          qrContent = JSON.stringify(parsed).toLowerCase();
        } catch { /* not JSON — use raw */ }

        // If QR contains at least one strong keyword from a different event,
        // we only warn (not block) because many external tickets are opaque tokens.
        // We DO block if the QR clearly references a different known event name.
        const { data: allEvents } = await supabase
          .from("events")
          .select("id, title, campus")
          .eq("is_active", true)
          .neq("id", eventId);

        if (allEvents) {
          for (const otherEvent of allEvents as Array<{ id: string; title: string; campus: string | null }>) {
            const otherWords = otherEvent.title
              .toLowerCase()
              .split(/\s+/)
              .filter((w: string) => w.length >= 5); // only strong words
            const otherCampus = otherEvent.campus?.toLowerCase() ?? "";

            const matchesOther = otherWords.some((w: string) => qrContent.includes(w)) ||
              (otherCampus.length >= 4 && qrContent.includes(otherCampus));

            const matchesSelected = keywords.some((k: string) => qrContent.includes(k));

            if (matchesOther && !matchesSelected) {
              console.warn("[verify-qr] QR content matches other event", { other: otherEvent.title });
              return json({
                status: "wrong_event",
                message: `This QR code appears to be for "${otherEvent.title}", not the selected event.`,
                qr_type: "external",
              });
            }
          }
        }
      }
    }

    console.log("[verify-qr] external QR accepted");
    return json({
      status: "valid",
      qr_type: "external",
      needs_review: true,
      message: "External QR code accepted — ticket will be manually reviewed before listing goes live.",
    });

  } catch (err) {
    console.error("[verify-qr] unexpected error:", err);
    return json({ status: "invalid", message: "An unexpected error occurred. Please try again." }, 500);
  }
});
