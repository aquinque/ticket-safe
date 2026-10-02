/**
 * generateServiceInvoicePdf(data) — TicketSafe's service-fee invoice to an
 * organizer, for the ticketing service fee collected on one event.
 *
 * This IS a tax invoice (facture) under French law — carries the
 * mandatory mentions of art. L441-9 C. com. / art. 242 nonies A ann. II
 * CGI: sequential number, issuer identity (SIREN, RCS, legal form,
 * share capital), client identity, designation, VAT breakdown (or the
 * franchise-en-base exemption mention), payment terms, late-payment
 * penalty clause. Generated exactly once per event, never edited —
 * corrections are a credit note (see generate-billing-document).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

export interface ServiceInvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  vatCents: number;
  totalHtCents: number;
  totalTtcCents: number;
}

export interface ServiceInvoiceData {
  documentNumber: string;
  issuedAt: string; // ISO
  serviceDate: string; // ISO — date de la prestation
  isCreditNote?: boolean;
  correctsDocumentNumber?: string | null;

  seller: {
    legalName: string;
    legalForm: string;
    shareCapitalCents: number;
    siren: string;
    rcsCity: string;
    addressLine1: string;
    postalCode: string;
    city: string;
    country: string;
    vatExempt: boolean;
    vatNumber: string | null;
    vatExemptMention: string;
    latePaymentPenaltyMention: string;
    supportEmail: string;
  };
  client: {
    name: string;
    siren: string | null;
    rnaNumber: string | null;
    addressLine1: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
  };

  eventTitle: string;
  lines: ServiceInvoiceLine[];
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
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

const eur = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const longDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

export async function generateServiceInvoicePdf(d: ServiceInvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_W, A4_H]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const fromTop = (mm: number) => A4_H - mm * MM;

  page.drawRectangle({ x: 0, y: A4_H - 14 * MM, width: A4_W, height: 14 * MM, color: WHITE });
  page.drawRectangle({ x: 14 * MM, y: A4_H - 14 * MM, width: A4_W - 28 * MM, height: 0.6, color: BRAND });
  text(page, "TICKET SAFE", { x: 14 * MM, y: fromTop(9), font: bold, size: 11, color: BRAND, spacing: 1.4 });
  text(page, d.isCreditNote ? "AVOIR" : "FACTURE", { x: A4_W - 14 * MM, y: fromTop(9), font: bold, size: 10, color: MUTED, spacing: 1.0, anchorRight: true });

  const title = d.isCreditNote ? "Avoir" : "Facture";
  text(page, title, { x: 14 * MM, y: fromTop(32), font: bold, size: 22, color: INK });
  text(page, d.documentNumber, { x: 14 * MM, y: fromTop(41), font: mono, size: 12, color: BRAND });
  if (d.isCreditNote && d.correctsDocumentNumber) {
    text(page, `Annule et remplace la facture ${d.correctsDocumentNumber}`, { x: 14 * MM, y: fromTop(47), font: reg, size: 9, color: MUTED });
  }

  // Doc meta, right-aligned
  const metaX = A4_W - 14 * MM;
  label(page, "DATE D'ÉMISSION", metaX, fromTop(30), bold, true);
  text(page, longDate(d.issuedAt), { x: metaX, y: fromTop(35.5), font: bold, size: 10, color: INK, anchorRight: true });
  label(page, "DATE DE LA PRESTATION", metaX, fromTop(43), bold, true);
  text(page, longDate(d.serviceDate), { x: metaX, y: fromTop(48.5), font: bold, size: 10, color: INK, anchorRight: true });

  hairline(page, 56);

  // Parties
  const colL = 14 * MM;
  const colR = 14 * MM + (A4_W - 28 * MM) * 0.5 + 6;
  label(page, "VENDEUR", colL, fromTop(65), bold);
  text(page, d.seller.legalName, { x: colL, y: fromTop(71), font: bold, size: 12, color: INK });
  text(page, d.seller.legalForm, { x: colL, y: fromTop(76), font: reg, size: 9, color: MUTED });
  text(page, `Capital social : ${eur(d.seller.shareCapitalCents)}`, { x: colL, y: fromTop(81), font: reg, size: 9, color: MUTED });
  text(page, `${d.seller.addressLine1}, ${d.seller.postalCode} ${d.seller.city}, ${d.seller.country}`, { x: colL, y: fromTop(86), font: reg, size: 9, color: MUTED, maxWidth: (A4_W - 28 * MM) * 0.5 - 6 });
  text(page, `SIREN ${d.seller.siren} · RCS ${d.seller.rcsCity}`, { x: colL, y: fromTop(91), font: reg, size: 9, color: MUTED });
  text(page, d.seller.vatExempt ? d.seller.vatExemptMention : `N° TVA intracommunautaire : ${d.seller.vatNumber ?? "—"}`, { x: colL, y: fromTop(96), font: reg, size: 8, color: MUTED, maxWidth: (A4_W - 28 * MM) * 0.5 - 6 });

  label(page, "CLIENT", colR, fromTop(65), bold);
  text(page, d.client.name, { x: colR, y: fromTop(71), font: bold, size: 12, color: INK, maxWidth: (A4_W - 28 * MM) * 0.5 - 6 });
  let cy = 76;
  if (d.client.siren) {
    text(page, `SIREN ${d.client.siren}`, { x: colR, y: fromTop(cy), font: reg, size: 9, color: MUTED });
    cy += 5;
  } else if (d.client.rnaNumber) {
    text(page, `RNA ${d.client.rnaNumber}`, { x: colR, y: fromTop(cy), font: reg, size: 9, color: MUTED });
    cy += 5;
  }
  if (d.client.addressLine1) {
    text(page, `${d.client.addressLine1}, ${d.client.postalCode ?? ""} ${d.client.city ?? ""}`, { x: colR, y: fromTop(cy), font: reg, size: 9, color: MUTED, maxWidth: (A4_W - 28 * MM) * 0.5 - 6 });
  }

  hairline(page, 104);

  // Line items
  let y = 114;
  const colDesc = colL, colQty = 112 * MM, colUnit = 135 * MM, colVat = 162 * MM, colTotal = A4_W - 14 * MM;
  text(page, "DÉSIGNATION", { x: colDesc, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 0.8 });
  text(page, "QTÉ", { x: colQty, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 0.8 });
  text(page, "PU HT", { x: colUnit, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 0.8 });
  text(page, "TVA", { x: colVat, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 0.8 });
  text(page, "TOTAL TTC", { x: colTotal, y: fromTop(y), font: bold, size: 8, color: MUTED, spacing: 0.8, anchorRight: true });
  y += 4;
  hairline(page, y);
  y += 8;
  for (const l of d.lines) {
    text(page, l.description, { x: colDesc, y: fromTop(y), font: reg, size: 10, color: INK, maxWidth: colQty - colDesc - 4 });
    text(page, String(l.quantity), { x: colQty, y: fromTop(y), font: reg, size: 10, color: INK });
    text(page, eur(l.unitPriceCents), { x: colUnit, y: fromTop(y), font: reg, size: 10, color: INK });
    text(page, l.vatRateBps > 0 ? `${(l.vatRateBps / 100).toFixed(0)}%` : "—", { x: colVat, y: fromTop(y), font: reg, size: 10, color: INK });
    text(page, eur(l.totalTtcCents), { x: colTotal, y: fromTop(y), font: bold, size: 10, color: INK, anchorRight: true });
    y += 8;
  }

  y += 4;
  hairline(page, y);
  y += 10;

  // Totals box
  page.drawRectangle({ x: 14 * MM, y: A4_H - (y + 38) * MM, width: A4_W - 28 * MM, height: 38 * MM, color: SOFT, borderColor: HAIR, borderWidth: 0.4 });
  const sx1 = 14 * MM + 6 * MM, sx2 = A4_W - 14 * MM - 6 * MM;
  const row = (n: number, l: string, v: string, big = false) => {
    const ly = y + 8 + n * 8;
    text(page, l, { x: sx1, y: fromTop(ly), font: reg, size: big ? 11 : 10, color: big ? INK : MUTED });
    text(page, v, { x: sx2, y: fromTop(ly), font: bold, size: big ? 14 : 10, color: big ? BRAND : INK, anchorRight: true });
  };
  row(0, "Total HT", eur(d.totalHtCents));
  row(1, d.seller.vatExempt ? "TVA" : "TVA (20%)", d.seller.vatExempt ? "non applicable" : eur(d.totalVatCents));
  row(2, "Total TTC", eur(d.totalTtcCents), true);

  y += 46;

  // Payment terms
  label(page, "CONDITIONS DE PAIEMENT", colL, fromTop(y), bold);
  y += 6;
  text(page, "Montant déduit directement du reversement effectué à l'organisateur (compensation). Aucun paiement séparé n'est requis.", { x: colL, y: fromTop(y), font: reg, size: 9, color: MUTED, maxWidth: A4_W - 28 * MM });
  y += 10;
  text(page, d.seller.latePaymentPenaltyMention, { x: colL, y: fromTop(y), font: reg, size: 7.5, color: MUTED, maxWidth: A4_W - 28 * MM });

  // Footer
  const footY = 278;
  hairline(page, footY);
  text(page, "TICKET SAFE", { x: 14 * MM, y: fromTop(footY + 7), font: bold, size: 8, color: BRAND, spacing: 1.2 });
  text(page, d.seller.supportEmail, { x: A4_W - 14 * MM, y: fromTop(footY + 7), font: reg, size: 8, color: MUTED, anchorRight: true });

  return await pdf.save();
}

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
function label(page: PDFPage, t: string, x: number, y: number, font: PDFFont, anchorRight = false) {
  const size = 8;
  const dx = anchorRight ? x - font.widthOfTextAtSize(t, size) : x;
  page.drawText(t, { x: dx, y, font, size, color: MUTED, characterSpacing: 1.1 });
}
function hairline(page: PDFPage, atTopMM: number) {
  page.drawRectangle({ x: 14 * MM, y: A4_H - atTopMM * MM, width: A4_W - 28 * MM, height: 0.3, color: HAIR });
}
