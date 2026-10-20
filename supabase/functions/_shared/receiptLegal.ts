/**
 * The legal notice and the payment summary on a buyer's confirmation (e-mail body and PDF receipt).
 *
 * French consumer law wants the buyer to get, on a durable medium, who sells (identity, address, contact),
 * the price with all taxes included, whether the right of withdrawal applies, how a refund works and who the
 * consumer mediator is. The text is French first and English underneath, because the site is bilingual.
 *
 * Pure (no Deno API), so it is unit-tested from the web app's suite (src/__tests__/receiptLegal.test.ts).
 * The company details come from billing_settings, the row the invoices use; RECEIPT_LEGAL_FALLBACK keeps the
 * notice complete if that read ever fails. replay-order-email is deployed on its own and carries a copy of
 * this file in its _shared folder; the test suite checks the two are identical.
 */

export type ReceiptKind = "ticket" | "resale";
export type ReceiptLang = "fr" | "en";

export interface ReceiptLegal {
  legalName: string;
  legalForm: string;
  shareCapitalCents: number;
  rcsLabel: string;
  address: string;
  supportEmail: string;
  vatExempt: boolean;
  vatNumber: string | null;
  vatExemptMention: string;
}

export const RECEIPT_LEGAL_FALLBACK: ReceiptLegal = {
  legalName: "Ticket Safe",
  legalForm: "Société par actions simplifiée (SAS)",
  shareCapitalCents: 100000,
  rcsLabel: "105 533 632 R.C.S. Paris",
  address: "2 rue Wilhem, 75016 Paris",
  supportEmail: "ticketsafe.friendly@gmail.com",
  vatExempt: true,
  vatNumber: null,
  vatExemptMention: "TVA non applicable, article 293 B du Code général des impôts.",
};

/** The billing_settings columns this module reads. */
export const RECEIPT_LEGAL_COLUMNS =
  "legal_name, legal_form, share_capital_cents, siren, rcs_city, rcs_full_label, address_line1, postal_code, city, support_email, vat_exempt, vat_number, vat_exempt_mention";

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** billing_settings row (or null) -> notice details; anything missing falls back to the known company details. */
export function receiptLegalFromSettings(row: Record<string, unknown> | null | undefined): ReceiptLegal {
  const f = RECEIPT_LEGAL_FALLBACK;
  if (!row) return { ...f };
  const siren = text(row.siren).replace(/\D/g, "");
  const rcsCity = text(row.rcs_city);
  const rcsLabel =
    text(row.rcs_full_label) ||
    (siren.length === 9 && rcsCity ? `${siren.replace(/(\d{3})(?=\d)/g, "$1 ")} R.C.S. ${rcsCity}` : "") ||
    f.rcsLabel;
  const street = text(row.address_line1);
  const place = [text(row.postal_code), text(row.city)].filter(Boolean).join(" ");
  const capital = row.share_capital_cents;
  return {
    legalName: text(row.legal_name) || f.legalName,
    legalForm: text(row.legal_form) || f.legalForm,
    shareCapitalCents: typeof capital === "number" && Number.isInteger(capital) && capital >= 0 ? capital : f.shareCapitalCents,
    rcsLabel,
    address: street && place ? `${street}, ${place}` : f.address,
    supportEmail: text(row.support_email) || f.supportEmail,
    vatExempt: typeof row.vat_exempt === "boolean" ? row.vat_exempt : f.vatExempt,
    vatNumber: text(row.vat_number) || null,
    vatExemptMention: text(row.vat_exempt_mention) || f.vatExemptMention,
  };
}

// ── Amounts ──────────────────────────────────────────────────────────────────

const NBSP = "\u00a0";
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** 1120 -> "11,20 €" (fr, non-breaking spaces) or "€11.20" (en). */
export function eurText(cents: number, lang: ReceiptLang): string {
  const n = Math.round(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const sign = n < 0 ? "-" : "";
  return lang === "fr" ? `${sign}${group(whole, NBSP)},${frac}${NBSP}€` : `${sign}€${group(whole, ",")}.${frac}`;
}

/** Share capital, whole euros: "1 000 €" or "€1,000". */
function capitalText(cents: number, lang: ReceiptLang): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0
    ? lang === "fr" ? `${group(whole, NBSP)}${NBSP}€` : `€${group(whole, ",")}`
    : eurText(cents, lang);
}

// ── Wording ──────────────────────────────────────────────────────────────────

