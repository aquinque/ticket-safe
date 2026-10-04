/**
 * Shared transactional-email building blocks — Deno send-time renderer.
 *
 * This is the ONE place that builds the HTML every Ticket Safe email uses.
 * Replaces three previously-separate, hand-rolled `shell()` copies
 * (organizer-notify, revolut-webhook, send-auth-email) plus the old
 * generic-gradient emailLayout.ts, which had all drifted from each other
 * and from the site's real design tokens.
 *
 * Visually mirrors emails/components/*.tsx (the React Email preview
 * package) exactly — that package is the authoring/preview tool, this
 * file is the hand-ported production renderer (Deno can't run the Node
 * React Email toolchain at request time, see the final summary for why).
 *
 * Email-safe constraints respected throughout: table layout, inline CSS
 * only, max-width 600px, no flexbox/grid, absolute image URLs, PNG logo
 * (no SVG — most clients strip it).
 */

import { emailTokens as T, legalFooter } from "./emailTokens.ts";

export function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Primary CTA — solid accent, zero radius, one per email. */
export function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px"><tr><td style="background:${T.accent}"><a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${T.fontBody};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.01em">${escapeHtml(label)}</a></td></tr></table>`;
}

/** Low-emphasis inline link, accent-colored. */
export function textLink(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="color:${T.accent};text-decoration:underline;font-weight:600">${escapeHtml(label)}</a>`;
}

/** Thin horizontal rule — the only separator used anywhere. */
export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;line-height:1px;font-size:1px;background:${T.border}">&nbsp;</td></tr></table>`;
}

/** One label/value row — the small-caps label + bold value pattern used
 *  for every ticket/order detail, in emails and matched in the PDF. */
export function infoRow(label: string, value: string, opts?: { valueColor?: string }): string {
  return `<tr>
    <td style="padding:9px 0;border-top:1px solid ${T.border};font-family:${T.fontBody};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.textMuted};vertical-align:top;width:42%">${escapeHtml(label)}</td>
    <td style="padding:9px 0;border-top:1px solid ${T.border};font-family:${T.fontBody};font-size:14px;font-weight:600;color:${opts?.valueColor ?? T.textPrimary};text-align:right;vertical-align:top">${escapeHtml(value)}</td>
  </tr>`;
}

/** The structured "order / ticket summary" block: a bordered table of
 *  infoRows, used on purchase, resale, and refund emails alike. */
export function ticketSummary(rows: Array<[string, string, string?]>): string {
  const body = rows.map(([l, v, c]) => infoRow(l, v, c ? { valueColor: c } : undefined)).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:${T.cardBg};border:1px solid ${T.border}"><tr><td style="padding:4px 18px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr></table>`;
}

/** Monospace code display — the OTP alternative under every auth link. */
export function codeBlock(label: string, code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:${T.bodyBg};border:1px solid ${T.border}"><tr><td style="padding:14px 18px">
    <div style="font-family:${T.fontBody};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.textMuted};margin-bottom:4px">${escapeHtml(label)}</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:0.08em;color:${T.textPrimary}">${escapeHtml(code)}</div>
  </td></tr></table>`;
}

/** Section title inside the body — used to break up longer emails
 *  (e.g. "What happens next"). Optional; most emails need none. */
export function sectionTitle(label: string): string {
  return `<p style="margin:26px 0 8px;font-family:${T.fontHeading};font-size:13px;font-weight:700;color:${T.textPrimary}">${escapeHtml(label)}</p>`;
}

export interface EmailShellOptions {
  /** Small caps label in the header, e.g. "ORDER CONFIRMATION" */
  eyebrow: string;
  /** H1 under the eyebrow, in the body (not the navy header — see render) */
  title: string;
  /** Pre-escaped / pre-built inner HTML for the body */
  bodyHtml: string;
  /** Inbox preview text (hidden, ~90 chars) */
  preheader: string;
  /** Plain-text version — required, every email gets one */
  text: string;
}

/**
 * The one shell every email goes through: navy header with the logo,
 * white card body, navy footer with the legal line + support link.
 * Returns { html, text } ready for Resend's `html` / `text` fields.
 */
export function renderEmail(opts: EmailShellOptions): { html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.title)}</title>
<!--[if mso]>
<style type="text/css">body, table, td { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${T.bodyBg};font-family:${T.fontBody};color:${T.textPrimary};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${T.bodyBg}">${escapeHtml(opts.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.bodyBg}">
<tr><td align="center" style="padding:32px 16px">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${T.maxWidth}px;background:${T.cardBg}">

  <!-- Header: navy band, logo only -->
  <tr>
    <td style="background:${T.brandNavy};padding:22px 32px">
      <img src="${T.logoHeaderUrl}" width="150" height="40" alt="Ticket Safe" style="display:block;border:0;outline:none;height:40px;width:auto" />
    </td>
  </tr>

  <!-- Eyebrow + title -->
  <tr>
    <td style="padding:34px 32px 0">
      <p style="margin:0 0 10px;font-family:${T.fontBody};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.textMuted}">${escapeHtml(opts.eyebrow)}</p>
      <h1 style="margin:0 0 18px;font-family:${T.fontHeading};font-size:24px;line-height:1.25;font-weight:700;color:${T.textPrimary}">${escapeHtml(opts.title)}</h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:0 32px 36px;font-family:${T.fontBody};font-size:15px;line-height:1.65;color:${T.textPrimary}">
      ${opts.bodyHtml}
    </td>
  </tr>

  <!-- Footer: navy band, legal + support -->
  <tr>
    <td style="background:${T.brandNavy};padding:24px 32px">
      <p style="margin:0 0 10px;font-family:${T.fontBody};font-size:12px;line-height:1.6;color:${T.accentLight}">${escapeHtml(legalFooter.taglineFr)}</p>
      <p style="margin:0 0 6px;font-family:${T.fontBody};font-size:12px;line-height:1.6;color:#b9c3dc">${escapeHtml(legalFooter.companyLine)}</p>
      <p style="margin:0;font-family:${T.fontBody};font-size:12px;line-height:1.6">
        <a href="mailto:${legalFooter.supportEmail}" style="color:${T.accentLight};text-decoration:underline">${legalFooter.supportEmail}</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, text: opts.text };
}

/** Plain-text line helper — keeps the text version's formatting
 *  consistent (label: value) without any caller re-deriving it. */
export function textLine(label: string, value: string): string {
  return `${label}: ${value}`;
}
