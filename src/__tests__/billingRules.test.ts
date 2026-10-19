import { describe, it, expect } from "vitest";
import {
  DEFAULT_LATE_PAYMENT_MENTION,
  buildInvoiceAmounts,
  invoiceBlocker,
  isEventOver,
  missingClientDetails,
  resolvePenaltyMention,
  sellerSettingsProblems,
  type FeeOrder,
} from "../../supabase/functions/_shared/billingRules.ts";

const EXEMPT = { exempt: true, rateBps: 2000 };
const LIABLE = { exempt: false, rateBps: 2000 };

describe("buildInvoiceAmounts — what is billed", () => {
  const orders: FeeOrder[] = [
    { quantity: 2, fee_cents: 240, unit_price_cents: 1000 },
    { quantity: 3, fee_cents: 360, unit_price_cents: 1000 },
    { quantity: 1, fee_cents: 70, unit_price_cents: 100 },
    { quantity: 5, fee_cents: 0, unit_price_cents: 0 }, // free tickets
  ];

  it("groups the orders by unit fee, so quantity × unit price is exactly the line total", () => {
    const a = buildInvoiceAmounts(orders, EXEMPT);
    expect(a.lines.map((l) => [l.quantity, l.unitPriceHtCents, l.totalTtcCents])).toEqual([
      [1, 70, 70],
      [5, 120, 600],
    ]);
    for (const l of a.lines) expect(l.quantity * l.unitPriceHtCents).toBe(l.totalHtCents);
  });

  it("bills nothing for free tickets and counts only the tickets that carry a fee", () => {
    const a = buildInvoiceAmounts(orders, EXEMPT);
    expect(a.ticketCount).toBe(6);
    expect(a.totalTtcCents).toBe(670);
  });

  it("without VAT, the total is exactly what the buyers paid and no VAT is shown", () => {
    const a = buildInvoiceAmounts(orders, EXEMPT);
    expect(a.vatRateBps).toBe(0);
    expect(a.totalHtCents).toBe(670);
    expect(a.totalVatCents).toBe(0);
    expect(a.lines.every((l) => l.vatRateBps === 0 && l.vatCents === 0)).toBe(true);
  });

  it("with VAT, the buyers' payment is split once for the whole invoice and the lines add up to it", () => {
    const a = buildInvoiceAmounts(orders, LIABLE);
    expect(a.vatRateBps).toBe(2000);
    // 6,70 € paid: 6,70 / 1,2 = 5,58 € excl. tax + 1,12 € VAT
    expect([a.totalHtCents, a.totalVatCents, a.totalTtcCents]).toEqual([558, 112, 670]);
    expect(a.lines.map((l) => [l.quantity, l.unitPriceHtCents, l.totalHtCents, l.vatCents])).toEqual([
      [1, 58, 58, 12], // 0,70 € → 0,58 € + 0,12 €
      [5, 100, 500, 100], // 1,20 € → 1,00 € + 0,20 €
    ]);
  });

  it("with VAT, the VAT shown is the rate applied to the total excl. tax, to the cent", () => {
    const big: FeeOrder[] = [
      { quantity: 312, fee_cents: 312 * 112, unit_price_cents: 800 },
      { quantity: 540, fee_cents: 540 * 120, unit_price_cents: 1000 },
      { quantity: 128, fee_cents: 128 * 140, unit_price_cents: 1500 },
      { quantity: 40, fee_cents: 40 * 180, unit_price_cents: 2500 },
    ];
    const a = buildInvoiceAmounts(big, LIABLE);
    expect(a.totalTtcCents).toBe(124864);
    expect(a.totalHtCents).toBe(104053);
    expect(a.totalVatCents).toBe(20811);
    expect(Math.abs(a.totalVatCents - a.totalHtCents * 0.2)).toBeLessThanOrEqual(1);
    expect(a.lines.reduce((s, l) => s + l.totalHtCents, 0)).toBe(a.totalHtCents);
    expect(a.lines.reduce((s, l) => s + l.vatCents, 0)).toBe(a.totalVatCents);
    for (const l of a.lines) {
      expect(l.totalHtCents + l.vatCents).toBe(l.totalTtcCents);
      expect(Math.abs(l.quantity * l.unitPriceHtCents - l.totalHtCents)).toBeLessThan(0.5);
    }
  });

  it("bills an order whose fee doesn't divide by its tickets as one item, unrounded", () => {
    const a = buildInvoiceAmounts([{ quantity: 3, fee_cents: 100, unit_price_cents: 500 }], EXEMPT);
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0]).toMatchObject({ quantity: 1, unitPriceHtCents: 100, totalTtcCents: 100 });
    expect(a.ticketCount).toBe(3);
  });

  it("says which ticket price each line applies to", () => {
    const a = buildInvoiceAmounts([{ quantity: 1, fee_cents: 120, unit_price_cents: 1000 }], EXEMPT);
    expect(a.lines[0].detail).toBe("billets à 10,00 €");
  });

  it("returns an empty invoice when no order carries a fee", () => {
    const a = buildInvoiceAmounts([{ quantity: 4, fee_cents: 0, unit_price_cents: 0 }], EXEMPT);
    expect(a).toMatchObject({ lines: [], ticketCount: 0, totalTtcCents: 0 });
  });

  it("keeps the invoice equal to what the buyers paid, over many orders and both VAT regimes", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const many: FeeOrder[] = Array.from({ length: 400 }, () => {
      const quantity = 1 + rnd(6);
      const unit = [70, 88, 120, 144, 350][rnd(5)];
      return { quantity, fee_cents: unit * quantity, unit_price_cents: [500, 800, 1000, 2000, 4000][rnd(5)] };
    });
    const paid = many.reduce((a, o) => a + (o.fee_cents ?? 0), 0);
    for (const vat of [EXEMPT, LIABLE]) {
      const a = buildInvoiceAmounts(many, vat);
      expect(a.totalTtcCents).toBe(paid);
      expect(a.totalHtCents + a.totalVatCents).toBe(a.totalTtcCents);
      expect(a.lines.reduce((s, l) => s + l.totalTtcCents, 0)).toBe(paid);
      expect(a.lines.reduce((s, l) => s + l.totalHtCents, 0)).toBe(a.totalHtCents);
      for (const l of a.lines) {
        expect(l.totalHtCents + l.vatCents).toBe(l.totalTtcCents);
        expect(Math.abs(l.quantity * l.unitPriceHtCents - l.totalHtCents)).toBeLessThan(0.5);
      }
    }
    const withVat = buildInvoiceAmounts(many, LIABLE);
    expect(Math.abs(withVat.totalVatCents - withVat.totalHtCents * 0.2)).toBeLessThanOrEqual(1);
  });
});

