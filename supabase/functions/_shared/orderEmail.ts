/**
 * generateConfirmationEmail(orderData)
 *
 * Builds the HTML body of the order-confirmation email sent right after
 * a successful Stripe payment. Two PDFs are attached separately by
 * sendTicketConfirmationEmail() — this file ONLY produces the HTML body.
 *
 * Design intent
 *   The previous version felt like an AI-generated SaaS template:
 *   purple/blue gradient header, ALL-CAPS overline, rounded 18px cards,
 *   excessive padding. This rewrite goes the opposite direction —
 *   premium ticketing-email language à la Shotgun / Dice / Eventbrite:
 *     • Clean white background, no gradient
 *     • Brand-blue accents ONLY on the title strip + key totals
 *     • System font stack (Apple → Segoe → Roboto → Helvetica → Arial)
 *     • Subtle 1px hairlines instead of shadowed cards
 *     • Sentence-case copy instead of caps
 *     • 580 px desktop, fully fluid mobile
 *
 * Compatibility
 *   - Layout uses <table>s with cellpadding / cellspacing so Outlook
 *     (which ignores box-model CSS on <div>s) renders cleanly.
 *   - All visual CSS is INLINE on each element. The <style> block in
 *     <head> only carries the mobile media query — gracefully degrades
 *     on clients that strip it.
 *   - No images required for the design to work. Logo is the
 *     "TicketSafe" wordmark in brand-blue type; if the user's client
 *     blocks images, nothing breaks.
 */

export interface OrderEmailData {
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;

  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;

  ticketType: string;
  quantity: number;
  pricePaid: string;

  orderNumber: string;
  purchaseDate: string;
  paymentStatus: "Paid" | "Pending" | "Refunded";

  organizerName: string;

  supportEmail?: string;
  websiteUrl?: string;
  myTicketsUrl?: string;
}

// Brand palette — pulled from src/index.css :root tokens so the email
// matches the rest of the product exactly.
//   --primary: 220 100% 30% → #003399  (Deep ESCP Blue — the brand)
//   --accent : 210 100% 45% → #0073E6  (Bright Accent Blue — secondary)
const BRAND       = "#003399";
const BRAND_DARK  = "#002878";
const INK         = "#0f172a"; // slate-900 — body text
const INK_2       = "#1e293b"; // slate-800
const MUTED       = "#475569"; // slate-600 — labels, secondary text
const FAINT       = "#94a3b8"; // slate-400 — disclaimers
const HAIR        = "#e2e8f0"; // slate-200 — hairlines
const BG_PAGE     = "#f5f7fa"; // page wrapping bg
const SECTION_BG  = "#f8fafc"; // subtle tint for the order summary section

