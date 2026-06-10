/**
 * send-preview-email — one-shot edge function that fires the full
 * confirmation-email flow (HTML body + ticket.pdf + order-summary.pdf)
 * with fake data so the developer can preview what real buyers receive.
 *
 * GET /functions/v1/send-preview-email?to=<email>
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendTicketConfirmationEmail } from "../_shared/sendTicketConfirmationEmail.ts";
import { generateTicketsPDFServer, type ServerTicketData } from "../_shared/ticketPdfServer.ts";
import { type OrderSummaryData } from "../_shared/orderSummaryPdf.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "achillequinquenel@gmail.com";

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const orderData: OrderSummaryData = {
    orderNumber:    "TS-PREVIEW-001",
    purchaseDate:   "10 June 2026",
    buyerFirstName: "Achille",
    buyerLastName:  "Quinquenel",
    buyerEmail:     to,
    eventName:      "ESCP Spring Boat Party",
    eventDate:      "Friday, 19 June 2026",
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
    transactionId:  "pi_test_preview_demo",
  };

  const tickets: ServerTicketData[] = [{
    eventName:      orderData.eventName,
    eventDate:      "2026-06-19T22:30:00.000Z",
    eventTime:      "22:30",
    eventLocation:  orderData.eventLocation,
    organizerName:  orderData.organizerName,
    buyerFirstName: orderData.buyerFirstName,
    buyerLastName:  orderData.buyerLastName,
    buyerEmail:     to,
    ticketType:     orderData.ticketType,
    pricePaid:      orderData.totalPaid,
    ticketId:       orderData.ticketId,
    qrToken:        `https://ticket-safe.eu/verify/${orderData.ticketId}`,
    status:         "Valid",
    ticketIndex:    1,
    ticketTotal:    1,
  }];

  let ticketPdfBytes = new Uint8Array();
  try {
    ticketPdfBytes = await generateTicketsPDFServer(tickets);
  } catch (err) {
    console.error("[send-preview-email] ticket PDF failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "ticket_pdf_failed", detail: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const result = await sendTicketConfirmationEmail({
    resendApiKey: resendKey,
    to,
    order: orderData,
    ticketPdfBytes,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
