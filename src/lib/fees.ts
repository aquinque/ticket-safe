/**
 * Centralized fee logic for TicketSafe — RESALE marketplace.
 *
 * Model (resale):
 *  - Buyer pays 5% on top of the listing price  (BUYER_FEE_RATE), whatever the price
 *  - Seller gets the listing price minus 5%      (SELLER_COMMISSION_RATE), paid out
 *    after the event
 *
 * (Studio primary sales use their own model instead: a per-ticket service fee
 * paid by the buyer, computed only in the database function
 * get_studio_commission_cents and read through src/hooks/useServiceFee.ts;
 * 0% from the organizer.)
 * All monetary calculations use integer cents to avoid floating-point drift.
 */

export const BUYER_FEE_RATE = 0.05;
/** Kept equal to BUYER_FEE_RATE: the resale fee no longer steps up for pricier tickets (it used to be 6 % / 7 %). */
export const BUYER_FEE_RATE_HIGH = 0.05;
/** Unit price (per ticket, EUR) at/above which BUYER_FEE_RATE_HIGH applies; no effect while both rates are equal. */
export const HIGH_VALUE_THRESHOLD_EUR = 50;
export const SELLER_COMMISSION_RATE = 0.05;

/** Buyer fee rate for a given unit (per-ticket) price in euros. */
export const buyerFeeRateFor = (unitPriceEuros: number): number =>
  unitPriceEuros >= HIGH_VALUE_THRESHOLD_EUR ? BUYER_FEE_RATE_HIGH : BUYER_FEE_RATE;

const percent = (rate: number) => Math.round(rate * 100);

/**
 * How the site words the resale buyer fee: "5%", one flat rate whatever the price. Display only: what is
 * charged comes from BUYER_FEE_PERCENT in stripe-connect-resale-checkout (and the legacy
 * revolut-resale-checkout), kept equal to BUYER_FEE_RATE by src/__tests__/resaleFeeCopy.test.ts.
 * Studio sales have their own wording in studioFee.ts.
 */
export const RESALE_BUYER_FEE_COPY = `${percent(BUYER_FEE_RATE)}%`;

/** The same words for use inside a sentence ("a 5% service fee"). Kept separate in case the wording diverges again. */
export const RESALE_BUYER_FEE_PHRASE = `${percent(BUYER_FEE_RATE)}%`;

/** How the site words the resale seller commission: "5%", taken from the listing price (get_resale_commission_cents). */
export const RESALE_SELLER_COMMISSION_COPY = `${percent(SELLER_COMMISSION_RATE)}%`;

/** Convert euros (possibly fractional) to integer cents, rounding half-up. */
export const toCents = (euros: number): number => Math.round(euros * 100);

/** Convert integer cents back to euros. */
export const toEuros = (cents: number): number => cents / 100;

/** Buyer service fee in cents for a given list price in cents. */
export const calcBuyerFeeCents = (listPriceCents: number): number =>
  Math.round(listPriceCents * BUYER_FEE_RATE);

/** Total amount charged to the buyer (list price + buyer fee), in cents. */
export const calcBuyerTotalCents = (listPriceCents: number): number =>
  listPriceCents + calcBuyerFeeCents(listPriceCents);

/** Platform commission deducted from the seller, in cents. */
export const calcSellerCommissionCents = (listPriceCents: number): number =>
  Math.round(listPriceCents * SELLER_COMMISSION_RATE);

/** Net payout the seller receives after commission, in cents. */
export const calcSellerPayoutCents = (listPriceCents: number): number =>
  listPriceCents - calcSellerCommissionCents(listPriceCents);

/**
 * Convenience object returned by calcBreakdown.
 * All monetary values are in cents unless suffixed with Euros.
 */
export interface FeeBreakdown {
  listPriceCents: number;
  buyerFeeCents: number;
  buyerTotalCents: number;
  sellerCommissionCents: number;
  sellerPayoutCents: number;
  // Euro helpers (derived)
  listPriceEuros: number;
  buyerFeeEuros: number;
  buyerTotalEuros: number;
  sellerCommissionEuros: number;
  sellerPayoutEuros: number;
}

/**
 * Fair-price assessment for a resale listing vs the ticket's face value.
 * Returns null when no face value is known (so callers can render nothing).
 */
export interface FairPrice {
  faceValue: number;
  /** Signed % difference vs face value (negative = cheaper than face). */
  deltaPct: number;
  tone: "good" | "fair" | "high";
  label: string;
}

export const evaluateFairPrice = (
  sellingPrice: number,
  faceValue: number | null | undefined,
): FairPrice | null => {
  if (faceValue == null || !isFinite(faceValue) || faceValue <= 0) return null;
  const deltaPct = Math.round(((sellingPrice - faceValue) / faceValue) * 100);
  if (deltaPct <= 0) {
    return {
      faceValue,
      deltaPct,
      tone: "good",
      label: deltaPct === 0 ? "At face value" : `${Math.abs(deltaPct)}% below face value`,
    };
  }
  if (deltaPct <= 10) {
    return { faceValue, deltaPct, tone: "fair", label: "Fair price" };
  }
  return { faceValue, deltaPct, tone: "high", label: `${deltaPct}% above face value` };
};

/**
 * Calculate the full fee breakdown for a ticket at `priceEuros` per ticket
 * for `quantity` tickets.
 */
export const calcBreakdown = (priceEuros: number, quantity: number = 1): FeeBreakdown => {
  const listPriceCents = toCents(priceEuros * quantity);
  // Buyer fee tier is based on the UNIT price (per ticket), not the line total.
  const buyerFeeCents = Math.round(listPriceCents * buyerFeeRateFor(priceEuros));
  const buyerTotalCents = listPriceCents + buyerFeeCents;
  const sellerCommissionCents = calcSellerCommissionCents(listPriceCents);
  const sellerPayoutCents = listPriceCents - sellerCommissionCents;

  return {
    listPriceCents,
    buyerFeeCents,
    buyerTotalCents,
    sellerCommissionCents,
    sellerPayoutCents,
    listPriceEuros: toEuros(listPriceCents),
    buyerFeeEuros: toEuros(buyerFeeCents),
    buyerTotalEuros: toEuros(buyerTotalCents),
    sellerCommissionEuros: toEuros(sellerCommissionCents),
    sellerPayoutEuros: toEuros(sellerPayoutCents),
  };
};