describe("invoiceBlocker — when an invoice can be issued", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const client = {
    name: "BDE ESCP",
    siren: "123456789",
    billing_address_line1: "79 avenue de la République",
    billing_postal_code: "75011",
    billing_city: "Paris",
  };
  const ok = {
    event: { status: "published", ends_at: "2026-10-10T23:00:00Z", date: "2026-10-10T18:00:00Z" },
    paidTickets: 12,
    feeCents: 1440,
    client,
    now,
  };

  it("lets an invoice through once the event is over, fees were charged and the client is complete", () => {
    expect(invoiceBlocker(ok)).toBeNull();
  });

  it("refuses a cancelled event, whose buyers were refunded in full", () => {
    expect(invoiceBlocker({ ...ok, event: { ...ok.event, status: "cancelled" } })?.code).toBe("event_cancelled");
  });

  it("refuses an event with no paid tickets, or only free ones", () => {
    expect(invoiceBlocker({ ...ok, paidTickets: 0, feeCents: 0 })?.code).toBe("no_paid_tickets");
    expect(invoiceBlocker({ ...ok, feeCents: 0 })?.code).toBe("no_fees");
  });

  it("waits for the end of the event, falling back on its date when it has no end", () => {
    expect(invoiceBlocker({ ...ok, event: { status: "published", ends_at: "2026-10-18T02:00:00Z" } })?.code).toBe("event_not_over");
    expect(invoiceBlocker({ ...ok, event: { status: "published", date: "2026-10-20T18:00:00Z" } })?.code).toBe("event_not_over");
    expect(invoiceBlocker({ ...ok, event: { status: "published", date: "2026-10-01T18:00:00Z" } })).toBeNull();
    expect(invoiceBlocker({ ...ok, event: { status: "published" } })?.code).toBe("event_not_over");
  });

  it("asks for the client's details, naming what is missing", () => {
    const b = invoiceBlocker({ ...ok, client: { name: "BDE ESCP" } });
    expect(b?.code).toBe("client_details_missing");
    expect(b?.missing).toEqual(["billing address", "postal code", "city", "SIREN or RNA number"]);
    expect(b?.message).toContain("SIREN or RNA number");
  });

  it("reports the reason that matters first", () => {
    const b = invoiceBlocker({ ...ok, feeCents: 0, event: { status: "published" }, client: {} });
    expect(b?.code).toBe("no_fees");
  });
});

