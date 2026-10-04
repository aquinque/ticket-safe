/**
 * Server-side ticket PDF renderer for Ticket Safe — Deno-native.
 *
 * Stack: pdf-lib (pure JS, runs in Deno) + @pdf-lib/fontkit (custom TTF
 * embedding) + qrcode (esm.sh) — no Chromium, no canvas, no client APIs.
 * Kept on pdf-lib rather than switching engines (the brief suggested
 * @react-pdf/renderer or Puppeteer as options): pdf-lib is already
 * Deno-native and proven in this exact payment-critical path, so the
 * redesign changes the drawing code, not the renderer underneath it —
 * see the final summary for the full reasoning.
 *
 * Fonts are the real site fonts (Inter + Instrument Sans), embedded as
 * TTF bytes bundled next to this module — not system fallbacks. Colors
 * match supabase/functions/_shared/emailTokens.ts exactly (the same
 * tokens driving every transactional email) so the PDF, the email, and
 * the live site are one visual system.
 *
 * Layout: A4 portrait, one page per ticket — unchanged shape from the
 * previous version (print + cut friendly, and renders fine on a phone
 * screen zoomed to the top third). What changed is everything drawn on
 * the page: navy header with the real logo mark, the event's own banner
 * photo in the hero (flat navy block if there isn't one — never a fake
 * gradient), an added order-number row, anti-fraud notices (resale
 * invalidates the QR, issued timestamp), and zero rounded corners
 * anywhere, consistent with the rest of the product.
 *
 * QR payload is untouched: still `d.qrToken` encoded as-is, same
 * error-correction level. Check-in scanning is unaffected by this
 * redesign.
 *
 *   ┌─ HEADER BAND (16 mm, navy) ───────────────────┐
 *   │ [TS] TicketSafe                                │
 *   ├─ HERO (85 mm, event photo or flat navy) ───────┤
 *   │ TICKET 2 OF 3 (overline if multi-ticket)       │
 *   │ EVENT NAME (26pt bold)                         │
 *   │ Date · Time · Location                          │
 *   │ [VALID] [EARLY BIRD]                           │
 *   ├─ PERFORATION (8 mm) ───────────────────────────┤
 *   │ ⊗ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ⊗  │
 *   ├─ INFO GRID (58 mm, 2-col) ─────────────────────┤
 *   │ HOLDER         ORGANIZER                        │
 *   │ TICKET TYPE    PRICE PAID                       │
 *   │ TICKET NUMBER  ORDER NUMBER                      │
 *   ├─ QR CARD (88 mm, surface tint) ─────────────────┤
 *   │ [65×65 mm QR + Scan at entrance + #id]         │
 *   │ Issued <date> · invalidated if resold off-platform │
 *   ├─ FOOTER (22 mm) ───────────────────────────────┤
 *   │ Notices + POWERED BY TICKET SAFE + support      │
 *   └─────────────────────────────────────────────────┘
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import QRCode from "https://esm.sh/qrcode@1.5.4";

// ── PUBLIC INTERFACE ──────────────────────────────────────────────────────

export interface ServerTicketData {
  eventName: string;
  /** ISO 8601 OR pre-formatted display string. */
  eventDate: string;
  eventTime?: string;
  eventLocation: string;
  organizerName: string;

  /** Event's own banner photo (absolute URL). Flat navy block if absent. */
  eventImageUrl?: string | null;

  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail?: string | null;

  ticketType: string;
  pricePaid: string;
  ticketId: string;
  /** Human order reference, e.g. "TS-A1B2C3D4". Omit to hide the row. */
  orderNumber?: string;
  qrToken: string;
  status?: "Valid" | "Used" | "Cancelled";

  ticketIndex?: number;
  ticketTotal?: number;
}

// ── PALETTE — matches supabase/functions/_shared/emailTokens.ts exactly ──