const FORM_EN: Record<string, string> = {
  "Société par actions simplifiée (SAS)": "simplified joint-stock company (SAS)",
  "Société à responsabilité limitée (SARL)": "limited liability company (SARL)",
  "Société anonyme (SA)": "public limited company (SA)",
};

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** One line naming the company: legal form, capital, registration, registered office, contact. */
export function identityLine(lang: ReceiptLang, legal: ReceiptLegal): string {
  if (lang === "fr") {
    return `${legal.legalName}, ${lowerFirst(legal.legalForm)} au capital de ${capitalText(legal.shareCapitalCents, "fr")}, ${legal.rcsLabel}, siège social : ${legal.address}. Contact : ${legal.supportEmail}.`;
  }
  const form = FORM_EN[legal.legalForm] ?? legal.legalForm;
  return `${legal.legalName}, ${form} with share capital of ${capitalText(legal.shareCapitalCents, "en")}, ${legal.rcsLabel}, registered office: ${legal.address}. Contact: ${legal.supportEmail}.`;
}

/** What the service fee says about VAT, without a trailing full stop. */
function vatStatement(lang: ReceiptLang, legal: ReceiptLegal): string {
  if (legal.vatExempt) {
    if (lang === "fr") return legal.vatExemptMention.replace(/\.\s*$/, "");
    return /293\s*B/i.test(legal.vatExemptMention)
      ? "VAT not applicable, article 293 B of the French General Tax Code"
      : legal.vatExemptMention.replace(/\.\s*$/, "");
  }
  if (legal.vatNumber) return lang === "fr" ? `TVA incluse (n° ${legal.vatNumber})` : `VAT included (no. ${legal.vatNumber})`;
  return lang === "fr" ? "TVA incluse le cas échéant" : "VAT included where applicable";
}

const MEDIATOR = "CMAP, 39 avenue Franklin D. Roosevelt, 75008 Paris, cmap.fr";

export interface NoticeItem {
  title: string;
  text: string;
}

export function noticeHeading(lang: ReceiptLang): string {
  return lang === "fr" ? "Informations légales" : "Legal information";
}

/** The legal points, in order, for one language. `site` has no trailing slash. */
export function noticeItems(
  lang: ReceiptLang,
  legal: ReceiptLegal,
  kind: ReceiptKind,
  opts: { organizerName?: string | null; site?: string } = {},
): NoticeItem[] {
  const site = (opts.site ?? "https://ticket-safe.eu").replace(/\/+$/, "");
  const organizer = (opts.organizerName ?? "").trim();
  const name = legal.legalName;
  const vat = vatStatement(lang, legal);
  const fr = lang === "fr";

  const seller: NoticeItem =
    kind === "resale"
      ? {
          title: fr ? "Vendeur" : "Seller",
          text: fr
            ? `Le billet est vendu par un particulier, non professionnel. ${name} exploite la place de marché : elle sécurise le paiement et le transfert du billet et perçoit des frais de service auprès de l’acheteur.`
            : `The ticket is sold by a private individual, not a business. ${name} runs the marketplace: it secures the payment and the transfer of the ticket and charges the buyer a service fee.`,
        }
      : {
          title: fr ? "Vendeur" : "Seller",
          text: fr
            ? `Le billet est vendu par l’organisateur${organizer ? ` (${organizer})` : ""}. ${name} agit comme intermédiaire de billetterie et d’encaissement ; elle facture ses propres frais de service.`
            : `The ticket is sold by the organizer${organizer ? ` (${organizer})` : ""}. ${name} acts as ticketing and payment intermediary and charges its own service fee.`,
        };

  const prices: NoticeItem = {
    title: fr ? "Prix et TVA" : "Prices and VAT",
    text: fr
      ? `Prix en euros, toutes taxes comprises. Frais de service ${name} : ${vat}.`
      : `Prices in euros, all taxes included. ${name} service fee: ${vat}.`,
  };

  const withdrawal: NoticeItem = {
    title: fr ? "Rétractation" : "Withdrawal",
    text: fr
      ? "Les billets pour une activité de loisirs à date déterminée ne bénéficient pas du droit de rétractation (article L221-28, 12° du Code de la consommation)."
      : "Tickets for a leisure event on a set date are not covered by the right of withdrawal (article L221-28, 12° of the French Consumer Code).",
  };

  const refunds: NoticeItem =
    kind === "resale"
      ? {
          title: fr ? "Remboursement" : "Refunds",
          text: fr ? `Conditions de remboursement et protection de l’acheteur : ${site}/refund-policy.` : `Refund terms and buyer protection: ${site}/refund-policy.`,
        }
      : {
          title: fr ? "Annulation et remboursement" : "Cancellation and refunds",
          text: fr
            ? `Si l’organisateur annule l’événement, vous êtes remboursé automatiquement du billet et des frais de service. Autres cas : ${site}/refund-policy.`
            : `If the organizer cancels the event, you are refunded automatically for the ticket and the service fee. Other cases: ${site}/refund-policy.`,
        };

  const mediation: NoticeItem = {
    title: fr ? "Réclamations et médiation" : "Complaints and mediation",
    text: fr
      ? `Écrivez d’abord à ${legal.supportEmail}. Si le litige persiste, vous pouvez saisir gratuitement le médiateur de la consommation : ${MEDIATOR}.`
      : `Write to ${legal.supportEmail} first. If the dispute is not settled, you may refer it free of charge to the consumer mediator: ${MEDIATOR}.`,
  };

  const documents: NoticeItem = {
    title: fr ? "Documents" : "Documents",
    text: fr
      ? `Conditions générales : ${site}/terms · Mentions légales : ${site}/mentions-legales · Données personnelles : ${site}/privacy.`
      : `Terms: ${site}/terms · Legal notice: ${site}/mentions-legales · Privacy: ${site}/privacy.`,
  };

  return kind === "resale"
    ? [seller, prices, refunds, mediation, documents]
    : [seller, prices, withdrawal, refunds, mediation, documents];
}

