/**
 * generateOrderSummaryPDF(orderData) — server-side PDF receipt generator.
 *
 * Runs inside Deno edge functions (no DOM, no canvas), so we use pdf-lib
 * which is pure JavaScript and ships nicely from esm.sh.
 *
 * Layout (A4 portrait, 210 × 297 mm):
 *
 *   ┌─ HEADER BAND ─────────────────────────────────┐
 *   │ TICKET SAFE                          [ PAID ] │
 *   ├─ TITLE ───────────────────────────────────────┤
 *   │ Order Summary                                  │
 *   │ Order #TS-ORDER-000184 · 12 September 2026    │
 *   ├─ BUYER + EVENT ───────────────────────────────┤
 *   │ BUYER                  EVENT                  │
 *   │ Achille Quinquenel     ESCP Opening Party     │
 *   │ achille@example.com    Fri 19 Sep 2026, 22:30 │
 *   │                        Le Duplex, Paris       │
 *   ├─ LINE ITEMS TABLE ────────────────────────────┤
 *   │ Item           Qty   Unit price    Total      │
 *   │ Early Bird     1     18.00 EUR     18.00 EUR  │
 *   │ ─────────────────────────────────────────────  │
 *   │                          TOTAL    18.00 EUR    │
 *   ├─ PAYMENT ─────────────────────────────────────┤
 *   │ Payment status    Paid                        │
 *   │ Payment method    Card                        │
 *   │ Transaction ID    stripe_txn_123456789        │
 *   │ Purchase date     12 September 2026           │
 *   ├─ FOOTER ──────────────────────────────────────┤
 *   │ Thank you for using TicketSafe.                │
 *   │ This document is a payment receipt and order   │
 *   │ summary.                                       │
 *   │ support@ticket-safe.eu   ticket-safe.eu        │
 *   └────────────────────────────────────────────────┘
 *
 * Returns a Uint8Array (raw PDF bytes) ready to be base64-encoded for the
 * Resend `attachments` field, or written to disk in test code.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

export interface OrderSummaryData {
  orderNumber: string;
  purchaseDate: string;     // "12 September 2026"

  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail: string;

  eventName: string;
  eventDate: string;        // "Friday, 19 September 2026"
  eventTime: string;        // "22:30"
  eventLocation: string;

  ticketType: string;       // "Early Bird", "VIP", …
  quantity: number;
  unitPrice: string;        // "18.00€"
  totalPaid: string;        // "18.00€"

  paymentMethod: string;    // "Card", "Apple Pay", …
  paymentStatus: "Paid" | "Pending" | "Refunded";
  transactionId: string;
  organizerName: string;
  ticketId: string;

  /** Optional overrides. */
  supportEmail?: string;
  websiteUrl?: string;
}

// pdf-lib measures in POINTS (1mm = 2.834645669 pt) by default. Pick A4.
const A4_W = 595.28;
const A4_H = 841.89;
const MM   = 2.834645669;

// Brand palette
const BRAND = rgb(0,   0.20, 0.60); // #003399
const LIGHT = rgb(0,   0.40, 0.80); // #0066cc
const INK   = rgb(0.06,0.09, 0.16); // slate-900
const MUTED = rgb(0.39,0.45, 0.55); // slate-500
const FAINT = rgb(0.58,0.64, 0.72); // slate-400
const HAIR  = rgb(0.88,0.91, 0.94); // slate-200
const SOFT  = rgb(0.97,0.98, 0.99); // slate-50
const VBG   = rgb(0.86,0.92, 1.00); // valid badge bg
const PILL  = rgb(0.0, 0.13, 0.36); // dark navy pill bg
const WHITE = rgb(1,1,1);