describe("client details", () => {
  it("accepts an RNA number in place of a SIREN, for associations without one", () => {
    expect(
      missingClientDetails({ name: "Asso", rna_number: "W123456789", billing_address_line1: "1 rue X", billing_postal_code: "75001", billing_city: "Paris" }),
    ).toEqual([]);
  });

  it("treats blanks as missing", () => {
    expect(missingClientDetails({ name: "  ", siren: " " })).toContain("legal name");
  });
});

describe("isEventOver", () => {
  it("is false without any date", () => {
    expect(isEventOver({})).toBe(false);
  });
});

describe("TicketSafe's own details", () => {
  const settings = {
    legal_name: "Ticket Safe",
    legal_form: "Société par actions simplifiée (SAS)",
    share_capital_cents: 100000,
    siren: "105533632",
    rcs_city: "Paris",
    address_line1: "2 rue Wilhem",
    postal_code: "75016",
    city: "Paris",
    vat_exempt: true,
    vat_number: null,
    vat_exempt_mention: "TVA non applicable, article 293 B du Code général des impôts.",
    vat_rate_bps: 2000,
    vat_regime_confirmed_at: null,
  };

  it("holds invoices back until the VAT regime has been confirmed", () => {
    expect(sellerSettingsProblems(settings)).toEqual(["VAT regime confirmation"]);
    expect(sellerSettingsProblems({ ...settings, vat_regime_confirmed_at: "2026-10-18T09:00:00Z" })).toEqual([]);
  });

  it("requires a VAT number and rate when the company charges VAT", () => {
    const confirmed = { ...settings, vat_regime_confirmed_at: "2026-10-18T09:00:00Z" };
    expect(sellerSettingsProblems({ ...confirmed, vat_exempt: false })).toEqual(["VAT number"]);
    expect(sellerSettingsProblems({ ...confirmed, vat_exempt: false, vat_number: "FR86105533632" })).toEqual([]);
    expect(sellerSettingsProblems({ ...confirmed, vat_exempt: false, vat_number: "FR86105533632", vat_rate_bps: 0 })).toEqual(["VAT rate"]);
  });

  it("lists every missing identity field", () => {
    expect(sellerSettingsProblems({ vat_exempt: true, vat_exempt_mention: "x", vat_regime_confirmed_at: "2026-10-18T09:00:00Z" })).toEqual([
      "legal name",
      "legal form",
      "SIREN",
      "RCS city",
      "address",
      "share capital",
    ]);
  });
});

describe("late-payment clause", () => {
  it("states the three-times-legal-rate minimum, the next-day due date and the 40 € indemnity", () => {
    expect(DEFAULT_LATE_PAYMENT_MENTION).toContain("trois fois le taux d'intérêt légal");
    expect(DEFAULT_LATE_PAYMENT_MENTION).toContain("dès le lendemain");
    expect(DEFAULT_LATE_PAYMENT_MENTION).toContain("40 €");
  });

  it("replaces the old clause, which only said 'au taux légal', and keeps a compliant one", () => {
    const old =
      "Tout retard de paiement entraîne, de plein droit, l'application d'un intérêt de retard au taux légal en vigueur ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 C. com.).";
    expect(resolvePenaltyMention(old)).toBe(DEFAULT_LATE_PAYMENT_MENTION);
    expect(resolvePenaltyMention(null)).toBe(DEFAULT_LATE_PAYMENT_MENTION);
    const custom = "Pénalités au taux de trois fois le taux d'intérêt légal, plus 40 € d'indemnité.";
    expect(resolvePenaltyMention(custom)).toBe(custom);
  });
});
