/**
 * Server-side ticket PDF renderer for Ticket Safe — Deno-native.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ROOT CAUSE of the "blank page" bug (found by rendering to PNG and
 *  comparing pdf-lib's font-subsetting path against a non-subsetted embed):
 *
 *  `pdf.embedFont(bytes, { subset: true })` on Inter-Regular.ttf /
 *  Inter-Bold.ttf (2871 glyphs each) corrupts text layout — most letters
 *  draw as the WRONG glyph or nothing at all ("BILLET OFFICIEL" came out as
 *  "ILLE" / "ICIEL", full sentences reduced to 2-3 stray characters). This
 *  is a pdf-lib 1.17.1 + @pdf-lib/fontkit subsetting bug that only shows up
 *  on fonts with enough glyphs to need multi-byte glyph IDs — it did NOT
 *  reproduce on InstrumentSans-Bold.ttf (only 375 glyphs), which is exactly
 *  why the previous version "mostly" worked (display text in Instrument
 *  Sans looked fine) while body/label text in Inter came out as a sparse
 *  handful of surviving characters on an otherwise near-empty-looking page.
 *  Confirmed fix: embed with `subset: false` (full font embedded — the
 *  file is bigger, Inter is ~325KB, acceptable for a 1-page ticket PDF).
 *
 *  Secondary, unrelated hardening added while fixing this: Inter/Instrument
 *  Sans don't carry CJK or other exotic-script glyphs. pdf-lib does NOT
 *  throw for a missing glyph (verified empirically) — it silently draws the
 *  .notdef tofu-box glyph instead. Every string drawn on the ticket is now
 *  pre-filtered against each font's real characterSet (parsed via raw
 *  fontkit, not pdf-lib's wrapper — pdf-lib's own measurement calls don't
 *  throw on unsupported codepoints either, so they can't detect this) and
 *  falls back to "—" rather than rendering boxes for a name in an
 *  unsupported script.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Stack: pdf-lib (pure JS, runs in Deno) + @pdf-lib/fontkit (custom TTF
 * embedding) + qrcode (esm.sh) — no Chromium, no canvas, no client APIs.
 *
 * Design: phone-card portrait (400×800pt — NOT A4), navy page background,
 * a centered card one surface tone lighter, zero border-radius throughout.
 * Real site tokens (matches _shared/emailTokens.ts). Event photo in the
 * hero banner when available, a flat accent-tinted block otherwise — never
 * a gradient. Perforation notch between the info grid and the QR block.
 *
 * QR payload is untouched: still `d.qrToken` encoded as-is, same
 * error-correction level. Check-in scanning is unaffected by this redesign
 * — see the final summary for the exact payload contract validate-scan
 * expects.
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

  /** Event's own banner photo (absolute URL). Flat tinted block if absent. */
  eventImageUrl?: string | null;

  buyerFirstName: string;
  buyerLastName: string;
  buyerEmail?: string | null;

  ticketType: string;
  pricePaid: string;
  ticketId: string;
  /** Human order reference, e.g. "TS-A1B2C3D4". */
  orderNumber?: string;
  qrToken: string;
  /** Kept for API compatibility with existing callers — not drawn on the
   *  card (not part of the current design spec), but harmless to pass. */
  status?: "Valid" | "Used" | "Cancelled";
  /** When the ticket was actually issued (order paid/confirmed), so a
   *  later "resend email" doesn't show today's date as the issue date.
   *  Falls back to the generation time if omitted. */
  issuedAt?: string;

  ticketIndex?: number;
  ticketTotal?: number;
}

// ── PALETTE — matches supabase/functions/_shared/emailTokens.ts exactly ──

const PAGE_BG       = rgb(26 / 255, 39 / 255, 68 / 255);     // #1a2744 — brandNavy
const CARD_BG       = rgb(36 / 255, 52 / 255, 90 / 255);     // #24345a — one step lighter
const DIVIDER       = rgb(53 / 255, 74 / 255, 114 / 255);    // rgba(147,197,253,.15) composited over card bg
const ACCENT        = rgb(58 / 255, 95 / 255, 230 / 255);    // #3a5fe6
const ACCENT_LIGHT  = rgb(174 / 255, 198 / 255, 255 / 255);  // #aec6ff — labels, small caps
const TEXT_MUTED    = rgb(159 / 255, 176 / 255, 204 / 255);  // #9fb0cc — secondary text on dark bg
const WHITE         = rgb(1, 1, 1);
const IMG_FALLBACK  = ACCENT;

// ── PAGE GEOMETRY — phone-card portrait, not A4 ───────────────────────────