export async function generateOrderSummaryPDF(d: OrderSummaryData): Promise<Uint8Array> {
  const supportEmail = d.supportEmail ?? "support@ticket-safe.eu";
  const websiteUrl   = d.websiteUrl ?? "ticket-safe.eu";

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);

  // Fonts — Helvetica family is built-in to pdf-lib so no font registration
  const fontReg  = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  // Coordinate helpers — pdf-lib has Y growing upward, so we work in
  // "distance from top" mm and convert per draw call.
  const fromTopMM = (topMM: number) => A4_H - topMM * MM;

  // ─── 1. HEADER BAND (14 mm) ──────────────────────────────────────────
  const headerH = 14 * MM;
  page.drawRectangle({
    x: 0, y: A4_H - headerH, width: A4_W, height: headerH,
    color: WHITE,
  });
  // Brand underline (0.5 mm tall) at the bottom of the band
  page.drawRectangle({
    x: 14 * MM, y: A4_H - headerH, width: A4_W - 28 * MM, height: 0.6,
    color: BRAND,
  });

  drawText(page, "TICKET SAFE", {
    x: 14 * MM, y: fromTopMM(9),
    font: fontBold, size: 11, color: BRAND, letterSpacing: 1.4,
  });

  // PAID/PENDING/REFUNDED status pill, top-right
  const pillLabel = (d.paymentStatus ?? "Paid").toUpperCase();
  const pillX = drawPill(page, {
    x: A4_W - 14 * MM, y: fromTopMM(11),
    label: pillLabel, font: fontBold, size: 9,
    bg: d.paymentStatus === "Refunded" ? rgb(1, 0.89, 0.89) : VBG,
    fg: d.paymentStatus === "Refunded" ? rgb(0.6, 0.10, 0.10) : BRAND,
    anchor: "right",
  });
  void pillX;

  // ─── 2. TITLE ─────────────────────────────────────────────────────────
  drawText(page, "Order Summary", {
    x: 14 * MM, y: fromTopMM(34),
    font: fontBold, size: 24, color: INK,
  });
  drawText(page, `Order #${d.orderNumber} · ${d.purchaseDate}`, {
    x: 14 * MM, y: fromTopMM(43),
    font: fontReg, size: 11, color: MUTED,
  });

  // Hairline separator at 52 mm
  hairline(page, 14, 52, A4_W - 14 * MM - 14 * MM);

  // ─── 3. BUYER + EVENT (two columns) ──────────────────────────────────
  const colLeftX  = 14 * MM;
  const colRightX = 14 * MM + (A4_W - 28 * MM) * 0.5 + 6;

  drawLabel(page, "BUYER", colLeftX, fromTopMM(62), fontBold);
  drawText(page, `${d.buyerFirstName} ${d.buyerLastName}`, {
    x: colLeftX, y: fromTopMM(68), font: fontBold, size: 14, color: INK,
  });
  drawText(page, d.buyerEmail, {
    x: colLeftX, y: fromTopMM(73.5), font: fontReg, size: 10, color: MUTED,
  });

  drawLabel(page, "EVENT", colRightX, fromTopMM(62), fontBold);
  drawText(page, d.eventName, {
    x: colRightX, y: fromTopMM(68), font: fontBold, size: 13, color: INK,
    maxWidth: (A4_W - 28 * MM) * 0.5 - 6,
  });
  drawText(page, `${d.eventDate} · ${d.eventTime}`, {
    x: colRightX, y: fromTopMM(73.5), font: fontReg, size: 10, color: MUTED,
  });
  drawText(page, d.eventLocation, {
    x: colRightX, y: fromTopMM(78), font: fontReg, size: 10, color: MUTED,
  });
  drawText(page, `Organised by ${d.organizerName}`, {
    x: colRightX, y: fromTopMM(83), font: fontReg, size: 10, color: MUTED,
  });

  hairline(page, 14, 92, A4_W - 28 * MM);

  // ─── 4. LINE ITEMS TABLE ─────────────────────────────────────────────
  // Column header row
  let tableY = 102;
  const colItemX  = 14 * MM;
  const colQtyX   = 130 * MM;
  const colUnitX  = 155 * MM;
  const colTotalX = A4_W - 14 * MM;

  drawText(page, "ITEM",         { x: colItemX,  y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "QTY",          { x: colQtyX,   y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "UNIT PRICE",   { x: colUnitX,  y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "TOTAL",        { x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0, anchor: "right" });

  hairline(page, 14, tableY + 3, A4_W - 28 * MM);

  tableY += 11;
  drawText(page, `${d.eventName} — ${d.ticketType}`, {
    x: colItemX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK,
    maxWidth: colQtyX - colItemX - 4,
  });
  drawText(page, String(d.quantity), {
    x: colQtyX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK,
  });
  drawText(page, d.unitPrice, {
    x: colUnitX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK,
  });
  drawText(page, d.totalPaid, {
    x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 11, color: INK, anchor: "right",
  });

  hairline(page, 14, tableY + 6, A4_W - 28 * MM);

  // Total row
  tableY += 16;
  drawText(page, "TOTAL", {
    x: colUnitX, y: fromTopMM(tableY), font: fontBold, size: 11, color: MUTED, letterSpacing: 1.2,
  });
  drawText(page, d.totalPaid, {
    x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 18, color: BRAND, anchor: "right",
  });

  // ─── 5. PAYMENT block ────────────────────────────────────────────────
  const payY = 150;
  page.drawRectangle({
    x: 14 * MM, y: A4_H - (payY + 38) * MM,
    width: A4_W - 28 * MM, height: 36 * MM,
    color: SOFT, borderColor: HAIR, borderWidth: 0.4,
  });

  drawLabel(page, "PAYMENT", 14 * MM + 5 * MM, fromTopMM(payY + 6), fontBold);

  const payRow = (n: number, label: string, value: string, mono = false) => {
    const baseY = payY + 14 + n * 7;
    drawText(page, label, {
      x: 14 * MM + 5 * MM, y: fromTopMM(baseY),
      font: fontReg, size: 10, color: MUTED,
    });
    drawText(page, value, {
      x: A4_W - 14 * MM - 5 * MM, y: fromTopMM(baseY),
      font: mono ? fontMono : fontBold, size: 10, color: INK, anchor: "right",
    });
  };
  payRow(0, "Payment status",  d.paymentStatus);
  payRow(1, "Payment method",  d.paymentMethod);
  payRow(2, "Transaction ID",  d.transactionId, true);
  payRow(3, "Ticket ID",       d.ticketId, true);
  payRow(4, "Purchase date",   d.purchaseDate);

  // ─── 6. FOOTER ───────────────────────────────────────────────────────
  const footY = 270;
  hairline(page, 14, footY, A4_W - 28 * MM);

  drawText(page, "Thank you for using TicketSafe.", {
    x: 14 * MM, y: fromTopMM(footY + 6), font: fontBold, size: 11, color: INK,
  });
  drawText(page, "This document is a payment receipt and order summary.", {
    x: 14 * MM, y: fromTopMM(footY + 11.5), font: fontReg, size: 9, color: MUTED,
  });

  drawText(page, "POWERED BY TICKET SAFE", {
    x: 14 * MM, y: fromTopMM(footY + 22), font: fontBold, size: 8, color: BRAND, letterSpacing: 1.4,
  });
  drawText(page, `${supportEmail}   ·   ${websiteUrl}`, {
    x: A4_W - 14 * MM, y: fromTopMM(footY + 22), font: fontReg, size: 9, color: MUTED, anchor: "right",
  });

  return await pdf.save();
}

// ──────────────────────────────────────────────────────────────────────────
//  drawing helpers
// ──────────────────────────────────────────────────────────────────────────

interface TextOpts {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  letterSpacing?: number;
  anchor?: "left" | "right";
  maxWidth?: number;
}

function drawText(page: PDFPage, text: string, o: TextOpts) {
  let t = text;
  // Naive width clamp for the long event name
  if (o.maxWidth) {
    while (o.font.widthOfTextAtSize(t, o.size) > o.maxWidth && t.length > 4) {
      t = t.slice(0, -2);
    }
    if (t !== text) t = t.slice(0, -1) + "…";
  }
  let x = o.x;
  if (o.anchor === "right") {
    x = o.x - o.font.widthOfTextAtSize(t, o.size);
  }
  page.drawText(t, {
    x, y: o.y,
    font: o.font, size: o.size, color: o.color,
    ...(o.letterSpacing ? { characterSpacing: o.letterSpacing } : {}),
  });
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text, {
    x, y, font, size: 8, color: MUTED, characterSpacing: 1.2,
  });
}

function hairline(page: PDFPage, marginMM: number, atTopMM: number, w: number) {
  page.drawRectangle({
    x: marginMM * MM, y: A4_H - atTopMM * MM,
    width: w, height: 0.3, color: HAIR,
  });
}

function drawPill(
  page: PDFPage,
  opts: {
    x: number;
    y: number;
    label: string;
    font: PDFFont;
    size: number;
    bg: ReturnType<typeof rgb>;
    fg: ReturnType<typeof rgb>;
    anchor?: "left" | "right";
  },
): number {
  const padX = 8;
  const padY = 5;
  const textW = opts.font.widthOfTextAtSize(opts.label, opts.size);
  const w = textW + padX * 2;
  const h = opts.size + padY * 2;
  let x = opts.x;
  if (opts.anchor === "right") x = opts.x - w;
  page.drawRectangle({
    x, y: opts.y - h + padY,
    width: w, height: h,
    color: opts.bg,
    borderColor: opts.bg,
    borderWidth: 0,
  });
  // Approximate rounded — pdf-lib doesn't have native rounded rect for
  // simple cases; the 999px feeling comes from the height vs width ratio.
  page.drawText(opts.label, {
    x: x + padX,
    y: opts.y - h + padY + (h - opts.size) / 2,
    font: opts.font, size: opts.size, color: opts.fg,
    characterSpacing: 0.8,
  });
  return x;
}
