/**
 * Shared HTML email layout for all Ticket Safe transactional emails.
 *
 * Keeps the gradient header, typography, button styles, and footer consistent
 * across auth emails, message notifications, purchase confirmations, etc.
 *
 * All styles are inlined because most email clients strip <style> blocks.
 */

export interface EmailLayoutOptions {
  /** Top-bar pill text, e.g. "Account · Confirm your email" */
  preTitle: string;
  /** Main H1 inside the gradient header */
  title: string;
  /** Inner HTML for the body (already escaped where needed) */
  bodyHtml: string;
  /** Plain-text preview line shown in inbox previews (≤ 90 chars) */
  preheader?: string;
  /** Optional footer note (defaults to standard transactional disclaimer) */
  footerNote?: string;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a primary CTA button using inline styles. */
export function ctaButton(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:linear-gradient(135deg,#003399,#0066cc);color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 12px rgba(0,51,153,0.25)">${escapeHtml(label)}</a>`;
}

/** Render a secondary, low-emphasis link/button. */
export function secondaryLink(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#003399;text-decoration:none;font-weight:600;font-size:13px">${escapeHtml(label)} →</a>`;
}

/** Render an info card (used for fallback links, OTP codes, summaries). */
export function infoCard(label: string, value: string): string {
  return `<div style="background:#f5f7fb;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin:18px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:4px">${escapeHtml(label)}</div>
    <div style="font-size:13px;color:#1e293b;word-break:break-all">${escapeHtml(value)}</div>
  </div>`;
}

/**
 * Wrap any body in the full Ticket Safe email shell.
 * Returns a complete HTML document ready to send via Resend.
 */
export function renderEmail({
  preTitle,
  title,
  bodyHtml,
  preheader,
  footerNote,
}: EmailLayoutOptions): string {
  const safePreheader = preheader ?? "Ticket Safe — your student event platform.";
  const safeFooter =
    footerNote ??
    "You received this email because of activity on your Ticket Safe account. If this was not you, please contact us at ticketsafe.friendly@gmail.com.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1e293b">
<!-- Preheader (hidden, used by inbox previews) -->
<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">
  ${escapeHtml(safePreheader)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:32px 16px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.08)">
        <!-- Header / gradient -->
        <tr>
          <td style="background:linear-gradient(135deg,#003399 0%,#0066cc 100%);padding:28px 32px 26px;color:#ffffff">
            <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.18);padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">
              ${escapeHtml(preTitle)}
            </div>
            <h1 style="margin:14px 0 0;font-size:24px;line-height:1.2;font-weight:800;color:#ffffff">
              ${escapeHtml(title)}
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px 32px 12px;font-size:15px;line-height:1.6;color:#1e293b">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px"><div style="height:1px;background:#e2e8f0"></div></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 24px;font-size:12px;color:#64748b;line-height:1.5">
            <p style="margin:0 0 8px">${escapeHtml(safeFooter)}</p>
            <p style="margin:0">
              <strong style="color:#475569">Ticket Safe</strong> · The ticket platform built for student events
            </p>
          </td>
        </tr>
      </table>

      <!-- Below-card mini footer -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin-top:16px">
        <tr>
          <td align="center" style="font-size:11px;color:#94a3b8;line-height:1.5">
            © ${new Date().getFullYear()} Ticket Safe ·
            <a href="https://ticket-safe.eu/privacy" style="color:#94a3b8;text-decoration:underline">Privacy</a> ·
            <a href="https://ticket-safe.eu/terms" style="color:#94a3b8;text-decoration:underline">Terms</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
