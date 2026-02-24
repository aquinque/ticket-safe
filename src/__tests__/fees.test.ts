import { describe, it, expect } from "vitest";
import {
  BUYER_FEE_RATE,
  SELLER_COMMISSION_RATE,
  toCents,
  toEuros,
  calcBuyerFeeCents,
  calcBuyerTotalCents,
  calcSellerCommissionCents,
  calcSellerPayoutCents,
  calcBreakdown,
} from "../lib/fees";

describe("fee constants", () => {
  it("buyer fee rate is 5%", () => expect(BUYER_FEE_RATE).toBe(0.05));
  it("seller commission rate is 5%", () => expect(SELLER_COMMISSION_RATE).toBe(0.05));
});

describe("currency conversion", () => {
  it("toCents rounds correctly", () => {
    expect(toCents(50)).toBe(5000);
    expect(toCents(52.5)).toBe(5250);
    expect(toCents(9.999)).toBe(1000); // round half-up
  });
  it("toEuros converts back", () => {
    expect(toEuros(5000)).toBe(50);
    expect(toEuros(5250)).toBe(52.5);
  });
});

describe("buyer fee calculations", () => {
  it("5% buyer fee on €50 = 250 cents", () => {
    expect(calcBuyerFeeCents(5000)).toBe(250);
  });
  it("buyer total on €50 = 5250 cents", () => {
    expect(calcBuyerTotalCents(5000)).toBe(5250);
  });
  it("handles fractional cent rounding (e.g. €33 ticket)", () => {
    const fee = calcBuyerFeeCents(3300); // 33 * 5% = 1.65 → 165 cents
    expect(fee).toBe(165);
  });
});

describe("seller commission calculations", () => {
  it("5% commission on €50 = 250 cents", () => {
    expect(calcSellerCommissionCents(5000)).toBe(250);
  });
  it("seller payout on €50 = 4750 cents", () => {
    expect(calcSellerPayoutCents(5000)).toBe(4750);
  });
  it("seller payout + commission = list price", () => {
    const listPriceCents = 7300;
    expect(calcSellerPayoutCents(listPriceCents) + calcSellerCommissionCents(listPriceCents)).toBe(
      listPriceCents
    );
  });
});

describe("calcBreakdown", () => {
  it("€50 ticket × 1 gives correct breakdown", () => {
    const b = calcBreakdown(50, 1);
    expect(b.listPriceCents).toBe(5000);
    expect(b.buyerFeeCents).toBe(250);
    expect(b.buyerTotalCents).toBe(5250);
    expect(b.sellerCommissionCents).toBe(250);
    expect(b.sellerPayoutCents).toBe(4750);
    // Euro helpers
    expect(b.listPriceEuros).toBe(50);
    expect(b.buyerFeeEuros).toBe(2.5);
    expect(b.buyerTotalEuros).toBe(52.5);
    expect(b.sellerCommissionEuros).toBe(2.5);
    expect(b.sellerPayoutEuros).toBe(47.5);
  });

  it("€25 ticket × 2 = €50 list price", () => {
    const b = calcBreakdown(25, 2);
    expect(b.listPriceCents).toBe(5000);
    expect(b.buyerTotalEuros).toBe(52.5);
    expect(b.sellerPayoutEuros).toBe(47.5);
  });

  it("defaults quantity to 1", () => {
    const b1 = calcBreakdown(50);
    const b2 = calcBreakdown(50, 1);
    expect(b1.buyerTotalCents).toBe(b2.buyerTotalCents);
  });

  it("buyer total - list price = buyer fee", () => {
    const b = calcBreakdown(37.99, 3);
    expect(b.buyerTotalCents - b.listPriceCents).toBe(b.buyerFeeCents);
  });

  it("list price - seller payout = seller commission", () => {
    const b = calcBreakdown(37.99, 3);
    expect(b.listPriceCents - b.sellerPayoutCents).toBe(b.sellerCommissionCents);
  });
});
