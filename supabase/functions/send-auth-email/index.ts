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
  infoCard,
  escapeHtml,
} from "../_shared/emailLayout.ts";

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

/** Build the canonical verify URL that activates the link click. */
function buildVerifyUrl(payload: AuthHookPayload): string {
  const { token_hash, email_action_type, redirect_to, site_url } =
    payload.email_data;
  const base = (site_url || "").replace(/\/+$/, "");
  const params = new URLSearchParams({
    token: token_hash,
    type: email_action_type,
    redirect_to,
  });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

interface EmailContent {
  subject: string;
  preTitle: string;
  title: string;
  preheader: string;
  bodyHtml: string;
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
  const fallback = `<p style="margin:18px 0 0;font-size:12px;color:#64748b">
    If the button does not work, copy this link into your browser:<br>
    <span style="color:#475569;word-break:break-all">${escapeHtml(link)}</span>
  </p>`;

  switch (payload.email_data.email_action_type) {
    case "signup":
      return {
        subject: "Confirm your Ticket Safe account",
        preTitle: "Account · Confirm",
        title: "Welcome to Ticket Safe",
        preheader: "Confirm your email to start using Ticket Safe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            You are one click away from joining the only ticket platform built for ESCP students.
            Confirm your email to activate your account.
          </p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Confirm my email", link)}</p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            This link expires in 24 hours. If you did not sign up, you can safely ignore this email.
          </p>
          ${infoCard("6-digit code (alternative)", otp)}
          ${fallback}
        `,
      };

    case "recovery":
      return {
        subject: "Reset your Ticket Safe password",
        preTitle: "Account · Password reset",
        title: "Reset your password",
        preheader: "Use the secure link to choose a new password.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            We received a request to reset your Ticket Safe password.
            Click the button below to choose a new one.
          </p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Reset my password", link)}</p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            This link is valid for 1 hour. If you did not request a reset, ignore this email — your password will stay the same.
          </p>
          ${infoCard("6-digit code (alternative)", otp)}
          ${fallback}
        `,
      };

    case "magiclink":
      return {
        subject: "Your Ticket Safe sign-in link",
        preTitle: "Account · Sign in",
        title: "Sign in to Ticket Safe",
        preheader: "One click and you are in. No password needed.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            Use the secure link below to sign in to Ticket Safe.
          </p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Sign me in", link)}</p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            This link expires in 10 minutes. If it was not you, ignore this email.
          </p>
          ${infoCard("6-digit code (alternative)", otp)}
          ${fallback}
        `,
      };

    case "invite":
      return {
        subject: "You have been invited to Ticket Safe",
        preTitle: "Account · Invitation",
        title: "You have been invited",
        preheader: "Accept your invitation to join Ticket Safe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            You have been invited to join Ticket Safe — the ticket platform built for student events.
          </p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Accept invitation", link)}</p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            This invitation expires in 7 days.
          </p>
          ${fallback}
        `,
      };

    case "email_change":
    case "email_change_current":
    case "email_change_new":
      return {
        subject: "Confirm your new email — Ticket Safe",
        preTitle: "Account · Email change",
        title: "Confirm your new email",
        preheader: "Click the link to finish changing your email address.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            We received a request to update the email address on your Ticket Safe account.
            Confirm this change by clicking the button below.
          </p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Confirm new email", link)}</p>
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            If you did not request this change, please contact us immediately at ticketsafe.friendly@gmail.com.
          </p>
          ${infoCard("6-digit code (alternative)", otp)}
          ${fallback}
        `,
      };

    case "reauthentication":
      return {
        subject: "Re-authenticate your Ticket Safe account",
        preTitle: "Account · Verify identity",
        title: "Verify it is you",
        preheader: "Enter the 6-digit code to continue.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">
            For your security, enter the code below to confirm this action on your Ticket Safe account.
          </p>
          ${infoCard("Your verification code", otp)}
          <p style="margin:18px 0 0;font-size:13px;color:#64748b">
            This code expires in 5 minutes. If it was not you, change your password immediately.
          </p>
        `,
      };

    case "login":
    default:
      return {
        subject: "Sign in to Ticket Safe",
        preTitle: "Account · Sign in",
        title: "Sign in to Ticket Safe",
        preheader: "Click the secure link to continue.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Use the secure link below to continue on Ticket Safe.</p>
          <p style="margin:24px 0 8px;text-align:center">${ctaButton("Continue", link)}</p>
          ${infoCard("6-digit code (alternative)", otp)}
          ${fallback}
        `,
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

  const html = renderEmail({
    preTitle: content.preTitle,
    title: content.title,
    bodyHtml: content.bodyHtml,
    preheader: content.preheader,
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
