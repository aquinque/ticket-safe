/**
 * generateTicketPDF — premium event ticket PDF generator for Ticket Safe.
 *
 * The design language is Ticketmaster/Shotgun mixed with the Ticket Safe
 * brand identity: deep brand blue + light blue gradient as the hero,
 * white content sections with a sharp typographic hierarchy, a
 * perforation strip between the hero and the body, and a generously
 * padded QR card sized for door scanning at handheld distance.
 *
 * Layout (A4 portrait, 210 × 297 mm):
 *
 *   ┌─ HEADER BAND (white, 14mm) ───────────────────┐
 *   │ TICKET SAFE              OFFICIAL EVENT TICKET│
 *   ├─ HERO (90mm) ─────────────────────────────────┤
 *   │ ░░ event image (full bleed) or brand gradient │
 *   │   + dark vertical gradient overlay on bottom  │
 *   │                                                │
 *   │ EVENT NAME (28pt bold, white)                  │
 *   │ Date · Time · Location                         │
 *   │ [VALID] [VIP]                                  │
 *   ├─ PERFORATION (8mm) ────────────────────────────┤
 *   │ ⊗ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ⊗ │
 *   ├─ INFO GRID (52mm, white) ──────────────────────┤
 *   │ HOLDER             ORGANIZER                   │
 *   │ Achille Quinquenel ESCP Students' Union        │
 *   │                                                 │
 *   │ TICKET TYPE        PRICE PAID                  │
 *   │ Early Bird         €18.00                      │
 *   │                                                 │
 *   │ TICKET NUMBER                                  │
 *   │ TS-ESC-000184                                  │
 *   ├─ QR CARD (85mm, soft bg) ──────────────────────┤
 *   │   ┌───────────────┐                            │
 *   │   │  [QR 65×65mm] │                            │
 *   │   └───────────────┘                            │
 *   │   Scan at entrance                             │
 *   │   #TS-ESC-000184                               │
 *   ├─ FOOTER (28mm, white) ─────────────────────────┤
 *   │ This ticket is personal and valid for one     │
 *   │ entry only. Screenshots or duplicates may be   │
 *   │ refused.                                       │
 *   │ Powered by TICKET SAFE — ticket-safe.eu       │
 *   └────────────────────────────────────────────────┘
 *
 * Heights add up to 277 mm, leaving 20 mm of breathing room at the bottom.
 *
 * Both jsPDF and qrcode are loaded dynamically from esm.sh on the first
 * generation, so non-buyers never pay the bundle cost and a build never
 * fails on a missing transitive dep.
 */

// ──────────────────────────────────────────────────────────────────────────
//  PUBLIC INTERFACE
// ──────────────────────────────────────────────────────────────────────────

/**
 * Data the PDF needs. Every field maps to a piece of the ticket layout.
 * Optional fields fall back to sensible defaults (Valid status, omitted
 * email, single-ticket order).
 */
export interface TicketData {
  // ─── Event ───────────────────────────────────────────────────────────
  eventName: string;
  /** ISO 8601 OR a pre-formatted string. The renderer prefers ISO so it
   *  can split the date and time and format both consistently. */
  eventDate: string;
  /** Optional explicit time; if omitted we parse it from eventDate. */
  eventTime?: string;
  eventLocation: string;
  /** Optional banner image URL. When set, fills the hero behind the title;
   *  when missing, the hero falls back to the brand gradient. */
  eventImageUrl?: string | null;
  /** Display name of the association running the event. */
  organizerName: string;

  // ─── Buyer ───────────────────────────────────────────────────────────
  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail?: string | null;

  // ─── Ticket ──────────────────────────────────────────────────────────
  /** Free-text — "Early Bird", "Regular", "VIP", "Staff", "Guest List", … */
  ticketType: string;
  /** Pre-formatted price string ("18.00€"). The caller controls currency
   *  + format so we don't try to guess locale here. */
  pricePaid: string;
  /** Display ID printed on the ticket — short and human-quotable. */
  ticketId: string;
  /** The payload encoded inside the QR. Can be the raw token, OR a full
   *  verify URL like https://ticket-safe.eu/verify/<token>. The scanner
   *  decides how to interpret it. */
  qrToken: string;
  /** Lifecycle marker. "Valid" by default. */
  status?: "Valid" | "Used" | "Cancelled";

