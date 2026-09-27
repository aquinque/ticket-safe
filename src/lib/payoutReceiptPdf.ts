/**
 * generatePayoutReceiptPDF — official proof-of-payment receipt for a
 * Ticket Safe SEPA payout, generated client-side.
 *
 * Same construction as ticketPdf.ts: jsPDF loaded lazily (bundled, not from
 * a CDN, to stay inside the strict CSP), brand palette, A4 portrait.
 *
 * Layout (A4 portrait, 210 × 297 mm):
 *
 *   ┌─ HEADER BAND ──────────────────────────────────┐
 *   │ TICKET SAFE                    PAYMENT RECEIPT │
 *   ├─ HERO ─────────────────────────────────────────┤
 *   │ NET AMOUNT PAID          Reference TS-PO-XXXXXX│
 *   │ €460.00                              SENT      │
 *   ├─ PARTIES (2 columns) ────────────────────────────┤
 *   │ ISSUER                    │ BENEFICIARY          │
 *   │ Ticket Safe SAS           │ ESCP Students' Union │
 *   │ 2 rue Wilhem, 75016 Paris │ Account holder : ... │
 *   │                           │ IBAN : FR76 ···· 7890│
 *   ├─ AMOUNT TABLE ─────────────────────────────────────┤
 *   │ Gross amount requested        €500.00              │
 *   │ Ticket Safe service fee (5%)  −€25.00  (resale only;│
 *   │                                studio payouts have  │
 *   │                                no Ticket Safe fee)  │
 *   │ NET AMOUNT PAID                €475.00 (large,blue)│
 *   ├─ DETAILS ──────────────────────────────────────────┤
 *   │ Method : SEPA transfer                              │
 *   │ Payment date : 26 September 2026                    │
 *   ├─ FOOTER ────────────────────────────────────────────┤
 *   │ Disclaimer + support email + ticket-safe.eu         │
 *   └──────────────────────────────────────────────────────┘
 */

// ──────────────────────────────────────────────────────────────────────────
//  PUBLIC INTERFACE
// ──────────────────────────────────────────────────────────────────────────

export interface PayoutReceiptData {
  /** "studio" (organizer withdrawal) or "resale" (seller withdrawal). */
  kind: "studio" | "resale";
  /** Payout row id — used to derive the display reference (TS-PO-/TS-RS-). */
  payoutId: string;
  /** Organizer display name. Omit for resale (personal) payouts. */
  organizationName?: string | null;
  /** Name on the bank account (IBAN holder) — always shown as the beneficiary. */
  beneficiaryName: string;
  iban: string;
  grossCents: number;
  feeCents: number;
  feePercent: number;
  netCents: number;
  /** ISO date the transfer was sent. Falls back to "pending" wording when absent. */
  sentAt?: string | null;
  requestedAt: string;
  status: "requested" | "processing" | "sent" | "failed" | "cancelled";
}

// ──────────────────────────────────────────────────────────────────────────
//  PALETTE & LAYOUT — matches ticketPdf.ts
// ──────────────────────────────────────────────────────────────────────────

const C_BRAND   = { r: 0,   g: 51,  b: 153 }; // #003399
const C_LIGHT   = { r: 0,   g: 102, b: 204 }; // #0066cc
const C_INK     = { r: 15,  g: 23,  b: 42  };
const C_MUTED   = { r: 100, g: 116, b: 139 };
const C_FAINT   = { r: 148, g: 163, b: 184 };
const C_BG_SOFT = { r: 248, g: 250, b: 252 };
const C_GOOD    = { r: 5,   g: 150, b: 105 }; // emerald-600, for "Sent"

const A4_W = 210;
const A4_H = 297;
const MARGIN_X = 14;
const CONTENT_W = A4_W - 2 * MARGIN_X;

// ──────────────────────────────────────────────────────────────────────────
//  FORMATTERS
// ──────────────────────────────────────────────────────────────────────────

