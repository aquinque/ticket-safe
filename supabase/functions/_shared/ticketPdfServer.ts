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
 * Design: phone-card portrait (400×640pt — NOT A4), navy page background and
 * a white ticket card, like the confirmation email's ticket and the site's
 * (src/components/tickets/TicketPass.tsx): event photo (or its title on its
 * colour), black strip with date and venue, NAME / TICKET, QR, reference.
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
  /** Event's colour ("#e8613c"), behind the title when there is no photo. */
  eventAccent?: string | null;
  /** "SAT 14 DEC · 23:00", already in the event's time zone; worked out from eventDate (Paris) if absent. */
  stripText?: string;

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
const ACCENT        = rgb(58 / 255, 95 / 255, 230 / 255);    // #3a5fe6
const ACCENT_LIGHT  = rgb(174 / 255, 198 / 255, 255 / 255);  // #aec6ff — labels, small caps
const TEXT_MUTED    = rgb(159 / 255, 176 / 255, 204 / 255);  // #9fb0cc — secondary text on dark bg
const WHITE         = rgb(1, 1, 1);

// ── PAGE GEOMETRY — phone-card portrait, not A4 ───────────────────────────

const PAGE_W = 400;
const PAGE_H = 640;

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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? dataUrl;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── PAGE DRAWER ───────────────────────────────────────────────────────────
//
// The ticket drawn like the email's ticket card and the site's (src/components/tickets/TicketPass.tsx):
// a white card on the navy page — the event's photo (or its title on its colour), a black strip with the
// date and the venue, NAME and TICKET, the QR and its reference.

const INK = rgb(15 / 255, 23 / 255, 42 / 255);          // #0f172a
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);     // #64748b
const RULE = rgb(226 / 255, 232 / 255, 240 / 255);      // #e2e8f0
const STRIP = rgb(11 / 255, 11 / 255, 15 / 255);        // #0b0b0f

