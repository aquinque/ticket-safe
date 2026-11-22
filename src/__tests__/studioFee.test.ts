import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STUDIO_FEE_RULE, studioFeeRule, studioFeeRuleWithMin } from "@/lib/studioFee";

// The wording must say what the database charges (get_studio_commission_cents). If one changes, change both.
describe("Studio service fee wording", () => {
  it("says 4% + €0.60 in euros and 4% + £0.70 in pounds", () => {
    expect(studioFeeRule("EUR")).toBe("4% + €0.60 per ticket");
    expect(studioFeeRuleWithMin("EUR")).toBe("4% + €0.60 per ticket, min €0.70");
    expect(studioFeeRule("GBP")).toBe("4% + £0.70 per ticket");
    expect(STUDIO_FEE_RULE).toBe("4% + €0.60 per ticket (4% + £0.70 for London events)");
  });

  it("matches the latest database formula on disk", () => {
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261122130000_service_fee_060.sql"), "utf8");
    expect(sql).toContain("GREATEST(70, 60 + ROUND(p_price_cents * 0.04)::integer)");
    expect(sql).toContain("GREATEST(60, 70 + ROUND(p_price_cents * 0.04)::integer)");
  });
});
