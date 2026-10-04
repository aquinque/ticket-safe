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
import {
  renderEmail,
  ctaButton,
  codeBlock,
  escapeHtml,
} from "../_shared/emailComponents.ts";
import { emailTokens, legalFooter } from "../_shared/emailTokens.ts";

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

  let next = "/profile";
  try {
    const url = new URL(redirect_to);
    next = url.pathname + url.search + url.hash || "/profile";
  } catch {
    if (redirect_to?.startsWith("/")) next = redirect_to;
  }

  const params = new URLSearchParams({
    token_hash,
    type: email_action_type,
    next,
  });
  return `${siteUrl}/auth/confirm?${params.toString()}`;
}

interface EmailContent {
  subject: string;
  eyebrow: string;
  title: string;
  preheader: string;
  bodyHtml: string;
  text: string;
}

function firstNameFrom(user: AuthHookPayload["user"]): string {
  const meta = user.user_metadata as { full_name?: string } | undefined;
  if (meta?.full_name) {
    const first = meta.full_name.split(/\s+/)[0];
    if (first) return first;
  }
  const localPart = user.email.split("@")[0] ?? "there";
  return localPart.split(/[.\-_]/)[0] || "there";
}

function buildContent(payload: AuthHookPayload, link: string): EmailContent {
  const name = escapeHtml(firstNameFrom(payload.user));
  const greeting = `<p style="margin:0 0 16px">Hi ${name},</p>`;
  const otp = payload.email_data.token; // 6-digit OTP for clients without link support
  const fallback = `<p style="margin:18px 0 0;font-size:12px;color:${emailTokens.textMuted}">
    If the button does not work, copy this link into your browser:<br>
    <span style="color:${emailTokens.textPrimary};word-break:break-all">${escapeHtml(link)}</span>
  </p>`;
  const textFallback = `If the button does not work, open this link: ${link}`;

  switch (payload.email_data.email_action_type) {
    case "signup":
      return {
        subject: "Confirm your Ticket Safe account",
        eyebrow: "Account · Confirm your email",
        title: "Welcome to Ticket Safe",
        preheader: "Confirm your email to start using Ticket Safe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">You're one step away from joining the ticket platform built for ESCP students. Confirm your email to activate your account.</p>
          ${ctaButton("Confirm my email", link)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">This link expires in 24 hours. If you did not sign up, you can safely ignore this email.</p>
          ${codeBlock("6-digit code (alternative)", otp)}
          ${fallback}
        `,
        text: `Hi,\n\nConfirm your email to activate your Ticket Safe account.\n\nCode: ${otp}\n${textFallback}\n\nThis link expires in 24 hours.`,
      };

    case "recovery":
      return {
        subject: "Reset your Ticket Safe password",
        eyebrow: "Account · Password reset",
        title: "Reset your password",
        preheader: "Use the secure link to choose a new password.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">We received a request to reset your Ticket Safe password. Click below to choose a new one.</p>
          ${ctaButton("Reset my password", link)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">This link is valid for 1 hour. If you did not request this, ignore this email — your password stays the same.</p>
          ${codeBlock("6-digit code (alternative)", otp)}
          ${fallback}
        `,
        text: `We received a request to reset your Ticket Safe password.\n\nCode: ${otp}\n${textFallback}\n\nValid for 1 hour. If you did not request this, ignore this email.`,
      };

    case "magiclink":
      return {
        subject: "Your Ticket Safe sign-in link",
        eyebrow: "Account · Sign in",
        title: "Sign in to Ticket Safe",
        preheader: "One click and you're in — no password needed.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Use the secure link below to sign in to Ticket Safe.</p>
          ${ctaButton("Sign me in", link)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">This link expires in 10 minutes. If it wasn't you, ignore this email.</p>
          ${codeBlock("6-digit code (alternative)", otp)}
          ${fallback}
        `,
        text: `Sign in to Ticket Safe.\n\nCode: ${otp}\n${textFallback}\n\nExpires in 10 minutes.`,
      };

    case "invite":
      return {
        subject: "You've been invited to Ticket Safe",
        eyebrow: "Account · Invitation",
        title: "You've been invited",
        preheader: "Accept your invitation to join Ticket Safe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">You've been invited to join Ticket Safe — the ticket platform built for student events.</p>
          ${ctaButton("Accept invitation", link)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">This invitation expires in 7 days.</p>
          ${fallback}
        `,
        text: `You've been invited to join Ticket Safe.\n\n${textFallback}\n\nExpires in 7 days.`,
      };

    case "email_change":
    case "email_change_current":
    case "email_change_new":
      return {
        subject: "Confirm your new email — Ticket Safe",
        eyebrow: "Account · Email change",
        title: "Confirm your new email",
        preheader: "Click the link to finish changing your email address.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">We received a request to update the email address on your Ticket Safe account. Confirm this change below.</p>
          ${ctaButton("Confirm new email", link)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">If you did not request this change, contact us immediately at ${legalFooter.supportEmail}.</p>
          ${codeBlock("6-digit code (alternative)", otp)}
          ${fallback}
        `,
        text: `Confirm the new email address on your Ticket Safe account.\n\nCode: ${otp}\n${textFallback}\n\nDidn't request this? Contact ticketsafe.friendly@gmail.com immediately.`,
      };

    case "reauthentication":
      return {
        subject: "Re-authenticate your Ticket Safe account",
        eyebrow: "Account · Verify it's you",
        title: "Verify it's you",
        preheader: "Enter the 6-digit code to continue.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">For your security, enter the code below to confirm this action on your Ticket Safe account.</p>
          ${codeBlock("Your verification code", otp)}
          <p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">This code expires in 5 minutes. If it wasn't you, change your password immediately.</p>
        `,
        text: `Verification code: ${otp}\n\nExpires in 5 minutes. If this wasn't you, change your password immediately.`,
      };

    case "login":
    default:
      return {
        subject: "Sign in to Ticket Safe",
        eyebrow: "Account · Sign in",
        title: "Sign in to Ticket Safe",
        preheader: "Click the secure link to continue.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Use the secure link below to continue on Ticket Safe.</p>
          ${ctaButton("Continue", link)}
          ${codeBlock("6-digit code (alternative)", otp)}
          ${fallback}
        `,
        text: `Sign in to Ticket Safe.\n\nCode: ${otp}\n${textFallback}`,
      };
  }
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
  const content = buildContent(payload, verifyLink);

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