// Single email-safe system font stack used everywhere
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function esc(s: string | number | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateConfirmationEmail(d: OrderEmailData): string {
  const supportEmail = d.supportEmail ?? "support@ticket-safe.eu";
  const websiteUrl   = d.websiteUrl   ?? "https://ticket-safe.eu";
  const myTicketsUrl = d.myTicketsUrl ?? "https://ticket-safe.eu/my-tickets";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Your TicketSafe ticket is confirmed</title>
<style>
  /* Mobile refinements. Gmail and Apple Mail honour these; clients that
     strip <style> still get a perfectly fluid layout from the inline CSS. */
  @media only screen and (max-width: 600px) {
    .ts-wrap   { padding: 16px 0 !important; }
    .ts-card   { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .ts-pad    { padding: 24px 20px !important; }
    .ts-pad-sm { padding: 20px 20px !important; }
    .ts-title  { font-size: 22px !important; line-height: 1.25 !important; }
    .ts-body   { font-size: 15px !important; line-height: 1.6 !important; }
    .ts-row td { font-size: 14px !important; padding: 8px 0 !important; }
    .ts-cta a  { display: block !important; width: 100% !important; box-sizing: border-box !important; }
  }
  /* Dark-mode override prevention — many clients invert backgrounds */
  [data-ogsc] .ts-card, [data-ogsb] .ts-card { background: #ffffff !important; color: ${INK} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- Inbox preview text — shown next to the subject in Gmail / Apple Mail.
       Hidden inside the body itself via display:none. -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_PAGE};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
    <tr>
      <td align="center" class="ts-wrap" style="padding:32px 14px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" class="ts-card" style="max-width:580px;width:100%;background:#ffffff;border:1px solid ${HAIR};border-radius:10px;">

          <!-- ─── HEADER: wordmark + small "Order confirmed" caption ─── -->
          <tr>
            <td class="ts-pad-sm" style="padding:26px 28px 18px;border-bottom:1px solid ${HAIR};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND};letter-spacing:-0.01em;">
                    TicketSafe
                  </td>
                  <td align="right" style="font-family:${FONT};font-size:13px;color:${MUTED};">
                    Order confirmed
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── TITLE + INTRO ─── -->
          <tr>
            <td class="ts-pad" style="padding:30px 28px 8px;">
              <h1 class="ts-title" style="margin:0 0 18px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:700;color:${INK};letter-spacing:-0.01em;">
                Your ticket is confirmed
              </h1>
              <p class="ts-body" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p class="ts-body" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                Thanks for your purchase. Your payment has been successfully processed, and your ticket for <strong style="color:${INK};">${esc(d.eventName)}</strong> is now confirmed.
              </p>
              <p class="ts-body" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                Your ticket is attached to this email as a PDF. Please keep it accessible on your phone and present the QR code at the entrance.
              </p>
              <p class="ts-body" style="margin:0 0 6px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                We've also attached your order summary for your records.
              </p>
            </td>
          </tr>

          <!-- ─── ORDER SUMMARY ─── -->
          <tr>
            <td class="ts-pad" style="padding:18px 28px 4px;">
              <div style="font-family:${FONT};font-size:13px;font-weight:600;color:${MUTED};margin-bottom:12px;">
                Order summary
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ts-row" style="background:${SECTION_BG};border:1px solid ${HAIR};border-radius:8px;">
                ${row("Event",          esc(d.eventName), { strongValue: true })}
                ${row("Date",           esc(d.eventDate))}
                ${row("Time",           esc(d.eventTime))}
                ${row("Location",       esc(d.eventLocation))}
                ${rowDivider()}
                ${row("Ticket",         esc(d.ticketType))}
                ${row("Quantity",       String(d.quantity))}
                ${row("Total paid",     esc(d.pricePaid), { strongValue: true, valueColor: BRAND, valueSize: 16 })}
                ${rowDivider()}
                ${row("Order number",   esc(d.orderNumber), { mono: true })}
                ${row("Payment status", esc(d.paymentStatus))}
              </table>
            </td>
          </tr>

          <!-- ─── CTA — Open my ticket ─── -->
          <tr>
            <td align="center" class="ts-pad ts-cta" style="padding:24px 28px 8px;">
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:${BRAND};border-radius:6px;letter-spacing:0;mso-padding-alt:0;border:1px solid ${BRAND_DARK};">
                Open my ticket
              </a>
            </td>
          </tr>

          <!-- ─── IMPORTANT INFORMATION ─── -->
          <tr>
            <td class="ts-pad" style="padding:22px 28px 8px;">
              <div style="font-family:${FONT};font-size:13px;font-weight:600;color:${MUTED};margin-bottom:10px;">
                Important information
              </div>
              <p class="ts-body" style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${MUTED};">
                Please keep your ticket safe. Your QR code is valid for one entry only and should not be shared. A valid ID may be required at the entrance. Screenshots or duplicated tickets may be refused.
              </p>
            </td>
          </tr>

          <!-- ─── FOOTER ─── -->
          <tr>
            <td class="ts-pad" style="padding:28px 28px 30px;border-top:1px solid ${HAIR};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:14px;font-weight:600;color:${BRAND};">
                    TicketSafe
                  </td>
                  <td align="right" style="font-family:${FONT};font-size:13px;color:${MUTED};">
                    <a href="${esc(websiteUrl)}" style="color:${MUTED};text-decoration:none;">ticket-safe.eu</a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:8px;font-family:${FONT};font-size:13px;color:${MUTED};">
                    <a href="mailto:${esc(supportEmail)}" style="color:${MUTED};text-decoration:underline;">${esc(supportEmail)}</a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:14px;font-family:${FONT};font-size:12px;color:${FAINT};line-height:1.5;">
                    This is an automated confirmation email. Please do not reply directly to this message.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────────────────
//  Tiny HTML helpers — keep the template above readable
// ──────────────────────────────────────────────────────────────────────────

function row(
  label: string,
  value: string,
  opts: { strongValue?: boolean; mono?: boolean; valueColor?: string; valueSize?: number } = {},
): string {
  const valueWeight = opts.strongValue ? 600 : 500;
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  const valueColor  = opts.valueColor ?? INK;
  const valueSize   = opts.valueSize ?? 14;
  return `<tr>
    <td style="padding:11px 16px;width:40%;color:${MUTED};font-family:${FONT};font-size:13px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:11px 16px;color:${valueColor};font-family:${valueFamily};font-size:${valueSize}px;font-weight:${valueWeight};text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}

function rowDivider(): string {
  return `<tr><td colspan="2" style="padding:0;"><div style="height:1px;background:${HAIR};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>`;
}
