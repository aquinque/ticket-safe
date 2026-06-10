/**
 * Server-side ticket PDF renderer for Ticket Safe — Deno-native.
 *
 * Mirrors the visual design of src/lib/ticketPdf.ts (the client-side
 * jsPDF version) so the PDF the buyer downloads from /my-tickets and
 * the PDF attached to the confirmation email are pixel-equivalent.
 *
 * Stack: pdf-lib (pure JS, runs in Deno) + qrcode (esm.sh) — no
 * Chromium, no canvas, no client APIs.
 *
 * Returns Uint8Array PDF bytes ready for Resend's attachments field.
 *
 * Layout (A4 portrait, 210 × 297 mm — identical to the client renderer):
 *
 *   ┌─ HEADER BAND (14 mm, white) ──────────────────┐
 *   │ TICKET SAFE              OFFICIAL EVENT TICKET│
 *   ├─ HERO (90 mm, brand gradient) ────────────────┤
 *   │ TICKET 2 OF 3 (caps overline if multi-ticket) │
 *   │ EVENT NAME (28pt bold white)                  │
 *   │ Date · Time · Location                         │
 *   │ [VALID] [EARLY BIRD]                          │
 *   ├─ PERFORATION (8 mm) ──────────────────────────┤
 *   │ ⊗ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ⊗ │
 *   ├─ INFO GRID (52 mm, white, 2-col) ─────────────┤
 *   │ HOLDER         ORGANIZER                       │
 *   │ TICKET TYPE    PRICE PAID                      │
 *   │ TICKET NUMBER (mono)                            │
 *   ├─ QR CARD (90 mm, slate-50) ───────────────────┤
 *   │ [65×65 mm QR + Scan at entrance + #id]        │
 *   ├─ FOOTER (23 mm) ──────────────────────────────┤
 *   │ Notice + POWERED BY TICKET SAFE + ticket-safe │
 *   └────────────────────────────────────────────────┘
 *
 * Multi-ticket orders use one page per ticket so the buyer can print
 * or share each page independently.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.4";

// ── PUBLIC INTERFACE ──────────────────────────────────────────────────────

export interface ServerTicketData {
  eventName: string;
  /** ISO 8601 OR pre-formatted display string. */
  eventDate: string;
  eventTime?: string;
  eventLocation: string;
  organizerName: string;

  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail?: string | null;

  ticketType: string;
  pricePaid: string;
  ticketId: string;
  qrToken: string;
  status?: "Valid" | "Used" | "Cancelled";

  ticketIndex?: number;
  ticketTotal?: number;
}

// ── PALETTE (matches src/lib/ticketPdf.ts) ────────────────────────────────

const BRAND     = rgb(0,    0.20, 0.60); // #003399
const LIGHT     = rgb(0,    0.40, 0.80); // #0066cc
const DARK_NAVY = rgb(0,    0.13, 0.36); // tier pill bg
const INK       = rgb(0.06, 0.09, 0.16); // slate-900
const MUTED     = rgb(0.39, 0.45, 0.55); // slate-500
const FAINT     = rgb(0.58, 0.64, 0.72); // slate-400
const HAIR      = rgb(0.88, 0.91, 0.94); // slate-200
const SOFT_BG   = rgb(0.97, 0.98, 0.99); // slate-50
const VALID_BG  = rgb(0.86, 0.92, 1.00); // valid pill bg
const USED_BG   = rgb(0.88, 0.91, 0.94); // slate pill bg
const USED_FG   = rgb(0.28, 0.33, 0.41); // slate-700
const CANCEL_BG = rgb(0.99, 0.89, 0.89); // red-100
const CANCEL_FG = rgb(0.60, 0.10, 0.10); // red-900
const WHITE     = rgb(1, 1, 1);

// ── A4 + MM CONVERSION ────────────────────────────────────────────────────

const MM     = 2.834645669;
const A4_W   = 595.28;
const A4_H   = 841.89;
const MARGIN = 14 * MM;

// Section heights in mm (sum = 277, leaves 20 buffer)
const H_HEADER = 14;
const H_HERO   = 90;
const H_PERF   = 8;
const H_INFO   = 52;
const H_QR     = 90;
const H_FOOTER = 23;
void H_FOOTER;

