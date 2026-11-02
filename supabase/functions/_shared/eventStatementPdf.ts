/**
 * generateEventStatementPdf(data): the "Financial statement" of one event, in English, from Stripe's figures.
 * Same rendering stack as the other billing PDFs (_shared/pdfKit.ts), with the brand icon in the header.
 *
 * It names no buyer: references are Stripe's payment, charge, refund and payout ids and the card's last four
 * digits. It is not an invoice and says so.
 */
import { A4_W, BRAND, CONTENT_W, INK, MARGIN_X, MM, MUTED, Sheet, rgb, type TextStyle } from "./pdfKit.ts";
import { brandIconPng } from "./brandIcon.ts";
import {
  formatDateEn,
  formatDateTimeEn,
  formatMoney,
  type CurrencyTotals,
  type StatementPayout,
  type StatementTransactionRow,
} from "./eventStatementMath.ts";

export interface EventStatementPdfData {
  event: { title: string; date: string | null; endsAt: string | null; location: string | null };
  organizer: { name: string };
  stripeAccountId: string;
  /** Unix seconds. */
  period: { start: number | null; end: number | null };
  /** ISO. */
  generatedAt: string;
  version: number;
  totals: CurrencyTotals[];
  rows: StatementTransactionRow[];
  payouts: StatementPayout[];
  balance: { available: { currency: string; amountCents: number }[]; pending: { currency: string; amountCents: number }[] };
  /** Where the organizer clicks "View in Stripe" (a fresh login link is made there; none is printed here). */
  studioEventUrl: string;
  /** TicketSafe's legal identity line for the footer. */
  footer: string;
  /** The VAT note printed above the legal identity on every page (STATEMENT_VAT_LINE). */
  vatLine: string;
}

const x = (mm: number) => mm * MM;
const RIGHT = A4_W - MARGIN_X;
const SMALL: TextStyle = { size: 9, color: MUTED };
const MONO: TextStyle = { font: "mono", size: 7.5, color: INK };
const GREEN = { bg: rgb(0.86, 0.95, 0.89), fg: rgb(0.04, 0.45, 0.24) };
const AMBER = { bg: rgb(1, 0.96, 0.87), fg: rgb(0.57, 0.36, 0.04) };
const RED = { bg: rgb(0.99, 0.9, 0.9), fg: rgb(0.6, 0.1, 0.1) };

// Column edges of the transactions table, in mm from the left of the page.
const TX = { date: 14, type: 42, grossR: 84, feeR: 112, netR: 138, ref: 142, refW: 40, cardR: 196 };
// Column edges of the payouts table.
const PO = { date: 14, amountR: 70, status: 76, id: 108, bank: 160 };

const PAYOUT_STATUS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  in_transit: "In transit",
  canceled: "Cancelled",
  failed: "Failed",
};

const periodLine = (p: { start: number | null; end: number | null }) =>
  p.start === null ? "No payment yet" : `${formatDateEn(p.start)} – ${formatDateEn(p.end ?? p.start)}`;

