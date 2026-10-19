/**
 * Rules and arithmetic of TicketSafe's billing documents.
 *
 * Pure (no Deno API): the generate-billing-document edge function is the authority
 * and applies every rule here; the Studio Sales page imports the same functions only
 * to tell an organizer, before they click, why a document isn't available yet. Unit
 * tested from the web app's test suite (src/__tests__/billingRules.test.ts).
 */
import { formatEurFr } from "./pdfText.ts";

// ── What is billed ───────────────────────────────────────────────────────────

export interface FeeOrder {
  quantity: number;
  fee_cents: number | null;
  unit_price_cents: number | null;
}

export interface InvoiceLine {
  description: string;
  detail: string; // the ticket price the fee applies to, e.g. "billets à 10,00 €"; empty when it isn't known
  quantity: number;
  unitPriceHtCents: number;
  vatRateBps: number;
  vatCents: number;
  totalHtCents: number;
  totalTtcCents: number;
}

export interface InvoiceAmounts {
  lines: InvoiceLine[];
  ticketCount: number;
  vatRateBps: number;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
}

export const INVOICE_LINE_LABEL = "Frais de service de billetterie";

/**
 * The fee a buyer pays is a price including tax, per ticket, and it is whole cents.
 * The invoice groups the paid orders by that unit fee, so the invoice total is exactly
 * what the buyers paid. Without VAT, quantity × unit price is exactly the line total.
 * With VAT, the buyers' total is split into excl.-tax and VAT once, for the whole
 * invoice (VAT is the rate applied to the total excl. tax, to the cent); each line is
 * split the same way, and the largest line absorbs the few cents rounding leaves, so the
 * lines always add up to the totals. A unit price excl. tax can then have more than two
 * decimals, which is why it is kept as a fraction of a cent.
 */
export function buildInvoiceAmounts(orders: FeeOrder[], vat: { exempt: boolean; rateBps: number }): InvoiceAmounts {
  const rateBps = vat.exempt ? 0 : Math.max(0, Math.trunc(vat.rateBps));
  const groups = new Map<string, { unitTtc: number; listPrice: number | null; quantity: number }>();
  let ticketCount = 0;

  for (const o of orders) {
    const qty = Math.trunc(o.quantity);
    const fee = Math.trunc(o.fee_cents ?? 0);
    if (!(qty > 0) || !(fee > 0)) continue; // free tickets carry no fee
    ticketCount += qty;
    // The fee is per ticket, so it divides evenly. An order whose fee doesn't (an old percentage fee)
    // is billed as one item of its exact fee rather than being rounded.
    const even = fee % qty === 0;
    const unitTtc = even ? fee / qty : fee;
    const listPrice = even ? o.unit_price_cents ?? null : null;
    const key = `${unitTtc}|${listPrice ?? ""}`;
    const group = groups.get(key) ?? { unitTtc, listPrice, quantity: 0 };
    group.quantity += even ? qty : 1;
    groups.set(key, group);
  }

  const sorted = [...groups.values()].sort((a, b) => (a.listPrice ?? Infinity) - (b.listPrice ?? Infinity) || a.unitTtc - b.unitTtc);
  const exclTax = (ttc: number) => (rateBps === 0 ? ttc : Math.round((ttc * 10000) / (10000 + rateBps)));

  const ttcs = sorted.map((g) => g.quantity * g.unitTtc);
  const totalTtcCents = ttcs.reduce((a, v) => a + v, 0);
  const totalHtCents = exclTax(totalTtcCents);
  const hts = ttcs.map(exclTax);
  const drift = totalHtCents - hts.reduce((a, v) => a + v, 0);
  if (drift !== 0) hts[ttcs.indexOf(Math.max(...ttcs))] += drift;

  const lines: InvoiceLine[] = sorted.map((g, i) => ({
    description: INVOICE_LINE_LABEL,
    detail: g.listPrice != null ? `billets à ${formatEurFr(g.listPrice)}` : "",
    quantity: g.quantity,
    unitPriceHtCents: Math.round((hts[i] / g.quantity) * 10000) / 10000,
    vatRateBps: rateBps,
    vatCents: ttcs[i] - hts[i],
    totalHtCents: hts[i],
    totalTtcCents: ttcs[i],
  }));

  return { lines, ticketCount, vatRateBps: rateBps, totalHtCents, totalVatCents: totalTtcCents - totalHtCents, totalTtcCents };
}

// ── When an invoice can be issued ───────────────────────────────────────────

