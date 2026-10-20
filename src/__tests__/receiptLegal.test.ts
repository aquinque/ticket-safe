import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RECEIPT_LEGAL_FALLBACK,
  eurText,
  identityLine,
  noticeItems,
  receiptLegalFromSettings,
  renderNoticeHtml,
  renderPaymentSummaryHtml,
  type ReceiptKind,
  type ReceiptLegal,
} from "../../supabase/functions/_shared/receiptLegal.ts";
import { isWinAnsi } from "../../supabase/functions/_shared/pdfText.ts";

const NBSP = "\u00a0";
const drawable = (s: string) => [...s].every((c) => isWinAnsi(c.codePointAt(0) as number));
const legal: ReceiptLegal = RECEIPT_LEGAL_FALLBACK;

describe("receiptLegalFromSettings", () => {
  it("falls back to the known company details when there is no row", () => {
    expect(receiptLegalFromSettings(null)).toEqual(RECEIPT_LEGAL_FALLBACK);
    expect(receiptLegalFromSettings(undefined)).toEqual(RECEIPT_LEGAL_FALLBACK);
  });

  it("reads the billing_settings columns and keeps the fallback for blank ones", () => {
    const l = receiptLegalFromSettings({
      legal_name: "Ticket Safe",
      legal_form: "Société par actions simplifiée (SAS)",
      share_capital_cents: 250000,
      siren: "105533632",
      rcs_city: "Paris",
      rcs_full_label: "",
      address_line1: "1 rue Neuve",
      postal_code: "75001",
      city: "Paris",
      support_email: "  ",
      vat_exempt: true,
      vat_number: null,
      vat_exempt_mention: "TVA non applicable, article 293 B du Code général des impôts.",
    });
    expect(l.shareCapitalCents).toBe(250000);
    expect(l.rcsLabel).toBe("105 533 632 R.C.S. Paris");
    expect(l.address).toBe("1 rue Neuve, 75001 Paris");
    expect(l.supportEmail).toBe(RECEIPT_LEGAL_FALLBACK.supportEmail);
  });

  it("ignores a capital that is not a whole number of cents", () => {
    expect(receiptLegalFromSettings({ share_capital_cents: -5 }).shareCapitalCents).toBe(RECEIPT_LEGAL_FALLBACK.shareCapitalCents);
    expect(receiptLegalFromSettings({ share_capital_cents: "1000" }).shareCapitalCents).toBe(RECEIPT_LEGAL_FALLBACK.shareCapitalCents);
  });
});

describe("eurText", () => {
  it("formats French and English amounts", () => {
    expect(eurText(1120, "fr")).toBe(`11,20${NBSP}€`);
    expect(eurText(1120, "en")).toBe("€11.20");
    expect(eurText(123456789, "fr")).toBe(`1${NBSP}234${NBSP}567,89${NBSP}€`);
    expect(eurText(123456789, "en")).toBe("€1,234,567.89");
    expect(eurText(Number.NaN, "en")).toBe("€0.00");
  });
});

describe("identityLine", () => {
  it("names the company with its form, capital, registration, address and contact", () => {
    const fr = identityLine("fr", legal);
    expect(fr).toContain("Ticket Safe, société par actions simplifiée (SAS)");
    expect(fr).toContain(`au capital de 1${NBSP}000${NBSP}€`);
    expect(fr).toContain("105 533 632 R.C.S. Paris");
    expect(fr).toContain("siège social : 2 rue Wilhem, 75016 Paris");
    expect(fr).toContain("ticketsafe.friendly@gmail.com");
    const en = identityLine("en", legal);
    expect(en).toContain("simplified joint-stock company (SAS) with share capital of €1,000");
    expect(en).toContain("registered office: 2 rue Wilhem, 75016 Paris");
  });
});