  // ─── Optional multi-ticket markers ───────────────────────────────────
  /** 1-based index when this is part of a multi-ticket order. */
  ticketIndex?: number;
  /** Total tickets in the same order. */
  ticketTotal?: number;
}

// ──────────────────────────────────────────────────────────────────────────
//  PALETTE & LAYOUT CONSTANTS
// ──────────────────────────────────────────────────────────────────────────

// RGB triplets (jsPDF wants three explicit channels, not a spread tuple —
// strict-mode TS trips on the latter).
const C_BRAND     = { r: 0,   g: 51,  b: 153 }; // #003399 — Ticket Safe deep navy
const C_LIGHT     = { r: 0,   g: 102, b: 204 }; // #0066cc — gradient end
const C_DARK_NAVY = { r: 0,   g: 31,  b: 92  }; // pill bg over the gradient
const C_INK       = { r: 15,  g: 23,  b: 42  }; // slate-900 — body text
const C_MUTED     = { r: 100, g: 116, b: 139 }; // slate-500 — labels
const C_FAINT     = { r: 148, g: 163, b: 184 }; // slate-400 — separators
const C_BG_SOFT   = { r: 248, g: 250, b: 252 }; // slate-50 — QR card bg
const C_STATUS = {
  Valid:     { bg: { r: 220, g: 234, b: 255 }, fg: C_BRAND }, // blue-100 / brand
  Used:      { bg: { r: 226, g: 232, b: 240 }, fg: { r: 71,  g: 85,  b: 105 } }, // slate
  Cancelled: { bg: { r: 254, g: 226, b: 226 }, fg: { r: 153, g: 27,  b: 27  } }, // red-100 / red-900
} as const;

// A4 + margins
const A4_W      = 210;
const A4_H      = 297;
const MARGIN_X  = 14;
const CONTENT_W = A4_W - 2 * MARGIN_X;

// Section heights (mm) — sum to 277 mm, leaving 20 mm at the page bottom
const H_HEADER = 14;
const H_HERO   = 90;
const H_PERF   = 8;
const H_INFO   = 52;
const H_QR     = 85;
const H_FOOTER = 28;

// Pre-computed Y positions for each section
const Y_HEADER = 0;
const Y_HERO   = Y_HEADER + H_HEADER;
const Y_PERF   = Y_HERO   + H_HERO;
const Y_INFO   = Y_PERF   + H_PERF;
const Y_QR     = Y_INFO   + H_INFO;
const Y_FOOTER = Y_QR     + H_QR;

// ──────────────────────────────────────────────────────────────────────────
//  IMAGE / QR HELPERS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Render the QR for `payload` straight to a PNG data URL. Loaded from
 * esm.sh on demand so the QRcode lib never ships in the main bundle.
 *
 * Settings tuned for handheld door-scan:
 *   - level "L"    — low ECC, fewer modules per char → bigger modules
 *   - margin 4     — recommended quiet zone for fast camera detection
 *   - width 1200   — high-resolution PNG so the embed stays crisp on print
 */
