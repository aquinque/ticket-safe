/**
 * Money display for Studio (first-sale) prices, in the event's own currency.
 *
 * London events are priced and charged in pounds, every other city in euros.
 * The currency lives on events.currency (and on each event_tiers row, kept in
 * sync by the database). Amounts are always integer minor units (cents or
 * pence). Resale stays in euros and keeps its own helpers in src/lib/fees.ts.
 */
export type Currency = "EUR" | "GBP";

export const CURRENCIES: Currency[] = ["EUR", "GBP"];

/** Normalise whatever the database or an old row holds; anything unknown is EUR. */
export const toCurrency = (c: string | null | undefined): Currency =>
  (c ?? "").toUpperCase() === "GBP" ? "GBP" : "EUR";

export const currencySymbol = (c: string | null | undefined): string =>
  toCurrency(c) === "GBP" ? "£" : "€";

/** The currency a new event gets from its city: pounds in London, euros elsewhere. */
export const currencyForCampus = (campus: string | null | undefined): Currency =>
  campus === "london" ? "GBP" : "EUR";

/** "£12.50" / "€12.50" from minor units. */
export const formatMoney = (minor: number, currency: string | null | undefined): string =>
  `${currencySymbol(currency)}${(minor / 100).toFixed(2)}`;

/** Same as formatMoney but drops ".00" on whole amounts: "£12", "€12.50". */
export const formatMoneyShort = (minor: number, currency: string | null | undefined): string => {
  const major = minor / 100;
  return `${currencySymbol(currency)}${Number.isInteger(major) ? major.toFixed(0) : major.toFixed(2)}`;
};

/** From a major-unit amount (e.g. events.base_price, a typed price): "£12.50". */
export const formatMajor = (major: number, currency: string | null | undefined): string =>
  `${currencySymbol(currency)}${major.toFixed(2)}`;
