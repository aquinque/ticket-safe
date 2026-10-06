/**
 * generateSalesStatementPdf(data) — "relevé de ventes" / reddition de
 * comptes: TicketSafe acting as the organizer's mandataire reports what
 * was sold, refunded, and reversed for ONE event.
 *
 * This is NOT a tax invoice — no VAT lines, no legal numbering requirement.
 * It can legitimately be regenerated (and its stored file overwritten)
 * while status === "provisoire"; once "definitif" the caller never
 * regenerates it again (enforced by the DB immutability trigger too).
 *
 * Same rendering stack as _shared/orderSummaryPdf.ts (pdf-lib, no DOM/
 * canvas — works in Deno).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

export interface SalesStatementData {
  documentNumber: string;
  status: "provisoire" | "definitif";
  issuedAt: string; // ISO
  periodStart: string | null; // ISO
  periodEnd: string | null; // ISO

  ticketSafe: {
    legalName: string;
    addressLine1: string;
    postalCode: string;
    city: string;
    country: string;
    supportEmail: string;
  };
  organizer: {
    name: string;
    siren: string | null;
    rnaNumber: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
  };
  event: { title: string; date: string; location: string | null };

  tierBreakdown: { name: string; soldQty: number; unitPriceCents: number; totalCents: number }[];
  grossCents: number;
  ticketSafeFeeCents: number;
  netCents: number;
  refundCount: number;
  refundCents: number;
  resaleCount: number;
  resaleGrossCents: number;
  resaleFeeCents: number;
}

const A4_W = 595.28;
const A4_H = 841.89;
const MM = 2.834645669;

const BRAND = rgb(0, 0.2, 0.6);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const HAIR = rgb(0.88, 0.91, 0.94);
const SOFT = rgb(0.97, 0.98, 0.99);
const WHITE = rgb(1, 1, 1);
const AMBER_BG = rgb(1, 0.96, 0.87);
const AMBER_FG = rgb(0.57, 0.36, 0.04);
const GREEN_BG = rgb(0.86, 0.95, 0.89);
const GREEN_FG = rgb(0.04, 0.45, 0.24);

const eur = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const longDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

export async function generateSalesStatementPdf(d: SalesStatementData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fromTop = (mm: number) => A4_H - mm * MM;

  // Header band
  page.drawRectangle({ x: 0, y: A4_H - 14 * MM, width: A4_W, height: 14 * MM, color: WHITE });
  page.drawRectangle({ x: 14 * MM, y: A4_H - 14 * MM, width: A4_W - 28 * MM, height: 0.6, color: BRAND });
  text(page, "TICKET SAFE", { x: 14 * MM, y: fromTop(9), font: bold, size: 11, color: BRAND, spacing: 1.4 });

  const pillBg = d.status === "definitif" ? GREEN_BG : AMBER_BG;
  const pillFg = d.status === "definitif" ? GREEN_FG : AMBER_FG;
  const pillLabel = d.status === "definitif" ? "DÉFINITIF" : "PROVISOIRE";
  pill(page, pillLabel, { x: A4_W - 14 * MM, y: fromTop(11), font: bold, size: 9, bg: pillBg, fg: pillFg, anchorRight: true });

  text(page, "Relevé de ventes", { x: 14 * MM, y: fromTop(34), font: bold, size: 22, color: INK });
  text(page, `${d.documentNumber} · émis le ${longDate(d.issuedAt)}`, { x: 14 * MM, y: fromTop(43), font: reg, size: 10, color: MUTED });
  text(page, `Période couverte : ${longDate(d.periodStart)} — ${longDate(d.periodEnd)}`, { x: 14 * MM, y: fromTop(49), font: reg, size: 9, color: MUTED });

  hairline(page, 58);

  // Parties
  const colL = 14 * MM;
  const colR = 14 * MM + (A4_W - 28 * MM) * 0.5 + 6;
  label(page, "TICKETSAFE — MANDATAIRE", colL, fromTop(67), bold);
  text(page, d.ticketSafe.legalName, { x: colL, y: fromTop(73), font: bold, size: 12, color: INK });
  text(page, `${d.ticketSafe.addressLine1}, ${d.ticketSafe.postalCode} ${d.ticketSafe.city}, ${d.ticketSafe.country}`, { x: colL, y: fromTop(78.5), font: reg, size: 9, color: MUTED });
  text(page, d.ticketSafe.supportEmail, { x: colL, y: fromTop(83.5), font: reg, size: 9, color: MUTED });

  label(page, "ORGANISATEUR — MANDANT", colR, fromTop(67), bold);
  text(page, d.organizer.name, { x: colR, y: fromTop(73), font: bold, size: 12, color: INK, maxWidth: (A4_W - 28 * MM) * 0.5 - 6 });
  let orgY = 78.5;
  if (d.organizer.siren) {
    text(page, `SIREN ${d.organizer.siren}`, { x: colR, y: fromTop(orgY), font: reg, size: 9, color: MUTED });
    orgY += 5.5;
  } else if (d.organizer.rnaNumber) {
    text(page, `RNA ${d.organizer.rnaNumber}`, { x: colR, y: fromTop(orgY), font: reg, size: 9, color: MUTED });
    orgY += 5.5;
  }
  if (d.organizer.addressLine1) {
    text(page, `${d.organizer.addressLine1}, ${d.organizer.postalCode ?? ""} ${d.organizer.city ?? ""}`, { x: colR, y: fromTop(orgY), font: reg, size: 9, color: MUTED });
  }

  hairline(page, 93);

  // Event
  label(page, "ÉVÉNEMENT", colL, fromTop(100), bold);
  text(page, d.event.title, { x: colL, y: fromTop(106), font: bold, size: 12, color: INK });
  text(page, `${longDate(d.event.date)}${d.event.location ? " · " + d.event.location : ""}`, { x: colL, y: fromTop(111.5), font: reg, size: 9, color: MUTED });

  hairline(page, 118);

  // Tier breakdown table
  let y = 128;
  label(page, "DÉTAIL PAR TARIF", colL, fromTop(y), bold);
  y += 8;
  const colName = colL, colQty = 100 * MM, colUnit = 125 * MM, colTotal = A4_W - 14 * MM;
  text(page, "TARIF", { x: colName, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 1.0 });
  text(page, "QTÉ", { x: colQty, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 1.0 });
  text(page, "PU TTC", { x: colUnit, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 1.0 });
  text(page, "TOTAL", { x: colTotal, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 1.0, anchorRight: true });
  y += 4;
  hairline(page, y);
  y += 7;
  for (const t of d.tierBreakdown) {
    text(page, t.name, { x: colName, y: fromTop(y), font: reg, size: 10, color: INK, maxWidth: colQty - colName - 6 });
    text(page, String(t.soldQty), { x: colQty, y: fromTop(y), font: reg, size: 10, color: INK });
    text(page, eur(t.unitPriceCents), { x: colUnit, y: fromTop(y), font: reg, size: 10, color: INK });
    text(page, eur(t.totalCents), { x: colTotal, y: fromTop(y), font: bold, size: 10, color: INK, anchorRight: true });
    y += 7;
  }
  if (d.tierBreakdown.length === 0) {
    text(page, "Aucune vente sur cet événement.", { x: colName, y: fromTop(y), font: reg, size: 10, color: MUTED });
    y += 7;
  }

  y += 3;
  hairline(page, y);
  y += 10;

  // Summary box
  page.drawRectangle({ x: 14 * MM, y: A4_H - (y + 46) * MM, width: A4_W - 28 * MM, height: 46 * MM, color: SOFT, borderColor: HAIR, borderWidth: 0.4 });
  const sx1 = 14 * MM + 6 * MM;
  const sx2 = A4_W - 14 * MM - 6 * MM;
  const row = (n: number, l: string, v: string, big = false) => {
    const ly = y + 8 + n * 7;
    text(page, l, { x: sx1, y: fromTop(ly), font: reg, size: big ? 11 : 10, color: big ? INK : MUTED });
    text(page, v, { x: sx2, y: fromTop(ly), font: bold, size: big ? 13 : 10, color: big ? BRAND : INK, anchorRight: true });
  };
  row(0, "Montant brut encaissé pour le compte de l'organisateur", eur(d.grossCents));
  row(1, "Frais de service TicketSafe (payés par les acheteurs)", `− ${eur(d.ticketSafeFeeCents)}`);
  row(2, "Remboursements / annulations", `${d.refundCount} billet(s) · ${eur(d.refundCents)}`);
  row(3, `Net reversé à l'organisateur`, eur(d.netCents), true);

  y += 54;

  // Resales (informational — no money owed to the organizer from these)
  if (d.resaleCount > 0) {
    label(page, "REVENTES SUR TICKETSAFE (INFORMATIF)", colL, fromTop(y), bold);
    y += 6;
    text(page, `${d.resaleCount} billet(s) revendus · volume ${eur(d.resaleGrossCents)} · frais TicketSafe perçus sur la revente ${eur(d.resaleFeeCents)}`, { x: colL, y: fromTop(y), font: reg, size: 9, color: MUTED, maxWidth: A4_W - 28 * MM });
    y += 10;
  }

  // Footer
  const footY = 270;
  hairline(page, footY);
  text(page, "Ce relevé récapitule, pour le compte de l'organisateur, les ventes et remboursements de cet événement. Il ne constitue pas une facture.", { x: 14 * MM, y: fromTop(footY + 7), font: reg, size: 8.5, color: MUTED, maxWidth: A4_W - 28 * MM });
  text(page, "TICKET SAFE", { x: 14 * MM, y: fromTop(footY + 18), font: bold, size: 8, color: BRAND, spacing: 1.2 });
  text(page, "ticket-safe.eu", { x: A4_W - 14 * MM, y: fromTop(footY + 18), font: reg, size: 8, color: MUTED, anchorRight: true });

  return await pdf.save();
}

// ── drawing helpers (self-contained, mirrors _shared/orderSummaryPdf.ts) ──
function text(
  page: PDFPage,
  t: string,
  o: { x: number; y: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; spacing?: number; anchorRight?: boolean; maxWidth?: number },
) {
  let s = t;
  if (o.maxWidth) {
    while (o.font.widthOfTextAtSize(s, o.size) > o.maxWidth && s.length > 4) s = s.slice(0, -2);
    if (s !== t) s = s.slice(0, -1) + "…";
  }
  const x = o.anchorRight ? o.x - o.font.widthOfTextAtSize(s, o.size) : o.x;
  page.drawText(s, { x, y: o.y, font: o.font, size: o.size, color: o.color, ...(o.spacing ? { characterSpacing: o.spacing } : {}) });
}
function label(page: PDFPage, t: string, x: number, y: number, font: PDFFont) {
  page.drawText(t, { x, y, font, size: 8, color: MUTED, characterSpacing: 1.1 });
}
function hairline(page: PDFPage, atTopMM: number) {
  page.drawRectangle({ x: 14 * MM, y: A4_H - atTopMM * MM, width: A4_W - 28 * MM, height: 0.3, color: HAIR });
}
function pill(page: PDFPage, label: string, o: { x: number; y: number; font: PDFFont; size: number; bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb>; anchorRight?: boolean }) {
  const padX = 8, padY = 5;
  const w = o.font.widthOfTextAtSize(label, o.size) + padX * 2;
  const h = o.size + padY * 2;
  const x = o.anchorRight ? o.x - w : o.x;
  page.drawRectangle({ x, y: o.y - h + padY, width: w, height: h, color: o.bg });
  page.drawText(label, { x: x + padX, y: o.y - h + padY + (h - o.size) / 2, font: o.font, size: o.size, color: o.fg, characterSpacing: 0.6 });
}