async function generateQrPng(payload: string): Promise<string> {
  const mod = await import(/* @vite-ignore */ "https://esm.sh/qrcode@1.5.4");
  const QRCode = (mod as { default?: { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> } })
    .default
    ?? (mod as unknown as { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> });
  return QRCode.toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "L",
    margin: 4,
    width: 1200,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/**
 * Load a remote image, optionally darken its bottom half so white overlay
 * text reads cleanly, and return it as a PNG data URL. CORS-tolerant:
 * returns null on failure and the caller falls back to a pure gradient.
 */
async function loadHeroBanner(
  url: string,
  outW = 1400,
  outH = 720,
  darkenBottom = true,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      // Cover-fit the image
      const srcRatio = img.width / img.height;
      const dstRatio = outW / outH;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (srcRatio > dstRatio) {
        sw = img.height * dstRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / dstRatio;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      // Dark gradient overlay (transparent → 65% black) to seat text
      if (darkenBottom) {
        const g = ctx.createLinearGradient(0, 0, 0, outH);
        g.addColorStop(0,    "rgba(0,0,0,0.20)");
        g.addColorStop(0.45, "rgba(0,0,0,0.45)");
        g.addColorStop(1,    "rgba(0,0,0,0.75)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, outW, outH);
      }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  FORMATTERS
// ──────────────────────────────────────────────────────────────────────────

function formatDateTime(input: { eventDate: string; eventTime?: string }): { dateLine: string; timeLine: string } {
  // If the caller passed an ISO date, parse it. Otherwise assume the string
  // is already display-formatted and pass it straight through.
  const d = new Date(input.eventDate);
  const isISO = !isNaN(d.getTime());
  if (!isISO) {
    return {
      dateLine: input.eventDate,
      timeLine: input.eventTime ?? "",
    };
  }
  const dateLine = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLine =
    input.eventTime ??
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { dateLine, timeLine };
}

function safeFilename(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9 _-]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "ticket"
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  jsPDF TYPED SHIM
// ──────────────────────────────────────────────────────────────────────────

interface JsPDFLike {
  setFillColor(r: number, g: number, b: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setLineWidth(w: number): void;
  setLineDashPattern(pattern: number[], phase: number): void;
  setFont(family: string, style?: string): void;
  setFontSize(size: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  circle(x: number, y: number, r: number, style?: string): void;
  text(text: string | string[], x: number, y: number, options?: Record<string, unknown>): void;
  splitTextToSize(text: string, maxLen: number): string[];
  getTextWidth(text: string): number;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  save(filename: string): void;
}
type JsPDFCtor = new (opts: { unit: string; format: string; orientation: string }) => JsPDFLike;

// ──────────────────────────────────────────────────────────────────────────
//  RENDERER
// ──────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Generates the PDF and triggers a browser download.
 *
 * @example
 *   await generateTicketPDF({
 *     eventName: "ESCP Opening Party",
 *     eventDate: "2026-09-19T22:30:00.000Z",
 *     eventLocation: "Le Duplex, Paris",
 *     buyerFirstName: "Achille",
 *     buyerLastName: "Quinquenel",
 *     ticketType: "Early Bird",
 *     pricePaid: "18.00€",
 *     ticketId: "TS-ESC-000184",
 *     qrToken: "https://ticket-safe.eu/verify/unique-secure-token",
 *     organizerName: "ESCP Students' Union",
 *     status: "Valid",
 *   });
 */
export async function generateTicketPDF(data: TicketData): Promise<void> {
  const mod = await import(/* @vite-ignore */ "https://esm.sh/jspdf@2.5.2");
  const JsPDF: JsPDFCtor =
    (mod as { jsPDF?: JsPDFCtor; default?: JsPDFCtor }).jsPDF
    ?? (mod as { default: JsPDFCtor }).default;
  const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ── 1. HEADER BAND ───────────────────────────────────────────────────
  // White band with the brand wordmark left and "OFFICIAL EVENT TICKET"
  // right. A thin brand-blue underline visually separates it from the hero.
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, Y_HEADER, A4_W, H_HEADER, "F");

  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("TICKET SAFE", MARGIN_X, Y_HEADER + 8.5, { charSpace: 1.2 });

  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("OFFICIAL EVENT TICKET", A4_W - MARGIN_X, Y_HEADER + 8.5, {
    align: "right",
    charSpace: 1.1,
  });

  // Thin brand underline at the very bottom of the header band
  pdf.setDrawColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN_X, Y_HEADER + H_HEADER - 0.5, A4_W - MARGIN_X, Y_HEADER + H_HEADER - 0.5);

  // ── 2. HERO ──────────────────────────────────────────────────────────
  // Base layer: brand-blue gradient, painted as 80 horizontal slices.
  // jsPDF has no native linear-gradient primitive; 80 slices interpolated
  // between BRAND and LIGHT reads as smooth on any decent printer.
  const slices = 80;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1);
    const r = Math.round(C_BRAND.r + (C_LIGHT.r - C_BRAND.r) * t);
    const g = Math.round(C_BRAND.g + (C_LIGHT.g - C_BRAND.g) * t);
    const b = Math.round(C_BRAND.b + (C_LIGHT.b - C_BRAND.b) * t);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, Y_HERO + (i * H_HERO) / slices, A4_W, H_HERO / slices + 0.5, "F");
  }

  // Optional banner image on top, already pre-darkened on its bottom half
  // so the title text reads. If the image fails to load, we just keep the
  // gradient — which is plenty premium on its own.
  if (data.eventImageUrl) {
    const banner = await loadHeroBanner(data.eventImageUrl);
    if (banner) {
      pdf.addImage(banner, "PNG", 0, Y_HERO, A4_W, H_HERO);
    }
  }

  // Hero text — all on the bottom half of the hero so it sits on the
  // dark gradient overlay (or the deepest part of the brand gradient
  // when there's no image)
  const heroTextY = Y_HERO + 50;
  pdf.setTextColor(255, 255, 255);

  // Multi-ticket marker, e.g. "TICKET 2 OF 3"
  if (data.ticketIndex && data.ticketTotal && data.ticketTotal > 1) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(
      `TICKET ${data.ticketIndex} OF ${data.ticketTotal}`,
      MARGIN_X,
      heroTextY - 8,
      { charSpace: 1.2 },
    );
  }

  // Event title (28pt bold, auto-wrapped to 2 lines)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  const titleLines = pdf.splitTextToSize(data.eventName, CONTENT_W).slice(0, 2);
  pdf.text(titleLines, MARGIN_X, heroTextY);

  // Date + location (one line, dot-separated)
  const { dateLine, timeLine } = formatDateTime({ eventDate: data.eventDate, eventTime: data.eventTime });
  const metaParts = [dateLine, timeLine, data.eventLocation].filter((s) => s && s.length > 0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const metaY = heroTextY + (titleLines.length === 2 ? 16 : 8);
  pdf.text(metaParts.join(" · "), MARGIN_X, metaY);

  // Status + Tier pills row, bottom-left of hero
  const pillY = Y_HERO + H_HERO - 11;
  let pillX = MARGIN_X;
  pillX = drawPill(pdf, pillX, pillY, (data.status ?? "Valid").toUpperCase(), {
    bg: C_STATUS[data.status ?? "Valid"].bg,
    fg: C_STATUS[data.status ?? "Valid"].fg,
  });
  pillX = drawPill(pdf, pillX + 3, pillY, data.ticketType.toUpperCase(), {
    bg: C_DARK_NAVY,
    fg: { r: 255, g: 255, b: 255 },
  });

  // ── 3. PERFORATION ───────────────────────────────────────────────────
  const perfMidY = Y_PERF + H_PERF / 2;
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.35);
  pdf.setLineDashPattern([1.8, 1.6], 0);
  pdf.line(8, perfMidY, A4_W - 8, perfMidY);
  pdf.setLineDashPattern([], 0);
  // Two white half-disc notches at the page edges, giving the "tear strip"
  // look without us actually cutting the canvas
  pdf.setFillColor(255, 255, 255);
  pdf.circle(0, perfMidY, 3.5, "F");
  pdf.circle(A4_W, perfMidY, 3.5, "F");

  // ── 4. INFO GRID ─────────────────────────────────────────────────────
  // Two-column grid with three rows of label/value pairs. The label is a
  // tracked 7pt uppercase muted-grey caption; the value is a 13pt INK
  // bold for the headline ones and 11pt regular for secondaries.
  const colLeftX = MARGIN_X;
  const colRightX = MARGIN_X + CONTENT_W / 2 + 2;
  let rowY = Y_INFO + 11;

  // Row 1 — Holder | Organizer
  drawLabel(pdf, "HOLDER", colLeftX, rowY);
  drawValue(pdf, `${data.buyerFirstName} ${data.buyerLastName}`.trim(), colLeftX, rowY + 5.5, { size: 13, weight: "bold" });
  if (data.buyerEmail) {
    drawValueMuted(pdf, data.buyerEmail, colLeftX, rowY + 11);
  }

  drawLabel(pdf, "ORGANIZER", colRightX, rowY);
  drawValue(pdf, data.organizerName, colRightX, rowY + 5.5, { size: 13, weight: "bold" });

  rowY += 18;

  // Row 2 — Ticket Type | Price Paid
  drawLabel(pdf, "TICKET TYPE", colLeftX, rowY);
  drawValue(pdf, data.ticketType, colLeftX, rowY + 5.5, { size: 12, weight: "bold" });

  drawLabel(pdf, "PRICE PAID", colRightX, rowY);
  // Price gets the brand colour so the buyer's eye lands on it instantly
  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(data.pricePaid, colRightX, rowY + 5.5);

  rowY += 14;

  // Row 3 — Ticket Number (single column, full width)
  drawLabel(pdf, "TICKET NUMBER", colLeftX, rowY);
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(12);
  pdf.text(data.ticketId, colLeftX, rowY + 5.5);

  // ── 5. QR CARD ───────────────────────────────────────────────────────
  // Soft-grey background panel that the QR card sits on. Visually breaks
  // the QR section from the body and adds a "this is the actionable bit"
  // emphasis without using any colour.
  pdf.setFillColor(C_BG_SOFT.r, C_BG_SOFT.g, C_BG_SOFT.b);
  pdf.rect(0, Y_QR, A4_W, H_QR, "F");

  const qrSize = 65;
  const qrX = (A4_W - qrSize) / 2;
  const qrY = Y_QR + 10;

  // White card around the QR with a thin slate border
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 3, 3, "FD");

  try {
    const qrPng = await generateQrPng(data.qrToken);
    pdf.addImage(qrPng, "PNG", qrX, qrY, qrSize, qrSize);
  } catch {
    pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("QR unavailable", A4_W / 2, qrY + qrSize / 2, { align: "center" });
  }

  // Caption — "Scan at entrance" + ticket ID in monospace
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Scan at entrance", A4_W / 2, qrY + qrSize + 10, { align: "center" });

  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(9);
  pdf.text(`#${data.ticketId}`, A4_W / 2, qrY + qrSize + 15.5, { align: "center" });

  // ── 6. FOOTER ────────────────────────────────────────────────────────
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, Y_FOOTER, A4_W, H_FOOTER, "F");

  // Hairline separator
  pdf.setDrawColor(C_FAINT.r, C_FAINT.g, C_FAINT.b);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, Y_FOOTER, A4_W - MARGIN_X, Y_FOOTER);

  // Security notice (3 short lines, fits without wrapping at 7.5pt)
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  const noticeLines = [
    "This ticket is personal and valid for one entry only.",
    "Screenshots or duplicate copies may be refused at the door.",
    "Photo ID may be required for age-restricted events.",
  ];
  noticeLines.forEach((line, i) => {
    pdf.text(line, MARGIN_X, Y_FOOTER + 6 + i * 3.6, {});
  });

  // Brand strip at the bottom of the footer
  const brandStripY = A4_H - 6;
  pdf.setTextColor(C_BRAND.r, C_BRAND.g, C_BRAND.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("POWERED BY TICKET SAFE", MARGIN_X, brandStripY, { charSpace: 1.2 });

  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("ticket-safe.eu", A4_W - MARGIN_X, brandStripY, { align: "right" });

  // ── SAVE ─────────────────────────────────────────────────────────────
  const suffix =
    data.ticketIndex && data.ticketTotal && data.ticketTotal > 1
      ? `-${data.ticketIndex}of${data.ticketTotal}`
      : "";
  pdf.save(`ticket-${safeFilename(data.eventName)}${suffix}.pdf`);
}

