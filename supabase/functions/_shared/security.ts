/**
 * Shared security helpers for Ticket Safe edge functions.
 *
 *  ┌────────────────────────────────────────────────────────────────────────┐
 *  │ DESIGN                                                                │
 *  │                                                                       │
 *  │ Edge functions sit between the browser (untrusted input) and the      │
 *  │ database / Stripe / Resend (privileged actions). This module is the   │
 *  │ single source of truth for:                                           │
 *  │                                                                       │
 *  │   • rateLimit()     — server-side burst & per-user limits, backed by  │
 *  │                       the public.rate_limit_consume RPC.              │
 *  │   • audit()         — append-only sensitive-action recording in       │
 *  │                       public.audit_log (admin-readable only).         │
 *  │   • clientIp()      — best-effort IP extraction from Supabase CDN     │
 *  │                       headers, IPv6/IPv4 aware.                       │
 *  │   • requireUser()   — common bearer-token auth gate used by every     │
 *  │                       authenticated function.                         │
 *  │   • redactForLog()  — strip PII before any console.log so secrets do  │
 *  │                       not leak into the function log stream.          │
 *  │                                                                       │
 *  │ Keep this file SMALL and POLICY-ONLY. Any caller that needs Stripe    │
 *  │ or Resend should call them directly — security primitives compose.    │
 *  └────────────────────────────────────────────────────────────────────────┘
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────────────────────────────────────────────── CONFIG / TYPES

export interface RateLimitConfig {
  /** Logical bucket name, e.g. "auth_login" or "studio_checkout". */
  bucket: string;
  /** Caller identifier — usually the user ID, falling back to IP. */
  key: string;
  /** How many requests are allowed in one window. */
  max: number;
  /** Window size in seconds. Limits reset at the end of every window. */
  windowSec: number;
}

export interface AuditRecord {
  action: string;          // e.g. "auth.login_failed"
  targetKind?: string;     // e.g. "event_order"
  targetId?: string;
  meta?: Record<string, unknown>;
  actorId?: string;
  actorEmail?: string;
  ip?: string;
  userAgent?: string;
}

// ──────────────────────────────────────────────────────────────────── CLIENT

/** Singleton Supabase client with service role. Cached per cold start. */
let _service: SupabaseClient | null = null;

function serviceClient(): SupabaseClient {
  if (_service) return _service;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("[security] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  }
  _service = createClient(url, key, { auth: { persistSession: false } });
  return _service;
}

// ────────────────────────────────────────────────────────────── RATE LIMITING

/**
 * Enforce a rate limit. Returns `{ ok: true }` if the request is allowed,
 * `{ ok: false, status: 429 }` otherwise. Always fails open if the DB is
 * unreachable — availability over hardening, because rate limiting is a
 * defense-in-depth layer, not a primary auth control.
 */
export async function rateLimit(
  cfg: RateLimitConfig,
): Promise<{ ok: true } | { ok: false; status: 429; error: string }> {
  try {
    const { data, error } = await serviceClient().rpc("rate_limit_consume", {
      p_bucket: cfg.bucket,
      p_key: cfg.key,
      p_max_hits: cfg.max,
      p_window_sec: cfg.windowSec,
    });
    if (error) {
      console.warn("[rateLimit] rpc error (failing open):", error.message);
      return { ok: true };
    }
    if (data === true) return { ok: true };
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please wait a moment and try again.",
    };
  } catch (err) {
    console.warn("[rateLimit] unexpected (failing open):", err);
    return { ok: true };
  }
}

// ──────────────────────────────────────────────────────────────────── AUDIT

/**
 * Record a sensitive action in the append-only audit log. Best-effort —
 * the caller's main flow must not be blocked if logging fails.
 */
export async function audit(record: AuditRecord): Promise<void> {
  try {
    const { error } = await serviceClient().rpc("audit_record", {
      p_action: record.action.slice(0, 80),
      p_target_kind: record.targetKind?.slice(0, 40) ?? null,
      p_target_id: record.targetId?.slice(0, 120) ?? null,
      p_meta: record.meta ?? {},
      p_actor_id: record.actorId ?? null,
      p_actor_email: record.actorEmail ?? null,
      p_ip: record.ip ?? null,
      p_user_agent: record.userAgent?.slice(0, 400) ?? null,
    });
    if (error) console.warn("[audit] insert failed:", error.message);
  } catch (err) {
    console.warn("[audit] unexpected:", err);
  }
}

// ───────────────────────────────────────────────────────────────────── REQ

/** Pull the client IP from CDN headers. Falls back to "unknown". */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Bound user-agent length so a malicious caller cannot pollute the log. */
export function clientUserAgent(req: Request): string {
  return (req.headers.get("user-agent") ?? "").slice(0, 400);
}

/**
 * Authenticate the request using its `Authorization: Bearer <jwt>` header.
 * Returns the resolved Supabase user, or a 401 response ready to be returned.
 *
 * Use:
 *   const auth = await requireUser(req);
 *   if (!("user" in auth)) return auth.response;
 *   const user = auth.user;
 */
export async function requireUser(
  req: Request,
): Promise<{ user: { id: string; email?: string | null } } | { response: Response }> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      }),
    };
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await serviceClient().auth.getUser(token);
  if (error || !user) {
    return {
      response: new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: corsHeaders,
      }),
    };
  }
  return { user: { id: user.id, email: user.email } };
}

// ───────────────────────────────────────────────────────────────────── LOGS

/**
 * Strip obviously sensitive fields before passing an object to console.log.
 * Stripe + Supabase service-role keys, raw JWTs, IBANs, and full email
 * addresses are masked. Pass through anything else.
 */
export function redactForLog<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const cloned: Record<string, unknown> = Array.isArray(value)
    ? ([...value] as unknown as Record<string, unknown>)
    : { ...(value as Record<string, unknown>) };
  for (const k of Object.keys(cloned)) {
    const v = cloned[k];
    if (typeof v === "string") {
      const lower = k.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("api_key") ||
        lower === "authorization"
      ) {
        cloned[k] = "***redacted***";
      } else if (lower === "email" && v.includes("@")) {
        // Mask local part: a***@example.com
        const [local, domain] = v.split("@");
        cloned[k] = `${local[0]}***@${domain}`;
      } else if (lower === "iban" || lower === "card_number") {
        cloned[k] = v.length > 4 ? `****${v.slice(-4)}` : "****";
      }
    } else if (v && typeof v === "object") {
      cloned[k] = redactForLog(v);
    }
  }
  return cloned as unknown as T;
}