// Cumulative top offsets in mm
const Y_HEADER = 0;
const Y_HERO   = Y_HEADER + H_HEADER;
const Y_PERF   = Y_HERO   + H_HERO;
const Y_INFO   = Y_PERF   + H_PERF;
const Y_QR     = Y_INFO   + H_INFO;
const Y_FOOTER = Y_QR     + H_QR;

// pdf-lib's y axis is bottom-up. Helper to take a "distance from top" in mm
// and return the y coordinate pdf-lib expects.
const fromTopMM = (topMM: number) => A4_H - topMM * MM;

// ── PUBLIC ENTRY POINTS ───────────────────────────────────────────────────

/** Render a single ticket as a 1-page PDF. */
export async function generateTicketPDFServer(t: ServerTicketData): Promise<Uint8Array> {
  return generateTicketsPDFServer([t]);
}

/** Render N tickets as an N-page PDF (one ticket per page). */
export async function generateTicketsPDFServer(
  tickets: ServerTicketData[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fontReg  = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  for (const data of tickets) {
    const page = pdf.addPage([A4_W, A4_H]);
    await drawTicketPage(pdf, page, data, fontReg, fontBold, fontMono);
  }

  return pdf.save();
}

// ── PAGE DRAWER ───────────────────────────────────────────────────────────

async function drawTicketPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  d: ServerTicketData,
  fontReg: PDFFont,
  fontBold: PDFFont,
  fontMono: PDFFont,
): Promise<void> {
  // ── 1. HEADER BAND ──
  page.drawRectangle({
    x: 0, y: A4_H - H_HEADER * MM,
    width: A4_W, height: H_HEADER * MM,
    color: WHITE,
  });
  // Brand underline (0.6 pt) at the bottom of the header band
  page.drawRectangle({
    x: MARGIN, y: A4_H - H_HEADER * MM,
    width: A4_W - 2 * MARGIN, height: 0.6,
    color: BRAND,
  });

  drawText(page, "TICKET SAFE", {
    x: MARGIN, y: fromTopMM(8.5),
    font: fontBold, size: 11, color: BRAND, letterSpacing: 1.4,
  });
  drawText(page, "OFFICIAL EVENT TICKET", {
    x: A4_W - MARGIN, y: fromTopMM(8.5),
    font: fontBold, size: 8, color: MUTED, letterSpacing: 1.2,
    anchor: "right",
  });

  // ── 2. HERO with brand gradient ──
  const heroBottomY = A4_H - (Y_HERO + H_HERO) * MM;
  const heroTopY    = A4_H - Y_HERO * MM;
  // 80 thin horizontal stripes interpolated BRAND → LIGHT to fake a
  // linear-gradient(135deg) — same trick as the client renderer.
  const slices = 80;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1);
    const r = BRAND.red   + (LIGHT.red   - BRAND.red)   * t;
    const g = BRAND.green + (LIGHT.green - BRAND.green) * t;
    const b = BRAND.blue  + (LIGHT.blue  - BRAND.blue)  * t;
    page.drawRectangle({
      x: 0,
      y: heroBottomY + (i * (heroTopY - heroBottomY)) / slices - 0.5,
      width: A4_W,
      height: (heroTopY - heroBottomY) / slices + 1,
      color: rgb(r, g, b),
    });
  }

  // Multi-ticket marker
  const heroTextY = Y_HERO + 50;
  if (d.ticketIndex && d.ticketTotal && d.ticketTotal > 1) {
    drawText(page, `TICKET ${d.ticketIndex} OF ${d.ticketTotal}`, {
      x: MARGIN, y: fromTopMM(heroTextY - 8),
      font: fontBold, size: 8, color: WHITE, letterSpacing: 1.4,
    });
  }

  // Event title (28pt, white). Truncates if too long — see drawText.
  drawText(page, d.eventName, {
    x: MARGIN, y: fromTopMM(heroTextY),
    font: fontBold, size: 28, color: WHITE,
    maxWidth: A4_W - 2 * MARGIN,
  });

  // Meta line: Date · Time · Location
  const meta = formatDateTime(d);
  const metaParts = [meta.dateLine, meta.timeLine, d.eventLocation].filter(Boolean);
  drawText(page, metaParts.join("  ·  "), {
    x: MARGIN, y: fromTopMM(heroTextY + 8),
    font: fontReg, size: 11, color: WHITE,
  });

  // Status + tier pills row, bottom of hero
  const pillBaselineY = Y_HERO + H_HERO - 11;
  const status = d.status ?? "Valid";
  const statusColours =
    status === "Used"      ? { bg: USED_BG,   fg: USED_FG   } :
    status === "Cancelled" ? { bg: CANCEL_BG, fg: CANCEL_FG } :
                             { bg: VALID_BG,  fg: BRAND     };
  let pillEnd = drawPill(page, {
    x: MARGIN, y: fromTopMM(pillBaselineY),
    label: status.toUpperCase(), font: fontBold, size: 8,
    bg: statusColours.bg, fg: statusColours.fg,
  });
  drawPill(page, {
    x: pillEnd + 5, y: fromTopMM(pillBaselineY),
    label: d.ticketType.toUpperCase(), font: fontBold, size: 8,
    bg: DARK_NAVY, fg: WHITE,
  });

  // ── 3. PERFORATION ──
  const perfMidY = fromTopMM(Y_PERF + H_PERF / 2);
  // Dashed slate line across with two white half-disc notches at each edge
  page.drawLine({
    start: { x: 8 * MM,         y: perfMidY },
    end:   { x: A4_W - 8 * MM,  y: perfMidY },
    thickness: 0.35,
    color: FAINT,
    dashArray: [4, 3.5],
  });
  page.drawCircle({ x: 0,    y: perfMidY, size: 3.5 * MM, color: WHITE });
  page.drawCircle({ x: A4_W, y: perfMidY, size: 3.5 * MM, color: WHITE });

  // ── 4. INFO GRID ──
  const colLeftX  = MARGIN;
  const colRightX = MARGIN + (A4_W - 2 * MARGIN) * 0.5 + 6;

  let rowY = Y_INFO + 11;
  drawLabel(page, "HOLDER", colLeftX, fromTopMM(rowY), fontBold);
  drawText(page, `${d.buyerFirstName} ${d.buyerLastName}`.trim(), {
    x: colLeftX, y: fromTopMM(rowY + 5.5),
    font: fontBold, size: 13, color: INK,
  });
  if (d.buyerEmail) {
    drawText(page, d.buyerEmail, {
      x: colLeftX, y: fromTopMM(rowY + 11),
      font: fontReg, size: 9, color: MUTED,
    });
  }

  drawLabel(page, "ORGANIZER", colRightX, fromTopMM(rowY), fontBold);
  drawText(page, d.organizerName, {
    x: colRightX, y: fromTopMM(rowY + 5.5),
    font: fontBold, size: 13, color: INK,
    maxWidth: (A4_W - 2 * MARGIN) * 0.5 - 6,
  });

  rowY += 18;
  drawLabel(page, "TICKET TYPE", colLeftX, fromTopMM(rowY), fontBold);
  drawText(page, d.ticketType, {
    x: colLeftX, y: fromTopMM(rowY + 5.5),
    font: fontBold, size: 12, color: INK,
  });

  drawLabel(page, "PRICE PAID", colRightX, fromTopMM(rowY), fontBold);
  drawText(page, d.pricePaid, {
    x: colRightX, y: fromTopMM(rowY + 5.5),
    font: fontBold, size: 13, color: BRAND,
  });

  rowY += 14;
  drawLabel(page, "TICKET NUMBER", colLeftX, fromTopMM(rowY), fontBold);
  drawText(page, d.ticketId, {
    x: colLeftX, y: fromTopMM(rowY + 5.5),
    font: fontMono, size: 12, color: INK,
  });

  // ── 5. QR CARD ──
  // Soft-grey panel across the section
  page.drawRectangle({
    x: 0, y: A4_H - (Y_QR + H_QR) * MM,
    width: A4_W, height: H_QR * MM,
    color: SOFT_BG,
  });

  const qrSize = 65;
  const qrXmm = (210 - qrSize) / 2;
  const qrYmm = Y_QR + 6;

  // White card frame around the QR
  page.drawRectangle({
    x: (qrXmm - 5) * MM,
    y: A4_H - (qrYmm + qrSize + 5) * MM,
    width:  (qrSize + 10) * MM,
    height: (qrSize + 10) * MM,
    color: WHITE,
    borderColor: FAINT,
    borderWidth: 0.4,
  });

  // Render the QR as a PNG, embed it.
  try {
    const qrDataUrl = await QRCode.toDataURL(d.qrToken, {
      errorCorrectionLevel: "L",
      margin: 4,
      width: 1200,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const qrBytes = dataUrlToBytes(qrDataUrl);
    const qrImage = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImage, {
      x: qrXmm * MM,
      y: A4_H - (qrYmm + qrSize) * MM,
      width:  qrSize * MM,
      height: qrSize * MM,
    });
  } catch (err) {
    console.warn("[ticketPdfServer] QR render failed:", err);
    drawText(page, "QR unavailable", {
      x: 105 * MM, y: A4_H - (qrYmm + qrSize / 2) * MM,
      font: fontReg, size: 10, color: MUTED, anchor: "center",
    });
  }

  // Caption
  drawText(page, "Scan at entrance", {
    x: 105 * MM, y: fromTopMM(qrYmm + qrSize + 8),
    font: fontBold, size: 11, color: INK, anchor: "center",
  });
  drawText(page, `#${d.ticketId}`, {
    x: 105 * MM, y: fromTopMM(qrYmm + qrSize + 14),
    font: fontMono, size: 9, color: MUTED, anchor: "center",
  });

  // ── 6. FOOTER ──
  // Hairline at the start of the footer
  page.drawRectangle({
    x: MARGIN, y: A4_H - Y_FOOTER * MM,
    width: A4_W - 2 * MARGIN, height: 0.3,
    color: FAINT,
  });

  const noticeLines = [
    "This ticket is personal and valid for one entry only.",
    "Screenshots or duplicate copies may be refused at the door.",
    "Photo ID may be required for age-restricted events.",
  ];
  noticeLines.forEach((line, i) => {
    drawText(page, line, {
      x: MARGIN, y: fromTopMM(Y_FOOTER + 6 + i * 3.6),
      font: fontReg, size: 7.5, color: MUTED,
    });
  });

  drawText(page, "POWERED BY TICKET SAFE", {
    x: MARGIN, y: fromTopMM(297 - 6),
    font: fontBold, size: 8, color: BRAND, letterSpacing: 1.4,
  });
  drawText(page, "ticket-safe.eu", {
    x: A4_W - MARGIN, y: fromTopMM(297 - 6),
    font: fontReg, size: 7.5, color: MUTED, anchor: "right",
  });
}

