/**
 * generateConfirmationEmail(orderData)
 *
 * Built from scratch (no carry-over from previous attempts). The design
 * goal: a transactional email that reads as real correspondence from a
 * ticketing platform — like a confirmation from Stripe, Airbnb or Dice.
 * Premium comes from TYPOGRAPHY + SPACING, not from decoration.
 *
 * Rules we live by here:
 *   1. No gradients. The brand presence is a single 4 px coloured strip
 *      at the top of the card + the wordmark + accents on the total
 *      and the CTA.
 *   2. No ALL CAPS overlines. Sentence case throughout.
 *   3. No "section cards" with tinted backgrounds. Hairlines separate
 *      sections; everything else is white.
 *   4. One brand colour, applied where it carries information (wordmark,
 *      Total paid value, CTA button). Everything else is the slate scale.
 *   5. Generous vertical rhythm. We trust whitespace to do the work.
 *
 * Brand colour
 *   Pulled from ticket-safe.eu live identity:
 *     #3a5fe6 — site meta theme-color
 *   This is the only accent colour the template uses.
 *
 * Attachments
 *   This file builds ONLY the HTML body of the email. The two PDFs
 *   (ticket.pdf + order-summary.pdf) are produced by ticketPdfServer.ts
 *   and orderSummaryPdf.ts respectively, and attached by
 *   sendTicketConfirmationEmail.ts. NONE of those files are touched here.
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
// Only one brand colour. Everything else is the slate scale.
const BRAND       = "#3a5fe6";
const BRAND_DEEP  = "#2a47c4";  // pressed / border, slightly darker

const TEXT        = "#111418";  // headings, primary values
const TEXT_2      = "#2c3138";  // body text
const TEXT_MUTED  = "#525a66";  // labels, secondary
const TEXT_FAINT  = "#8a93a1";  // footer disclaimer
const HAIR        = "#e5e7ec";  // section separators
const PAGE_BG     = "#f3f4f7";  // soft slate page wrap

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
  /* Mobile refinements. Honoured by Apple Mail iOS, Gmail iOS, Outlook iOS.
     Clients that strip <style> still get a fluid layout from the inline CSS. */
  @media only screen and (max-width: 600px) {
    .e-outer    { padding: 18px 10px !important; }
    .e-card     { border-radius: 12px !important; }
    .e-pad      { padding: 24px 22px !important; }
    .e-title    { font-size: 22px !important; line-height: 1.22 !important; }
    .e-body     { font-size: 15.5px !important; line-height: 1.6 !important; }
    .e-row td   { font-size: 14.5px !important; padding: 11px 0 !important; }
    .e-row .l   { width: 38% !important; }
    .e-total td { padding: 13px 0 !important; }
    .e-cta a    { display: block !important; padding: 15px 0 !important; }
    .e-foot     { padding: 22px 22px 26px !important; }
  }
  /* Dark-mode-friendly: stop Outlook/Gmail inversion making the card grey */
  [data-ogsc] .e-card,
  [data-ogsb] .e-card { background-color: #ffffff !important; color: ${TEXT} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};color:${TEXT};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <!-- Pre-header (inbox preview). Hidden in the body, shown beside the subject. -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAGE_BG};">
    <tr>
      <td align="center" class="e-outer" style="padding:36px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="e-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.05);">

          <!-- Brand accent strip: a single 4 px brand-coloured band at the
               very top of the card. Carries the brand without dominating. -->
          <tr>
            <td bgcolor="${BRAND}" style="background:${BRAND};line-height:0;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Logo: centered text wordmark, brand colour.
               No image dependency: if external assets are blocked the
               wordmark still renders perfectly. -->
          <tr>
            <td align="center" class="e-pad" style="padding:32px 32px 8px;">
              <div style="font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND};letter-spacing:-0.015em;">
                TicketSafe
              </div>
            </td>
          </tr>

          <!-- Title block -->
          <tr>
            <td class="e-pad" style="padding:18px 32px 8px;">
              <div style="font-family:${FONT};font-size:13px;font-weight:500;color:${TEXT_MUTED};margin-bottom:8px;">
                Order confirmed
              </div>
              <h1 class="e-title" style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${TEXT};letter-spacing:-0.015em;">
                Your ticket is confirmed
              </h1>
            </td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td class="e-pad" style="padding:20px 32px 4px;">
              <p class="e-body" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${TEXT_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p class="e-body" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${TEXT_2};">
                Thanks for your purchase. Your payment has been successfully processed, and your ticket for ${esc(d.eventName)} is confirmed.
              </p>
              <p class="e-body" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${TEXT_2};">
                Your ticket is attached to this email as a PDF. Please keep it accessible on your phone and present the QR code at the entrance.
              </p>
              <p class="e-body" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.65;color:${TEXT_2};">
                We've also attached your order summary for your records.
              </p>
            </td>
          </tr>

          <!-- ─── Event details ─── -->
          <tr>
            <td class="e-pad" style="padding:32px 32px 0;">
              <div style="height:1px;background:${HAIR};line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="e-pad" style="padding:20px 32px 4px;">
              <h2 style="margin:0 0 14px;font-family:${FONT};font-size:13px;font-weight:600;color:${TEXT};letter-spacing:0;">
                Event details
              </h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="e-row">
                ${row("Event",     esc(d.eventName))}
                ${row("Date",      esc(d.eventDate))}
                ${row("Time",      esc(d.eventTime))}
                ${row("Location",  esc(d.eventLocation))}
              </table>
            </td>
          </tr>

          <!-- ─── Order summary ─── -->
          <tr>
            <td class="e-pad" style="padding:24px 32px 0;">
              <div style="height:1px;background:${HAIR};line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="e-pad" style="padding:20px 32px 4px;">
              <h2 style="margin:0 0 14px;font-family:${FONT};font-size:13px;font-weight:600;color:${TEXT};letter-spacing:0;">
                Order summary
              </h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="e-row">
                ${row("Ticket type",    esc(d.ticketType))}
                ${row("Quantity",       String(d.quantity))}
                ${rowTotal("Total paid", esc(d.pricePaid))}
                ${row("Order number",   esc(d.orderNumber), { mono: true })}
                ${row("Payment status", esc(d.paymentStatus))}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" class="e-pad e-cta" style="padding:28px 32px 8px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(myTicketsUrl)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" stroke="f" fillcolor="${BRAND}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">Open my ticket</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${esc(myTicketsUrl)}" target="_blank"
                 style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;background:${BRAND};border-radius:8px;letter-spacing:0;border:1px solid ${BRAND_DEEP};">
                Open my ticket
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- ─── Important information ─── -->
          <tr>
            <td class="e-pad" style="padding:24px 32px 0;">
              <div style="height:1px;background:${HAIR};line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="e-pad" style="padding:20px 32px 8px;">
              <h2 style="margin:0 0 10px;font-family:${FONT};font-size:13px;font-weight:600;color:${TEXT};letter-spacing:0;">
                Important information
              </h2>
              <p style="margin:0;font-family:${FONT};font-size:14.5px;line-height:1.7;color:${TEXT_MUTED};">
                Please keep your ticket safe. Your QR code is valid for one entry only and should not be shared. A valid ID may be required at the entrance. Screenshots or duplicated tickets may be refused.
              </p>
            </td>
          </tr>

          <!-- ─── Footer ─── -->
          <tr>
            <td class="e-foot" style="padding:24px 32px 32px;border-top:1px solid ${HAIR};margin-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};font-size:13.5px;color:${TEXT_MUTED};line-height:1.65;">
                    <div style="font-weight:600;color:${BRAND};margin-bottom:6px;letter-spacing:-0.01em;">Powered by TicketSafe</div>
                    <a href="${esc(websiteUrl)}" style="color:${TEXT_MUTED};text-decoration:none;">ticket-safe.eu</a><br>
                    <span style="color:${TEXT_MUTED};">Support: </span><a href="mailto:${esc(supportEmail)}" style="color:${TEXT_MUTED};text-decoration:underline;">${esc(supportEmail)}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;font-family:${FONT};font-size:12px;color:${TEXT_FAINT};line-height:1.5;">
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
//  Row helpers — label left, value right, hairline-separated
// ──────────────────────────────────────────────────────────────────────────

function row(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td class="l" style="padding:12px 0;width:42%;color:${TEXT_MUTED};font-family:${FONT};font-size:14.5px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:12px 0;color:${TEXT};font-family:${valueFamily};font-size:15px;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}

function rowTotal(label: string, value: string): string {
  return `<tr class="e-total">
    <td class="l" style="padding:14px 0;width:42%;color:${TEXT_MUTED};font-family:${FONT};font-size:14.5px;font-weight:500;vertical-align:middle;">${esc(label)}</td>
    <td style="padding:14px 0;color:${BRAND};font-family:${FONT};font-size:17px;font-weight:700;text-align:right;vertical-align:middle;letter-spacing:-0.01em;">${value}</td>
  </tr>`;
}