describe("noticeItems", () => {
  const kinds: ReceiptKind[] = ["ticket", "resale"];

  it("says the same things in French and in English", () => {
    for (const kind of kinds) {
      const fr = noticeItems("fr", legal, kind, { organizerName: "BDE Horizon" });
      const en = noticeItems("en", legal, kind, { organizerName: "BDE Horizon" });
      expect(fr.length).toBe(en.length);
      expect(fr.length).toBe(kind === "ticket" ? 6 : 5);
    }
  });

  it("for a ticket: the organizer sells, the fee is VAT-exempt, no withdrawal, refund on cancellation, mediator", () => {
    const fr = noticeItems("fr", legal, "ticket", { organizerName: "BDE Horizon" }).map((i) => i.text).join("\n");
    expect(fr).toContain("vendu par l’organisateur (BDE Horizon)");
    expect(fr).toContain("TVA non applicable, article 293 B du Code général des impôts.");
    expect(fr).toContain("article L221-28, 12°");
    expect(fr).toContain("remboursé automatiquement du billet et des frais de service");
    expect(fr).toContain("CMAP");
    expect(fr).toContain("https://ticket-safe.eu/refund-policy");
    const en = noticeItems("en", legal, "ticket", { organizerName: "BDE Horizon" }).map((i) => i.text).join("\n");
    expect(en).toContain("VAT not applicable, article 293 B of the French General Tax Code");
    expect(en).toContain("refunded automatically for the ticket and the service fee");
  });

  it("for a resale: a private individual sells and there is no withdrawal paragraph", () => {
    const fr = noticeItems("fr", legal, "resale").map((i) => `${i.title} ${i.text}`).join("\n");
    expect(fr).toContain("vendu par un particulier");
    expect(fr).not.toContain("L221-28");
    expect(fr).not.toContain("remboursé automatiquement");
  });

  it("states the VAT number instead of the exemption when the company is registered for VAT", () => {
    const vat: ReceiptLegal = { ...legal, vatExempt: false, vatNumber: "FR12105533632" };
    const fr = noticeItems("fr", vat, "ticket").map((i) => i.text).join("\n");
    expect(fr).toContain("TVA incluse (n° FR12105533632)");
    expect(fr).not.toContain("293 B");
  });

  it("only uses characters the PDF font can draw", () => {
    for (const kind of kinds) {
      for (const lang of ["fr", "en"] as const) {
        const all = [identityLine(lang, legal), ...noticeItems(lang, legal, kind, { organizerName: "Café Été" }).flatMap((i) => [i.title, i.text])];
        for (const s of all) expect(drawable(s), s).toBe(true);
      }
    }
  });
});

describe("renderNoticeHtml", () => {
  it("escapes the organizer name and carries both languages and the company line", () => {
    const html = renderNoticeHtml(legal, "ticket", { organizerName: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Informations légales");
    expect(html).toContain("Legal information");
    expect(html).toContain("105 533 632 R.C.S. Paris");
  });
});

describe("renderPaymentSummaryHtml", () => {
  const base = { orderRef: "TS-593B3512", paidOn: "13 October 2026", quantity: 2, tierName: "Early Bird" };

  it("splits the ticket price and the service fee", () => {
    const html = renderPaymentSummaryHtml({ ...base, ticketCents: 2000, feeCents: 240, totalCents: 2240 });
    expect(html).toContain("2 × Early Bird");
    expect(html).toContain("€20.00");
    expect(html).toContain("Service fee (Ticket Safe)");
    expect(html).toContain("€2.40");
    expect(html).toContain("€22.40");
    expect(html).toContain("TS-593B3512");
  });

  it("shows a free order without a fee line", () => {
    const html = renderPaymentSummaryHtml({ ...base, ticketCents: 0, feeCents: 0, totalCents: 0 });
    expect(html).toContain("Free");
    expect(html).not.toContain("Service fee");
  });

  it("escapes the tier name", () => {
    const html = renderPaymentSummaryHtml({ ...base, tierName: "<b>VIP</b>", ticketCents: 100, feeCents: 0, totalCents: 100 });
    expect(html).not.toContain("<b>VIP</b>");
  });
});

describe("the standalone copy used by replay-order-email", () => {
  it("is identical to the shared module", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/receiptLegal.ts"), "utf8");
    const copy = readFileSync(resolve(process.cwd(), "supabase/functions/replay-order-email/_shared/receiptLegal.ts"), "utf8");
    expect(copy).toBe(shared);
  });
});