// ── DRAWING HELPERS ───────────────────────────────────────────────────────

interface TextOpts {
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  letterSpacing?: number;
  anchor?: "left" | "right" | "center";
  maxWidth?: number;
}

function drawText(page: PDFPage, text: string, o: TextOpts) {
  let t = text;
  if (o.maxWidth) {
    while (o.font.widthOfTextAtSize(t, o.size) > o.maxWidth && t.length > 4) {
      t = t.slice(0, -2);
    }
    if (t !== text) t = t.slice(0, -1) + "…";
  }
  let x = o.x;
  if (o.anchor === "right") {
    x = o.x - o.font.widthOfTextAtSize(t, o.size);
  } else if (o.anchor === "center") {
    x = o.x - o.font.widthOfTextAtSize(t, o.size) / 2;
  }
  page.drawText(t, {
    x, y: o.y,
    font: o.font, size: o.size, color: o.color,
    ...(o.letterSpacing ? { characterSpacing: o.letterSpacing } : {}),
  });
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text, {
    x, y, font, size: 7, color: MUTED, characterSpacing: 1.0,
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
  },
): number {
  const padX = 6;
  const padY = 3;
  const textW = opts.font.widthOfTextAtSize(opts.label, opts.size);
  const w = textW + padX * 2;
  const h = opts.size + padY * 2;
  page.drawRectangle({
    x: opts.x, y: opts.y - h + padY,
    width: w, height: h,
    color: opts.bg,
  });
  page.drawText(opts.label, {
    x: opts.x + padX,
    y: opts.y - h + padY + (h - opts.size) / 2,
    font: opts.font, size: opts.size, color: opts.fg,
    characterSpacing: 0.8,
  });
  return opts.x + w;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function formatDateTime(d: ServerTicketData): { dateLine: string; timeLine: string } {
  const parsed = new Date(d.eventDate);
  const isISO  = !isNaN(parsed.getTime());
  if (!isISO) {
    return { dateLine: d.eventDate, timeLine: d.eventTime ?? "" };
  }
  return {
    dateLine: parsed.toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }),
    timeLine: d.eventTime ?? parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit",
    }),
  };
}
