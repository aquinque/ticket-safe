/** Pure helpers for My Wallet (formatting, history grouping). */

export type PayoutStatus = "requested" | "processing" | "sent" | "failed" | "cancelled";

export interface HistoryItem {
  id: string;
  at: string;
  label: string;
  detail?: string;
  cents: number;
  /** plus: money in (accent colour) · minus: money out (neutral) · none: no longer counts (refund). */
  sign: "plus" | "minus" | "none";
  chip: { text: string; tone: "neutral" | "accent" | "good" | "bad" };
  receipt?: () => void;
  receiptBusy?: boolean;
}

const EUR = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 4550 -> "€45.50", always in English. */
export const formatEur = (cents: number) => EUR.format((Number.isFinite(cents) ? cents : 0) / 100);

/** Last four characters of an IBAN, spaces ignored. */
export const ibanLast4 = (iban: string | null | undefined) => (iban ?? "").replace(/\s+/g, "").slice(-4).toUpperCase();

/**
 * What the seller receives for a sale, in cents. Card resales (Stripe) also
 * carry the 5 % seller commission in commission_cents; older resales are
 * counted like the seller_earnings view (amount minus fee_amount).
 */
export function sellerNetCents(
  s: { amount: number | string; fee_amount: number | string | null; commission_cents: number | null },
  card = true,
) {
  const net = Math.round(Number(s.amount) * 100) - Math.round(Number(s.fee_amount ?? 0) * 100);
  return card ? net - (s.commission_cents ?? 0) : net;
}

/** Newest first, grouped by calendar month ("November 2026"), in Paris time. */
export function groupByMonth<T extends { at: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const it of sorted) {
    const d = new Date(it.at);
    const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" });
    const label = d.toLocaleDateString("en-GB", { timeZone: "Europe/Paris", month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, label, items: [it] });
  }
  return groups;
}