// ──────────────────────────────────────────────────────────────────────────
//  SMALL HELPERS  (label / value / pill)
// ──────────────────────────────────────────────────────────────────────────

function drawLabel(pdf: JsPDFLike, text: string, x: number, y: number) {
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text(text, x, y, { charSpace: 1.0 });
}
function drawValue(
  pdf: JsPDFLike,
  text: string,
  x: number,
  y: number,
  opts: { size: number; weight: "bold" | "normal" },
) {
  pdf.setTextColor(C_INK.r, C_INK.g, C_INK.b);
  pdf.setFont("helvetica", opts.weight);
  pdf.setFontSize(opts.size);
  pdf.text(text, x, y);
}
function drawValueMuted(pdf: JsPDFLike, text: string, x: number, y: number) {
  pdf.setTextColor(C_MUTED.r, C_MUTED.g, C_MUTED.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(text, x, y);
}

/**
 * Draws a rounded "pill" badge with custom bg + fg and returns the X
 * coordinate just past the pill, so the caller can chain pills horizontally.
 */
function drawPill(
  pdf: JsPDFLike,
  x: number,
  y: number,
  label: string,
  colour: { bg: { r: number; g: number; b: number }; fg: { r: number; g: number; b: number } },
): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  const padX = 3;
  const padY = 1.5;
  const w = pdf.getTextWidth(label) + padX * 2;
  const h = 5.5;
  pdf.setFillColor(colour.bg.r, colour.bg.g, colour.bg.b);
  pdf.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  pdf.setTextColor(colour.fg.r, colour.fg.g, colour.fg.b);
  pdf.text(label, x + padX, y + h - padY, { charSpace: 0.6 });
  return x + w;
}

