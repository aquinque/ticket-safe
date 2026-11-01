/**
 * How the site words the Studio buyer service fee, in one place.
 *
 * Display only: the amount a buyer is charged always comes from the database
 * function get_studio_commission_cents (4 % of the ticket price + €0.80, at
 * least €0.70; for a London event in pounds, 4 % + £0.70, at least £0.60; no
 * maximum; nothing on a free ticket), read through src/hooks/useServiceFee.ts.
 * When that rule changes, change it there first, then the numbers below.
 * (Resale has its own model, in src/lib/fees.ts.)
 */
import { formatMoney, toCurrency } from "@/lib/money";

export const STUDIO_FEE_PERCENT = 4;
/** Fixed part and floor of the fee per ticket, in minor units, per currency. */
export const STUDIO_FEE_FIXED_CENTS = { EUR: 80, GBP: 70 } as const;
export const STUDIO_FEE_MIN_CENTS = { EUR: 70, GBP: 60 } as const;

/** "4% + €0.80 per ticket" / "4% + £0.70 per ticket" */
export const studioFeeRule = (currency: string | null | undefined = "EUR"): string => {
  const c = toCurrency(currency);
  return `${STUDIO_FEE_PERCENT}% + ${formatMoney(STUDIO_FEE_FIXED_CENTS[c], c)} per ticket`;
};

/** "4% + €0.80 per ticket, min €0.70" */
export const studioFeeRuleWithMin = (currency: string | null | undefined = "EUR"): string => {
  const c = toCurrency(currency);
  return `${studioFeeRule(c)}, min ${formatMoney(STUDIO_FEE_MIN_CENTS[c], c)}`;
};

/** "4% of the ticket price + €0.80 per ticket (at least €0.70 per ticket)" */
export const studioFeeRuleLong = (currency: string | null | undefined = "EUR"): string => {
  const c = toCurrency(currency);
  return `${STUDIO_FEE_PERCENT}% of the ticket price + ${formatMoney(STUDIO_FEE_FIXED_CENTS[c], c)} per ticket (at least ${formatMoney(STUDIO_FEE_MIN_CENTS[c], c)} per ticket)`;
};

/** Both currencies, for pages that are not about one event: "4% + €0.80 per ticket (£0.70 for London events)" */
export const STUDIO_FEE_RULE = `${studioFeeRule("EUR")} (4% + £0.70 for London events)`;
export const STUDIO_FEE_RULE_LONG = `${studioFeeRuleLong("EUR")}; for London events priced in pounds, ${studioFeeRuleLong("GBP")}`;
