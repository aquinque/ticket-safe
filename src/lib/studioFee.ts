/**
 * How the site words the Studio buyer service fee, in one place.
 *
 * Display only: the amount a buyer is charged always comes from the database
 * function get_studio_commission_cents (€0.80 + 4 % of the ticket price, never
 * above €3.50, nothing on a free ticket), read through
 * src/hooks/useServiceFee.ts. When that rule changes, change it there first,
 * then the numbers below. (Resale has its own model, in src/lib/fees.ts.)
 */
export const STUDIO_FEE_PERCENT = 4;
export const STUDIO_FEE_FIXED_EUR = 0.8;
export const STUDIO_FEE_MAX_EUR = 3.5;

const eur = (n: number) => `€${n.toFixed(2)}`;

/** "4% + €0.80 per ticket" */
export const STUDIO_FEE_RULE = `${STUDIO_FEE_PERCENT}% + ${eur(STUDIO_FEE_FIXED_EUR)} per ticket`;

/** "4% + €0.80 per ticket, max €3.50" */
export const STUDIO_FEE_RULE_MAX = `${STUDIO_FEE_RULE}, max ${eur(STUDIO_FEE_MAX_EUR)}`;

/** "4% of the ticket price + €0.80 per ticket, capped at €3.50 per ticket" */
export const STUDIO_FEE_RULE_LONG = `${STUDIO_FEE_PERCENT}% of the ticket price + ${eur(STUDIO_FEE_FIXED_EUR)} per ticket, capped at ${eur(STUDIO_FEE_MAX_EUR)} per ticket`;
