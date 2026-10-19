/**
 * generateServiceInvoicePdf(data) — TicketSafe's service-fee invoice to an
 * organizer, for the ticketing service fee collected on one event.
 *
 * This IS a tax invoice (facture) under French law. It carries the mandatory
 * mentions of art. L441-9 C. com. and art. 242 nonies A annexe II CGI: sequential
 * number, issue date, date of the service, nature of the operation, TicketSafe's
 * identity (legal form, capital, SIREN, RCS, VAT number or the franchise mention),
 * the client's identity (name, address, SIREN or RNA), each line's quantity, unit
 * price excluding VAT, VAT rate and totals, the due date, the discount terms, the
 * late-payment rate and the 40 € recovery indemnity. Generated once per event and
 * never edited. A correction needs a credit note, which this module doesn't draw yet:
 * a credit note has negative amounts and its own wording, and nothing issues one.
 */
import { MARGIN_X, MM, A4_W, CONTENT_W, BRAND, INK, MUTED, Sheet, type TextStyle } from "./pdfKit.ts";
import { formatDateFr, formatEurFr, formatUnitPriceFr } from "./pdfText.ts";
import type { InvoiceLine } from "./billingRules.ts";

export interface ServiceInvoiceData {
  documentNumber: string;
  issuedAt: string; // ISO: when the number was allocated
  serviceDate: string; // ISO: the end of the event, when the service is complete

