/**
 * generateConfirmationEmail(orderData)
 *
 * Builds the HTML body of the post-purchase confirmation email. Two PDFs
 * are attached separately by sendTicketConfirmationEmail() — this file
 * only produces the HTML body.
 *
 * Brand colours
 *   Pulled from ticket-safe.eu live: the logo SVG uses a diagonal gradient
 *   #4153E0 → #2A3BB5, and the PWA <meta name="theme-color"> is #3a5fe6.
 *   These are the real live brand colours, NOT the older --primary token
 *   (#003399) which has drifted from the deployed identity.
 *
 * Design intent
 *   Premium ticketing-confirmation email à la Ticketmaster / Shotgun /
 *   Dice / Eventbrite / Airbnb:
 *     • Soft slate page background (not a flat white slab)
 *     • Single rounded card with subtle shadow + hairline border
 *     • SOLID brand-gradient header carrying the wordmark, an "Order
 *       confirmed" overline, the title, and the order number — so the
 *       reader gets brand + context in one glance
 *     • White body with a dedicated EVENT card (date / time / location
 *       with icons) and an order-summary table — separating "what
 *       you're going to" from "what you paid"
 *     • Total paid is the only line picked out in brand colour
 *     • CTA inherits the brand gradient
 *     • Important info section reads like real fine print, not a checklist
 *
 *   Mobile-first: stack everything in one column, tighten padding, bump
 *   line heights so the body stays readable on a phone.
 *
 * Compatibility
 *   - Tables for layout (Outlook + Gmail desktop)
 *   - Inline CSS on every element
 *   - bgcolor= attribute on the gradient header as a fallback for clients
 *     that strip linear-gradient
 *   - System-font stack (-apple-system → BlinkMacSystem → Segoe → Roboto)
 *     so the email picks up San Francisco / Segoe / Roboto natively
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

// ── Real live brand palette ──
// (from ticket-safe.eu/favicon.svg + meta theme-color)
const BRAND        = "#3a5fe6";          // theme-color, used as bgcolor fallback
const BRAND_START  = "#4153E0";          // logo gradient start
const BRAND_END    = "#2A3BB5";          // logo gradient end
const BRAND_DEEP   = "#1f2da3";          // shadow / pressed state

const INK          = "#0f172a"; // slate-900 — headings
const INK_2        = "#1e293b"; // slate-800 — body text
const MUTED        = "#475569"; // slate-600 — labels, secondary text
const FAINT        = "#94a3b8"; // slate-400 — disclaimers
const HAIR         = "#e2e8f0"; // slate-200 — separators
const BG_PAGE      = "#f1f5f9"; // slate-100 — page wrap
const BG_TINT      = "#f8fafc"; // slate-50 — event card / order summary tint

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
  /* Mobile refinements. Gmail iOS + Apple Mail honour these; clients that
     strip <style> still get a perfectly fluid layout from the inline CSS. */
  @media only screen and (max-width: 600px) {
    .ts-wrap     { padding: 16px 0 !important; }
    .ts-card     { border-radius: 14px !important; margin: 0 12px !important; }
    .ts-header   { padding: 28px 22px 24px !important; }
    .ts-title    { font-size: 22px !important; line-height: 1.22 !important; }
    .ts-body-pad { padding: 24px 22px !important; }
    .ts-event    { padding: 18px 18px !important; }
    .ts-event h2 { font-size: 17px !important; }
    .ts-row td   { font-size: 14px !important; padding: 10px 14px !important; }
    .ts-total    { font-size: 16px !important; }
    .ts-cta a    { display: block !important; padding: 14px 0 !important; }
    .ts-footer   { padding: 22px !important; }
  }
  /* Dark-mode override prevention */
  [data-ogsc] .ts-card,
  [data-ogsb] .ts-card { background: #ffffff !important; color: ${INK} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- Inbox preview (preheader) — shown beside the subject in Gmail/Apple Mail -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_PAGE};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
    <tr>
      <td align="center" class="ts-wrap" style="padding:32px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ts-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${HAIR};box-shadow:0 6px 20px rgba(31,45,163,0.08);">

          <!-- ─── HEADER (brand gradient block with logo + title + order #) ─── -->
          <tr>
            <td bgcolor="${BRAND}" class="ts-header" style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND_START} 0%,${BRAND_END} 100%);padding:36px 32px 32px;color:#ffffff;">
              <!-- Logo block (text-based, mimics the real TS rounded-square brand mark) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.14);border-radius:10px;width:48px;height:48px;vertical-align:middle;text-align:center;font-family:${FONT};font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:48px;mso-line-height-rule:exactly;">
                    TS
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;font-family:${FONT};font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                    TicketSafe
                  </td>
                </tr>
              </table>

              <!-- Overline + title + order number -->
              <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.18em;color:rgba(255,255,255,0.72);text-transform:uppercase;margin:28px 0 8px;">
                Order confirmed
              </div>
              <h1 class="ts-title" style="margin:0 0 10px;font-family:${FONT};font-size:28px;line-height:1.18;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
                Your ticket is confirmed
              </h1>
              <div style="font-family:${FONT};font-size:13px;color:rgba(255,255,255,0.78);font-variant-numeric:tabular-nums;">
                Order #${esc(d.orderNumber)}
              </div>
            </td>
          </tr>

          <!-- ─── BODY ─── -->
          <tr>
            <td class="ts-body-pad" style="padding:30px 32px 8px;font-family:${FONT};">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${INK_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${INK_2};">
                Thanks for your purchase. Your payment has been successfully processed, and your ticket for <strong style="color:${INK};">${esc(d.eventName)}</strong> is now confirmed.
              </p>
              <p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${INK_2};">
                Your ticket is attached to this email as a PDF. Please keep it accessible on your phone and present the QR code at the entrance.
              </p>
              <p style="margin:0 0 4px;font-size:16px;line-height:1.65;color:${INK_2};">
                We've also attached your order summary for your records.
              </p>
            </td>
          </tr>

          <!-- ─── EVENT CARD ─── -->
          <tr>
            <td class="ts-body-pad" style="padding:14px 32px 6px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ts-event" style="background:${BG_TINT};border:1px solid ${HAIR};border-radius:12px;">
                <tr>
                  <td style="padding:22px 22px 16px;">
                    <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;color:${MUTED};text-transform:uppercase;margin-bottom:8px;">
                      Event
                    </div>
                    <h2 style="margin:0 0 16px;font-family:${FONT};font-size:19px;font-weight:700;color:${INK};letter-spacing:-0.01em;line-height:1.3;">
                      ${esc(d.eventName)}
                    </h2>

                    ${eventRow("📅", esc(d.eventDate))}
                    ${eventRow("🕐", esc(d.eventTime))}
                    ${eventRow("📍", esc(d.eventLocation))}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── ORDER SUMMARY ─── -->
          <tr>
            <td class="ts-body-pad" style="padding:14px 32px 8px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;color:${MUTED};text-transform:uppercase;margin:8px 0 10px;">
                Order summary
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ts-row" style="background:${BG_TINT};border:1px solid ${HAIR};border-radius:12px;">
                ${row("Ticket",          esc(d.ticketType))}
                ${row("Quantity",        String(d.quantity))}
                ${rowTotal("Total paid", esc(d.pricePaid))}
                ${rowDivider()}
                ${row("Order number",    esc(d.orderNumber), { mono: true })}
                ${row("Payment status",  esc(d.paymentStatus))}
              </table>
            </td>
          </tr>

          <!-- ─── CTA ─── -->
          <tr>
            <td align="center" class="ts-body-pad ts-cta" style="padding:24px 32px 8px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(myTicketsUrl)}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="13%" stroke="f" fillcolor="${BRAND_START}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">Open my ticket</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:${BRAND_START};background-image:linear-gradient(135deg,${BRAND_START} 0%,${BRAND_END} 100%);border-radius:8px;letter-spacing:0;border:1px solid ${BRAND_DEEP};">
                Open my ticket
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ─── IMPORTANT INFORMATION ─── -->
          <tr>
            <td class="ts-body-pad" style="padding:24px 32px 8px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.16em;color:${MUTED};text-transform:uppercase;margin-bottom:10px;">
                Important information
              </div>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${MUTED};">
                Please keep your ticket safe. Your QR code is valid for one entry only and should not be shared. A valid ID may be required at the entrance. Screenshots or duplicated tickets may be refused.
              </p>
            </td>
          </tr>

          <!-- ─── FOOTER ─── -->
          <tr>
            <td class="ts-footer" style="padding:26px 32px 30px;border-top:1px solid ${HAIR};background:${BG_TINT};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:1.6;">
                    <div style="font-weight:600;color:${BRAND};margin-bottom:4px;">Powered by TicketSafe</div>
                    <a href="${esc(websiteUrl)}" style="color:${MUTED};text-decoration:none;">ticket-safe.eu</a>
                    &nbsp;·&nbsp;
                    <a href="mailto:${esc(supportEmail)}" style="color:${MUTED};text-decoration:none;">${esc(supportEmail)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font-family:${FONT};font-size:12px;color:${FAINT};line-height:1.5;">
                    This is an automated confirmation email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────────────────
//  Tiny HTML helpers
// ──────────────────────────────────────────────────────────────────────────

function eventRow(icon: string, text: string): string {
  // Emoji icons render natively on iOS / macOS / Android Gmail; on Outlook
  // they fall back to the system emoji font which is still passable.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
    <tr>
      <td style="width:24px;vertical-align:middle;font-size:15px;line-height:1;padding-top:2px;">${icon}</td>
      <td style="vertical-align:middle;font-family:${FONT};font-size:15px;font-weight:500;color:${INK_2};line-height:1.5;">${text}</td>
    </tr>
  </table>`;
}

function row(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td style="padding:12px 18px;width:42%;color:${MUTED};font-family:${FONT};font-size:13px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:12px 18px;color:${INK};font-family:${valueFamily};font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}

function rowTotal(label: string, value: string): string {
  return `<tr>
    <td style="padding:14px 18px 14px;color:${MUTED};font-family:${FONT};font-size:13px;font-weight:500;vertical-align:middle;">${esc(label)}</td>
    <td class="ts-total" style="padding:14px 18px 14px;color:${BRAND};font-family:${FONT};font-size:18px;font-weight:700;text-align:right;vertical-align:middle;letter-spacing:-0.01em;">${value}</td>
  </tr>`;
}

function rowDivider(): string {
  return `<tr><td colspan="2" style="padding:0;"><div style="height:1px;background:${HAIR};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>`;
}
