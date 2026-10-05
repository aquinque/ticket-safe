/**
 * send-auth-email — Supabase Auth "Send Email Hook"
 *
 * Replaces Supabase's built-in auth emails (signup confirm, password reset,
 * magic link, email change, etc.) with branded Ticket Safe templates sent
 * via Resend.
 *
 * Setup:
 *   1. Resend domain `ticket-safe.eu` verified (already used by other functions).
 *   2. Function secrets:
 *        RESEND_API_KEY        — Resend API key
 *        SEND_EMAIL_HOOK_SECRET — Standard Webhooks signing secret from
 *                                 Supabase Dashboard → Auth → Hooks
 *        SITE_URL              — https://ticket-safe.eu
 *   3. Supabase Dashboard → Authentication → Hooks → Send Email hook →
 *        URL: https://<project-ref>.supabase.co/functions/v1/send-auth-email
 *        Secret: same value as SEND_EMAIL_HOOK_SECRET
 *
 * Payload (Standard Webhooks signed) from Supabase Auth:
 *   {
 *     user: { id, email, ... },
 *     email_data: {
 *       token, token_hash, redirect_to,
 *       email_action_type: "signup" | "recovery" | "magiclink" |
 *                          "invite" | "email_change" | "reauthentication",
 *       site_url, token_new, token_hash_new
 *     }
 *   }
 */

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { renderEmail } from "../_shared/emailComponents.ts";
import { legalFooter } from "../_shared/emailTokens.ts";
import { buildAuthEmailContent, nextPathFor } from "../_shared/authEmailContent.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface AuthHookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      | "signup"
      | "login"
      | "invite"
      | "magiclink"
      | "recovery"
      | "email_change"
      | "email_change_current"
      | "email_change_new"
      | "reauthentication";
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

/** Build a link that goes directly to the app and lets it call verifyOtp.
 *  This bypasses the Supabase /verify redirect (which is PKCE-dependent and
 *  fails when the email is opened in a different browser than the one that
 *  originated the request).
 *
 *  Format:  {SITE_URL}/auth/confirm?token_hash=...&type=...&next=/...
 */
function buildVerifyUrl(payload: AuthHookPayload): string {
  const { token_hash, email_action_type, redirect_to } = payload.email_data;
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu").replace(
    /\/+$/,
    "",
  );

  const next = nextPathFor(email_action_type, redirect_to);

  const params = new URLSearchParams({
    token_hash,
    type: email_action_type,
    next,
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!hookSecret) {
    console.error("[send-auth-email] SEND_EMAIL_HOOK_SECRET is not set");
    return json({ error: "Hook secret not configured" }, 500);
  }
  if (!resendKey) {
    console.error("[send-auth-email] RESEND_API_KEY is not set");
    return json({ error: "Resend API key not configured" }, 500);
  }

  // Verify Standard Webhooks signature so only Supabase Auth can call us.
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);

  let payload: AuthHookPayload;
  try {
    // The Send Email hook secret arrives prefixed with "v1,whsec_..." in
    // Supabase Dashboard. Strip the "v1," prefix if present, then verify.
    const secret = hookSecret.startsWith("v1,") ? hookSecret.slice(3) : hookSecret;
    const wh = new Webhook(secret);
    payload = wh.verify(raw, headers) as AuthHookPayload;
  } catch (err) {
    console.error("[send-auth-email] signature verification failed:", err);
    return json({ error: "Invalid signature" }, 401);
  }

  if (!payload?.user?.email || !payload?.email_data?.email_action_type) {
    return json({ error: "Malformed payload" }, 400);
  }

  console.log(
    "[send-auth-email] action:",
    payload.email_data.email_action_type,
    "→",
    payload.user.email,
  );

  const verifyLink = buildVerifyUrl(payload);
  // Wording lives in _shared/authEmailContent.ts (French, with an "activate your
  // account" version for accounts created by a purchase without an account).
  const content = buildAuthEmailContent({
    user: payload.user,
    action: payload.email_data.email_action_type,
    link: verifyLink,
    otp: payload.email_data.token,
  });

  const { html, text } = renderEmail({
    eyebrow: content.eyebrow,
    title: content.title,
    bodyHtml: content.bodyHtml,
    preheader: content.preheader,
    text: content.text,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ticket Safe <noreply@ticket-safe.eu>",
        // Replies reach the support inbox instead of the no-reply address.
        reply_to: legalFooter.supportEmail,
        to: [payload.user.email],
        subject: content.subject,
        html,
        text,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[send-auth-email] Resend error:", res.status, body);
      return json({ error: "Failed to send email", details: body }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[send-auth-email] fetch failed:", err);
    return json({ error: "Email service unreachable" }, 502);
  }
});
