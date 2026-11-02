import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUYER_FEE_RATE,
  BUYER_FEE_RATE_HIGH,
  HIGH_VALUE_THRESHOLD_EUR,
  RESALE_BUYER_FEE_COPY,
  RESALE_BUYER_FEE_PHRASE,
  buyerFeeRateFor,
  calcBreakdown,
} from "../lib/fees";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("how the site words the resale buyer fee", () => {
  it("states one flat rate", () => {
    expect(RESALE_BUYER_FEE_COPY).toBe("5%");
    expect(RESALE_BUYER_FEE_PHRASE).toBe("5%");
  });

  it("follows the rates the checkout uses", () => {
    expect(buyerFeeRateFor(HIGH_VALUE_THRESHOLD_EUR - 0.01)).toBe(BUYER_FEE_RATE);
    expect(buyerFeeRateFor(HIGH_VALUE_THRESHOLD_EUR)).toBe(BUYER_FEE_RATE_HIGH);
  });

  it("is the only place the percentages are written in the pages that state the fee", () => {
    for (const page of [
      "src/pages/HowItWorks.tsx",
      "src/pages/TermsConditions.tsx",
      "src/pages/RefundPolicy.tsx",
      "src/pages/settings/MyListings.tsx",
    ]) {
      const source = read(page);
      expect(source, page).toMatch(/RESALE_BUYER_FEE_(COPY|PHRASE)/);
      expect(source, page).not.toMatch(/\b[67]%/);
    }
  });
});

describe("the tiers match the server", () => {
  // If you change a rate or the threshold, change revolut-resale-checkout and src/lib/fees.ts together.
  const server = read("supabase/functions/revolut-resale-checkout/index.ts");
  const constant = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(server)?.[1]);

  it("charges the same percentages and threshold as the checkout page", () => {
    const stripe = read("supabase/functions/stripe-connect-resale-checkout/index.ts");
    expect(Number(/const BUYER_FEE_PERCENT = (\d+);/.exec(stripe)?.[1])).toBe(Math.round(BUYER_FEE_RATE * 100));
    expect(constant("BUYER_FEE_PERCENT")).toBe(Math.round(BUYER_FEE_RATE * 100));
    expect(constant("BUYER_FEE_PERCENT_HIGH")).toBe(Math.round(BUYER_FEE_RATE_HIGH * 100));
    expect(constant("HIGH_VALUE_THRESHOLD_EUR")).toBe(HIGH_VALUE_THRESHOLD_EUR);
  });
});

describe("the example on the How It Works page", () => {
  // The page computes its example with calcBreakdown at €40; these are the figures a visitor reads.
  it("shows a €40 ticket at 5%", () => {
    const example = calcBreakdown(40, 1);
    expect(example.buyerFeeCents).toBe(200);
    expect(example.buyerTotalCents).toBe(4200);
    expect(example.sellerCommissionCents).toBe(200);
    expect(example.sellerPayoutCents).toBe(3800);
  });

  it("uses the same 5% at €50", () => {
    const fifty = calcBreakdown(50, 1);
    expect(fifty.buyerFeeCents).toBe(250);
    expect(fifty.buyerTotalCents).toBe(5250);
  });
});
