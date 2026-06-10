/**
 * generateConfirmationEmail(orderData)
 *
 * Built from scratch per the new spec. Premium ticketing-confirmation
 * email à la Shotgun / Ticketmaster / Eventbrite / Airbnb, with the
 * TicketSafe identity.
 *
 * Visual structure
 *   1. Deep-navy HEADER carrying the wordmark + "Order confirmed" pill
 *      + big white title
 *   2. White BODY with greeting and short copy
 *   3. ATTACHMENTS block listing ticket.pdf + order-summary.pdf
 *   4. EVENT card with banner (or navy fallback if no image)
 *   5. ORDER SUMMARY card (slate-tinted)
 *   6. IMPORTANT INFORMATION card (bulleted)
 *   7. Deep-navy FOOTER with brand wordmark + URL + support
 *
 * Brand
 *   #3a5fe6   live ticket-safe.eu accent
 *   #0c1e3e   deep navy for the header + footer
 *   #16a34a   green, reserved exclusively for "Paid" status
 *
 * PDFs
 *   ticket.pdf + order-summary.pdf untouched — only this HTML template
 *   has been rewritten.
 */

export interface OrderEmailData {
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;

  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  /** Street address — if absent, falls back to eventLocation alone. */
  eventAddress?: string | null;
  /** Banner image URL. When absent, the event card uses a navy fallback. */
  eventImageUrl?: string | null;

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
const BRAND          = "#3a5fe6";   // live brand accent
const BRAND_DEEP     = "#2a47c4";   // CTA border
const NAVY           = "#0c1e3e";   // header + footer bg
const NAVY_BORDER    = "#1a2c52";   // navy section dividers
const NAVY_FAINT     = "#8aa3d5";   // navy footer disclaimer

const INK            = "#0f172a";   // primary text
const INK_2          = "#1e293b";   // body
const MUTED          = "#64748b";   // labels
const FAINT          = "#94a3b8";   // disclaimers
const HAIR           = "#e2e8f0";   // hairlines
const PAGE_BG        = "#f3f4f7";   // page wrap
const CARD_TINT      = "#f8fafc";   // subtle tint inside body cards

const PAID_GREEN     = "#16a34a";   // ONLY used for the Paid status pill
const PAID_GREEN_BG  = "#dcfce7";   // pill bg for Paid

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
    .outer        { padding: 18px 10px !important; }
    .card         { border-radius: 14px !important; }
    .head         { padding: 28px 22px 32px !important; }
    .head h1      { font-size: 24px !important; line-height: 1.2 !important; }
    .pad          { padding: 24px 22px !important; }
    .body-p       { font-size: 15.5px !important; line-height: 1.6 !important; }
    .att-row      { padding: 12px 16px !important; }
    .att-name     { font-size: 14px !important; }
    .att-meta     { font-size: 12px !important; }
    .ev-name      { font-size: 19px !important; }
    .ev-meta      { font-size: 14px !important; }
    .row td       { font-size: 14.5px !important; padding: 11px 0 !important; }
    .total-v      { font-size: 19px !important; }
    .imp li       { font-size: 14px !important; padding-left: 6px !important; }
    .foot         { padding: 26px 22px 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <!-- Preheader -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">
    Your ticket and order summary are attached.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
    <tr>
      <td align="center" class="outer" style="padding:36px 16px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="card" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,0.08);">

          <!-- ═══ 1. NAVY HEADER ═══ -->
          <tr>
            <td bgcolor="${NAVY}" class="head" style="background:${NAVY};padding:34px 36px 38px;">
              <!-- Wordmark left + Order confirmed badge right -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:26px;">
                <tr>
                  <td style="font-family:${FONT};font-size:16px;font-weight:800;color:#ffffff;letter-spacing:-0.015em;">
                    TicketSafe
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:#ffffff;color:${BRAND};padding:5px 11px;border-radius:99px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
                      Order confirmed
                    </span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 8px;font-family:${FONT};font-size:28px;line-height:1.18;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
                Your ticket is confirmed
              </h1>
              <div style="font-family:${FONT};font-size:14px;line-height:1.5;color:${NAVY_FAINT};font-weight:500;">
                Thank you for your purchase.
              </div>
            </td>
          </tr>

          <!-- ═══ 2. BODY — greeting + intro ═══ -->
          <tr>
            <td class="pad" style="padding:32px 36px 8px;">
              <p class="body-p" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                Hi ${esc(d.buyerFirstName)},
              </p>
              <p class="body-p" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                Your ticket for <strong style="color:${INK};">${esc(d.eventName)}</strong> is confirmed.
              </p>
              <p class="body-p" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                You'll find your ticket attached to this email as a PDF. Please keep it accessible on your phone and present the QR code at the entrance.
              </p>
              <p class="body-p" style="margin:0;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_2};">
                We've also attached your order summary for your records.
              </p>
            </td>
          </tr>

          <!-- ═══ 3. ATTACHMENTS BLOCK ═══ -->
          <tr>
            <td class="pad" style="padding:22px 36px 4px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;color:${BRAND};margin-bottom:10px;text-transform:uppercase;">
                2 attachments
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_TINT};border:1px solid ${HAIR};border-radius:10px;">
                <tr>
                  <td class="att-row" style="padding:14px 18px;border-bottom:1px solid ${HAIR};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div class="att-name" style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${INK};line-height:1.3;">
                            ticket.pdf
                          </div>
                          <div class="att-meta" style="font-family:${FONT};font-size:12.5px;color:${MUTED};line-height:1.4;margin-top:2px;">
                            Your event ticket with QR code
                          </div>
                        </td>
                        <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:10px;font-weight:700;color:${BRAND};letter-spacing:0.08em;text-transform:uppercase;">
                          PDF
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="att-row" style="padding:14px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div class="att-name" style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${INK};line-height:1.3;">
                            order-summary.pdf
                          </div>
                          <div class="att-meta" style="font-family:${FONT};font-size:12.5px;color:${MUTED};line-height:1.4;margin-top:2px;">
                            Receipt for your records
                          </div>
                        </td>
                        <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:10px;font-weight:700;color:${BRAND};letter-spacing:0.08em;text-transform:uppercase;">
                          PDF
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ 4. EVENT CARD ═══ -->
          <tr>
            <td class="pad" style="padding:22px 36px 4px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;color:${MUTED};margin-bottom:10px;text-transform:uppercase;">
                Event details
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;overflow:hidden;">
                ${eventBanner(d)}
                <tr>
                  <td style="padding:20px 22px 22px;">
                    <div class="ev-name" style="font-family:${FONT};font-size:20px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.015em;margin-bottom:14px;">
                      ${esc(d.eventName)}
                    </div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="row">
                      ${row("Date",       esc(d.eventDate))}
                      ${row("Time",       esc(d.eventTime))}
                      ${row("Location",   esc(d.eventLocation))}
                      ${d.eventAddress ? row("Address", esc(d.eventAddress)) : ""}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ 5. ORDER SUMMARY CARD ═══ -->
          <tr>
            <td class="pad" style="padding:22px 36px 4px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;color:${MUTED};margin-bottom:10px;text-transform:uppercase;">
                Order summary
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CARD_TINT};border:1px solid ${HAIR};border-radius:12px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="row">
                      ${row("Ticket type",    esc(d.ticketType))}
                      ${row("Quantity",       String(d.quantity))}
                      ${rowTotal("Total paid", esc(d.pricePaid))}
                      ${row("Order number",   esc(d.orderNumber), { mono: true })}
                      ${rowStatus("Payment status", d.paymentStatus)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ 6. IMPORTANT INFORMATION CARD ═══ -->
          <tr>
            <td class="pad" style="padding:22px 36px 28px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.16em;color:${MUTED};margin-bottom:10px;text-transform:uppercase;">
                Important information
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <ul class="imp" style="margin:0;padding:0 0 0 18px;font-family:${FONT};font-size:14.5px;line-height:1.7;color:${INK_2};">
                      <li style="margin-bottom:4px;">Your QR code is valid for one entry only.</li>
                      <li style="margin-bottom:4px;">Do not share your ticket with anyone.</li>
                      <li style="margin-bottom:4px;">A valid ID may be required at the entrance.</li>
                      <li>Screenshots or duplicated tickets may be refused.</li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ 7. NAVY FOOTER ═══ -->
          <tr>
            <td bgcolor="${NAVY}" class="foot" style="background:${NAVY};padding:30px 36px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div style="font-family:${FONT};font-size:16px;font-weight:800;color:#ffffff;letter-spacing:-0.015em;margin-bottom:10px;">
                      TicketSafe
                    </div>
                    <div style="font-family:${FONT};font-size:13.5px;color:${NAVY_FAINT};line-height:1.7;">
                      <a href="${esc(websiteUrl)}" style="color:#ffffff;text-decoration:none;font-weight:600;">ticket-safe.eu</a><br>
                      <span style="color:${NAVY_FAINT};">Support: </span><a href="mailto:${esc(supportEmail)}" style="color:#ffffff;text-decoration:none;">${esc(supportEmail)}</a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:18px;border-top:1px solid ${NAVY_BORDER};margin-top:18px;">
                    <div style="padding-top:14px;font-family:${FONT};font-size:11.5px;color:${NAVY_FAINT};line-height:1.55;">
                      This is an automated confirmation email. Please do not reply to this email.
                    </div>
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
//  Event card banner — image when provided, navy fallback otherwise
// ──────────────────────────────────────────────────────────────────────────

function eventBanner(d: OrderEmailData): string {
  if (d.eventImageUrl) {
    return `<tr>
      <td style="padding:0;line-height:0;font-size:0;">
        <img src="${esc(d.eventImageUrl)}" alt="${esc(d.eventName)}" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;border-top-left-radius:12px;border-top-right-radius:12px;" />
      </td>
    </tr>`;
  }
  // Fallback: deep-navy block with event name centred so the card never
  // breaks when the organiser hasn't uploaded a banner.
  return `<tr>
    <td bgcolor="${NAVY}" style="background:${NAVY};padding:34px 26px;text-align:center;">
      <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.18em;color:${BRAND};text-transform:uppercase;margin-bottom:10px;">
        Event
      </div>
      <div style="font-family:${FONT};font-size:20px;line-height:1.25;font-weight:700;color:#ffffff;letter-spacing:-0.015em;">
        ${esc(d.eventName)}
      </div>
    </td>
  </tr>`;
}

// ──────────────────────────────────────────────────────────────────────────
//  Row helpers
// ──────────────────────────────────────────────────────────────────────────

function row(label: string, value: string, opts: { mono?: boolean } = {}): string {
  const valueFamily = opts.mono ? "ui-monospace,Menlo,Consolas,monospace" : FONT;
  return `<tr>
    <td style="padding:9px 0;width:38%;color:${MUTED};font-family:${FONT};font-size:14px;font-weight:500;vertical-align:top;">${esc(label)}</td>
    <td style="padding:9px 0;color:${INK};font-family:${valueFamily};font-size:14.5px;font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`;
}

function rowTotal(label: string, value: string): string {
  return `<tr>
    <td style="padding:12px 0;width:38%;color:${MUTED};font-family:${FONT};font-size:14px;font-weight:500;vertical-align:middle;">${esc(label)}</td>
    <td class="total-v" style="padding:12px 0;color:${BRAND};font-family:${FONT};font-size:20px;font-weight:800;text-align:right;vertical-align:middle;letter-spacing:-0.015em;">${value}</td>
  </tr>`;
}

function rowStatus(label: string, status: "Paid" | "Pending" | "Refunded"): string {
  // "Paid" is the only place green appears in the whole template.
  const isPaid = status === "Paid";
  const bg = isPaid ? PAID_GREEN_BG : "#f1f5f9";
  const fg = isPaid ? PAID_GREEN   : MUTED;
  return `<tr>
    <td style="padding:9px 0;width:38%;color:${MUTED};font-family:${FONT};font-size:14px;font-weight:500;vertical-align:middle;">${esc(label)}</td>
    <td style="padding:9px 0;text-align:right;vertical-align:middle;">
      <span style="display:inline-block;background:${bg};color:${fg};padding:4px 10px;border-radius:99px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.04em;">
        ${esc(status)}
      </span>
    </td>
  </tr>`;
}
