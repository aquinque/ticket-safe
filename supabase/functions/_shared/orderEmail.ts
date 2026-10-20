/**
 * generateConfirmationEmail(orderData) — order-confirmation email body.
 *
 * Routed through the shared shell (_shared/emailComponents.ts) so this
 * email looks exactly like every other Ticket Safe transactional email:
 * real navy/accent tokens, zero border-radius, the real PNG logo. Used by
 * sendTicketConfirmationEmail.ts (the resale "ticket transferred from a
 * Studio event" path in revolut-webhook) — replay-order-email builds its
 * own body directly against the same shell for the primary Studio path.
 */
import { renderEmail, ctaButton, ticketSummary, textLine } from "./emailComponents.ts";
import { emailTokens } from "./emailTokens.ts";
import { RECEIPT_LEGAL_FALLBACK, renderNoticeHtml, type NoticeStyle, type ReceiptKind, type ReceiptLegal } from "./receiptLegal.ts";

export interface OrderEmailData {
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;

  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  eventAddress?: string | null;
  eventImageUrl?: string | null;

  ticketType: string;
  quantity: number;
  pricePaid: string;
  /** Ticket price and service fee, formatted ("10.00€"); when both are set the recap shows them apart. */
  ticketPrice?: string;
  serviceFee?: string;

  orderNumber: string;
  purchaseDate: string;
  paymentStatus: "Paid" | "Pending" | "Refunded";

  organizerName: string;

  /** "ticket" (default) or "resale": picks the wording of the legal notice. */
  kind?: ReceiptKind;
  legal?: ReceiptLegal;

  supportEmail?: string;
  websiteUrl?: string;
  myTicketsUrl?: string;
}

// The legal notice in the e-mail's own palette and fonts.
const NOTICE_STYLE: NoticeStyle = {
  text: emailTokens.textPrimary,
  muted: emailTokens.textMuted,
  label: emailTokens.textMuted,
  strong: emailTokens.textPrimary,
  accent: emailTokens.accent,
  border: emailTokens.border,
  font: emailTokens.fontBody,
};

export function generateConfirmationEmail(d: OrderEmailData): { html: string; text: string } {
  const myTicketsUrl = d.myTicketsUrl ?? `${emailTokens.siteUrl}/my-tickets`;

  const bodyHtml = `
    <p style="margin:0 0 4px">Hi ${d.buyerFirstName},</p>
    <p style="margin:0 0 4px">Your ticket for <strong>${d.eventName}</strong> is confirmed. It's attached to this email as a PDF, ready to show at the door.</p>
    ${ticketSummary([
      ["Event", d.eventName],
      ["Date", d.eventDate],
      ["Time", d.eventTime],
      ["Location", d.eventLocation],
      ...(d.eventAddress ? ([["Address", d.eventAddress]] as [string, string][]) : []),
      ["Ticket type", d.ticketType],
      ["Quantity", String(d.quantity)],
      ...(d.ticketPrice && d.serviceFee
        ? ([["Ticket price", d.ticketPrice], ["Service fee (Ticket Safe)", d.serviceFee]] as [string, string][])
        : []),
      ["Total paid", d.pricePaid, emailTokens.accent],
      ["Order number", d.orderNumber],
    ])}
    ${ctaButton("View my tickets", myTicketsUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:${emailTokens.textMuted}">The attached QR code is valid for one entry. This ticket is nominative — don't share it; it can only be resold through Ticket Safe.</p>
    ${renderNoticeHtml(d.legal ?? RECEIPT_LEGAL_FALLBACK, d.kind ?? "ticket", { organizerName: d.organizerName, style: NOTICE_STYLE })}
  `;

  const text = [
    `Your ticket for ${d.eventName} is confirmed.`,
    "",
    textLine("Event", d.eventName),
    textLine("Date", d.eventDate),
    textLine("Time", d.eventTime),
    textLine("Location", d.eventLocation),
    textLine("Ticket type", d.ticketType),
    textLine("Quantity", String(d.quantity)),
    ...(d.ticketPrice && d.serviceFee ? [textLine("Ticket price", d.ticketPrice), textLine("Service fee (Ticket Safe)", d.serviceFee)] : []),
    textLine("Total paid", d.pricePaid),
    textLine("Order number", d.orderNumber),
    "",
    `Your ticket is attached as a PDF. You can also find it at ${myTicketsUrl}`,
  ].join("\n");

  return renderEmail({
    eyebrow: "Order confirmation",
    title: "Your ticket is confirmed",
    bodyHtml,
    preheader: `${d.eventName} — ${d.eventDate}. Your ticket is attached.`,
    text,
  });
}