  seller: {
    legalName: string;
    legalForm: string;
    shareCapitalCents: number;
    siren: string;
    rcsCity: string;
    rcsLabel: string | null;
    addressLine1: string;
    postalCode: string;
    city: string;
    country: string;
    vatExempt: boolean;
    vatNumber: string | null;
    vatOnDebits: boolean;
    vatExemptMention: string;
    latePaymentMention: string;
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
  eventDate: string; // ISO
  lines: InvoiceLine[];
  vatRateBps: number;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
}

const x = (mm: number) => mm * MM;
const RIGHT = A4_W - MARGIN_X;
const HALF = CONTENT_W / 2 - 6;
const SMALL: TextStyle = { size: 9, color: MUTED };

// Column edges of the line table, in mm from the left of the page.
const COL = { desc: 14, descW: 92, qtyR: 112, unitR: 140, vatR: 158, totalR: 196 };

const spacedSiren = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");
const place = (line: string | null, postal: string | null, city: string | null, country: string | null) =>
  [[line, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", "), country && country !== "France" ? country : null]
    .filter(Boolean)
    .join(", ");

export async function generateServiceInvoicePdf(d: ServiceInvoiceData): Promise<Uint8Array> {
  const sheet = await Sheet.create({
    title: `Facture ${d.documentNumber}`,
    subject: `Facture de frais de service de billetterie \u2013 ${d.eventTitle}`,
    createdAt: new Date(d.issuedAt),
  });
  const s = d.seller;

  // ── Title and dates ──
  sheet.text("Facture", MARGIN_X, 32, { font: "bold", size: 22 });
  sheet.text(d.documentNumber, MARGIN_X, 41, { font: "mono", size: 12, color: BRAND });
  const meta: [string, string][] = [
    ["DATE D'ÉMISSION", formatDateFr(d.issuedAt)],
    ["DATE DE LA PRESTATION", formatDateFr(d.serviceDate)],
    ["ÉCHÉANCE", formatDateFr(d.issuedAt)],
  ];
  meta.forEach(([label, value], i) => {
    sheet.label(label, RIGHT, 24 + i * 12, "right");
    sheet.text(value, RIGHT, 29.5 + i * 12, { font: "bold", size: 10, align: "right" });
  });
  sheet.rule(58);

  // ── Parties ──
  const colR = MARGIN_X + CONTENT_W / 2 + 6;
  sheet.label("VENDEUR", MARGIN_X, 65);
  sheet.label("CLIENT", colR, 65);

  let ly = sheet.block(s.legalName, MARGIN_X, 71, HALF, { font: "bold", size: 11.5 }, 5);
  ly = sheet.block(`${s.legalForm} au capital de ${formatEurFr(s.shareCapitalCents)}`, MARGIN_X, ly + 0.5, HALF, SMALL);
  ly = sheet.block(place(s.addressLine1, s.postalCode, s.city, s.country), MARGIN_X, ly, HALF, SMALL);
  ly = sheet.block(`SIREN ${spacedSiren(s.siren)} \u00b7 RCS ${s.rcsCity}`, MARGIN_X, ly, HALF, SMALL);
  ly = sheet.block(
    s.vatExempt ? s.vatExemptMention : `N\u00b0 TVA intracommunautaire : ${s.vatNumber}`,
    MARGIN_X,
    ly,
    HALF,
    SMALL,
  );
  if (!s.vatExempt && s.vatOnDebits) {
    ly = sheet.block("Option pour le paiement de la TVA d'après les débits.", MARGIN_X, ly, HALF, SMALL);
  }

  const c = d.client;
  let ry = sheet.block(c.name, colR, 71, HALF, { font: "bold", size: 11.5 }, 5);
  if (c.siren) ry = sheet.block(`SIREN ${spacedSiren(c.siren)}`, colR, ry + 0.5, HALF, SMALL);
  if (c.rnaNumber) ry = sheet.block(`RNA ${c.rnaNumber}`, colR, c.siren ? ry : ry + 0.5, HALF, SMALL);
  ry = sheet.block(place(c.addressLine1, c.postalCode, c.city, c.country), colR, ry, HALF, SMALL);

  sheet.y = Math.max(ly, ry) + 4;
  sheet.rule();

  // ── Object ──
  sheet.y += 7;
  sheet.label("OBJET", MARGIN_X, sheet.y);
  sheet.y += 5.5;
  sheet.flow(`${d.lines[0]?.description ?? "Frais de service de billetterie"} \u2013 ${d.eventTitle}`, { font: "bold", size: 10.5 }, 5);
  sheet.flow(`Événement du ${formatDateFr(d.eventDate)} \u00b7 Nature de l'opération : prestation de services`, SMALL);
  sheet.y += 3;

  // ── Lines ──
  const header = () => {
    const y = sheet.y;
    const style: TextStyle = { font: "bold", size: 8, color: MUTED, spacing: 0.8 };
    sheet.text("DÉSIGNATION", x(COL.desc), y, style);
    sheet.text("QTÉ", x(COL.qtyR), y, { ...style, align: "right" });
    sheet.text("PU HT", x(COL.unitR), y, { ...style, align: "right" });
    sheet.text("TVA", x(COL.vatR), y, { ...style, align: "right" });
    sheet.text("TOTAL HT", x(COL.totalR), y, { ...style, align: "right" });
    sheet.rule(y + 2.5);
    sheet.y = y + 8;
  };
  sheet.ensure(40);
  header();
  const { bold, reg } = sheet.fonts;
  for (const l of d.lines) {
    // The ticket price sits next to the designation when it fits, under it otherwise.
    const tag = l.detail ? ` \u00b7 ${l.detail}` : "";
    const sameLine = bold.widthOfTextAtSize(l.description, 10) + reg.widthOfTextAtSize(tag, 9) <= x(COL.descW);
    if (sheet.ensure(sameLine ? 9 : 14)) header();
    const top = sheet.y;
    sheet.text(l.description, x(COL.desc), top, { font: "bold", size: 10 });
    let bottom = top;
    if (tag && sameLine) {
      sheet.text(tag, x(COL.desc) + bold.widthOfTextAtSize(l.description, 10), top, SMALL);
    } else if (l.detail) {
      bottom = sheet.block(l.detail, x(COL.desc), top + 4.6, x(COL.descW), SMALL, 4.3) - 4.3;
    }
    sheet.text(String(l.quantity), x(COL.qtyR), top, { align: "right" });
    sheet.text(formatUnitPriceFr(l.unitPriceHtCents), x(COL.unitR), top, { align: "right" });
    sheet.text(l.vatRateBps > 0 ? `${l.vatRateBps / 100} %`.replace(".", ",") : "\u2014", x(COL.vatR), top, { align: "right" });
    sheet.text(formatEurFr(l.totalHtCents), x(COL.totalR), top, { font: "bold", align: "right" });
    sheet.rule(bottom + 2.3);
    sheet.y = bottom + 7;
  }

  // ── Payment terms (left) beside the totals (right) ──
  sheet.y += 1;
  const leftW = x(94);
  const terms: [string, string][] = [
    ["Échéance", `${formatDateFr(d.issuedAt)}, date d'émission de la facture.`],
    [
      "Mode de règlement",
      "Compensation : les frais de service, payés par les acheteurs à TicketSafe lors de la vente, sont retenus par TicketSafe sur les sommes " +
        "qu'elle encaisse pour le compte de l'organisateur. Aucun paiement supplémentaire n'est dû.",
    ],
    ["Escompte", "Aucun escompte n'est accordé pour paiement anticipé."],
  ];
  const TERM: TextStyle = { size: 8.5, color: MUTED };
  const termHeight = terms.reduce((h, [, text]) => h + 4.4 + sheet.wrap(text, leftW, TERM).length * 4.2 + 2.2, 6);
  const BOX_H = 38;
  sheet.ensure(Math.max(termHeight, BOX_H) + 8);
  const top = sheet.y;

  sheet.label("CONDITIONS DE RÈGLEMENT", MARGIN_X, top + 4);
  let ty = top + 10;
  for (const [label, text] of terms) {
    sheet.text(label, MARGIN_X, ty, { font: "bold", size: 8.5 });
    ty = sheet.block(text, MARGIN_X, ty + 4.2, leftW, TERM, 4.2) + 2.2;
  }

  const boxX = x(112);
  const boxW = RIGHT - boxX;
  sheet.box(boxX, top, boxW, BOX_H);
  const row = (i: number, label: string, value: string, style: TextStyle = {}) => {
    const y = top + 7 + i * 6.4;
    sheet.text(label, boxX + x(5), y, { size: style.size ?? 10, color: style.color ?? MUTED });
    sheet.text(value, RIGHT - x(5), y, { font: "bold", size: style.size ?? 10, color: style.color ?? INK, align: "right" });
  };
  row(0, "Total HT", formatEurFr(d.totalHtCents));
  row(1, d.vatRateBps > 0 ? `TVA ${d.vatRateBps / 100} %`.replace(".", ",") : "TVA", d.vatRateBps > 0 ? formatEurFr(d.totalVatCents) : "non applicable");
  row(2, "Total TTC", formatEurFr(d.totalTtcCents), { size: 12, color: BRAND });
  row(3, "Réglé par compensation", `-${formatEurFr(d.totalTtcCents)}`);
  row(4, "Reste à payer", formatEurFr(0));

  // ── Late payment, in full ──
  sheet.y = Math.max(ty, top + BOX_H) + 5;
  sheet.ensure(24);
  sheet.text("Retard de paiement", MARGIN_X, sheet.y, { font: "bold", size: 8.5 });
  sheet.y += 4.2;
  sheet.flow(s.latePaymentMention, TERM, 4.2);

  return await sheet.finish({
    label: "FACTURE",
    number: d.documentNumber,
    footer:
      `${s.legalName}, ${s.legalForm} au capital de ${formatEurFr(s.shareCapitalCents)} \u00b7 ${s.rcsLabel ?? `${spacedSiren(s.siren)} R.C.S. ${s.rcsCity}`} \u00b7 ` +
      `${place(s.addressLine1, s.postalCode, s.city, s.country)} \u00b7 ${s.supportEmail}`,
  });
}
