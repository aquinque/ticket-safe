/**
 * Amounts in the currency of a first-sale (Studio) order.
 *
 * London events are priced and charged in pounds, every other event in euros, and
 * the order records which (event_orders.currency, event_tiers.currency). Pounds are
 * always written the British way, "£1,234.50". Euros keep the style the caller
 * already used, so nothing changes for euro buyers: "12.50€" (default), "€12.50"
 * ("prefix") or "12,50 €" ("fr", non-breaking spaces).
 *
 * Resale stays euro-only and doesn't go through here.
 *
 * Pure (no Deno API), and every character it emits is in Windows-1252 ("£" is 0xA3),
 * so its output can be drawn by the built-in PDF fonts.
 */

export type Currency = "EUR" | "GBP";
export type EurStyle = "suffix" | "prefix" | "fr";

const NBSP = "\u00a0";
const group = (n: number, sep: string) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** 'GBP' (any case) -> "GBP"; anything else, a missing value included, -> "EUR". */
export function normalizeCurrency(currency: unknown): Currency {
  return typeof currency === "string" && currency.trim().toUpperCase() === "GBP" ? "GBP" : "EUR";
}

/** 1250 -> "£12.50" (GBP) or, for EUR, "12.50€" / "€12.50" / "12,50 €" depending on eurStyle. */
export function formatMinor(minor: number, currency?: string | null, eurStyle: EurStyle = "suffix"): string {
  const n = Math.round(Number.isFinite(minor) ? minor : 0);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const sign = n < 0 ? "-" : "";
  if (normalizeCurrency(currency) === "GBP") return `${sign}£${group(whole, ",")}.${frac}`;
  if (eurStyle === "fr") return `${sign}${group(whole, NBSP)},${frac}${NBSP}€`;
  if (eurStyle === "prefix") return `${sign}€${whole}.${frac}`;
  return `${sign}${whole}.${frac}€`;
}
