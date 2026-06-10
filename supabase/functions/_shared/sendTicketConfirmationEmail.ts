/**
 * sendTicketConfirmationEmail(orderData) — the orchestrator.
 *
 * One call after a successful Stripe payment does everything:
 *   1. Generates the HTML body (orderEmail.ts)
 *   2. Generates ticket.pdf            (caller-supplied; see note below)
 *   3. Generates order-summary.pdf     (orderSummaryPdf.ts)
 *   4. Calls the Resend API with both PDFs as base64 attachments
 *
 * Note on ticket.pdf:
 *   The repository has a client-side ticket generator (src/lib/ticketPdf.ts)
 *   that uses jsPDF in the browser. That can't run inside a Deno edge
 *   function. For now we accept a pre-rendered ticket PDF as a Uint8Array,
 *   so the caller controls how it's produced. The webhook can either:
 *     - reuse a server-side renderer (TODO: future ticketPdfServer.ts), or
 *     - ship a placeholder PDF until that lands.
 *   Either way, this function doesn't care — it just attaches the bytes.
 */

import { generateConfirmationEmail, type OrderEmailData } from "./orderEmail.ts";
import { generateOrderSummaryPDF, type OrderSummaryData } from "./orderSummaryPdf.ts";

export interface SendTicketConfirmationInput {
  resendApiKey: string;
  to: string;

  /** Combined data — single source of truth for the email body, the order
   *  summary PDF, and the Resend metadata. */
  order: OrderSummaryData;

  /** Pre-rendered ticket PDF bytes. The caller decides how to produce it. */
  ticketPdfBytes: Uint8Array;

  /** Optional: override the From address. */
  from?: string;
  /** Optional: pass extra headers Resend understands (e.g. tags). */
  tags?: { name: string; value: string }[];
}

/**
 * Base64-encode raw bytes. atob/btoa in Deno work on strings only, and the
 * native Buffer doesn't exist, so we hand-encode in chunks.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export async function sendTicketConfirmationEmail(
  input: SendTicketConfirmationInput,
): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const { resendApiKey, to, order, ticketPdfBytes } = input;
  const from = input.from ?? "Ticket Safe <noreply@ticket-safe.eu>";

  // 1. Order summary PDF
  let orderSummaryBytes: Uint8Array;
  try {
    orderSummaryBytes = await generateOrderSummaryPDF(order);
  } catch (err) {
    console.error("[sendTicketConfirmationEmail] order-summary generation failed:", err);
    return { ok: false, error: "order_summary_pdf_failed" };
  }

  // 2. Email HTML
  const emailData: OrderEmailData = {
    buyerFirstName: order.buyerFirstName,
    buyerLastName:  order.buyerLastName,
    buyerEmail:     order.buyerEmail,
    eventName:      order.eventName,
    eventDate:      order.eventDate,
    eventTime:      order.eventTime,
    eventLocation:  order.eventLocation,
    ticketType:     order.ticketType,
    quantity:       order.quantity,
    pricePaid:      order.totalPaid,
    orderNumber:    order.orderNumber,
    purchaseDate:   order.purchaseDate,
    paymentStatus:  order.paymentStatus,
    organizerName:  order.organizerName,
    supportEmail:   order.supportEmail,
    websiteUrl:     order.websiteUrl,
  };
  const html = generateConfirmationEmail(emailData);

  // 3. Build the Resend payload
  // Subject — per spec, kept short and brand-led so it reads cleanly in
  // every inbox preview, even when the event name is long.
  const subject = "Your TicketSafe ticket is confirmed";
  const payload = {
    from,
    to: [to],
    subject,
    html,
    attachments: [
      {
        filename: "ticket.pdf",
        content: bytesToBase64(ticketPdfBytes),
      },
      {
        filename: "order-summary.pdf",
        content: bytesToBase64(orderSummaryBytes),
      },
    ],
    ...(input.tags ? { tags: input.tags } : {}),
  };

  // 4. Fire-and-await the Resend call. We surface the response id so the
  //    webhook can log it for later support / debugging.
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[sendTicketConfirmationEmail] Resend non-200:", res.status, body);
      return { ok: false, error: (body as { message?: string }).message ?? `resend_${res.status}` };
    }
    return { ok: true, resendId: (body as { id?: string }).id };
  } catch (err) {
    console.error("[sendTicketConfirmationEmail] Resend fetch failed:", err);
    return { ok: false, error: "resend_fetch_failed" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  EXAMPLE payload — drop into a test edge function or a curl tester
// ──────────────────────────────────────────────────────────────────────────

export const EXAMPLE_ORDER: OrderSummaryData = {
  orderNumber:    "TS-ORDER-000184",
  purchaseDate:   "12 September 2026",
  buyerFirstName: "Achille",
  buyerLastName:  "Quinquenel",
  buyerEmail:     "achille@example.com",
  eventName:      "ESCP Opening Party",
  eventDate:      "Friday, 19 September 2026",
  eventTime:      "22:30",
  eventLocation:  "Le Duplex, Paris",
  ticketType:     "Early Bird",
  quantity:       1,
  unitPrice:      "18.00€",
  totalPaid:      "18.00€",
  paymentMethod:  "Card",
  paymentStatus:  "Paid",
  organizerName:  "ESCP Students' Union",
  ticketId:       "TS-ESC-000184",
  transactionId:  "stripe_txn_123456789",
};