const PAGE_W = 400;
const PAGE_H = 800;
const CARD_MARGIN = 16;
const CARD_X = CARD_MARGIN;
const CARD_Y = CARD_MARGIN;
const CARD_W = PAGE_W - CARD_MARGIN * 2;
const CARD_H = PAGE_H - CARD_MARGIN * 2;
const PAD = 20;

// ── GLYPH-SAFE TEXT DRAWING ────────────────────────────────────────────────

interface Fonts {
  body: PDFFont & { supportedCodepoints?: Set<number> };
  bodyBold: PDFFont & { supportedCodepoints?: Set<number> };
  display: PDFFont & { supportedCodepoints?: Set<number> };
  mono: PDFFont & { supportedCodepoints?: Set<number> };
}

/** Returns null when every character is already supported (no-op fast path
 *  — keeps whitespace untouched so it never masquerades as truncation). */
function sanitizeForFont(font: Fonts["body"], text: string): string | null {
  if (!font.supportedCodepoints) return null;
  let changed = false;
  const kept = Array.from(text).filter((ch) => {
    const ok = font.supportedCodepoints!.has(ch.codePointAt(0)!);
    if (!ok) changed = true;
    return ok;
  });
  if (!changed) return null;
  return kept.join("").replace(/\s+/g, " ").trim();
}

interface TextOpts {
  x: number;
  y: number;
  font: Fonts["body"];
  size: number;
  color: ReturnType<typeof rgb>;
  letterSpacing?: number;
  anchor?: "left" | "right" | "center";
  maxWidth?: number;
}

function drawText(page: PDFPage, text: string, o: TextOpts) {
  let t = String(text ?? "");
  const sanitized = sanitizeForFont(o.font, t);
  if (sanitized !== null) t = sanitized || "—";
  if (o.maxWidth) {
    const beforeTruncate = t;
    while (o.font.widthOfTextAtSize(t, o.size) > o.maxWidth && t.length > 4) t = t.slice(0, -2);
    if (t !== beforeTruncate) t = t.slice(0, -1) + "…";
  }
  const place = (str: string) => {
    let x = o.x;
    if (o.anchor === "right") x = o.x - o.font.widthOfTextAtSize(str, o.size);
    else if (o.anchor === "center") x = o.x - o.font.widthOfTextAtSize(str, o.size) / 2;
    page.drawText(str, {
      x, y: o.y, font: o.font, size: o.size, color: o.color,
      ...(o.letterSpacing ? { characterSpacing: o.letterSpacing } : {}),
    });
  };
  try {
    place(t);
  } catch (err) {
    console.warn("[ticketPdfServer] draw failed, sanitizing:", err);
    const safe = sanitizeForFont(o.font, t) || "—";
    try { place(safe); } catch (err2) { console.warn("[ticketPdfServer] sanitized draw still failed, skipping:", err2); }
  }
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: Fonts["body"]) {
  drawText(page, text, { x, y, font, size: 9, color: ACCENT_LIGHT, letterSpacing: 1.2 });
}

// ── FONT LOADING ──────────────────────────────────────────────────────────

function attachCharacterSet(pdfFont: PDFFont, rawBytes: Uint8Array): Fonts["body"] {
  const raw = fontkit.create(rawBytes);
  (pdfFont as Fonts["body"]).supportedCodepoints = new Set(raw.characterSet);
  return pdfFont as Fonts["body"];
}

/** Loads the real site fonts (bundled as TTF files next to this module —
 *  see _shared/fonts/). `subset: false` is load-bearing — see the root
 *  cause note at the top of this file; do not re-enable subsetting on
 *  Inter without re-testing against a PNG render first.
 *
 *  Falls back to pdf-lib's built-in Helvetica if the bundled TTFs don't
 *  resolve at runtime (e.g. a deploy that doesn't bundle the fonts/
 *  directory) — StandardFonts use simple WinAnsi encoding, not the
 *  fontkit/CID path that caused the subsetting bug, so this fallback
 *  can't reintroduce it. Degrades the look, never breaks ticket delivery. */
async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  try {
    const [interReg, interBold, instrumentBold] = await Promise.all([
      Deno.readFile(new URL("./fonts/Inter-Regular.ttf", import.meta.url)),
      Deno.readFile(new URL("./fonts/Inter-Bold.ttf", import.meta.url)),
      Deno.readFile(new URL("./fonts/InstrumentSans-Bold.ttf", import.meta.url)),
    ]);
    const [bodyFont, boldFont, displayFont] = await Promise.all([
      pdf.embedFont(interReg, { subset: false }),
      pdf.embedFont(interBold, { subset: false }),
      pdf.embedFont(instrumentBold, { subset: false }),
    ]);
    attachCharacterSet(bodyFont, interReg);
    attachCharacterSet(boldFont, interBold);
    attachCharacterSet(displayFont, instrumentBold);
    return {
      body: bodyFont as Fonts["body"],
      bodyBold: boldFont as Fonts["body"],
      display: displayFont as Fonts["body"],
      // Reuses the already-embedded body font rather than a second embedFont
      // call on the same bytes — one fewer font object for the same result
      // (Inter Regular reads fine for the short ticket/order IDs used here).
      mono: bodyFont as Fonts["body"],
    };
  } catch (err) {
    console.error("[ticketPdfServer] bundled font load failed, falling back to Helvetica:", err);
    const fallback = await pdf.embedFont(StandardFonts.Helvetica);
    const fallbackBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    return { body: fallback, bodyBold: fallbackBold, display: fallbackBold, mono: fallback };
  }
}