function hexColor(hex: string | null | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return ACCENT;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function stripFromDate(d: ServerTicketData): string {
  if (d.stripText) return d.stripText;
  const parsed = new Date(d.eventDate);
  if (isNaN(parsed.getTime())) return d.eventDate.toUpperCase();
  const day = parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Paris" }).replace(/,/g, "");
  const time = parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return `${day} · ${time}`.toUpperCase();
}

const ticketRef = (id: string) => `TS-${id.slice(0, 4).toUpperCase()}-${id.slice(-4).toUpperCase()}`;

async function drawTicketPage(pdfDoc: PDFDocument, page: PDFPage, d: ServerTicketData, fonts: Fonts): Promise<void> {
  const X = 20;
  const W = PAGE_W - 40;
  const PADX = 16;

  // The event's picture is shown whole: a flyer carries its own title and date, so nothing is cropped
  // off. Its box takes the picture's own height (between a wide strip and a tall flyer) and the page
  // grows by what the box gains over the strip.
  const bannerImage = await tryEmbedEventImage(pdfDoc, d.eventImageUrl);
  const stripBannerH = Math.round(W / 2.35);
  const bannerH = bannerImage
    ? Math.round(Math.min(Math.max((W * bannerImage.height) / bannerImage.width, stripBannerH), 440))
    : stripBannerH;
  const pageH = PAGE_H + (bannerH - stripBannerH);
  page.setSize(PAGE_W, pageH);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: pageH, color: PAGE_BG });
  const at = (fromTop: number) => pageH - fromTop; // page y from a distance below the page's top

  const stripH = 26;
  const infoH = 62;
  const qrSize = 210;
  const qrBlockH = 24 + qrSize + 18 + 14 + 26;
  const cardTop = 52;
  const cardH = bannerH + stripH + infoH + qrBlockH;
  const bannerY = at(cardTop + bannerH);

  // ── Picture (fitted inside its box, on the strip's black), or the event's colour with its title ──
  if (bannerImage) {
    page.drawRectangle({ x: X, y: bannerY, width: W, height: bannerH, color: STRIP });
    const scale = Math.min(W / bannerImage.width, bannerH / bannerImage.height);
    const dw = bannerImage.width * scale;
    const dh = bannerImage.height * scale;
    page.drawImage(bannerImage, { x: X + (W - dw) / 2, y: bannerY + (bannerH - dh) / 2, width: dw, height: dh });
  } else {
    page.drawRectangle({ x: X, y: bannerY, width: W, height: bannerH, color: hexColor(d.eventAccent) });
    drawText(page, "TICKETSAFE", { x: X + PADX, y: bannerY + 50, font: fonts.bodyBold, size: 7.5, color: WHITE, letterSpacing: 1.6 });
    drawText(page, d.eventName.toUpperCase(), { x: X + PADX, y: bannerY + 20, font: fonts.display, size: 24, color: WHITE, maxWidth: W - 2 * PADX });
  }
  // The rest of the card, white.
  page.drawRectangle({ x: X, y: at(cardTop + cardH), width: W, height: cardH - bannerH, color: WHITE });

  // ── Above the card: brand and position in the order ──
  drawText(page, "Ticket", { x: X, y: at(34), font: fonts.display, size: 14, color: WHITE });
  const tw = fonts.display.widthOfTextAtSize("Ticket", 14);
  drawText(page, "Safe", { x: X + tw, y: at(34), font: fonts.display, size: 14, color: ACCENT_LIGHT });
  if (d.ticketIndex && d.ticketTotal && d.ticketTotal > 1) {
    drawText(page, `TICKET ${d.ticketIndex} OF ${d.ticketTotal}`, { x: X + W, y: at(33), font: fonts.bodyBold, size: 8, color: ACCENT_LIGHT, letterSpacing: 1.2, anchor: "right" });
  }

  // ── Black strip: when, where ──
  const stripY = at(cardTop + bannerH + stripH);
  page.drawRectangle({ x: X, y: stripY, width: W, height: stripH, color: STRIP });
  const stripText = stripFromDate(d);
  drawText(page, stripText, { x: X + PADX, y: stripY + 9, font: fonts.bodyBold, size: 8.5, color: WHITE, letterSpacing: 1 });
  const usedLeft = fonts.bodyBold.widthOfTextAtSize(stripText, 8.5) + stripText.length * 1 + 20;
  drawText(page, (d.eventLocation ?? "").toUpperCase(), { x: X + W - PADX, y: stripY + 9, font: fonts.bodyBold, size: 8.5, color: WHITE, letterSpacing: 1, anchor: "right", maxWidth: Math.max(60, W - 2 * PADX - usedLeft) });

  // ── Name, ticket ──
  const infoTop = cardTop + bannerH + stripH;
  const colL = X + PADX;
  const colR = X + W / 2 + 6;
  const colW = W / 2 - PADX - 8;
  drawText(page, "NAME", { x: colL, y: at(infoTop + 22), font: fonts.bodyBold, size: 7.5, color: SLATE, letterSpacing: 1.1 });
  drawText(page, "TICKET", { x: colR, y: at(infoTop + 22), font: fonts.bodyBold, size: 7.5, color: SLATE, letterSpacing: 1.1 });
  drawText(page, `${d.buyerFirstName} ${d.buyerLastName}`.trim() || "—", { x: colL, y: at(infoTop + 42), font: fonts.bodyBold, size: 12.5, color: INK, maxWidth: colW });
  // Tier and price on one line when they fit; otherwise the price goes under, so it is never cut off.
  const ticketLine = [d.ticketType, d.pricePaid].filter(Boolean).join(" · ") || "—";
  if (!d.pricePaid || fonts.bodyBold.widthOfTextAtSize(ticketLine, 12.5) <= colW) {
    drawText(page, ticketLine, { x: colR, y: at(infoTop + 42), font: fonts.bodyBold, size: 12.5, color: INK, maxWidth: colW });
  } else {
    drawText(page, d.ticketType || "—", { x: colR, y: at(infoTop + 39), font: fonts.bodyBold, size: 11.5, color: INK, maxWidth: colW });
    drawText(page, d.pricePaid, { x: colR, y: at(infoTop + 54), font: fonts.bodyBold, size: 11.5, color: INK, maxWidth: colW });
  }
  page.drawRectangle({ x: X, y: at(infoTop + infoH), width: W, height: 1, color: RULE });

  // ── QR and reference ──
  const qrTop = infoTop + infoH + 24;
  const qrX = X + (W - qrSize) / 2;
  try {
    const qrDataUrl = await QRCode.toDataURL(d.qrToken, { errorCorrectionLevel: "L", margin: 1, width: 1000, color: { dark: "#000000", light: "#FFFFFF" } });
    const qrImage = await pdfDoc.embedPng(dataUrlToBytes(qrDataUrl));
    page.drawImage(qrImage, { x: qrX, y: at(qrTop + qrSize), width: qrSize, height: qrSize });
  } catch (err) {
    console.warn("[ticketPdfServer] QR render failed:", err);
    drawText(page, "QR unavailable — show the reference at the door", { x: X + W / 2, y: at(qrTop + qrSize / 2), font: fonts.body, size: 9, color: SLATE, anchor: "center", maxWidth: qrSize });
  }
  drawText(page, ticketRef(d.ticketId), { x: X + W / 2, y: at(qrTop + qrSize + 18), font: fonts.mono, size: 9, color: SLATE, letterSpacing: 1.2, anchor: "center" });
  drawText(page, "Single-use · checked at the door · cancelled automatically if resold", { x: X + W / 2, y: at(qrTop + qrSize + 34), font: fonts.body, size: 7.5, color: SLATE, anchor: "center", maxWidth: W - 2 * PADX });

  // ── Under the card ──
  const below = cardTop + cardH + 22;
  drawText(page, `${d.organizerName ? `${d.organizerName} · ` : ""}${d.orderNumber ? `Order ${d.orderNumber} · ` : ""}ticket-safe.eu`, {
    x: PAGE_W / 2, y: at(below), font: fonts.body, size: 8, color: TEXT_MUTED, anchor: "center", maxWidth: PAGE_W - 40,
  });
}
