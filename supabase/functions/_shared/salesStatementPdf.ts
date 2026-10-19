/**
 * generateSalesStatementPdf(data) — the "relevé de ventes": what TicketSafe
 * collected from buyers for ONE event, what it kept as its service fee, and what is
 * left for the organizer. It accounts for money TicketSafe holds for the organizer;
 * it is not a tax invoice (no VAT, no legal numbering) and says so.
 *
 * It can be regenerated while its status is "provisoire" (the stored file is
 * overwritten); once "definitif" it is frozen, and the database refuses any change.
 *
 * Same rendering stack as the service invoice (_shared/pdfKit.ts).
 */
import { MARGIN_X, MM, A4_W, CONTENT_W, BRAND, INK, MUTED, Sheet, rgb, type TextStyle } from "./pdfKit.ts";
import { formatDateFr, formatEurFr } from "./pdfText.ts";

export interface SalesStatementData {
  documentNumber: string;
  status: "provisoire" | "definitif";
  issuedAt: string; // ISO: when this version was drawn up
  periodStart: string | null; // ISO
  periodEnd: string | null; // ISO

  ticketSafe: {
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

  tiers: { name: string; unitPriceCents: number; quantity: number; discountCents: number; netCents: number }[];
  paidByBuyersCents: number; // everything the buyers paid, service fee included
  serviceFeeCents: number; // TicketSafe's service fee, paid by the buyers on top of the ticket price
  netCents: number; // what is left for the organizer
  discountCents: number; // promo-code discounts, already out of the net
  refundedTickets: number;
  refundedCents: number;
  resaleCount: number;
  resaleVolumeCents: number;
}

const x = (mm: number) => mm * MM;
const RIGHT = A4_W - MARGIN_X;
const HALF = CONTENT_W / 2 - 6;
const SMALL: TextStyle = { size: 9, color: MUTED };

const AMBER = { bg: rgb(1, 0.96, 0.87), fg: rgb(0.57, 0.36, 0.04) };
const GREEN = { bg: rgb(0.86, 0.95, 0.89), fg: rgb(0.04, 0.45, 0.24) };

// Column edges of the tier table, in mm from the left of the page.
const COL = { name: 14, nameW: 70, unitR: 112, qtyR: 130, discR: 160, netR: 196 };

const spacedSiren = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");
const place = (line: string | null, postal: string | null, city: string | null, country: string | null) =>
  [[line, [postal, city].filter(Boolean).join(" ")].filter(Boolean).join(", "), country && country !== "France" ? country : null]
    .filter(Boolean)
    .join(", ");

export async function generateSalesStatementPdf(d: SalesStatementData): Promise<Uint8Array> {
  const sheet = await Sheet.create({
    title: `Relevé de ventes ${d.documentNumber}`,
    subject: `Relevé de ventes \u2013 ${d.event.title}`,
    createdAt: new Date(d.issuedAt),
  });
  const t = d.ticketSafe;
  const definitive = d.status === "definitif";

  // ── Title ──
  sheet.text("Relevé de ventes", MARGIN_X, 32, { font: "bold", size: 22 });
  sheet.text(`${d.documentNumber} \u00b7 établi le ${formatDateFr(d.issuedAt)}`, MARGIN_X, 41, { size: 10, color: MUTED });
  sheet.text(`Période couverte : du ${formatDateFr(d.periodStart)} au ${formatDateFr(d.periodEnd)}`, MARGIN_X, 47, SMALL);

  const status = definitive ? GREEN : AMBER;
  const word = definitive ? "DÉFINITIF" : "PROVISOIRE";
  const wordW = sheet.fonts.bold.widthOfTextAtSize(word, 9) + 0.6 * word.length + x(8);
  sheet.box(RIGHT - wordW, 21, wordW, 8, status.bg, null);
  sheet.text(word, RIGHT - x(4), 26.4, { font: "bold", size: 9, color: status.fg, spacing: 0.6, align: "right" });
  sheet.rule(58);

  // ── Parties ──
  const colR = MARGIN_X + CONTENT_W / 2 + 6;
  sheet.label("PLATEFORME DE BILLETTERIE", MARGIN_X, 65);
  sheet.label("ORGANISATEUR", colR, 65);

  let ly = sheet.block(t.legalName, MARGIN_X, 71, HALF, { font: "bold", size: 11.5 }, 5);
  ly = sheet.block(`${t.legalForm} au capital de ${formatEurFr(t.shareCapitalCents)}`, MARGIN_X, ly + 0.5, HALF, SMALL);
  ly = sheet.block(place(t.addressLine1, t.postalCode, t.city, t.country), MARGIN_X, ly, HALF, SMALL);
  ly = sheet.block(`SIREN ${spacedSiren(t.siren)} \u00b7 RCS ${t.rcsCity}`, MARGIN_X, ly, HALF, SMALL);
  ly = sheet.block(t.supportEmail, MARGIN_X, ly, HALF, SMALL);

  const o = d.organizer;
  let ry = sheet.block(o.name, colR, 71, HALF, { font: "bold", size: 11.5 }, 5);
  if (o.siren) ry = sheet.block(`SIREN ${spacedSiren(o.siren)}`, colR, ry + 0.5, HALF, SMALL);
  if (o.rnaNumber) ry = sheet.block(`RNA ${o.rnaNumber}`, colR, o.siren ? ry : ry + 0.5, HALF, SMALL);
  ry = sheet.block(place(o.addressLine1, o.postalCode, o.city, o.country), colR, ry, HALF, SMALL);

  sheet.y = Math.max(ly, ry) + 4;
  sheet.rule();

  // ── Event ──
  sheet.y += 7;
  sheet.label("ÉVÉNEMENT", MARGIN_X, sheet.y);
  sheet.y += 5.5;
  sheet.flow(d.event.title, { font: "bold", size: 11.5 }, 5);
  sheet.flow(`${formatDateFr(d.event.date)}${d.event.location ? ` \u00b7 ${d.event.location}` : ""}`, SMALL);
  sheet.y += 2;
  sheet.rule();

  // ── Tiers ──
  sheet.y += 8;
  sheet.ensure(40);
  const header = () => {
    const y = sheet.y;
    const style: TextStyle = { font: "bold", size: 8, color: MUTED, spacing: 0.8 };
    sheet.text("TARIF", x(COL.name), y, style);
    sheet.text("PRIX", x(COL.unitR), y, { ...style, align: "right" });
    sheet.text("BILLETS", x(COL.qtyR), y, { ...style, align: "right" });
    sheet.text("RÉDUCTIONS", x(COL.discR), y, { ...style, align: "right" });
    sheet.text("NET", x(COL.netR), y, { ...style, align: "right" });
    sheet.rule(y + 2.5);
    sheet.y = y + 8;
  };
  sheet.label("DÉTAIL PAR TARIF", MARGIN_X, sheet.y);
  sheet.y += 7;
  header();
  for (const tier of d.tiers) {
    const lines = sheet.wrap(tier.name, x(COL.nameW), { size: 10 }).length;
    if (sheet.ensure(lines * 4.8 + 3)) header();
    const top = sheet.y;
    const y = sheet.block(tier.name, x(COL.name), top, x(COL.nameW), { size: 10 }, 4.8);
    sheet.text(formatEurFr(tier.unitPriceCents), x(COL.unitR), top, { align: "right" });
    sheet.text(String(tier.quantity), x(COL.qtyR), top, { align: "right" });
    sheet.text(tier.discountCents > 0 ? `-${formatEurFr(tier.discountCents)}` : "\u2014", x(COL.discR), top, { align: "right", color: MUTED });
    sheet.text(formatEurFr(tier.netCents), x(COL.netR), top, { font: "bold", align: "right" });
    sheet.y = y + 1.5;
  }
  if (d.tiers.length === 0) {
    sheet.text("Aucune vente payée sur cet événement.", x(COL.name), sheet.y, { color: MUTED });
    sheet.y += 6;
  }
  sheet.y += 1;
  sheet.rule();

  // ── What is left for the organizer ──
  sheet.y += 8;
  sheet.ensure(46);
  const top = sheet.y;
  sheet.box(MARGIN_X, top, CONTENT_W, 31);
  const row = (i: number, label: string, value: string, big = false) => {
    const y = top + 9 + i * 8.5;
    sheet.text(label, MARGIN_X + x(6), y, { size: big ? 11 : 10, color: big ? INK : MUTED });
    sheet.text(value, RIGHT - x(6), y, { font: "bold", size: big ? 13 : 10, color: big ? BRAND : INK, align: "right" });
  };
  row(0, "Total payé par les acheteurs, frais de service compris", formatEurFr(d.paidByBuyersCents));
  row(1, "Frais de service TicketSafe, payés par les acheteurs", `-${formatEurFr(d.serviceFeeCents)}`);
  row(2, "Net revenant à l'organisateur", formatEurFr(d.netCents), true);
  sheet.y = top + 31 + 6;

  sheet.flow(
    "Ce relevé ne constitue pas une facture : les frais de service TicketSafe font l'objet d'une facture distincte, émise à l'issue de l'événement.",
    SMALL,
  );
  if (d.discountCents > 0) {
    sheet.flow(`Les réductions accordées par codes promo (${formatEurFr(d.discountCents)}) sont déjà déduites du net.`, SMALL);
  }
  if (d.refundedTickets > 0) {
    sheet.flow(
      `Commandes remboursées ou annulées, non comprises ci-dessus : ${d.refundedTickets} billet${d.refundedTickets > 1 ? "s" : ""}, ${formatEurFr(d.refundedCents)}.`,
      SMALL,
    );
  }
  sheet.flow(
    definitive
      ? "Statut définitif : les sommes revenant à l'organisateur au titre de cet événement lui ont été reversées."
      : "Statut provisoire : ce relevé reflète les ventes à la date où il est établi. Il deviendra définitif lorsque les sommes revenant à l'organisateur lui auront été reversées.",
    SMALL,
  );

  if (d.resaleCount > 0) {
    sheet.y += 4;
    sheet.ensure(18);
    sheet.label("REVENTES ENTRE PARTICULIERS (POUR INFORMATION)", MARGIN_X, sheet.y);
    sheet.y += 6;
    sheet.flow(
      `${d.resaleCount} billet${d.resaleCount > 1 ? "s" : ""} de cet événement ${d.resaleCount > 1 ? "ont été revendus" : "a été revendu"} sur la place de marché TicketSafe ` +
        `(volume : ${formatEurFr(d.resaleVolumeCents)}). Ces opérations ne sont pas comprises dans ce relevé.`,
      SMALL,
    );
  }

  return await sheet.finish({
    label: "RELEVÉ DE VENTES",
    number: d.documentNumber,
    footer:
      `${t.legalName}, ${t.legalForm} au capital de ${formatEurFr(t.shareCapitalCents)} \u00b7 ${t.rcsLabel ?? `${spacedSiren(t.siren)} R.C.S. ${t.rcsCity}`} \u00b7 ` +
      `${place(t.addressLine1, t.postalCode, t.city, t.country)} \u00b7 ${t.supportEmail}`,
  });
}
