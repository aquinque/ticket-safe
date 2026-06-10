/**
 * generateConfirmationEmail(orderData)
 *
 * Builds the HTML body of the order-confirmation email that goes out
 * right after a successful Stripe payment. Two PDFs are attached
 * separately (ticket.pdf + order-summary.pdf) — see
 * sendTicketConfirmationEmail() in this folder.
 *
 * Compatibility:
 *   - Layout uses <table>s with cellpadding / cellspacing so Outlook
 *     (which ignores box-model CSS on divs) renders the cards correctly.
 *   - All CSS is INLINE on each element. Outlook strips <style> blocks
 *     wholesale; Gmail rewrites them.
 *   - Fonts: Arial / Helvetica / sans-serif — system stack that's
 *     installed on every desktop and phone, no webfont download.
 *   - Max body width 600 px (industry standard for email).
 *   - No background images on critical elements: the buyer still sees
 *     the full information if their client blocks images.
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

  /** Defaults if omitted. */
  supportEmail?: string;
  websiteUrl?: string;
  myTicketsUrl?: string;
}

// Brand palette duplicated here so the template stays self-contained —
// no risk of an upstream colour change silently desyncing what buyers see.
const BRAND_BLUE    = "#003399";
const BRAND_LIGHT   = "#0066cc";
const INK           = "#0f172a";
const MUTED         = "#64748b";
const FAINT         = "#94a3b8";
const HAIRLINE      = "#e2e8f0";
const BG_PAGE       = "#f1f5f9";
const BG_CARD       = "#ffffff";
const BG_SOFT       = "#f8fafc";
const VALID_BG      = "#dceaff";

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
  const websiteUrl   = d.websiteUrl ?? "https://ticket-safe.eu";
  const myTicketsUrl = d.myTicketsUrl ?? "https://ticket-safe.eu/my-tickets";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your TicketSafe order is confirmed</title>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <!-- Pre-header: shown in inbox preview but hidden in the body -->
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">
    Your ticket for ${esc(d.eventName)} is attached. Order ${esc(d.orderNumber)} — ${esc(d.pricePaid)} paid.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_PAGE};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:${BG_CARD};border-radius:18px;overflow:hidden;box-shadow:0 6px 28px rgba(15,23,42,0.08);">

          <!-- ─── HEADER (brand gradient) ─── -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_BLUE} 0%,${BRAND_LIGHT} 100%);background-color:${BRAND_BLUE};padding:32px 36px;color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:11px;text-transform:uppercase;letter-spacing:0.22em;font-weight:700;color:rgba(255,255,255,0.85);">
                    TICKET SAFE · ORDER CONFIRMED
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:10px;font-size:24px;font-weight:800;line-height:1.2;color:#ffffff;">
                    Your TicketSafe order is confirmed
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:6px;font-size:14px;color:rgba(255,255,255,0.90);">
                    Thank you for your purchase.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── MAIN MESSAGE ─── -->
          <tr>
            <td style="padding:30px 36px 8px;font-size:15px;line-height:1.65;color:${INK};">
              <p style="margin:0 0 14px;">Hi <strong>${esc(d.buyerFirstName)}</strong>,</p>
              <p style="margin:0 0 14px;">
                Thank you for your purchase on <strong>TicketSafe</strong>. Your payment has been successfully processed and your ticket for <strong>${esc(d.eventName)}</strong> is now confirmed.
              </p>
              <p style="margin:0 0 14px;">
                You will find your ticket attached to this email as a PDF. Please keep it accessible on your phone and present the QR code at the entrance of the event.
              </p>
              <p style="margin:0;">
                We have also attached your order summary for your records.
              </p>
            </td>
          </tr>

          <!-- ─── ORDER SUMMARY CARD ─── -->
          <tr>
            <td style="padding:24px 36px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG_SOFT};border:1px solid ${HAIRLINE};border-radius:14px;overflow:hidden;">
                <!-- Title row -->
                <tr>
                  <td style="padding:18px 22px 12px;border-bottom:1px solid ${HAIRLINE};">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-size:10px;text-transform:uppercase;letter-spacing:0.20em;font-weight:700;color:${MUTED};">
                          ORDER SUMMARY
                        </td>
                        <td align="right" style="font-size:11px;font-weight:700;letter-spacing:0.10em;color:${BRAND_BLUE};background:${VALID_BG};padding:4px 10px;border-radius:999px;display:inline-block;">
                          ${esc((d.paymentStatus ?? "Paid").toUpperCase())}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Body rows -->
                <tr>
                  <td style="padding:14px 22px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:${INK};">
                      ${row("Event",          esc(d.eventName), { strong: true })}
                      ${row("Date",           esc(d.eventDate))}
                      ${row("Time",           esc(d.eventTime))}
                      ${row("Location",       esc(d.eventLocation))}
                      ${spacer()}
                      ${row("Ticket type",    esc(d.ticketType))}
                      ${row("Quantity",       String(d.quantity))}
                      ${row("Price paid",     esc(d.pricePaid), { strongValue: true, valueColor: BRAND_BLUE })}
                      ${spacer()}
                      ${row("Order number",   esc(d.orderNumber), { mono: true })}
                      ${row("Buyer",          esc(`${d.buyerFirstName} ${d.buyerLastName}`))}
                      ${row("Purchase date",  esc(d.purchaseDate))}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── CTA — Open in My Tickets ─── -->
          <tr>
            <td align="center" style="padding:20px 36px 6px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background:${BRAND_BLUE};border-radius:10px;">
                    <a href="${esc(myTicketsUrl)}" target="_blank"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.02em;">
                      Open my ticket
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ─── IMPORTANT INFORMATION ─── -->
          <tr>
            <td style="padding:22px 36px 4px;">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.20em;font-weight:700;color:${MUTED};margin-bottom:10px;">
                IMPORTANT INFORMATION
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;color:${INK};line-height:1.6;">
                ${noticeRow("Your QR code is valid for one entry only.")}
                ${noticeRow("Do not share your ticket with anyone.")}
                ${noticeRow("A valid ID may be required at the entrance.")}
                ${noticeRow("Screenshots or duplicate tickets may be refused.")}
                ${noticeRow(`If you have any issue, please contact us at <a href="mailto:${esc(supportEmail)}" style="color:${BRAND_BLUE};text-decoration:none;">${esc(supportEmail)}</a>.`)}
              </table>
            </td>
          </tr>

          <!-- ─── FOOTER ─── -->
          <tr>
            <td style="padding:28px 36px 30px;border-top:1px solid ${HAIRLINE};margin-top:20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:11px;font-weight:700;letter-spacing:0.22em;color:${BRAND_BLUE};text-transform:uppercase;">
                    POWERED BY TICKET SAFE
                  </td>
                  <td align="right" style="font-size:12px;color:${MUTED};">
                    <a href="${esc(websiteUrl)}" style="color:${MUTED};text-decoration:none;">ticket-safe.eu</a>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:12px;font-size:11px;color:${FAINT};line-height:1.6;">
                    This is an automated confirmation email. Please do not reply directly to this message.<br>
                    For any question, contact <a href="mailto:${esc(supportEmail)}" style="color:${MUTED};text-decoration:underline;">${esc(supportEmail)}</a>.
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
  opts: { strong?: boolean; strongValue?: boolean; mono?: boolean; valueColor?: string } = {},
): string {
  const valueWeight = opts.strong || opts.strongValue ? 700 : 500;
  const valueFamily = opts.mono ? "Menlo,Consolas,monospace" : "Arial,Helvetica,sans-serif";
  const valueColor  = opts.valueColor ?? INK;
  return `<tr>
    <td style="padding:5px 0;width:42%;color:${MUTED};font-size:12px;font-weight:600;letter-spacing:0.04em;">${esc(label)}</td>
    <td style="padding:5px 0;color:${valueColor};font-size:14px;font-weight:${valueWeight};font-family:${valueFamily};text-align:right;">${value}</td>
  </tr>`;
}

function spacer(): string {
  return `<tr><td colspan="2" style="padding:6px 0;"><div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px;">&nbsp;</div></td></tr>`;
}

function noticeRow(html: string): string {
  return `<tr>
    <td valign="top" style="padding:3px 8px 3px 0;color:${BRAND_LIGHT};font-weight:700;width:14px;">•</td>
    <td style="padding:3px 0;color:${INK};font-size:13px;">${html}</td>
  </tr>`;
}