/** Same reference the payouts use: the end of the event, or its start when no end is set. */
export function eventEnd(event: { ends_at?: string | null; date?: string | null }): Date | null {
  const raw = event.ends_at ?? event.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isEventOver(event: { ends_at?: string | null; date?: string | null }, now: Date = new Date()): boolean {
  const end = eventEnd(event);
  return end !== null && end.getTime() <= now.getTime();
}

export interface ClientIdentity {
  name?: string | null;
  siren?: string | null;
  rna_number?: string | null;
  billing_address_line1?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
}

/** What an invoice must say about its client (art. L441-9 C. com., art. 242 nonies A ann. II CGI) and the profile lacks. */
export function missingClientDetails(c: ClientIdentity): string[] {
  const missing: string[] = [];
  if (!c.name?.trim()) missing.push("legal name");
  if (!c.billing_address_line1?.trim()) missing.push("billing address");
  if (!c.billing_postal_code?.trim()) missing.push("postal code");
  if (!c.billing_city?.trim()) missing.push("city");
  if (!c.siren?.trim() && !c.rna_number?.trim()) missing.push("SIREN or RNA number");
  return missing;
}

export type InvoiceBlockerCode = "event_cancelled" | "no_paid_tickets" | "no_fees" | "event_not_over" | "client_details_missing";

export interface InvoiceBlocker {
  code: InvoiceBlockerCode;
  hint: string; // a few words, for the menu
  message: string; // a sentence, for the organizer
  missing?: string[];
}

/** The first reason an invoice can't be issued for this event yet, or null when it can. */
export function invoiceBlocker(input: {
  event: { status?: string | null; ends_at?: string | null; date?: string | null };
  paidTickets: number;
  feeCents: number;
  client: ClientIdentity;
  now?: Date;
}): InvoiceBlocker | null {
  if (input.event.status === "cancelled") {
    return {
      code: "event_cancelled",
      hint: "Event cancelled",
      message: "There is no invoice for a cancelled event: buyers are refunded in full, service fee included.",
    };
  }
  if (input.paidTickets <= 0) {
    return { code: "no_paid_tickets", hint: "No paid tickets", message: "This event has no paid tickets, so there is nothing to invoice." };
  }
  if (input.feeCents <= 0) {
    return { code: "no_fees", hint: "No service fees", message: "No service fee was charged on this event, so there is nothing to invoice." };
  }
  if (!isEventOver(input.event, input.now)) {
    return {
      code: "event_not_over",
      hint: "After the event",
      message: "The invoice is issued once the event is over, because that is when the service is complete.",
    };
  }
  return clientDetailsBlocker(input.client);
}

/** The organizer's own details, which only they can fill in (Studio → Settings), or null when the invoice can name them. */
export function clientDetailsBlocker(client: ClientIdentity): InvoiceBlocker | null {
  const missing = missingClientDetails(client);
  if (missing.length === 0) return null;
  return {
    code: "client_details_missing",
    hint: "Add billing details",
    message: `Add your ${missing.join(", ")} in Settings first: an invoice has to name its client, and it can't be changed once issued.`,
    missing,
  };
}

// ── TicketSafe's own details ────────────────────────────────────────────────

export interface SellerSettings {
  legal_name?: string | null;
  legal_form?: string | null;
  share_capital_cents?: number | null;
  siren?: string | null;
  rcs_city?: string | null;
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  vat_exempt?: boolean | null;
  vat_number?: string | null;
  vat_exempt_mention?: string | null;
  vat_rate_bps?: number | null;
  vat_regime_confirmed_at?: string | null;
}

/**
 * What stops TicketSafe from issuing invoices yet. Invoices are numbered without
 * gaps and can't be edited, so none is issued until the legal details are complete
 * and the VAT regime has been confirmed by whoever answers for it.
 */
export function sellerSettingsProblems(s: SellerSettings): string[] {
  const problems: string[] = [];
  const blank = (v: string | null | undefined) => !String(v ?? "").trim();
  if (blank(s.legal_name)) problems.push("legal name");
  if (blank(s.legal_form)) problems.push("legal form");
  if (!/^\d{9}$/.test(String(s.siren ?? ""))) problems.push("SIREN");
  if (blank(s.rcs_city)) problems.push("RCS city");
  if (blank(s.address_line1) || blank(s.postal_code) || blank(s.city)) problems.push("address");
  if (!Number.isInteger(s.share_capital_cents) || (s.share_capital_cents as number) < 0) problems.push("share capital");
  if (s.vat_exempt) {
    if (blank(s.vat_exempt_mention)) problems.push("VAT exemption mention");
  } else {
    if (blank(s.vat_number)) problems.push("VAT number");
    if (!((s.vat_rate_bps ?? 0) > 0)) problems.push("VAT rate");
  }
  if (!s.vat_regime_confirmed_at) problems.push("VAT regime confirmation");
  return problems;
}

/**
 * The late-payment clause an invoice must carry (art. L441-10 C. com.): a rate that
 * can't be below three times the legal interest rate, due the day after the due date,
 * plus the fixed 40 € recovery indemnity.
 */
export const DEFAULT_LATE_PAYMENT_MENTION =
  "En cas de retard de paiement, des pénalités de retard sont exigibles dès le lendemain de la date d'échéance, sans qu'un rappel soit nécessaire, " +
  "au taux de trois fois le taux d'intérêt légal en vigueur (art. L441-10 du Code de commerce). " +
  "Tout retard de paiement entraîne également, de plein droit, une indemnité forfaitaire de 40 \u20ac pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce), " +
  "sans préjudice d'une indemnisation complémentaire si les frais réels de recouvrement sont supérieurs à ce montant.";

/** The clause kept in billing_settings when it states a compliant rate; the standard one otherwise. */
export function resolvePenaltyMention(fromSettings: string | null | undefined): string {
  const text = String(fromSettings ?? "").trim();
  return /trois fois|\b3 ?fois/i.test(text) && /40\s*\u20ac/.test(text) ? text : DEFAULT_LATE_PAYMENT_MENTION;
}
