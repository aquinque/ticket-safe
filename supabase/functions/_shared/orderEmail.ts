/**
 * generateConfirmationEmail(orderData) — dark, branded, minimal.
 *
 * Design direction (per user feedback):
 *   - Dark navy background, not white
 *   - Strong TicketSafe brand presence (the real #3a5fe6)
 *   - Much less copy. The email is the recap card, not a letter.
 *
 * The recap card is the centrepiece. Body text shrinks to two short
 * paragraphs above it. Important-info section dropped (the same warning
 * lives on the PDF itself and on the in-app ticket view). Footer cut
 * to two lines.
 *
 * Brand
 *   #3a5fe6 — live theme-color on ticket-safe.eu
 *   #2a47c4 — deeper variant for CTA border
 *   #182146 — dark navy for tints inside the dark card
 *
 * Mobile-first: viewport meta + a single @media query.
 * Compatibility: tables for layout, inline CSS on every node.
 * Attachments: ticket.pdf + order-summary.pdf untouched.
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

// ── Palette ──────────────────────────────────────────────────────────────
const BRAND        = "#3a5fe6";   // live ticket-safe.eu brand
const BRAND_DEEP   = "#2a47c4";   // CTA border / pressed
const BRAND_DIM    = "#5b76e9";   // muted brand for sub-accents

const PAGE_BG      = "#050816";   // very deep navy (almost black) page wrap
const CARD_BG      = "#0e1325";   // dark navy main card
const RECAP_BG     = "#181f3a";   // slightly lighter inside the recap
const RECAP_BORDER = "#2a3554";   // subtle brand-tinted border
const HAIR_DARK    = "#222a47";   // separators inside the dark card
const HAIR_DARK_2  = "#1a2138";   // softer separators

const WHITE        = "#ffffff";
const SLATE_200    = "#e2e8f0";   // body text
const SLATE_300    = "#cbd5e1";   // values
const SLATE_400    = "#94a3b8";   // labels, secondary
const SLATE_500    = "#64748b";   // footer disclaimer

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
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Your TicketSafe ticket is confirmed</title>
<style>
  @media only screen and (max-width: 600px) {
    .e-outer      { padding: 18px 10px !important; }
    .e-card       { border-radius: 14px !important; }
    .e-pad        { padding: 28px 22px !important; }
    .e-title      { font-size: 24px !important; line-height: 1.2 !important; }
    .e-body       { font-size: 15.5px !important; line-height: 1.6 !important; }
    .e-recap-pad  { padding: 22px 20px !important; }
    .e-event-name { font-size: 19px !important; }
    .e-total-v    { font-size: 22px !important; }
    .e-cta a      { display: block !important; padding: 16px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};color:${SLATE_200};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <!-- Pre-header (inbox preview) -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
    <tr>
      <td align="center" class="e-outer" style="padding:36px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="e-card" bgcolor="${CARD_BG}" style="max-width:600px;width:100%;background:${CARD_BG};border-radius:16px;overflow:hidden;">

          <!-- Brand accent strip at the top -->
          <tr>
            <td bgcolor="${BRAND}" style="background:${BRAND};line-height:0;font-size:0;height:4px;">&nbsp;</td>
          </tr>

          <!-- Wordmark -->
          <tr>
            <td align="center" class="e-pad" style="padding:36px 32px 4px;">
              <div style="font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND};letter-spacing:-0.015em;">
                TicketSafe
              </div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td class="e-pad" style="padding:24px 32px 6px;">
              <h1 class="e-title" style="margin:0;font-family:${FONT};font-size:26px;line-height:1.22;font-weight:700;color:${WHITE};letter-spacing:-0.02em;">
                Your ticket is confirmed
              </h1>
            </td>
          </tr>

          <!-- Body — short, two lines only -->
          <tr>
            <td class="e-pad" style="padding:18px 32px 6px;">
              <p class="e-body" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${SLATE_300};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p class="e-body" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${SLATE_300};">
                Your ticket and order summary are attached as PDFs. Present the QR at the entrance.
              </p>
            </td>
          </tr>

          <!-- ─── RECAP CARD ─── The visual centrepiece. -->
          <tr>
            <td class="e-pad" style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${RECAP_BG}" style="background:${RECAP_BG};border:1px solid ${RECAP_BORDER};border-radius:14px;">
                <tr>
                  <td class="e-recap-pad" style="padding:26px 26px 24px;">

                    <!-- Brand caps label -->
                    <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.18em;color:${BRAND_DIM};margin-bottom:14px;text-transform:uppercase;">
                      Booking summary
                    </div>

                    <!-- Event -->
                    <div class="e-event-name" style="font-family:${FONT};font-size:20px;line-height:1.25;font-weight:700;color:${WHITE};letter-spacing:-0.015em;margin-bottom:10px;">
                      ${esc(d.eventName)}
                    </div>
                    <div style="font-family:${FONT};font-size:14.5px;line-height:1.55;color:${SLATE_300};font-weight:500;">
                      ${esc(d.eventDate)}${d.eventTime ? `, ${esc(d.eventTime)}` : ""}
                    </div>
                    <div style="font-family:${FONT};font-size:14.5px;line-height:1.55;color:${SLATE_300};font-weight:500;">
                      ${esc(d.eventLocation)}
                    </div>

                    <!-- Hairline -->
                    <div style="height:1px;background:${HAIR_DARK};line-height:1px;font-size:1px;margin:20px 0;">&nbsp;</div>

                    <!-- Compact ticket info -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${darkRow("Ticket",       esc(d.ticketType))}
                      ${darkRow("Quantity",     String(d.quantity))}
                      ${darkRow("Order",        esc(d.orderNumber), { mono: true })}
                      ${darkRow("Status",       esc(d.paymentStatus))}
                    </table>

                    <!-- Hairline -->
                    <div style="height:1px;background:${HAIR_DARK};line-height:1px;font-size:1px;margin:18px 0;">&nbsp;</div>

                    <!-- Total — brand, big -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family:${FONT};font-size:12px;font-weight:700;color:${BRAND_DIM};letter-spacing:0.18em;text-transform:uppercase;vertical-align:middle;">
                          Total paid
                        </td>
                        <td align="right" class="e-total-v" style="font-family:${FONT};font-size:26px;font-weight:800;color:${BRAND};letter-spacing:-0.02em;vertical-align:middle;">
                          ${esc(d.pricePaid)}
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" class="e-pad e-cta" style="padding:28px 32px 16px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(myTicketsUrl)}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="16%" stroke="f" fillcolor="${BRAND}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">Open my ticket</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:inline-block;padding:15px 38px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:${BRAND};border-radius:8px;letter-spacing:0;border:1px solid ${BRAND_DEEP};">
                Open my ticket
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Footer — minimal, single block -->
          <tr>
            <td class="e-pad" style="padding:18px 32px 32px;border-top:1px solid ${HAIR_DARK_2};">
              <div style="font-family:${FONT};font-size:13px;color:${SLATE_400};line-height:1.6;text-align:center;">
                <a href="${esc(websiteUrl)}" style="color:${BRAND_DIM};text-decoration:none;font-weight:600;">ticket-safe.eu</a>
                &nbsp;·&nbsp;
                <a href="mailto:${esc(supportEmail)}" style="color:${SLATE_400};text-decoration:none;">${esc(supportEmail)}</a>
              </div>
              <div style="padding-top:8px;font-family:${FONT};font-size:11px;color:${SLATE_500};line-height:1.5;text-align:center;">
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

// ──────────────────────────────────────────────────────────────────────────
//  Row helper — dark recap card variant
// ──────────────────────────────────────────────────────────────────────────

function darkRow(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td style="padding:6px 0;width:42%;color:${SLATE_400};font-family:${FONT};font-size:13.5px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;color:${WHITE};font-family:${valueFamily};font-size:14.5px;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}