export async function generateEventStatementPdf(d: EventStatementPdfData): Promise<Uint8Array> {
  const sheet = await Sheet.create({
    title: `Financial statement – ${d.event.title}`,
    subject: `Financial statement of ${d.event.title} (Stripe connected account ${d.stripeAccountId})`,
    createdAt: new Date(d.generatedAt),
    language: "en-GB",
  });

  // ── Title ──
  sheet.text("Financial statement", MARGIN_X, 32, { font: "bold", size: 22 });
  // A long title wraps; everything below follows it down.
  const afterTitle = sheet.block(d.event.title, MARGIN_X, 41, CONTENT_W - x(30), { font: "bold", size: 12 }, 5.2);
  const when = [formatDateTimeEn(d.event.date), d.event.endsAt ? `to ${formatDateTimeEn(d.event.endsAt)}` : null, d.event.location]
    .filter(Boolean)
    .join(" \u00b7 ");
  const whenY = sheet.block(when, MARGIN_X, afterTitle + 0.8, CONTENT_W - x(30), SMALL, 4.2);

  const word = `VERSION ${d.version}`;
  const wordW = sheet.fonts.bold.widthOfTextAtSize(word, 9) + 0.6 * word.length + x(8);
  sheet.box(RIGHT - wordW, 21, wordW, 8, GREEN.bg, null);
  sheet.text(word, RIGHT - x(4), 26.4, { font: "bold", size: 9, color: GREEN.fg, spacing: 0.6, align: "right" });
  const ruleY = Math.max(58, whenY + 3);
  sheet.rule(ruleY);

  // ── Parties and period ──
  const colR = MARGIN_X + CONTENT_W / 2 + 6;
  const HALF = CONTENT_W / 2 - 6;
  const partiesY = ruleY + 7;
  sheet.label("ORGANIZER", MARGIN_X, partiesY);
  let ly = sheet.block(d.organizer.name, MARGIN_X, partiesY + 6, HALF, { font: "bold", size: 11.5 }, 5);
  ly = sheet.block(`Stripe connected account ${d.stripeAccountId}`, MARGIN_X, ly + 0.5, HALF, SMALL);

  sheet.label("PERIOD COVERED", colR, partiesY);
  let ry = sheet.block(periodLine(d.period), colR, partiesY + 6, HALF, { size: 10 }, 5);
  sheet.label("GENERATED", colR, ry + 3);
  ry = sheet.block(`${formatDateTimeEn(d.generatedAt)} (Paris time)`, colR, ry + 8.5, HALF, { size: 10 }, 5);

  sheet.y = Math.max(ly, ry) + 4;
  sheet.rule();

  // ── Summary, one block per currency ──
  const totals = d.totals.length ? d.totals : [emptyTotals("eur")];
  for (const t of totals) {
    sheet.y += 8;
    sheet.ensure(70);
    sheet.label(totals.length > 1 ? `SUMMARY (${t.currency.toUpperCase()})` : "SUMMARY", MARGIN_X, sheet.y);
    sheet.y += 6;
    const top = sheet.y;
    const lines: [string, string, boolean][] = [
      ["Tickets sold", String(t.ticketsSold), false],
      ["Gross sales (paid by the buyers, service fee included)", formatMoney(t.grossCents, t.currency), false],
      [`Refunds (${t.refundsCount})`, t.refundedCents > 0 ? `-${formatMoney(t.refundedCents, t.currency)}` : formatMoney(0, t.currency), false],
      ["TicketSafe service fees (paid by the buyers)", `-${formatMoney(t.ticketSafeFeeCents, t.currency)}`, false],
      ["Stripe processing fees (paid by TicketSafe out of its fee)", formatMoney(t.stripeFeeCents, t.currency), false],
      ["Net amount to organizer", formatMoney(t.netToOrganizerCents, t.currency), true],
    ];
    const h = 7 + lines.length * 8.2;
    sheet.box(MARGIN_X, top, CONTENT_W, h);
    lines.forEach(([label, value, big], i) => {
      const y = top + 8.5 + i * 8.2;
      if (big) sheet.rule(y - 5.2);
      sheet.text(label, MARGIN_X + x(6), y, { size: big ? 11 : 10, color: big ? INK : MUTED });
      sheet.text(value, RIGHT - x(6), y, { font: "bold", size: big ? 13 : 10, color: big ? BRAND : INK, align: "right" });
    });
    sheet.y = top + h + 5;
    sheet.flow(
      t.netSource === "connected_account"
        ? "The net amount is what reached your Stripe balance for this event, after refunds, as Stripe recorded it on your connected account. Stripe's processing fees are borne by TicketSafe, not by you; they are shown for information."
        : "The net amount is the gross sales minus refunds and TicketSafe's service fees. Stripe's processing fees are borne by TicketSafe, not by you; they are shown for information.",
      SMALL,
    );
  }
  sheet.y += 2;
  sheet.rule();

  // ── Payouts ──
  sheet.y += 8;
  sheet.ensure(30);
  sheet.label("PAYOUTS TO YOUR BANK ACCOUNT", MARGIN_X, sheet.y);
  sheet.y += 7;
  if (d.payouts.length === 0) {
    sheet.flow("No payout carrying this event's money has left your Stripe balance yet. Payouts are sent after the event ends; this statement is updated when one is paid.", SMALL);
  } else {
    const header = () => {
      const y = sheet.y;
      const s: TextStyle = { font: "bold", size: 8, color: MUTED, spacing: 0.8 };
      sheet.text("DATE", x(PO.date), y, s);
      sheet.text("AMOUNT", x(PO.amountR), y, { ...s, align: "right" });
      sheet.text("STATUS", x(PO.status), y, s);
      sheet.text("PAYOUT", x(PO.id), y, s);
      sheet.text("BANK ACCOUNT", x(PO.bank), y, s);
      sheet.rule(y + 2.5);
      sheet.y = y + 8;
    };
    header();
    for (const p of d.payouts) {
      if (sheet.ensure(6.5)) header();
      const y = sheet.y;
      const status = PAYOUT_STATUS[p.status] ?? p.status;
      const tone = p.status === "paid" ? GREEN : p.status === "failed" || p.status === "canceled" ? RED : AMBER;
      sheet.text(formatDateEn(p.arrivalDate ?? p.created), x(PO.date), y, { size: 9.5 });
      sheet.text(formatMoney(p.amount, p.currency), x(PO.amountR), y, { font: "bold", size: 9.5, align: "right" });
      sheet.text(status, x(PO.status), y, { font: "bold", size: 8.5, color: tone.fg });
      sheet.text(p.id, x(PO.id), y, MONO);
      sheet.text(p.bankLast4 ? `${p.bankName ? `${p.bankName} ` : ""}···· ${p.bankLast4}` : "—", x(PO.bank), y, { size: 9.5, color: MUTED });
      sheet.y = y + 6;
    }
    sheet.y += 1;
  }

  // ── Balance ──
  sheet.y += 5;
  sheet.ensure(20);
  sheet.label("CURRENT BALANCE OF YOUR STRIPE ACCOUNT", MARGIN_X, sheet.y);
  sheet.y += 6.5;
  const balanceLine = (label: string, lines: { currency: string; amountCents: number }[]) =>
    `${label}: ${lines.length ? lines.map((l) => formatMoney(l.amountCents, l.currency)).join(" · ") : formatMoney(0, "eur")}`;
  sheet.flow(`${balanceLine("Available", d.balance.available)}   ${balanceLine("Pending", d.balance.pending)}`, { size: 10 });
  sheet.flow("The balance is that of the whole account at the moment of generation, every event included.", SMALL);
  sheet.y += 2;
  sheet.rule();

  // ── Transactions ──
  sheet.y += 8;
  sheet.ensure(30);
  sheet.label("TRANSACTIONS", MARGIN_X, sheet.y);
  sheet.y += 7;
  if (d.rows.length === 0) {
    sheet.flow("No payment was taken through Stripe for this event.", SMALL);
  } else {
    const header = () => {
      const y = sheet.y;
      const s: TextStyle = { font: "bold", size: 8, color: MUTED, spacing: 0.8 };
      sheet.text("DATE", x(TX.date), y, s);
      sheet.text("TYPE", x(TX.type), y, s);
      sheet.text("GROSS", x(TX.grossR), y, { ...s, align: "right" });
      sheet.text("SERVICE FEE", x(TX.feeR), y, { ...s, align: "right" });
      sheet.text("NET TO YOU", x(TX.netR), y, { ...s, align: "right" });
      sheet.text("REFERENCE", x(TX.ref), y, s);
      sheet.text("CARD", x(TX.cardR), y, { ...s, align: "right" });
      sheet.rule(y + 2.5);
      sheet.y = y + 8;
    };
    header();
    for (const r of d.rows) {
      if (sheet.ensure(6)) header();
      const y = sheet.y;
      const refund = r.type === "refund";
      sheet.text(formatDateEn(r.date), x(TX.date), y, { size: 9 });
      sheet.text(refund ? "Refund" : "Payment", x(TX.type), y, { size: 9, color: refund ? RED.fg : INK });
      sheet.text(formatMoney(r.grossCents, r.currency), x(TX.grossR), y, { size: 9, align: "right" });
      sheet.text(formatMoney(r.ticketSafeFeeCents, r.currency), x(TX.feeR), y, { size: 9, color: MUTED, align: "right" });
      sheet.text(`${formatMoney(r.netCents, r.currency)}${r.estimated ? "*" : ""}`, x(TX.netR), y, { font: "bold", size: 9, align: "right" });
      sheet.text(r.reference, x(TX.ref), y, MONO);
      sheet.text(r.cardLast4 ? `···· ${r.cardLast4}` : "—", x(TX.cardR), y, { size: 9, color: MUTED, align: "right" });
      sheet.y = y + 5.4;
    }
    if (d.rows.some((r) => r.estimated)) {
      sheet.y += 1;
      sheet.flow("* Refund not yet reflected on your connected account at generation time: the amount pulled back is estimated in proportion to the refund.", SMALL);
    }
  }
  sheet.y += 3;
  sheet.rule();

  // ── Notes ──
  sheet.y += 7;
  sheet.ensure(28);
  sheet.flow(
    `Figures sourced from Stripe (balance transactions and payouts of connected account ${d.stripeAccountId}). This statement is generated by TicketSafe and is not an invoice.`,
    SMALL,
  );
  sheet.flow(
    `View in Stripe: open this event in Ticket Studio and click "View in Stripe"; a fresh, single-use login link to your Stripe Express dashboard is created each time and never stored. ${d.studioEventUrl}`,
    SMALL,
  );

  return await sheet.finish({
    label: "FINANCIAL STATEMENT",
    number: `v${d.version}`,
    footer: d.footer,
    footerNote: d.vatLine,
    logoPng: brandIconPng(),
  });
}

function emptyTotals(currency: string): CurrencyTotals {
  return {
    currency,
    chargesCount: 0,
    ticketsSold: 0,
    grossCents: 0,
    refundsCount: 0,
    refundedCents: 0,
    ticketSafeFeeCents: 0,
    stripeFeeCents: 0,
    netToOrganizerCents: 0,
    netSource: "platform",
  };
}