const NAVY         = rgb(26 / 255, 39 / 255, 68 / 255);     // #1a2744 — brandNavy
const ACCENT       = rgb(58 / 255, 95 / 255, 230 / 255);    // #3a5fe6 — accent
const ACCENT_LIGHT = rgb(174 / 255, 198 / 255, 255 / 255);  // #aec6ff — accentLight
const INK          = rgb(11 / 255, 16 / 255, 36 / 255);     // #0b1024 — textPrimary
const MUTED        = rgb(91 / 255, 100 / 255, 128 / 255);   // #5b6480 — textMuted
const BORDER       = rgb(228 / 255, 231 / 255, 240 / 255);  // #e4e7f0 — border
const SURFACE      = rgb(246 / 255, 247 / 255, 250 / 255);  // #f6f7fa — bodyBg
const DANGER       = rgb(255 / 255, 77 / 255, 109 / 255);   // #ff4d6d
const SUCCESS      = rgb(34 / 255, 197 / 255, 94 / 255);    // #22c55e
const WHITE        = rgb(1, 1, 1);
const USED_BG       = rgb(0.88, 0.91, 0.94);
const USED_FG       = rgb(0.28, 0.33, 0.41);

// ── A4 + MM CONVERSION ────────────────────────────────────────────────────

const MM     = 2.834645669;
const A4_W   = 595.28;
const A4_H   = 841.89;
const MARGIN = 14 * MM;

const H_HEADER = 16;
const H_HERO   = 85;
const H_PERF   = 8;
const H_INFO   = 58;
const H_QR     = 88;

const Y_HEADER = 0;
const Y_HERO   = Y_HEADER + H_HEADER;
const Y_PERF   = Y_HERO   + H_HERO;
const Y_INFO   = Y_PERF   + H_PERF;
const Y_QR     = Y_INFO   + H_INFO;
const Y_FOOTER = Y_QR     + H_QR;

const fromTopMM = (topMM: number) => A4_H - topMM * MM;

// ── FONT LOADING ──────────────────────────────────────────────────────────

interface Fonts {
  body: PDFFont;
  bodyBold: PDFFont;
  display: PDFFont;
  mono: PDFFont;
}

/**
 * Loads the real site fonts (bundled as TTF files next to this module —
 * see _shared/fonts/). Falls back to pdf-lib's built-in Helvetica if the
 * bundled assets don't resolve at runtime for any reason: this path gates
 * every purchase-confirmation email, so a font-loading hiccup must degrade
 * to a slightly-off-brand PDF, never break ticket delivery outright.
 */
async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  try {
    const [interReg, interBold, instrumentBold] = await Promise.all([
      Deno.readFile(new URL("./fonts/Inter-Regular.ttf", import.meta.url)),
      Deno.readFile(new URL("./fonts/Inter-Bold.ttf", import.meta.url)),
      Deno.readFile(new URL("./fonts/InstrumentSans-Bold.ttf", import.meta.url)),
    ]);
    return {
      body: await pdf.embedFont(interReg, { subset: true }),
      bodyBold: await pdf.embedFont(interBold, { subset: true }),
      display: await pdf.embedFont(instrumentBold, { subset: true }),
      // pdf-lib has no built-in monospace TTF bundled; Inter-Bold reads fine
      // for the short alphanumeric ticket/order IDs this is used for, and
      // avoids a 5th embedded font just for a few digits.
      mono: await pdf.embedFont(interReg, { subset: true }),
    };
  } catch (err) {
    console.error("[ticketPdfServer] bundled font load failed, falling back to Helvetica:", err);
    const fallback = await pdf.embedFont(StandardFonts.Helvetica);
    const fallbackBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { body: fallback, bodyBold: fallbackBold, display: fallbackBold, mono: fallback };
  }
}

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
  const fonts = await loadFonts(pdf);

  for (const data of tickets) {
    const page = pdf.addPage([A4_W, A4_H]);
    await drawTicketPage(pdf, page, data, fonts);
  }

  return pdf.save();
}

// ── IMAGE FETCH (best-effort — flat navy fallback on any failure) ────────

async function tryEmbedEventImage(pdf: PDFDocument, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("png")) return await pdf.embedPng(bytes);
    // Default to JPG for anything else (jpeg is the common case; embedJpg
    // throws on a real mismatch, caught below same as a network failure).
    return await pdf.embedJpg(bytes);
  } catch (err) {
    console.warn("[ticketPdfServer] event image fetch/embed failed, using flat fallback:", err);
    return null;
  }
}

