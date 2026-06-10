/**
 * submit-listing v57 — v56 + resale-validation email also goes to the shared
 * Ticket Safe inbox (primary) and is flagged high-priority.
 * v56: anti-scalping cap on resale price (max 1.5× face value).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type QRValidationCode =
  | "VALID" | "INVALID_FORMAT" | "UNKNOWN_TICKET" | "ALREADY_LISTED"
  | "ALREADY_USED" | "CANCELLED" | "REFUNDED" | "EXPIRED" | "INTERNAL_ERROR";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function generateActionJWT(ticketId: string, action: "approve" | "reject", secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({ tid: ticketId, act: action, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 172800 })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sigB64}`;
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64urlToBytes(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "==".slice(0, 4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifyJWTHS256(token: string, secret: string): Promise<{ valid: boolean; payload: Record<string, unknown> | null }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, payload: null };
    const [headerB64, payloadB64, signatureB64] = parts;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = base64urlToBytes(signatureB64);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    if (!valid) return { valid: false, payload: null };
    const payloadJson = new TextDecoder().decode(base64urlToBytes(payloadB64));
    return { valid: true, payload: JSON.parse(payloadJson) };
  } catch { return { valid: false, payload: null }; }
}

async function verifyHMACHex(dataStr: string, sigHex: string, secret: string): Promise<boolean> {
  try {
    const sigBytes = new Uint8Array((sigHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(dataStr));
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ code: "INTERNAL_ERROR", message: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ code: "INVALID_FORMAT", message: "Authentication required. Please log in and try again." }, 401);
    }
    const token = authHeader.slice(7);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse({ code: "INVALID_FORMAT", message: "Session expired. Please log in again." }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return jsonResponse({ code: "INVALID_FORMAT", message: "Request body must be valid JSON" }, 400); }

    const { eventId, sellingPrice, quantity, notes, qrText, extractedText, fileBase64, fileName } = body as {
      eventId?: unknown; sellingPrice?: unknown; quantity?: unknown; notes?: unknown; qrText?: unknown;
      extractedText?: unknown; fileBase64?: unknown; fileName?: unknown; fileMimeType?: unknown;
    };

    if (!eventId || typeof eventId !== "string" || eventId.trim() === "") return jsonResponse({ code: "INVALID_FORMAT", message: "eventId is required" }, 400);
    if (!qrText || typeof qrText !== "string" || qrText.trim() === "") return jsonResponse({ code: "INVALID_FORMAT", message: "QR code text is required" }, 400);
    const trimmedQR = qrText.trim();
    if (trimmedQR.length > 10_000) return jsonResponse({ code: "INVALID_FORMAT", message: "QR code text is too long (max 10 000 characters)" }, 400);

    const price = typeof sellingPrice === "number" ? sellingPrice : parseFloat(String(sellingPrice ?? ""));
    if (!isFinite(price) || price <= 0 || price > 10_000) return jsonResponse({ code: "INVALID_FORMAT", message: "Selling price must be between €0.01 and €10,000" }, 400);

    const qty = Number.isInteger(quantity) ? (quantity as number) : parseInt(String(quantity ?? "1"), 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) return jsonResponse({ code: "INVALID_FORMAT", message: "Quantity must be between 1 and 10" }, 400);

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recentCount } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("seller_id", user.id).gte("created_at", oneHourAgo);
    if ((recentCount ?? 0) >= 10) return jsonResponse({ code: "INTERNAL_ERROR", message: "Rate limit exceeded: max 10 listings per hour. Please wait before listing again." }, 429);

    const { data: event, error: eventError } = await supabase.from("events").select("id, is_active, date, ends_at, campus, base_price, title").eq("id", eventId.trim()).single();
    if (eventError || !event) return jsonResponse({ code: "INVALID_FORMAT", message: "Event not found" }, 400);
    if (!event.is_active) return jsonResponse({ code: "EXPIRED", message: "This event is no longer active" }, 400);

    const startMs = new Date(event.date).getTime();
    const endsAtMs = event.ends_at ? new Date(event.ends_at).getTime() : startMs + 8 * 60 * 60 * 1000;
    const graceMs = 6 * 60 * 60 * 1000;
    if (Date.now() > endsAtMs + graceMs) return jsonResponse({ code: "EXPIRED", message: "Cannot sell tickets for past events" }, 400);

    // ── Anti-scalping cap (max 1.5× face value) ──
    {
      const { data: tiers } = await supabase.from("event_tiers").select("price_cents").eq("event_id", eventId.trim());
      const maxTierCents = (tiers ?? []).reduce((m: number, t: { price_cents?: number }) => Math.max(m, t.price_cents ?? 0), 0);
      const refCents = maxTierCents > 0
        ? maxTierCents
        : (typeof event.base_price === "number" ? Math.round(event.base_price * 100) : 0);
      if (refCents > 0) {
        const capCents = Math.ceil(refCents * 1.5);
        if (Math.round(price * 100) > capCents) {
          return jsonResponse({
            code: "INVALID_FORMAT",
            message: `Anti-scalping: you cannot sell above €${(capCents / 100).toFixed(2)} (face value × 1.5).`,
          }, 400);
        }
      }
    }

    const rawExtractedText = typeof extractedText === "string" ? extractedText.toLowerCase().trim() : null;
    if (rawExtractedText && rawExtractedText.length > 50) {
      const { data: allEvents } = await supabase.from("events").select("id, title, campus").eq("is_active", true);
      if (allEvents && allEvents.length > 0) {
        const COMMON = new Set(["ticket", "billet", "soiree", "event", "events", "price", "euros", "place", "places"]);
        const selectedKeywords = event.title.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 6 && !COMMON.has(w));
        for (const otherEvent of allEvents as { id: string; title: string; campus: string | null }[]) {
          if (otherEvent.id === eventId.trim()) continue;
          const otherKeywords = otherEvent.title.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 6 && !COMMON.has(w));
          const otherMatches = otherKeywords.filter((w: string) => rawExtractedText.includes(w));
          const selectedMatches = selectedKeywords.filter((k: string) => rawExtractedText.includes(k));
          if (otherMatches.length >= 2 && selectedMatches.length === 0) {
            return jsonResponse({ code: "INVALID_FORMAT", message: `This ticket appears to be for "${otherEvent.title}", not "${event.title}". Please upload the correct ticket.` }, 400);
          }
        }
      }
    }

    const qrHash = await sha256hex(trimmedQR);
    const { data: duplicate } = await supabase.from("tickets").select("id, status, seller_id").eq("qr_hash", qrHash).not("status", "eq", "cancelled").maybeSingle();
    if (duplicate) {
      if (duplicate.seller_id === user.id) {
        await supabase.from("tickets").delete().eq("id", duplicate.id);
      } else if (duplicate.status === "sold") {
        return jsonResponse({ code: "ALREADY_LISTED", message: "This ticket has already been sold on the marketplace" }, 409);
      } else {
        return jsonResponse({ code: "ALREADY_LISTED", message: "This ticket is already listed on the marketplace by another seller" }, 409);
      }
    }

    let qrVerified = false;
    let qrType = "plain";
    let linkedStudioTicketId: string | null = null;
    const signingSecret = Deno.env.get("TICKET_SIGNING_SECRET");
    const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

    if (JWT_RE.test(trimmedQR)) {
      qrType = "jwt";
      if (signingSecret) {
        const { valid, payload } = await verifyJWTHS256(trimmedQR, signingSecret);
        if (valid) {
          if (payload && typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
            return jsonResponse({ code: "EXPIRED", message: "This ticket token has expired" }, 400);
          }
          const { data: et } = await supabase
            .from("event_tickets")
            .select(`id, event_id, buyer_id, status, scanned_at, event:events(title, status)`)
            .eq("qr_token", trimmedQR)
            .maybeSingle();
          if (et) {
            const ev = Array.isArray((et as { event?: unknown }).event)
              ? (et as { event: { title: string; status: string }[] }).event[0]
              : (et as { event: { title: string; status: string } | null }).event;
            if (ev?.status === "cancelled") return jsonResponse({ code: "CANCELLED", message: "The event linked to this ticket was cancelled — the original buyer has been refunded." }, 400);
            if (et.status === "transferred") return jsonResponse({ code: "ALREADY_USED", message: "This ticket was already resold on Ticket Safe — the new buyer holds the valid QR." }, 400);
            if (et.status === "scanned" || et.scanned_at) return jsonResponse({ code: "ALREADY_USED", message: "This ticket has already been scanned at the door." }, 400);
            if (et.status === "cancelled" || et.status === "refunded") return jsonResponse({ code: "CANCELLED", message: "This ticket was cancelled or refunded — it cannot be resold." }, 400);
            if (et.event_id !== eventId.trim()) return jsonResponse({ code: "INVALID_FORMAT", message: `This QR belongs to a different event ("${ev?.title ?? "unknown"}"). Pick the correct event and re-upload.` }, 400);
            if (et.buyer_id !== user.id) return jsonResponse({ code: "INVALID_FORMAT", message: "This ticket doesn't belong to you. Only the original buyer can resell a Ticket Safe ticket." }, 400);
            linkedStudioTicketId = et.id;
          } else if (payload) {
            const ticketRef = (payload.tid ?? payload.sub ?? payload.ticket_id) as string | undefined;
            if (ticketRef) {
              const { data: secTkt } = await supabase.from("secure_tickets").select("id, status, is_revoked").eq("ticket_number", ticketRef).maybeSingle();
              if (secTkt) {
                if (secTkt.is_revoked || secTkt.status === "REVOKED") return jsonResponse({ code: "CANCELLED", message: "This ticket has been revoked or cancelled" }, 400);
                if (secTkt.status === "USED") return jsonResponse({ code: "ALREADY_USED", message: "This ticket has already been used at the event" }, 400);
                if (secTkt.status === "EXPIRED") return jsonResponse({ code: "EXPIRED", message: "This ticket has expired" }, 400);
              }
            }
          }
          qrVerified = true;
        } else {
          qrType = "external_jwt";
        }
      }
    } else {
      try {
        const qrJson = JSON.parse(trimmedQR) as Record<string, unknown>;
        qrType = "json";
        if (typeof qrJson !== "object" || qrJson === null || Array.isArray(qrJson)) return jsonResponse({ code: "INVALID_FORMAT", message: "QR code contains an invalid data format" }, 400);
        if (typeof qrJson.sig === "string" && signingSecret) {
          const { sig, ...rest } = qrJson;
          const valid = await verifyHMACHex(JSON.stringify(rest), sig as string, signingSecret);
          if (!valid) return jsonResponse({ code: "INVALID_FORMAT", message: "Invalid ticket signature — this ticket may be fraudulent" }, 400);
          qrVerified = true;
        }
        if (!qrVerified) {
          const idFields = ["id", "tid", "ticket_id", "ticketId", "number", "code", "ref", "token"];
          const hasId = idFields.some((k) => typeof qrJson[k] === "string" && (qrJson[k] as string).length > 0);
          if (!hasId && Object.keys(qrJson).length < 2) return jsonResponse({ code: "INVALID_FORMAT", message: "QR code does not contain recognizable ticket information" }, 400);
        }
      } catch {
        if (trimmedQR.length < 5) return jsonResponse({ code: "INVALID_FORMAT", message: "QR code text is too short to be a valid ticket" }, 400);
      }
    }

    const NOTES_ALLOWLIST = /^[\p{L}\p{N}\s.,!?'"()\-:;€@#]*$/u;
    const rawNotes = typeof notes === "string" ? notes.trim() : "";
    if (rawNotes.length > 1000) return jsonResponse({ code: "INVALID_FORMAT", message: "Notes must be 1000 characters or fewer" }, 400);
    if (rawNotes.length > 0 && !NOTES_ALLOWLIST.test(rawNotes)) return jsonResponse({ code: "INVALID_FORMAT", message: "Notes contain invalid characters. Only letters, numbers, and basic punctuation are allowed." }, 400);
    const sanitizedNotes: string | null = rawNotes.length > 0 ? rawNotes : null;

    const isStudioResale = linkedStudioTicketId !== null;
    const needsReview = !isStudioResale;

    let listing: Record<string, unknown> | null = null;
    const fullInsert = await supabase
      .from("tickets")
      .insert({
        event_id: eventId.trim(),
        seller_id: user.id,
        selling_price: price,
        quantity: qty,
        notes: sanitizedNotes,
        status: "available",
        qr_hash: qrHash,
        qr_verified: isStudioResale ? true : qrVerified,
        needs_review: needsReview,
        verification_status: isStudioResale ? "verified" : "pending",
        studio_ticket_id: linkedStudioTicketId,
      })
      .select("id, event_id, seller_id, selling_price, quantity, notes, status, qr_verified, needs_review, created_at, updated_at, event:events(id, title, date, location, category, university, campus)")
      .single();
    if (fullInsert.error) {
      if (fullInsert.error.code === "23505") return jsonResponse({ code: "ALREADY_LISTED", message: "This ticket is already listed on the marketplace" }, 409);
      return jsonResponse({ code: "INTERNAL_ERROR", message: `Database error: ${fullInsert.error.message}` }, 500);
    }
    listing = fullInsert.data as Record<string, unknown>;

    if (!isStudioResale) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const actionSecret = Deno.env.get("TICKET_SIGNING_SECRET") ?? Deno.env.get("ADMIN_ACTION_SECRET");
      if (resendKey) {
        const { data: sellerProfile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle() as { data: { full_name: string; email: string } | null };
        const sellerName = sellerProfile?.full_name ?? "Unknown";
        const sellerEmail = sellerProfile?.email ?? user.email ?? "";
        const listingId = listing?.id as string | undefined;
        let approveUrl = `${siteUrl}/admin/review`;
        let rejectUrl = `${siteUrl}/admin/review`;
        if (actionSecret && listingId) {
          const approveToken = await generateActionJWT(listingId, "approve", actionSecret);
          const rejectToken = await generateActionJWT(listingId, "reject", actionSecret);
          approveUrl = `${supabaseUrl}/functions/v1/admin-quick-action?token=${approveToken}`;
          rejectUrl = `${supabaseUrl}/functions/v1/admin-quick-action?token=${rejectToken}`;
        }
        const textPreview = rawExtractedText ? rawExtractedText.slice(0, 400).replace(/</g, "&lt;").replace(/>/g, "&gt;") : null;
        const qrBadge = qrType === "jwt" ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:12px">Platform QR</span>` : `<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:4px;font-size:12px">External QR</span>`;
        const eventDate = event.date ? new Date(event.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TicketSafe <noreply@ticket-safe.eu>",
            // High-importance so the validation surfaces immediately on the
            // team's phones (set the sender as a VIP for the actual ring).
            headers: { "X-Priority": "1 (Highest)", "X-MSMail-Priority": "High", Importance: "high" },
            // Lands in the shared Ticket Safe inbox (primary, monitored) AND on
            // Achille's + Adrien's phones so the resale ticket is reviewed fast.
            to: ["ticketsafe.friendly@gmail.com", "achille.quinquenel@edu.escp.eu", "adrien.menard@edu.escp.eu"],
            subject: `[URGENT] Nouveau billet à valider — ${event.title}`,
            html: `<div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="background:#6366f1;padding:24px 32px;color:white"><p style="margin:0;font-size:13px;opacity:.7;text-transform:uppercase">TicketSafe · Admin</p><h1 style="margin:6px 0 0;font-size:20px;font-weight:600">Nouveau billet en attente</h1></div><div style="padding:28px 32px"><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:8px 0;color:#888;width:40%">Événement</td><td style="padding:8px 0;font-weight:600">${event.title}</td></tr><tr><td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Date</td><td style="padding:8px 0;border-top:1px solid #f0f0f0">${eventDate}</td></tr><tr><td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Prix</td><td style="padding:8px 0;border-top:1px solid #f0f0f0">€${price} × ${qty} billet${qty > 1 ? "s" : ""}</td></tr><tr><td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">Vendeur</td><td style="padding:8px 0;border-top:1px solid #f0f0f0">${sellerName}<br><span style="font-size:12px;color:#999">${sellerEmail}</span></td></tr><tr><td style="padding:8px 0;color:#888;border-top:1px solid #f0f0f0">QR Code</td><td style="padding:8px 0;border-top:1px solid #f0f0f0">${qrBadge}</td></tr></table>${textPreview ? `<div style="margin-top:20px;background:#f8f8f8;border-left:3px solid #6366f1;padding:14px 16px"><p style="margin:0 0 6px;font-size:11px;color:#888">Contenu extrait</p><p style="margin:0;font-size:13px;font-family:monospace;white-space:pre-wrap">${textPreview}</p></div>` : ""}<div style="margin-top:28px"><a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:12px">✓ Approuver</a><a href="${rejectUrl}" style="display:inline-block;background:#dc2626;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">✗ Rejeter</a></div></div></div>`,
            ...(typeof fileBase64 === "string" && typeof fileName === "string" && fileBase64.length > 0 ? { attachments: [{ filename: fileName, content: fileBase64 }] } : {}),
          }),
        }).catch((e: unknown) => console.warn("[submit-listing v57] email failed:", e));
      }
    }

    const { data: priceAgg } = await supabase.from("tickets").select("selling_price").eq("event_id", eventId.trim()).eq("status", "available").order("selling_price", { ascending: true }).limit(1).maybeSingle();
    if (priceAgg) await supabase.from("events").update({ base_price: priceAgg.selling_price }).eq("id", eventId.trim());

    return jsonResponse({ code: "VALID", listing, studio_ticket_id: linkedStudioTicketId, auto_approved: isStudioResale }, 201);
  } catch (err) {
    console.error("[submit-listing v57] Unhandled error:", err);
    return jsonResponse({ code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." }, 500);
  }
});
