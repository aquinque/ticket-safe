import { describe, expect, it } from "vitest";
import { formatEur, groupByMonth, ibanLast4, sellerNetCents } from "@/components/wallet/walletModel";

describe("My Wallet helpers", () => {
  it("format euros in English", () => {
    expect(formatEur(4550)).toBe("€45.50");
    expect(formatEur(0)).toBe("€0.00");
    expect(formatEur(123456)).toBe("€1,234.56");
  });

  it("keep the last four IBAN characters", () => {
    expect(ibanLast4("FR76 3000 4000 0312 3456 7890 143")).toBe("0143");
    expect(ibanLast4(null)).toBe("");
  });

  it("count what the seller receives", () => {
    expect(sellerNetCents({ amount: "32.00", fee_amount: 0, commission_cents: 160 })).toBe(3040);
    expect(sellerNetCents({ amount: 30, fee_amount: "1.50", commission_cents: 160 }, false)).toBe(2850);
  });

  it("group newest first by month", () => {
    const g = groupByMonth([
      { at: "2026-10-03T10:00:00Z" },
      { at: "2026-11-01T10:00:00Z" },
      { at: "2026-10-20T10:00:00Z" },
    ]);
    expect(g.map((m) => m.label)).toEqual(["November 2026", "October 2026"]);
    expect(g[1].items.map((i) => i.at)).toEqual(["2026-10-20T10:00:00Z", "2026-10-03T10:00:00Z"]);
  });
});