// ── PAGE DRAWER ───────────────────────────────────────────────────────────

async function drawTicketPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  d: ServerTicketData,
  fonts: Fonts,
): Promise<void> {
  // ── 1. HEADER BAND — navy, logo mark + wordmark ──
  page.drawRectangle({
    x: 0, y: A4_H - H_HEADER * MM,
    width: A4_W, height: H_HEADER * MM,
    color: NAVY,
  });
  // Logo mark: flat square (zero radius, per the brief — the live site's
  // actual mark is rounded, but this artifact is explicitly zero-radius
  // throughout), brand-blue fill, "TS" in white/light-blue.
  const markSize = 8.5 * MM;
  const markY = A4_H - (H_HEADER * MM + markSize) / 2;
  page.drawRectangle({ x: MARGIN, y: markY, width: markSize, height: markSize, color: ACCENT });
  drawText(page, "TS", {
    x: MARGIN + markSize / 2, y: markY + markSize / 2 - 3.2,
    font: fonts.display, size: 9, color: WHITE, anchor: "center",
  });
  drawText(page, "Ticket", {
    x: MARGIN + markSize + 3 * MM, y: fromTopMM(H_HEADER / 2 + 1.6),
    font: fonts.display, size: 13, color: WHITE,
  });
  const ticketW = fonts.display.widthOfTextAtSize("Ticket", 13);
  drawText(page, "Safe", {
    x: MARGIN + markSize + 3 * MM + ticketW, y: fromTopMM(H_HEADER / 2 + 1.6),
    font: fonts.display, size: 13, color: ACCENT_LIGHT,
  });
  drawText(page, "OFFICIAL EVENT TICKET", {
    x: A4_W - MARGIN, y: fromTopMM(H_HEADER / 2 + 1.2),
    font: fonts.bodyBold, size: 7.5, color: ACCENT_LIGHT, letterSpacing: 1.2,
    anchor: "right",
  });

  // ── 2. HERO — real event photo, or a flat navy block (never a gradient) ──
  const heroTopY = A4_H - Y_HERO * MM;
  const heroBottomY = A4_H - (Y_HERO + H_HERO) * MM;
  const heroImage = d.eventImageUrl ? await tryEmbedEventImage(pdfDoc, d.eventImageUrl) : null;
  if (heroImage) {
    // object-cover into the hero rect
    const boxW = A4_W, boxH = heroTopY - heroBottomY;
    const scale = Math.max(boxW / heroImage.width, boxH / heroImage.height);
    const drawW = heroImage.width * scale, drawH = heroImage.height * scale;
    page.drawImage(heroImage, {
      x: (boxW - drawW) / 2, y: heroBottomY - (drawH - boxH) / 2,
      width: drawW, height: drawH,
    });
    // Dark scrim for text legibility over a real photo.
    page.drawRectangle({
      x: 0, y: heroBottomY, width: A4_W, height: boxH,
      color: NAVY, opacity: 0.45,
    });
  } else {
    page.drawRectangle({
      x: 0, y: heroBottomY, width: A4_W, height: heroTopY - heroBottomY,
      color: NAVY,
    });
  }

  const heroTextY = Y_HERO + 48;
  if (d.ticketIndex && d.ticketTotal && d.ticketTotal > 1) {
    drawText(page, `TICKET ${d.ticketIndex} OF ${d.ticketTotal}`, {
      x: MARGIN, y: fromTopMM(heroTextY - 8),
      font: fonts.bodyBold, size: 8, color: ACCENT_LIGHT, letterSpacing: 1.4,
    });
  }

  drawText(page, d.eventName, {
    x: MARGIN, y: fromTopMM(heroTextY),
    font: fonts.display, size: 26, color: WHITE,
    maxWidth: A4_W - 2 * MARGIN,
  });

  const meta = formatDateTime(d);
  const metaParts = [meta.dateLine, meta.timeLine, d.eventLocation].filter(Boolean);
  drawText(page, metaParts.join("   ·   "), {
    x: MARGIN, y: fromTopMM(heroTextY + 9),
    font: fonts.body, size: 11, color: WHITE,
  });

  const pillBaselineY = Y_HERO + H_HERO - 11;
  const status = d.status ?? "Valid";
  const statusColours =
    status === "Used"      ? { bg: USED_BG, fg: USED_FG } :
    status === "Cancelled" ? { bg: DANGER,  fg: WHITE }   :
                              { bg: SUCCESS, fg: WHITE };
  let pillEnd = drawPill(page, {
    x: MARGIN, y: fromTopMM(pillBaselineY),
    label: status.toUpperCase(), font: fonts.bodyBold, size: 8,
    bg: statusColours.bg, fg: statusColours.fg,
  });
  drawPill(page, {
    x: pillEnd + 5, y: fromTopMM(pillBaselineY),
    label: d.ticketType.toUpperCase(), font: fonts.bodyBold, size: 8,
    bg: rgb(1, 1, 1), fg: NAVY,
  });

  // ── 3. PERFORATION — dashed line + notch circles, the "real ticket" cue ──
  const perfMidY = fromTopMM(Y_PERF + H_PERF / 2);
  page.drawLine({
    start: { x: 8 * MM, y: perfMidY },
    end: { x: A4_W - 8 * MM, y: perfMidY },
    thickness: 0.35, color: BORDER, dashArray: [4, 3.5],
  });
  page.drawCircle({ x: 0, y: perfMidY, size: 3.5 * MM, color: WHITE });
  page.drawCircle({ x: A4_W, y: perfMidY, size: 3.5 * MM, color: WHITE });

  // ── 4. INFO GRID ──
  const colLeftX = MARGIN;
  const colRightX = MARGIN + (A4_W - 2 * MARGIN) * 0.5 + 6;

  let rowY = Y_INFO + 11;
  drawLabel(page, "HOLDER", colLeftX, fromTopMM(rowY), fonts.bodyBold);
  drawText(page, `${d.buyerFirstName} ${d.buyerLastName}`.trim(), {
    x: colLeftX, y: fromTopMM(rowY + 5.5), font: fonts.bodyBold, size: 13, color: INK,
  });
  if (d.buyerEmail) {
    drawText(page, d.buyerEmail, {
      x: colLeftX, y: fromTopMM(rowY + 11), font: fonts.body, size: 9, color: MUTED,
    });
  }

  drawLabel(page, "ORGANIZER", colRightX, fromTopMM(rowY), fonts.bodyBold);
  drawText(page, d.organizerName, {
    x: colRightX, y: fromTopMM(rowY + 5.5), font: fonts.bodyBold, size: 13, color: INK,
    maxWidth: (A4_W - 2 * MARGIN) * 0.5 - 6,
  });

  rowY += 18;
  drawLabel(page, "TICKET TYPE", colLeftX, fromTopMM(rowY), fonts.bodyBold);
  drawText(page, d.ticketType, {
    x: colLeftX, y: fromTopMM(rowY + 5.5), font: fonts.bodyBold, size: 12, color: INK,
  });

  drawLabel(page, "PRICE PAID", colRightX, fromTopMM(rowY), fonts.bodyBold);
  drawText(page, d.pricePaid, {
    x: colRightX, y: fromTopMM(rowY + 5.5), font: fonts.bodyBold, size: 13, color: ACCENT,
  });

  rowY += 14;
  drawLabel(page, "TICKET NUMBER", colLeftX, fromTopMM(rowY), fonts.bodyBold);
  drawText(page, d.ticketId, {
    x: colLeftX, y: fromTopMM(rowY + 5.5), font: fonts.mono, size: 11, color: INK,
  });

  if (d.orderNumber) {
    drawLabel(page, "ORDER NUMBER", colRightX, fromTopMM(rowY), fonts.bodyBold);
    drawText(page, d.orderNumber, {
      x: colRightX, y: fromTopMM(rowY + 5.5), font: fonts.mono, size: 11, color: INK,
    });
  }

  // ── 5. QR CARD ──
  page.drawRectangle({
    x: 0, y: A4_H - (Y_QR + H_QR) * MM, width: A4_W, height: H_QR * MM, color: SURFACE,
  });

  const qrSize = 62;
  const qrXmm = (210 - qrSize) / 2;
  const qrYmm = Y_QR + 6;

  page.drawRectangle({
    x: (qrXmm - 5) * MM,
    y: A4_H - (qrYmm + qrSize + 5) * MM,
    width: (qrSize + 10) * MM,
    height: (qrSize + 10) * MM,
    color: WHITE,
    borderColor: BORDER,
    borderWidth: 0.4,
  });

  try {
    // Quiet zone: margin:4 gives QR code's own required white border
    // around the modules, independent of the white card frame above —
    // two layers of breathing room so it scans reliably even printed.
    const qrDataUrl = await QRCode.toDataURL(d.qrToken, {
      errorCorrectionLevel: "L",
      margin: 4,
      width: 1200,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const qrBytes = dataUrlToBytes(qrDataUrl);
    const qrImage = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImage, {
      x: qrXmm * MM, y: A4_H - (qrYmm + qrSize) * MM, width: qrSize * MM, height: qrSize * MM,
    });
  } catch (err) {
    console.warn("[ticketPdfServer] QR render failed:", err);
    drawText(page, "QR unavailable — use ticket number at the door", {
      x: 105 * MM, y: A4_H - (qrYmm + qrSize / 2) * MM,
      font: fonts.body, size: 10, color: MUTED, anchor: "center",
    });
  }

  drawText(page, "Scan at entrance", {
    x: 105 * MM, y: fromTopMM(qrYmm + qrSize + 8),
    font: fonts.bodyBold, size: 11, color: INK, anchor: "center",
  });
  drawText(page, `#${d.ticketId}`, {
    x: 105 * MM, y: fromTopMM(qrYmm + qrSize + 14),
    font: fonts.mono, size: 9, color: MUTED, anchor: "center",
  });
  // Anti-fraud: issuance timestamp + resale notice, directly under the QR
  // so it reads as part of the ticket itself, not just small print.
  drawText(page, `Issued ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · invalidated if transferred outside Ticket Safe`, {
    x: 105 * MM, y: fromTopMM(qrYmm + qrSize + 19.5),
    font: fonts.body, size: 7.5, color: MUTED, anchor: "center",
  });

  // ── 6. FOOTER ──
  page.drawRectangle({
    x: MARGIN, y: A4_H - Y_FOOTER * MM, width: A4_W - 2 * MARGIN, height: 0.3, color: BORDER,
  });

  const noticeLines = [
    "This ticket is nominative and valid for one entry only.",
    "Resale is only possible through Ticket Safe — tickets sold elsewhere are void.",
    "Photo ID may be requested at the door.",
  ];
  noticeLines.forEach((line, i) => {
    drawText(page, line, {
      x: MARGIN, y: fromTopMM(Y_FOOTER + 6 + i * 3.6),
      font: fonts.body, size: 7.5, color: MUTED,
    });
  });

  drawText(page, "POWERED BY TICKET SAFE", {
    x: MARGIN, y: fromTopMM(297 - 6),
    font: fonts.bodyBold, size: 8, color: ACCENT, letterSpacing: 1.4,
  });
  drawText(page, "ticket-safe.eu · ticketsafe.friendly@gmail.com", {
    x: A4_W - MARGIN, y: fromTopMM(297 - 6),
    font: fonts.body, size: 7.5, color: MUTED, anchor: "right",
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
  page.drawText(text, { x, y, font, size: 7, color: MUTED, characterSpacing: 1.0 });
}

function drawPill(
  page: PDFPage,
  opts: { x: number; y: number; label: string; font: PDFFont; size: number; bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb> },
): number {
  const padX = 6;
  const padY = 3;
  const textW = opts.font.widthOfTextAtSize(opts.label, opts.size);
  const w = textW + padX * 2;
  const h = opts.size + padY * 2;
  page.drawRectangle({ x: opts.x, y: opts.y - h + padY, width: w, height: h, color: opts.bg });
  page.drawText(opts.label, {
    x: opts.x + padX, y: opts.y - h + padY + (h - opts.size) / 2,
    font: opts.font, size: opts.size, color: opts.fg, characterSpacing: 0.8,
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
  const isISO = !isNaN(parsed.getTime());
  if (!isISO) {
    return { dateLine: d.eventDate, timeLine: d.eventTime ?? "" };
  }
  return {
    dateLine: parsed.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    timeLine: d.eventTime ?? parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}
