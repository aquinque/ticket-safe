import { describe, expect, it } from "vitest";
import { payoutCountryCode, payoutCountryName } from "@/lib/payoutCountries";

describe("payout countries", () => {
  it("reads codes, names and the usual other spellings", () => {
    expect(payoutCountryCode("France")).toBe("FR");
    expect(payoutCountryCode("fr")).toBe("FR");
    expect(payoutCountryCode("United Kingdom")).toBe("GB");
    expect(payoutCountryCode(" uk ")).toBe("GB");
    expect(payoutCountryCode("England")).toBe("GB");
    expect(payoutCountryCode("Spain")).toBe("ES");
    expect(payoutCountryCode("España")).toBe("ES");
  });

  it("never guesses a code from the first letters", () => {
    // The old address code turned "Spain" into "SP" and "United Kingdom" into "UN".
    expect(payoutCountryCode("Narnia")).toBeNull();
    expect(payoutCountryCode("")).toBeNull();
    expect(payoutCountryCode(null)).toBeNull();
  });

  it("names a code", () => {
    expect(payoutCountryName("GB")).toBe("United Kingdom");
  });
});