// ──────────────────────────────────────────────────────────────────────────
//  BACKWARD-COMPAT WRAPPER
// ──────────────────────────────────────────────────────────────────────────

/**
 * The old call site uses this name + an older payload shape (pre-QR-token,
 * accepted an SVG blob URL). Keep it working by mapping into the new
 * generateTicketPDF, so MyTickets.tsx doesn't have to change immediately.
 *
 * @deprecated Prefer generateTicketPDF(TicketData) for new code.
 */
export interface TicketPdfInput {
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  eventLogoUrl: string | null;
  tierName: string | null;
  holderName: string;
  holderEmail: string | null;
  ticketId: string;
  orderId: string;
  ticketIndex: number;
  ticketTotal: number;
  /** A blob: URL pointing at a pre-rendered SVG OR a raw token that
   *  the new renderer will encode itself. */
  qrSvgUrl: string;
  /** Optional new fields the caller may already know. */
  qrToken?: string;
  pricePaid?: string;
  organizerName?: string;
  status?: "Valid" | "Used" | "Cancelled";
}

export async function downloadTicketPdf(input: TicketPdfInput): Promise<void> {
  // Split "First Last" into the two new fields. Falls back gracefully on
  // single-word names.
  const parts = input.holderName.trim().split(/\s+/);
  const buyerFirstName = parts[0] ?? "";
  const buyerLastName  = parts.slice(1).join(" ");

  // When the legacy caller has only the SVG blob URL, fall back to a
  // verify-URL payload built from the short ticket ID. The QR scanner
  // already knows how to interpret either shape (token or URL).
  const qrToken =
    input.qrToken
    ?? (input.qrSvgUrl.startsWith("blob:") ? `https://ticket-safe.eu/verify/${input.ticketId}` : input.qrSvgUrl);

  await generateTicketPDF({
    eventName: input.eventTitle,
    eventDate: input.eventDate,
    eventLocation: input.eventLocation ?? "",
    eventImageUrl: null, // legacy callers don't have the banner URL
    organizerName: input.organizerName ?? "Ticket Safe",
    buyerFirstName,
    buyerLastName,
    buyerEmail: input.holderEmail,
    ticketType: input.tierName ?? "Standard",
    pricePaid: input.pricePaid ?? "—",
    ticketId: input.ticketId.slice(0, 12).toUpperCase(),
    qrToken,
    status: input.status ?? "Valid",
    ticketIndex: input.ticketIndex,
    ticketTotal: input.ticketTotal,
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  EXAMPLE — handy for quick previews and tests
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fake-data payload that exercises every field of the layout. Call:
 *
 *   import { generateExampleTicket } from "@/lib/ticketPdf";
 *   await generateExampleTicket();
 *
 * …from a dev console to download a fully-populated demo PDF.
 */
export const EXAMPLE_TICKET: TicketData = {
  eventName: "ESCP Opening Party",
  eventDate: "2026-09-19T22:30:00.000Z",
  eventLocation: "Le Duplex, Paris",
  eventImageUrl: null,
  organizerName: "ESCP Students' Union",
  buyerFirstName: "Achille",
  buyerLastName: "Quinquenel",
  buyerEmail: "achille@edu.escp.eu",
  ticketType: "Early Bird",
  pricePaid: "18.00€",
  ticketId: "TS-ESC-000184",
  qrToken: "https://ticket-safe.eu/verify/unique-secure-token-here",
  status: "Valid",
};

export async function generateExampleTicket(): Promise<void> {
  await generateTicketPDF(EXAMPLE_TICKET);
}
