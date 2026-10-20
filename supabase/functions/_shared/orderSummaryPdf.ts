/**
 * generateOrderSummaryPDF(orderData) — server-side payment receipt generator.
 *
 * Runs inside Deno edge functions (no DOM, no canvas), so we use pdf-lib
 * which is pure JavaScript and ships nicely from esm.sh.
 *
 * It is the buyer's confirmation of the order and of the payment, in French with the
 * English underneath. Page 1 is the receipt: who the buyer is, the event, who sells, who
 * Ticket Safe is, the ticket price and the service fee shown separately, the payment.
 * Page 2 is the legal information (see _shared/receiptLegal.ts for the wording).
 *
 *   ┌─ HEADER BAND ─────────────────────────────────┐
 *   │ TICKET SAFE                     [ PAYÉ · PAID ] │
 *   ├─ TITLE ───────────────────────────────────────┤
 *   │ Reçu de paiement                               │
 *   │ Payment receipt · Order #TS-… · 12 September  │
 *   ├─ BUYER + EVENT ───────────────────────────────┤
 *   ├─ SELLER + TICKET SAFE ────────────────────────┤
 *   ├─ LINE ITEMS ──────────────────────────────────┤
 *   │ Billet / ticket           1   18.00€   18.00€ │
 *   │ Frais de service Ticket Safe          1.20€    │
 *   │                          TOTAL TTC   19.20€    │
 *   ├─ PAYMENT ─────────────────────────────────────┤
 *   └─ page 2: informations légales / legal info ───┘
 *
 * Every string goes through pdfSafe(): the built-in Helvetica draws Windows-1252 only
 * and throws on anything else (an emoji in an event title, a Polish letter in a name),
 * which would otherwise cost the buyer the whole confirmation e-mail.
 *
 * Returns a Uint8Array (raw PDF bytes) ready to be base64-encoded for the
 * Resend `attachments` field, or written to disk in test code.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { pdfSafe } from "./pdfText.ts";
import {
  RECEIPT_LEGAL_FALLBACK,
  identityLine,
  noticeHeading,
  noticeItems,
  type ReceiptKind,
  type ReceiptLang,
  type ReceiptLegal,
} from "./receiptLegal.ts";

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

  /**
   * Optional ticket-price / service-fee split, in cents. When both are
   * provided the table shows "Ticket price" + "Service fee" as two lines
   * instead of one lumped "unitPrice" row — required so the receipt
   * states what the buyer actually paid TicketSafe vs. the organizer.
   * Omit to keep the single-line layout (older callers).
   */
  ticketPriceCents?: number;
  serviceFeeCents?: number;

  /** "ticket" (default): the organizer sells the ticket. "resale": a private individual sells it on the marketplace. */
  kind?: ReceiptKind;
  /** Company details for the legal notice; the built-in ones (the same as billing_settings today) are used when absent. */
  legal?: ReceiptLegal;

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
const INK   = rgb(0.06,0.09, 0.16); // slate-900
const MUTED = rgb(0.39,0.45, 0.55); // slate-500
const FAINT = rgb(0.58,0.64, 0.72); // slate-400
const HAIR  = rgb(0.88,0.91, 0.94); // slate-200
const SOFT  = rgb(0.97,0.98, 0.99); // slate-50
const VBG   = rgb(0.86,0.92, 1.00); // valid badge bg

const STATUS_LABEL: Record<OrderSummaryData["paymentStatus"], string> = {
  Paid: "PAYÉ · PAID",
  Pending: "EN ATTENTE · PENDING",
  Refunded: "REMBOURSÉ · REFUNDED",
};

