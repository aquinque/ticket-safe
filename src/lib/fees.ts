/**
 * Centralized fee logic for TicketSafe.
 *
 * Model:
 *  - Buyer pays 5% on top of the listing price  (BUYER_FEE_RATE)
 *  - Seller pays 5% deducted from the listing price (SELLER_COMMISSION_RATE)
 *
 * All monetary calculations use integer cents to avoid floating-point drift.
 */

export const BUYER_FEE_RATE = 0.05;
export const SELLER_COMMISSION_RATE = 0.05;

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
 * Calculate the full fee breakdown for a ticket at `priceEuros` per ticket
 * for `quantity` tickets.
 */
export const calcBreakdown = (priceEuros: number, quantity: number = 1): FeeBreakdown => {
  const listPriceCents = toCents(priceEuros * quantity);
  const buyerFeeCents = calcBuyerFeeCents(listPriceCents);
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
