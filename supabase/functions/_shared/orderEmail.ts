/**
 * generateConfirmationEmail(orderData) — final design, locked.
 *
 * Solid brand-coloured hero carrying the event details (Shotgun-style
 * confidence), white body below carrying the order details (clean,
 * scannable, transactional). One accent colour. Minimal copy. Mobile-
 * first. Done.
 *
 * Brand   #3a5fe6   (live ticket-safe.eu)
 * PDFs    untouched
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

// ── Palette ──
const BRAND       = "#3a5fe6";   // hero bg + every accent
const BRAND_DEEP  = "#2a47c4";   // CTA border

const INK         = "#0f172a";   // titles
const INK_2       = "#1e293b";   // body
const MUTED       = "#64748b";   // labels
const FAINT       = "#94a3b8";   // footer disclaimer
const HAIR        = "#e2e8f0";   // hairlines
const PAGE_BG     = "#f4f5f8";   // page wrap
const ORDER_BG    = "#f8fafc";   // subtle tint on the order details block
const WHITE_85    = "rgba(255,255,255,0.85)";
const WHITE_70    = "rgba(255,255,255,0.7)";

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
    .outer       { padding: 16px 10px !important; }
    .card        { border-radius: 14px !important; }
    .hero        { padding: 32px 24px 36px !important; }
    .ev-name     { font-size: 26px !important; line-height: 1.12 !important; }
    .body-pad    { padding: 26px 24px !important; }
    .o-pad       { padding: 18px 18px !important; }
    .o-row td    { font-size: 14.5px !important; padding: 11px 0 !important; }
    .cta a       { display: block !important; padding: 16px 0 !important; }
    .foot        { padding: 22px 24px 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <!-- Pre-header -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
    <tr>
      <td align="center" class="outer" style="padding:36px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="card" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.08);">

          <!-- ═══ HERO — solid brand colour, event-first ═══ -->
          <tr>
            <td bgcolor="${BRAND}" class="hero" style="background:${BRAND};padding:40px 36px 44px;">
              <!-- Wordmark + tiny overline -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:-0.015em;">
                    TicketSafe
                  </td>
                  <td align="right" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;color:${WHITE_70};text-transform:uppercase;">
                    Order confirmed
                  </td>
                </tr>
              </table>

              <!-- Event name — the visual focus -->
              <div class="ev-name" style="font-family:${FONT};font-size:30px;line-height:1.1;font-weight:800;color:#ffffff;letter-spacing:-0.025em;margin-bottom:16px;">
                ${esc(d.eventName)}
              </div>

              <!-- Meta -->
              <div style="font-family:${FONT};font-size:15px;line-height:1.55;font-weight:500;color:${WHITE_85};">
                ${esc(d.eventDate)}${d.eventTime ? ` · ${esc(d.eventTime)}` : ""}
              </div>
              ${d.eventLocation ? `<div style="font-family:${FONT};font-size:15px;line-height:1.55;font-weight:500;color:${WHITE_85};">${esc(d.eventLocation)}</div>` : ""}
            </td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td class="body-pad" style="padding:32px 36px 4px;">
              <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK_2};">
                Your ticket and order summary are attached as PDFs. Present the QR code at the entrance.
              </p>
            </td>
          </tr>

          <!-- ═══ ORDER DETAILS — subtle tinted block ═══ -->
          <tr>
            <td class="body-pad" style="padding:24px 36px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${ORDER_BG}" style="background:${ORDER_BG};border:1px solid ${HAIR};border-radius:10px;">
                <tr>
                  <td class="o-pad" style="padding:20px 22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="o-row">
                      ${row("Ticket",         esc(d.ticketType))}
                      ${row("Quantity",       String(d.quantity))}
                      ${rowTotal("Total paid", esc(d.pricePaid))}
                      ${row("Order number",   esc(d.orderNumber), { mono: true })}
                      ${row("Payment status", esc(d.paymentStatus))}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ CTA ═══ -->
          <tr>
            <td align="center" class="body-pad cta" style="padding:26px 36px 12px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(myTicketsUrl)}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="16%" stroke="f" fillcolor="${BRAND}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">Open my ticket</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:inline-block;padding:15px 40px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:${BRAND};border-radius:10px;letter-spacing:0;border:1px solid ${BRAND_DEEP};">
                Open my ticket
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td class="foot" style="padding:24px 36px 32px;border-top:1px solid ${HAIR};">
              <div style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:1.6;text-align:center;">
                <a href="${esc(websiteUrl)}" style="color:${BRAND};text-decoration:none;font-weight:600;">ticket-safe.eu</a>
                &nbsp;·&nbsp;
                <a href="mailto:${esc(supportEmail)}" style="color:${MUTED};text-decoration:none;">${esc(supportEmail)}</a>
              </div>
              <div style="padding-top:8px;font-family:${FONT};font-size:11px;color:${FAINT};line-height:1.5;text-align:center;">
                Automated confirmation. QR is single-use. ID may be required.
              </div>
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

// Row helpers
function row(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td style="padding:9px 0;width:44%;color:${MUTED};font-family:${FONT};font-size:14px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:9px 0;color:${INK};font-family:${valueFamily};font-size:14.5px;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}

function rowTotal(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 0;width:44%;color:${MUTED};font-family:${FONT};font-size:14px;font-weight:500;vertical-align:middle;">${esc(label)}</td>
    <td style="padding:11px 0;color:${BRAND};font-family:${FONT};font-size:18px;font-weight:800;text-align:right;vertical-align:middle;letter-spacing:-0.015em;">${value}</td>
  </tr>`;
}