export async function generateOrderSummaryPDF(d: OrderSummaryData): Promise<Uint8Array> {
  const supportEmail = d.supportEmail ?? "support@ticket-safe.eu";
  const websiteUrl   = d.websiteUrl ?? "ticket-safe.eu";
  const kind: ReceiptKind = d.kind ?? "ticket";
  const legal = d.legal ?? RECEIPT_LEGAL_FALLBACK;
  const site = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`Reçu de paiement ${d.orderNumber}`));
  pdf.setSubject(pdfSafe(`Reçu de paiement – ${d.eventName}`));
  const page = pdf.addPage([A4_W, A4_H]);

  // Fonts — Helvetica family is built-in to pdf-lib so no font registration
  const fontReg  = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  // Coordinate helpers — pdf-lib has Y growing upward, so we work in
  // "distance from top" mm and convert per draw call.
  const fromTopMM = (topMM: number) => A4_H - topMM * MM;
  const contentW = A4_W - 28 * MM;
  const halfW = contentW * 0.5 - 6;
  const colLeftX  = 14 * MM;
  const colRightX = 14 * MM + contentW * 0.5 + 6;

  const header = (p: PDFPage, pill?: { label: string; refunded: boolean }) => {
    p.drawRectangle({ x: 14 * MM, y: A4_H - 14 * MM, width: contentW, height: 0.6, color: BRAND });
    drawText(p, "TICKET SAFE", { x: 14 * MM, y: fromTopMM(9), font: fontBold, size: 11, color: BRAND, letterSpacing: 1.4 });
    if (pill) {
      drawPill(p, {
        x: A4_W - 14 * MM, y: fromTopMM(11), label: pill.label, font: fontBold, size: 9,
        bg: pill.refunded ? rgb(1, 0.89, 0.89) : VBG,
        fg: pill.refunded ? rgb(0.6, 0.10, 0.10) : BRAND,
        anchor: "right",
      });
    }
  };

  // ─── PAGE 1 ──────────────────────────────────────────────────────────
  header(page, { label: STATUS_LABEL[d.paymentStatus] ?? STATUS_LABEL.Paid, refunded: d.paymentStatus === "Refunded" });

  drawText(page, "Reçu de paiement", { x: 14 * MM, y: fromTopMM(34), font: fontBold, size: 24, color: INK });
  drawText(page, `Payment receipt · Order #${d.orderNumber} · ${d.purchaseDate}`, {
    x: 14 * MM, y: fromTopMM(43), font: fontReg, size: 11, color: MUTED, maxWidth: contentW,
  });
  hairline(page, 14, 52, contentW);

  // Buyer + event
  drawLabel(page, "ACHETEUR · BUYER", colLeftX, fromTopMM(62), fontBold);
  drawText(page, `${d.buyerFirstName} ${d.buyerLastName}`, { x: colLeftX, y: fromTopMM(68), font: fontBold, size: 14, color: INK, maxWidth: halfW });
  drawText(page, d.buyerEmail, { x: colLeftX, y: fromTopMM(73.5), font: fontReg, size: 10, color: MUTED, maxWidth: halfW });

  drawLabel(page, "ÉVÉNEMENT · EVENT", colRightX, fromTopMM(62), fontBold);
  drawText(page, d.eventName, { x: colRightX, y: fromTopMM(68), font: fontBold, size: 13, color: INK, maxWidth: halfW });
  drawText(page, `${d.eventDate} · ${d.eventTime}`, { x: colRightX, y: fromTopMM(73.5), font: fontReg, size: 10, color: MUTED, maxWidth: halfW });
  drawText(page, d.eventLocation, { x: colRightX, y: fromTopMM(78), font: fontReg, size: 10, color: MUTED, maxWidth: halfW });
  hairline(page, 14, 88, contentW);

  // Who sells, and who Ticket Safe is
  drawLabel(page, "VENDEUR DU BILLET · TICKET SELLER", colLeftX, fromTopMM(97), fontBold);
  drawLabel(page, "INTERMÉDIAIRE · INTERMEDIARY", colRightX, fromTopMM(97), fontBold);

  let leftY = 103;
  if (kind === "resale") {
    drawText(page, "Particulier · Private individual", { x: colLeftX, y: fromTopMM(leftY), font: fontBold, size: 10.5, color: INK, maxWidth: halfW });
    leftY += 5;
    leftY = paragraph(page, `Événement organisé par ${d.organizerName}`, { x: colLeftX, topMM: leftY, width: halfW, font: fontReg, size: 8.5, color: MUTED, lineMM: 4 });
  } else {
    drawText(page, d.organizerName, { x: colLeftX, y: fromTopMM(leftY), font: fontBold, size: 10.5, color: INK, maxWidth: halfW });
    leftY += 5;
    leftY = paragraph(page, "Organisateur de l’événement · Event organizer", { x: colLeftX, topMM: leftY, width: halfW, font: fontReg, size: 8.5, color: MUTED, lineMM: 4 });
  }

  let rightY = 103;
  drawText(page, legal.legalName, { x: colRightX, y: fromTopMM(rightY), font: fontBold, size: 10.5, color: INK, maxWidth: halfW });
  rightY += 5;
  rightY = paragraph(page, identityLine("fr", legal), { x: colRightX, topMM: rightY, width: halfW, font: fontReg, size: 8.5, color: MUTED, lineMM: 4 });

  const partiesEnd = Math.max(leftY, rightY) + 2;
  hairline(page, 14, partiesEnd, contentW);

  // ─── Line items ───
  let tableY = partiesEnd + 10;
  const colItemX  = 14 * MM;
  const colQtyX   = 130 * MM;
  const colUnitX  = 155 * MM;
  const colTotalX = A4_W - 14 * MM;

  drawText(page, "ARTICLE · ITEM",    { x: colItemX,  y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "QTÉ",               { x: colQtyX,   y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "PRIX UNIT.",        { x: colUnitX,  y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0 });
  drawText(page, "TOTAL",             { x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 9, color: MUTED, letterSpacing: 1.0, anchor: "right" });
  hairline(page, 14, tableY + 3, contentW);

  tableY += 11;
  // Two layouts: if the ticket-price/service-fee split is provided, show
  // "ticket price" and "service fee" as two distinct lines (required so
  // the receipt states what went to the seller vs. to TicketSafe);
  // otherwise fall back to the single lumped line older callers still use.
  const hasFeeSplit = d.ticketPriceCents != null && d.serviceFeeCents != null;
  const itemName = `${d.eventName} — ${d.ticketType}`;
  if (hasFeeSplit) {
    const ticketPriceStr = `${(d.ticketPriceCents! / 100).toFixed(2)}€`;
    const feeStr = `${(d.serviceFeeCents! / 100).toFixed(2)}€`;
    drawText(page, itemName, { x: colItemX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK, maxWidth: colQtyX - colItemX - 14 });
    drawText(page, String(d.quantity), { x: colQtyX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK });
    drawText(page, ticketPriceStr, { x: colUnitX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK });
    drawText(page, ticketPriceStr, { x: colTotalX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK, anchor: "right" });
    tableY += 8;
    drawText(page, "Frais de service Ticket Safe · Service fee", { x: colItemX, y: fromTopMM(tableY), font: fontReg, size: 10, color: MUTED });
    drawText(page, feeStr, { x: colTotalX, y: fromTopMM(tableY), font: fontReg, size: 10, color: MUTED, anchor: "right" });
  } else {
    drawText(page, itemName, { x: colItemX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK, maxWidth: colQtyX - colItemX - 14 });
    drawText(page, String(d.quantity), { x: colQtyX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK });
    drawText(page, d.unitPrice, { x: colUnitX, y: fromTopMM(tableY), font: fontReg, size: 11, color: INK });
    drawText(page, d.totalPaid, { x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 11, color: INK, anchor: "right" });
  }
  hairline(page, 14, tableY + 6, contentW);

  // Total row
  tableY += 16;
  const totalW = fontBold.widthOfTextAtSize(pdfSafe(d.totalPaid), 18);
  drawText(page, "TOTAL TTC", { x: colTotalX - totalW - 14, y: fromTopMM(tableY), font: fontBold, size: 11, color: MUTED, letterSpacing: 1.2, anchor: "right" });
  drawText(page, d.totalPaid, { x: colTotalX, y: fromTopMM(tableY), font: fontBold, size: 18, color: BRAND, anchor: "right" });

  // ─── Payment block ───
  const payY = tableY + 14;
  page.drawRectangle({
    x: 14 * MM, y: A4_H - (payY + 48) * MM,
    width: contentW, height: 46 * MM,
    color: SOFT, borderColor: HAIR, borderWidth: 0.4,
  });
  drawLabel(page, "PAIEMENT · PAYMENT", 14 * MM + 5 * MM, fromTopMM(payY + 6), fontBold);

  const payRow = (n: number, label: string, value: string, mono = false) => {
    const baseY = payY + 14 + n * 7;
    drawText(page, label, { x: 14 * MM + 5 * MM, y: fromTopMM(baseY), font: fontReg, size: 10, color: MUTED });
    drawText(page, value, { x: A4_W - 14 * MM - 5 * MM, y: fromTopMM(baseY), font: mono ? fontMono : fontBold, size: 10, color: INK, anchor: "right", maxWidth: 120 * MM });
  };
  payRow(0, "Statut · Status",              STATUS_LABEL[d.paymentStatus] ?? d.paymentStatus);
  payRow(1, "Moyen de paiement · Method",   d.paymentMethod);
  payRow(2, "Transaction",                  d.transactionId, true);
  payRow(3, "Billet · Ticket",              d.ticketId, true);
  payRow(4, "Date d’achat · Purchase date", d.purchaseDate);

  // ─── Footer of page 1 ───
  const footY = 270;
  hairline(page, 14, footY, contentW);
  drawText(page, "Merci d’utiliser Ticket Safe · Thank you for using Ticket Safe.", { x: 14 * MM, y: fromTopMM(footY + 6), font: fontBold, size: 10.5, color: INK });
  drawText(page, "Ce document est un reçu de paiement et une confirmation de commande. Informations légales page 2.", { x: 14 * MM, y: fromTopMM(footY + 11.5), font: fontReg, size: 8.5, color: MUTED, maxWidth: contentW });
  drawText(page, "This document is a payment receipt and order confirmation. Legal information on page 2.", { x: 14 * MM, y: fromTopMM(footY + 16), font: fontReg, size: 8.5, color: FAINT, maxWidth: contentW });
  drawText(page, `${supportEmail}   ·   ${websiteUrl}   ·   1/2`, { x: A4_W - 14 * MM, y: fromTopMM(footY + 22), font: fontReg, size: 9, color: MUTED, anchor: "right" });

  // ─── PAGE 2: legal information ───
  const page2 = pdf.addPage([A4_W, A4_H]);
  header(page2);
  drawText(page2, "Informations légales", { x: 14 * MM, y: fromTopMM(30), font: fontBold, size: 20, color: INK });
  drawText(page2, `Legal information · Order #${d.orderNumber}`, { x: 14 * MM, y: fromTopMM(38), font: fontReg, size: 10.5, color: MUTED, maxWidth: contentW });
  hairline(page2, 14, 46, contentW);

  const columns: [ReceiptLang, number, ReturnType<typeof rgb>][] = [["fr", colLeftX, INK], ["en", colRightX, MUTED]];
  let endY = 56;
  for (const [lang, x, color] of columns) {
    drawLabel(page2, noticeHeading(lang).toUpperCase(), x, fromTopMM(56), fontBold);
    let y = 63;
    for (const item of noticeItems(lang, legal, kind, { organizerName: d.organizerName, site })) {
      drawText(page2, item.title, { x, y: fromTopMM(y), font: fontBold, size: 9, color });
      y += 4.4;
      y = paragraph(page2, item.text, { x, topMM: y, width: halfW, font: fontReg, size: 8.5, color, lineMM: 4.1 }) + 3;
    }
    endY = Math.max(endY, y);
  }
  hairline(page2, 14, endY + 2, contentW);
  let idY = endY + 9;
  idY = paragraph(page2, identityLine("fr", legal), { x: 14 * MM, topMM: idY, width: contentW, font: fontReg, size: 8.5, color: INK, lineMM: 4.1 });
  paragraph(page2, identityLine("en", legal), { x: 14 * MM, topMM: idY + 1, width: contentW, font: fontReg, size: 8.5, color: MUTED, lineMM: 4.1 });

  hairline(page2, 14, footY, contentW);
  drawText(page2, `${supportEmail}   ·   ${websiteUrl}   ·   2/2`, { x: A4_W - 14 * MM, y: fromTopMM(footY + 22), font: fontReg, size: 9, color: MUTED, anchor: "right" });

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
  const original = pdfSafe(text);
  let t = original;
  // Naive width clamp for the long event name
  if (o.maxWidth) {
    while (o.font.widthOfTextAtSize(t, o.size) > o.maxWidth && t.length > 4) {
      t = t.slice(0, -2);
    }
    if (t !== original) t = t.slice(0, -1) + "…";
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

/** Greedy word wrap; the text is made WinAnsi-safe first. */
function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (!line || font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws wrapped text from `topMM` down and returns the mm just below the last line. */
function paragraph(
  page: PDFPage,
  text: string,
  o: { x: number; topMM: number; width: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; lineMM: number },
): number {
  let y = o.topMM;
  for (const line of wrapLines(o.font, text, o.size, o.width)) {
    page.drawText(line, { x: o.x, y: A4_H - y * MM, font: o.font, size: o.size, color: o.color });
    y += o.lineMM;
  }
  return y;
}

// pdf-lib's typings don't list character spacing, so it travels through a spread, as in drawText.
const spaced = (n: number): Record<string, number> => ({ characterSpacing: n });

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(pdfSafe(text), {
    x, y, font, size: 8, color: MUTED, ...spaced(1.2),
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
  const label = pdfSafe(opts.label);
  const padX = 8;
  const padY = 5;
  const textW = opts.font.widthOfTextAtSize(label, opts.size);
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
  page.drawText(label, {
    x: x + padX,
    y: opts.y - h + padY + (h - opts.size) / 2,
    font: opts.font, size: opts.size, color: opts.fg,
    ...spaced(0.8),
  });
  return x;
}
