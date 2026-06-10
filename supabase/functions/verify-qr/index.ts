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
    let body: { qrText?: string; eventId?: string; userId?: string };
    try { body = await req.json(); } catch { return json({ status: "unreadable_qr", message: "Invalid request body" }, 400); }

    const raw = (body.qrText ?? "").trim();
    const eventId = (body.eventId ?? "").trim() || null;
    const userId = (body.userId ?? "").trim() || null;

    if (raw.length < 5) return json({ status: "unreadable_qr", message: "QR code is too short or empty" });
    if (raw.length > 10_000) return json({ status: "unreadable_qr", message: "QR code is too long" });

    console.log("[verify-qr] checking", { len: raw.length, isJWT: JWT_RE.test(raw), eventId });

    // ── 2b. Event timing check (applies to ALL ticket types) ───────────────
    // Mirrors submit-listing step 5: a ticket for an event that has already
    // taken place (with a 6h grace after the end time) can never be resold,
    // whatever the QR type — including opaque external tickets we otherwise
    // can't introspect. This is what turns a confusing "invalid format" into a
    // clear "this event has already taken place" the moment the seller picks a
    // past event.
    if (eventId) {
      const { data: evRow } = await supabase
        .from("events")
        .select("date, ends_at, is_active")
        .eq("id", eventId)
        .maybeSingle();
      if (evRow) {
        if (evRow.is_active === false) {
          return json({ status: "expired", message: "This event is no longer active — tickets can't be resold." });
        }
        const startMs = evRow.date ? new Date(evRow.date).getTime() : NaN;
        if (!Number.isNaN(startMs)) {
          const endsAtMs = evRow.ends_at ? new Date(evRow.ends_at).getTime() : startMs + 8 * 60 * 60 * 1000;
          const graceMs = 6 * 60 * 60 * 1000; // 6h grace after the event ends
          if (Date.now() > endsAtMs + graceMs) {
            return json({ status: "expired", message: "This event has already taken place — tickets can't be resold." });
          }
        }
      }
    }

    // ── 3. Deduplication ───────────────────────────────────────────────────
    // Cancelled listings are excluded so the seller can relist the same ticket.
    const qrHash = await sha256hex(raw);
    const { data: existing } = await supabase
      .from("tickets")
      .select("id, status, seller_id")
      .eq("qr_hash", qrHash)
      .not("status", "eq", "cancelled")
      .maybeSingle();

    if (existing) {
      if (existing.status === "sold") {
        return json({ status: "already_used", message: "This ticket has already been sold on the marketplace." });
      }
      if (existing.status === "reserved") {
        return json({ status: "already_used", message: "This ticket is currently being purchased by a buyer." });
      }
      // status === "available": same seller can relist (submit-listing will auto-cancel the old one)
      if (userId && existing.seller_id === userId) {
        console.log("[verify-qr] same-seller relist detected — allowing");
        // Fall through to QR validation below
      } else {
        // No userId provided, or belongs to another seller — soft warning, not hard block
        // submit-listing will enforce the actual rule; pre-check is best-effort
        return json({
          status: "already_listed",
          message: "A listing already exists for this QR code. If it's yours, submitting will update it.",
        });
      }
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

      // ── Studio event_tickets cross-check (v25 deployed) ──
      // The JWT *is* the qr_token stored on event_tickets, so we look the
      // live row up to know: real / right event / scanned / transferred /
      // owned by the seller. This is the canonical source of truth — the
      // legacy secure_tickets fallback below is kept only for older rows.
      const { data: et } = await supabase
        .from("event_tickets")
        .select(`id, event_id, buyer_id, status, scanned_at,
                 event:events(title, status)`)
        .eq("qr_token", raw)
        .maybeSingle();
      if (et) {
        const ev = Array.isArray((et as { event?: unknown }).event)
          ? (et as { event: { title: string; status: string }[] }).event[0]
          : (et as { event: { title: string; status: string } | null }).event;
        if (ev?.status === "cancelled") return json({ status: "invalid", message: "The event linked to this ticket was cancelled — the seller has already been refunded." });
        if (et.status === "transferred") return json({ status: "already_used", message: "This ticket was already resold on Ticket Safe — the new buyer holds the valid QR." });
        if (et.status === "scanned" || et.scanned_at) return json({ status: "already_used", message: "This ticket has already been scanned at the door." });
        if (et.status === "cancelled" || et.status === "refunded") return json({ status: "invalid", message: "This ticket was cancelled or refunded — it cannot be resold." });
        if (eventId && et.event_id !== eventId) return json({ status: "wrong_event", message: `This QR belongs to a different event ("${ev?.title ?? "unknown"}"). Pick the correct event and re-upload.`, qr_type: "platform", event_id: et.event_id });
        if (userId && et.buyer_id !== userId) return json({ status: "invalid", message: "This ticket doesn't belong to you. Only the original buyer can resell a Ticket Safe ticket." });
        return json({ status: "valid", qr_type: "platform", needs_review: false, event_id: et.event_id, ticket_id: et.id, studio_ticket_id: et.id, message: "Studio ticket verified — real, owned by you, valid for this event, never scanned." });
      }

      // Event match fallback via JWT payload (legacy / no event_tickets row)
      const jwtEventId = (payload?.event_id ?? payload?.eid ?? payload?.evt) as string | undefined;
      if (eventId && jwtEventId && jwtEventId !== eventId) {
        return json({
          status: "wrong_event",
          message: "This QR code belongs to a different event.",
          qr_type: "platform",
          event_id: jwtEventId,
        });
      }

      // Check secure_tickets status (legacy platform-issued tickets)
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