// ── PUBLIC ENTRY POINTS ───────────────────────────────────────────────────

export async function generateTicketPDFServer(t: ServerTicketData): Promise<Uint8Array> {
  return generateTicketsPDFServer([t]);
}

/** Render N tickets as an N-page PDF (one ticket per page). */
export async function generateTicketsPDFServer(tickets: ServerTicketData[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  for (const data of tickets) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    await drawTicketPage(pdf, page, data, fonts);
  }
  return pdf.save();
}

// ── IMAGE FETCH (best-effort — flat tinted fallback on any failure) ──────

async function tryEmbedEventImage(pdf: PDFDocument, url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("png")) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch (err) {
    console.warn("[ticketPdfServer] event image fetch/embed failed, using flat fallback:", err);
    return null;
  }
}

function formatDateTime(d: ServerTicketData): { dateLine: string; timeLine: string } {
  const parsed = new Date(d.eventDate);
  const isISO = !isNaN(parsed.getTime());
  if (!isISO) return { dateLine: d.eventDate, timeLine: d.eventTime ?? "" };
  return {
    dateLine: parsed.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    timeLine: d.eventTime ?? parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── PAGE DRAWER ───────────────────────────────────────────────────────────

async function drawTicketPage(pdfDoc: PDFDocument, page: PDFPage, d: ServerTicketData, fonts: Fonts): Promise<void> {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAGE_BG });
  page.drawRectangle({ x: CARD_X, y: CARD_Y, width: CARD_W, height: CARD_H, color: CARD_BG });

  const top = (fromCardTop: number) => PAGE_H - CARD_Y - fromCardTop;
  let cy = 0;

  // ── Header: logo left, "BILLET OFFICIEL" right ──
  cy += 28;
  const markSize = 20;
  page.drawRectangle({ x: CARD_X + PAD, y: top(cy) - markSize + 6, width: markSize, height: markSize, color: ACCENT });
  drawText(page, "TS", { x: CARD_X + PAD + markSize / 2, y: top(cy) - markSize / 2 - 1, font: fonts.display, size: 9, color: WHITE, anchor: "center" });
  drawText(page, "Ticket", { x: CARD_X + PAD + markSize + 8, y: top(cy) - 5, font: fonts.display, size: 14, color: WHITE });
  const tw = fonts.display.widthOfTextAtSize("Ticket", 14);
  drawText(page, "Safe", { x: CARD_X + PAD + markSize + 8 + tw, y: top(cy) - 5, font: fonts.display, size: 14, color: ACCENT_LIGHT });
  drawText(page, "BILLET OFFICIEL", { x: CARD_X + CARD_W - PAD, y: top(cy) - 5, font: fonts.bodyBold, size: 8, color: ACCENT_LIGHT, letterSpacing: 1.4, anchor: "right" });

  // ── Event image banner (or flat accent-tint block if none) ──
  cy += 20;
  const bannerH = 140;
  const bannerImage = await tryEmbedEventImage(pdfDoc, d.eventImageUrl);
  const bannerY = top(cy + bannerH);
  if (bannerImage) {
    const scale = Math.max(CARD_W / bannerImage.width, bannerH / bannerImage.height);
    const dw = bannerImage.width * scale, dh = bannerImage.height * scale;
    page.drawImage(bannerImage, { x: CARD_X + (CARD_W - dw) / 2, y: bannerY - (dh - bannerH) / 2, width: dw, height: dh });
    page.drawRectangle({ x: CARD_X, y: bannerY, width: CARD_W, height: bannerH, color: PAGE_BG, opacity: 0.25 });
  } else {
    page.drawRectangle({ x: CARD_X, y: bannerY, width: CARD_W, height: bannerH, color: IMG_FALLBACK, opacity: 0.12 });
  }
  cy += bannerH;

  // ── Event name + date/time + location ──
  cy += 28;
  drawText(page, d.eventName, { x: CARD_X + PAD, y: top(cy), font: fonts.display, size: 20, color: WHITE, maxWidth: CARD_W - 2 * PAD });
  const meta = formatDateTime(d);
  cy += 22;
  drawText(page, [meta.dateLine, meta.timeLine].filter(Boolean).join("  ·  "), { x: CARD_X + PAD, y: top(cy), font: fonts.body, size: 10.5, color: TEXT_MUTED, maxWidth: CARD_W - 2 * PAD });
  cy += 16;
  drawText(page, d.eventLocation, { x: CARD_X + PAD, y: top(cy), font: fonts.body, size: 10.5, color: TEXT_MUTED, maxWidth: CARD_W - 2 * PAD });

  // ── Divider ──
  cy += 20;
  page.drawRectangle({ x: CARD_X + PAD, y: top(cy), width: CARD_W - 2 * PAD, height: 1, color: DIVIDER });

  // ── Info grid, 2 columns ──
  const colL = CARD_X + PAD, colR = CARD_X + CARD_W / 2 + 4;
  const gridRow = (label: string, value: string, x: number) => {
    drawLabel(page, label, x, top(cy), fonts.bodyBold);
    drawText(page, value, { x, y: top(cy + 16), font: fonts.bodyBold, size: 13, color: WHITE, maxWidth: CARD_W / 2 - PAD - 10 });
  };
  cy += 26;
  gridRow("TYPE DE BILLET", d.ticketType, colL);
  gridRow("PRIX", d.pricePaid, colR);
  cy += 38;
  gridRow("TITULAIRE", `${d.buyerFirstName} ${d.buyerLastName}`.trim(), colL);
  gridRow("N° BILLET", d.ticketId.slice(0, 13), colR);
  cy += 38;
  gridRow("N° COMMANDE", d.orderNumber ?? "—", colL);
  const issuedDate = new Date(d.issuedAt ?? Date.now());
  gridRow("ÉMIS LE", issuedDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }), colR);

  // ── Perforation: dashed line + two semicircle notches ──
  cy += 32;
  const perfY = top(cy);
  page.drawLine({ start: { x: CARD_X + 10, y: perfY }, end: { x: CARD_X + CARD_W - 10, y: perfY }, thickness: 1, color: DIVIDER, dashArray: [4, 4] });
  page.drawCircle({ x: CARD_X, y: perfY, size: 9, color: PAGE_BG });
  page.drawCircle({ x: CARD_X + CARD_W, y: perfY, size: 9, color: PAGE_BG });

  // ── QR block ──
  cy += 28;
  const qrSize = 190;
  const qrPad = 14;
  const qrBoxX = CARD_X + (CARD_W - qrSize - qrPad * 2) / 2;
  page.drawRectangle({ x: qrBoxX, y: top(cy + qrSize + qrPad * 2), width: qrSize + qrPad * 2, height: qrSize + qrPad * 2, color: WHITE });
  try {
    const qrDataUrl = await QRCode.toDataURL(d.qrToken, { errorCorrectionLevel: "L", margin: 2, width: 1000, color: { dark: "#000000", light: "#FFFFFF" } });
    const qrImage = await pdfDoc.embedPng(dataUrlToBytes(qrDataUrl));
    page.drawImage(qrImage, { x: qrBoxX + qrPad, y: top(cy + qrSize + qrPad), width: qrSize, height: qrSize });
  } catch (err) {
    console.warn("[ticketPdfServer] QR render failed:", err);
    drawText(page, "QR unavailable — use ticket number at the door", { x: CARD_X + CARD_W / 2, y: top(cy + qrSize), font: fonts.body, size: 9, color: PAGE_BG, anchor: "center", maxWidth: qrSize });
  }
  cy += qrSize + qrPad * 2;

  cy += 20;
  drawText(page, d.ticketId, { x: CARD_X + CARD_W / 2, y: top(cy), font: fonts.mono, size: 10, color: WHITE, anchor: "center" });
  cy += 16;
  drawText(page, "Ce QR est unique. Il est invalidé automatiquement en cas de revente.", {
    x: CARD_X + CARD_W / 2, y: top(cy), font: fonts.body, size: 8, color: TEXT_MUTED, anchor: "center", maxWidth: CARD_W - 2 * PAD,
  });

  // ── Footer ──
  cy = CARD_H - 22;
  drawText(page, "Revente uniquement via ticket-safe.eu · Un billet = une entrée", {
    x: CARD_X + CARD_W / 2, y: top(cy), font: fonts.body, size: 8, color: TEXT_MUTED, anchor: "center", maxWidth: CARD_W - 2 * PAD,
  });

  if (d.ticketIndex && d.ticketTotal && d.ticketTotal > 1) {
    drawText(page, `${d.ticketIndex}/${d.ticketTotal}`, { x: CARD_X + CARD_W - PAD, y: PAGE_H - CARD_Y - 28 - 20, font: fonts.bodyBold, size: 9, color: ACCENT_LIGHT, anchor: "right" });
  }
}