// ── HTML (e-mail) ────────────────────────────────────────────────────────────

export function escapeHtmlText(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NoticeStyle {
  text: string; // body text of the notice
  muted: string; // secondary text (English block, company line)
  label: string; // row labels of the payment summary
  strong: string; // row values of the payment summary
  accent: string; // the total
  border: string;
  font: string;
}

export const DEFAULT_NOTICE_STYLE: NoticeStyle = {
  text: "#475569",
  muted: "#94a3b8",
  label: "#64748b",
  strong: "#1e293b",
  accent: "#2440b6",
  border: "#e2e8f0",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
};

/** The French notice, then the English one, then the company line: email-safe paragraphs, inline CSS only. */
export function renderNoticeHtml(
  legal: ReceiptLegal,
  kind: ReceiptKind,
  opts: { organizerName?: string | null; site?: string; style?: NoticeStyle } = {},
): string {
  const s = opts.style ?? DEFAULT_NOTICE_STYLE;
  const block = (lang: ReceiptLang, color: string) =>
    `<p style="margin:0 0 6px;font-family:${s.font};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${color}">${escapeHtmlText(noticeHeading(lang))}</p>` +
    noticeItems(lang, legal, kind, opts)
      .map(
        (i) =>
          `<p style="margin:0 0 5px;font-family:${s.font};font-size:11px;line-height:1.55;color:${color}"><strong>${escapeHtmlText(i.title)}.</strong> ${escapeHtmlText(i.text)}</p>`,
      )
      .join("");
  return `<div style="margin-top:18px;padding-top:16px;border-top:1px solid ${s.border};text-align:left">
${block("fr", s.text)}
<div style="height:10px;line-height:10px;font-size:1px">&nbsp;</div>
${block("en", s.muted)}
<p style="margin:12px 0 0;font-family:${s.font};font-size:11px;line-height:1.55;color:${s.muted}">${escapeHtmlText(identityLine("fr", legal))}</p>
</div>`;
}

export interface PaymentSummary {
  orderRef: string;
  paidOn: string;
  quantity: number;
  tierName: string;
  ticketCents: number;
  feeCents: number;
  totalCents: number;
}

/** What the buyer paid, split between the ticket (organizer) and the service fee (Ticket Safe). English, like the rest of the e-mail. */
export function renderPaymentSummaryHtml(s: PaymentSummary, style: NoticeStyle = DEFAULT_NOTICE_STYLE): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;font-family:${style.font};font-size:13px;color:${style.label};width:56%">${escapeHtmlText(label)}</td>` +
    `<td style="padding:5px 0;font-family:${style.font};font-size:13px;text-align:right;color:${strong ? style.accent : style.strong};font-weight:${strong ? 800 : 600}">${escapeHtmlText(value)}</td></tr>`;
  const rows = [
    row(`${s.quantity} × ${s.tierName}`, s.totalCents === 0 ? "Free" : eurText(s.ticketCents, "en")),
    ...(s.feeCents > 0 ? [row("Service fee (Ticket Safe)", eurText(s.feeCents, "en"))] : []),
    row("Total paid", eurText(s.totalCents, "en"), true),
  ].join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:18px;border-top:1px solid ${style.border}">${rows}</table>
<p style="margin:8px 0 0;font-family:${style.font};font-size:11px;line-height:1.55;color:${style.muted}">Order ${escapeHtmlText(s.orderRef)} · paid on ${escapeHtmlText(s.paidOn)} · online payment through Stripe · prices include all taxes.</p>`;
}