const eur = (cents: number): string =>
  `€${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function longDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function prettyIban(iban: string): string {
  return String(iban ?? "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

function reference(kind: "studio" | "resale", payoutId: string): string {
  const prefix = kind === "studio" ? "TS-PO" : "TS-RS";
  return `${prefix}-${payoutId.slice(0, 8).toUpperCase()}`;
}

const STATUS_LABEL: Record<PayoutReceiptData["status"], string> = {
  requested: "Requested",
  processing: "Processing",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

// ──────────────────────────────────────────────────────────────────────────
//  jsPDF TYPED SHIM — same shape as ticketPdf.ts
// ──────────────────────────────────────────────────────────────────────────

interface JsPDFLike {
  setFillColor(r: number, g: number, b: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setLineWidth(w: number): void;
  setFont(family: string, style?: string): void;
  setFontSize(size: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  text(text: string | string[], x: number, y: number, options?: Record<string, unknown>): void;
  splitTextToSize(text: string, maxLen: number): string[];
  save(filename: string): void;
}
type JsPDFCtor = new (opts: { unit: string; format: string; orientation: string }) => JsPDFLike;

// ──────────────────────────────────────────────────────────────────────────
//  SMALL HELPERS
// ──────────────────────────────────────────────────────────────────────────

function drawLabel(pdf: JsPDFLike, text: string, x: number, y: number) {
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text(text, x, y, { charSpace: 1.0 });
}
function drawValue(pdf: JsPDFLike, text: string, x: number, y: number, size = 11, weight: "bold" | "normal" = "normal") {
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.setFont("helvetica", weight);
  pdf.setFontSize(size);
  pdf.text(text, x, y);
}

// ──────────────────────────────────────────────────────────────────────────
//  RENDERER
// ──────────────────────────────────────────────────────────────────────────

export async function generatePayoutReceiptPDF(data: PayoutReceiptData): Promise<void> {
  const mod = await import("jspdf");
  const JsPDF: JsPDFCtor =
    (mod as { jsPDF?: JsPDFCtor; default?: JsPDFCtor }).jsPDF
    ?? (mod as { default: JsPDFCtor }).default;
  const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const ref = reference(data.kind, data.payoutId);
  const issuedDate = longDate(new Date().toISOString());
  const transferDate = data.sentAt ? longDate(data.sentAt) : null;

  // ── 1. HEADER BAND ───────────────────────────────────────────────────
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, A4_W, 16, "F");
  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("TICKET SAFE", MARGIN_X, 10, { charSpace: 1.2 });
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("PAYMENT RECEIPT", A4_W - MARGIN_X, 10, { align: "right", charSpace: 0.8 });
  pdf.setDrawColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN_X, 15.5, A4_W - MARGIN_X, 15.5);

  // ── 2. HERO — brand gradient band with the net amount, front and centre ─
  const heroY = 16;
  const heroH = 46;
  const slices = 60;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1);
    const r = Math.round(C_BRAND.r + (C_LIGHT.r - C_BRAND.r) * t);
    const g = Math.round(C_BRAND.g + (C_LIGHT.g - C_BRAND.g) * t);
    const b = Math.round(C_BRAND.b + (C_LIGHT.b - C_BRAND.b) * t);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, heroY + (i * heroH) / slices, A4_W, heroH / slices + 0.5, "F");
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("NET AMOUNT PAID", MARGIN_X, heroY + 14, { charSpace: 1.4 });
  pdf.setFontSize(30);
  pdf.text(eur(data.netCents), MARGIN_X, heroY + 30);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Reference ${ref}`, A4_W - MARGIN_X, heroY + 14, { align: "right" });
  const statusColor = data.status === "sent" ? C_GOOD : { r: 255, g: 255, b: 255 };
  pdf.setTextColor(statusColor.r, statusColor.g, statusColor.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(STATUS_LABEL[data.status].toUpperCase(), A4_W - MARGIN_X, heroY + 24, { align: "right", charSpace: 0.6 });

  // ── 3. DOC META (issued date, right under the hero) ─────────────────────
  let y = heroY + heroH + 10;
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Document issued on ${issuedDate}`, MARGIN_X, y);
  y += 12;

  // ── 4. PARTIES — two columns ─────────────────────────────────────────
  const colLeftX = MARGIN_X;
  const colRightX = MARGIN_X + CONTENT_W / 2 + 4;

  drawLabel(pdf, "ISSUER", colLeftX, y);
  drawValue(pdf, "Ticket Safe SAS", colLeftX, y + 6, 12, "bold");
  drawValue(pdf, "2 rue Wilhem, 75016 Paris, France", colLeftX, y + 11.5, 9);
  drawValue(pdf, "ticketsafe.friendly@gmail.com", colLeftX, y + 16.5, 9);

  drawLabel(pdf, "BENEFICIARY", colRightX, y);
  let benY = y + 6;
  if (data.organizationName) {
    drawValue(pdf, data.organizationName, colRightX, benY, 12, "bold");
    benY += 5.5;
    drawValue(pdf, `Account holder: ${data.beneficiaryName}`, colRightX, benY, 9);
  } else {
    drawValue(pdf, data.beneficiaryName, colRightX, benY, 12, "bold");
  }
  benY += 5.5;
  pdf.setFont("courier", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.text(prettyIban(data.iban), colRightX, benY);

  y += 30;
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN_X, y, A4_W - MARGIN_X, y);
  y += 10;

  // ── 5. AMOUNT BREAKDOWN TABLE ────────────────────────────────────────
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("BREAKDOWN", MARGIN_X, y, { charSpace: 1.0 });
  y += 8;

  const rowVal = (label: string, value: string, opts?: { bold?: boolean; muted?: boolean }) => {
    pdf.setFont("helvetica", opts?.bold ? "bold" : "normal");
    pdf.setFontSize(opts?.bold ? 12 : 10.5);
    pdf.setTextColor(
      opts?.muted ? C_MUTED.r : C_INK.r,
      opts?.muted ? C_MUTED.g : C_INK.g,
      opts?.muted ? C_MUTED.b : C_INK.b,
    );
    pdf.text(label, MARGIN_X, y);
    pdf.text(value, A4_W - MARGIN_X, y, { align: "right" });
    y += opts?.bold ? 9 : 7.5;
  };

  if (data.feeCents > 0) {
    rowVal("Gross amount requested", eur(data.grossCents), { muted: true });
    rowVal(`Ticket Safe service fee (${data.feePercent}%)`, `- ${eur(data.feeCents)}`, { muted: true });
  } else {
    rowVal("Amount requested", eur(data.grossCents), { muted: true });
    rowVal("Ticket Safe fee", "None", { muted: true });
  }
  pdf.setDrawColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_X, y - 4.5, A4_W - MARGIN_X, y - 4.5);
  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  rowVal("Net amount paid", eur(data.netCents), { bold: true });

  y += 4;
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN_X, y, A4_W - MARGIN_X, y);
  y += 10;

  // ── 6. TRANSFER DETAILS ──────────────────────────────────────────────
  pdf.setFillColor(C_BG_SOFT.r, C_BG_SOFT.g, C_BG_SOFT.b);
  pdf.roundedRect(MARGIN_X, y, CONTENT_W, 32, 3, 3, "F");
  const detY = y + 9;
  const detColRightX = MARGIN_X + CONTENT_W / 2 + 4;
  drawLabel(pdf, "METHOD", MARGIN_X + 6, detY);
  drawValue(pdf, "SEPA transfer", MARGIN_X + 6, detY + 6, 10.5, "bold");
  drawLabel(pdf, "REQUEST DATE", detColRightX, detY);
  drawValue(pdf, longDate(data.requestedAt), detColRightX, detY + 6, 10.5, "bold");
  drawLabel(pdf, "PAYMENT DATE", MARGIN_X + 6, detY + 16);
  drawValue(pdf, transferDate ?? "Pending execution", MARGIN_X + 6, detY + 22, 10.5, "bold");
  drawLabel(pdf, "REFERENCE", detColRightX, detY + 16);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.text(ref, detColRightX, detY + 22);

  // ── 7. FOOTER ─────────────────────────────────────────────────────────
  const footerY = A4_H - 34;
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, footerY, A4_W - MARGIN_X, footerY);

  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  const disclaimer = pdf.splitTextToSize(
    `This document certifies the payment made by Ticket Safe SAS to the beneficiary above, by SEPA bank transfer. It is a proof of funds movement between Ticket Safe SAS and the beneficiary; it is not a tax invoice and does not replace an official bank statement. For any question, contact ticketsafe.friendly@gmail.com and quote reference ${ref}.`,
    CONTENT_W,
  );
  pdf.text(disclaimer, MARGIN_X, footerY + 6);

  const brandStripY = A4_H - 6;
  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("TICKET SAFE SAS", MARGIN_X, brandStripY, { charSpace: 1.0 });
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("ticket-safe.eu", A4_W - MARGIN_X, brandStripY, { align: "right" });

  // ── SAVE ─────────────────────────────────────────────────────────────
  pdf.save(`receipt-${ref}.pdf`);
}
