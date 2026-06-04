/**
 * ticketJwt — HMAC-SHA256 (HS256) JWT signing/verification for Studio tickets.
 *
 * Why this exists
 * ---------------
 * Before: event_tickets.qr_token was a random 40-char hex string. That's a
 * unique opaque token, but a door scanner can't tell "this is a real Ticket
 * Safe ticket" until it hits the database — and worse, anyone could forge
 * an arbitrary-looking string and we'd issue an audit_log entry for every
 * such attempt. There's no cryptographic binding to a specific ticket_id +
 * event_id + expiry.
 *
 * After: qr_token = signed JWT. The scanner can verify the signature offline
 * (or before the DB lookup) and immediately reject anything not signed by us.
 * The payload encodes the ticket_id (sub), event_id (evt) and an expiry tied
 * to the event date, so a stale or wrong-event token is caught before any DB
 * round-trip.
 *
 * Reuses the same algorithm as verify-qr/index.ts's verifyJWTHS256 so the
 * resale flow (seller submits an external JWT we may have issued) and the
 * Studio flow (we issue the JWT) stay symmetric.
 *
 * The secret is read from Deno.env.get("TICKET_SIGNING_SECRET"). Both
 * functions in this folder fall back gracefully when the secret is missing
 * (sign returns null → caller writes a legacy random token; verify reports
 * "secret_missing" → caller can decide to soft-allow or hard-reject).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(b64url: string): Uint8Array {
  const pad = b64url.length % 4 === 0 ? "" : "==".slice(0, 4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

export interface StudioTicketJwtPayload {
  iss: string; // "ticket-safe.eu/studio"
  sub: string; // event_tickets.id (UUID) — the canonical identifier
  evt: string; // event_id (UUID)
  iat: number; // issued at, seconds
  exp: number; // expires at, seconds — typically event_date + 24h
}

/**
 * Sign a Studio ticket JWT. Returns null if TICKET_SIGNING_SECRET is missing
 * (callers should then fall back to a legacy random hex token and log the
 * misconfiguration once at boot).
 */
export async function signStudioTicketJWT(params: {
  ticket_id: string;
  event_id: string;
  /** Expiry, in seconds since epoch. Convention: event_date + 24h. */
  exp_seconds: number;
}): Promise<string | null> {
  const secret = Deno.env.get("TICKET_SIGNING_SECRET");
  if (!secret) return null;

  const header = { alg: "HS256", typ: "JWT" };
  const payload: StudioTicketJwtPayload = {
    iss: "ticket-safe.eu/studio",
    sub: params.ticket_id,
    evt: params.event_id,
    iat: Math.floor(Date.now() / 1000),
    exp: params.exp_seconds,
  };

  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigB64 = base64urlEncode(new Uint8Array(sigBytes));

  return `${data}.${sigB64}`;
}

export type VerifyResult =
  | { ok: true; payload: StudioTicketJwtPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_issuer" | "secret_missing" | "exception"; payload?: StudioTicketJwtPayload };

/**
 * Verify a Studio ticket JWT. Returns {ok: false, reason: 'secret_missing'}
 * if the env var isn't set — callers should treat this as a server error,
 * not as a forgery.
 */
export async function verifyStudioTicketJWT(token: string): Promise<VerifyResult> {
  const secret = Deno.env.get("TICKET_SIGNING_SECRET");
  if (!secret) return { ok: false, reason: "secret_missing" };

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed" };
    const [headerB64, payloadB64, sigB64] = parts;

    const key = await getKey(secret, ["verify"]);
    const sigBytes = base64urlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return { ok: false, reason: "bad_signature" };

    const payload = JSON.parse(dec.decode(base64urlDecode(payloadB64))) as StudioTicketJwtPayload;

    if (payload.iss !== "ticket-safe.eu/studio") {
      return { ok: false, reason: "wrong_issuer", payload };
    }
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, reason: "expired", payload };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "exception" };
  }
}

/**
 * Quick shape check used by callers that want to know whether a string LOOKS
 * like a JWT (3 base64url-ish parts) without doing the crypto. Useful for
 * routing between legacy random hex tokens and signed JWTs in the same
 * verifier — see validate-event-ticket.
 */
export function looksLikeJWT(s: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}
