/**
 * generateConfirmationEmail(orderData) — Shotgun-style confirmation
 *
 * Design language is deliberately bold and event-first, like the emails
 * Shotgun / Dice ship after a primary sale:
 *   - Brand-coloured hero takes the top third of the card
 *   - Event name is the visual focus (36 px, tight letter-spacing)
 *   - "You're going to" overline sets the anticipation
 *   - Date / time / location sit on the hero as white type
 *   - Body is intentionally short: confirmation + how to use the PDF
 *   - Order summary is a clean two-column table, no decoration
 *   - Strong full-width CTA in brand colour
 *
 * Brand palette pulled from ticket-safe.eu (the live identity):
 *   #4153E0 → #2A3BB5     logo gradient (favicon.svg)
 *   #3a5fe6                meta theme-color
 *   #1f2da3                deep variant for the CTA border
 *
 * Mobile-first: viewport meta + a single @media query collapses padding
 * and shrinks the title. Inline CSS on every node + table layout so
 * Outlook / Gmail desktop render the same as Apple Mail iOS.
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
const BRAND        = "#3a5fe6";   // theme-color fallback
const BRAND_START  = "#4153E0";   // logo gradient start
const BRAND_END    = "#2A3BB5";   // logo gradient end
const BRAND_DEEP   = "#1f2da3";   // CTA border / pressed
const BRAND_TINT   = "#eef1ff";   // very light brand tint for accents

const INK          = "#0a0f1f";   // near-black for headings
const INK_2        = "#1f2937";   // slate-800
const MUTED        = "#4b5563";   // slate-600
const FAINT        = "#9ca3af";   // slate-400
const HAIR         = "#e5e7eb";   // slate-200
const BG_PAGE      = "#eef0f4";   // soft slate page wrap

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
  @media only screen and (max-width: 600px) {
    .ts-wrap     { padding: 14px 12px !important; }
    .ts-card     { border-radius: 14px !important; }
    .ts-hero     { padding: 32px 24px 36px !important; }
    .ts-event    { font-size: 28px !important; line-height: 1.08 !important; }
    .ts-overline { font-size: 10px !important; }
    .ts-meta     { font-size: 14px !important; }
    .ts-pad      { padding: 26px 22px !important; }
    .ts-body     { font-size: 15px !important; line-height: 1.6 !important; }
    .ts-row td   { font-size: 14px !important; padding: 12px 14px !important; }
    .ts-total td { font-size: 14px !important; }
    .ts-total-v  { font-size: 20px !important; }
    .ts-cta a    { display: block !important; padding: 16px 0 !important; font-size: 14px !important; }
    .ts-foot     { padding: 22px 22px 26px !important; }
  }
  [data-ogsc] .ts-card, [data-ogsb] .ts-card { background: #ffffff !important; color: ${INK} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- Preheader (inbox preview) -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BG_PAGE};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
    <tr>
      <td align="center" class="ts-wrap" style="padding:36px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ts-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(31,45,163,0.10);">

          <!-- ─── HERO: event-first, big and bold ─── -->
          <tr>
            <td bgcolor="${BRAND_END}" class="ts-hero" style="background:${BRAND_END};background-image:linear-gradient(180deg,${BRAND_START} 0%,${BRAND_END} 100%);padding:44px 36px 44px;">

              <!-- Wordmark row -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:42px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="rgba(255,255,255,0.16)" style="background:rgba(255,255,255,0.16);border-radius:8px;width:34px;height:34px;text-align:center;font-family:${FONT};font-size:14px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:34px;mso-line-height-rule:exactly;">TS</td>
                        <td style="padding-left:12px;vertical-align:middle;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">TicketSafe</td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:11px;font-weight:600;color:rgba(255,255,255,0.68);letter-spacing:0.18em;text-transform:uppercase;">
                    Order confirmed
                  </td>
                </tr>
              </table>

              <!-- Anticipation overline -->
              <div class="ts-overline" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.22em;color:rgba(255,255,255,0.78);text-transform:uppercase;margin-bottom:14px;">
                You're going to
              </div>

              <!-- Event title — the visual focal point -->
              <h1 class="ts-event" style="margin:0 0 22px;font-family:${FONT};font-size:34px;line-height:1.05;font-weight:800;color:#ffffff;letter-spacing:-0.025em;">
                ${esc(d.eventName)}
              </h1>

              <!-- Meta — date · time · location -->
              <div class="ts-meta" style="font-family:${FONT};font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);font-weight:500;">
                ${esc(d.eventDate)}${d.eventTime ? ` &middot; ${esc(d.eventTime)}` : ""}
              </div>
              ${d.eventLocation ? `<div class="ts-meta" style="font-family:${FONT};font-size:15px;line-height:1.55;color:rgba(255,255,255,0.92);font-weight:500;">${esc(d.eventLocation)}</div>` : ""}
            </td>
          </tr>

          <!-- ─── BODY — short, focused ─── -->
          <tr>
            <td class="ts-pad" style="padding:32px 36px 4px;font-family:${FONT};">
              <p class="ts-body" style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${INK_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p class="ts-body" style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${INK_2};">
                Your ticket is confirmed. You'll find it attached as a PDF — keep it on your phone and present the QR code at the entrance.
              </p>
              <p class="ts-body" style="margin:0;font-size:16px;line-height:1.65;color:${INK_2};">
                Your order summary is attached for your records.
              </p>
            </td>
          </tr>

          <!-- ─── ORDER SUMMARY ─── -->
          <tr>
            <td class="ts-pad" style="padding:24px 36px 6px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;margin-bottom:14px;">
                Order summary
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ts-row" style="border-top:1px solid ${HAIR};">
                ${row("Ticket",         esc(d.ticketType))}
                ${row("Quantity",       String(d.quantity))}
                ${rowTotal("Total paid", esc(d.pricePaid))}
                ${row("Order number",   esc(d.orderNumber), { mono: true })}
                ${row("Payment status", esc(d.paymentStatus))}
              </table>
            </td>
          </tr>

          <!-- ─── CTA — full-width brand button ─── -->
          <tr>
            <td class="ts-pad ts-cta" style="padding:30px 36px 8px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(myTicketsUrl)}" style="height:52px;v-text-anchor:middle;width:528px;" arcsize="14%" stroke="f" fillcolor="${BRAND_END}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.02em;">OPEN MY TICKET</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:block;width:100%;box-sizing:border-box;padding:16px 0;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;background:${BRAND_END};background-image:linear-gradient(180deg,${BRAND_START} 0%,${BRAND_END} 100%);border-radius:10px;text-align:center;letter-spacing:0.02em;border:1px solid ${BRAND_DEEP};">
                OPEN MY TICKET
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ─── IMPORTANT INFORMATION ─── -->
          <tr>
            <td class="ts-pad" style="padding:30px 36px 6px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;margin-bottom:12px;">
                Important information
              </div>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${MUTED};">
                Please keep your ticket safe. Your QR code is valid for one entry only and should not be shared. A valid ID may be required at the entrance. Screenshots or duplicated tickets may be refused.
              </p>
            </td>
          </tr>

          <!-- ─── FOOTER ─── -->
          <tr>
            <td class="ts-foot" style="padding:28px 36px 36px;border-top:1px solid ${HAIR};margin-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:1.6;">
                    <div style="font-weight:700;color:${BRAND};letter-spacing:-0.01em;margin-bottom:4px;">Powered by TicketSafe</div>
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
//  Small helpers
// ──────────────────────────────────────────────────────────────────────────

function row(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td style="padding:14px 18px;width:44%;color:${MUTED};font-family:${FONT};font-size:13px;font-weight:500;vertical-align:middle;border-bottom:1px solid ${HAIR};">${esc(label)}</td>
    <td style="padding:14px 18px;color:${INK};font-family:${valueFamily};font-size:14px;font-weight:600;text-align:right;vertical-align:middle;border-bottom:1px solid ${HAIR};">${value}</td>
  </tr>`;
}

function rowTotal(label: string, value: string): string {
  return `<tr class="ts-total">
    <td style="padding:18px 18px;color:${MUTED};font-family:${FONT};font-size:13px;font-weight:600;vertical-align:middle;border-bottom:1px solid ${HAIR};letter-spacing:0.02em;text-transform:uppercase;">${esc(label)}</td>
    <td class="ts-total-v" style="padding:18px 18px;color:${BRAND};font-family:${FONT};font-size:22px;font-weight:800;text-align:right;vertical-align:middle;border-bottom:1px solid ${HAIR};letter-spacing:-0.02em;">${value}</td>
  </tr>`;
}
