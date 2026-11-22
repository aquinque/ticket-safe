import { describe, expect, it } from "vitest";
import { dropLabel, dropParentOptions, isUpcomingDrop, studioDropStatus, tierReleaseState, type DropTier } from "@/lib/tierDrops";

const NOW = Date.parse("2026-11-22T18:00:00Z");
const tier = (over: Partial<DropTier> = {}): DropTier => ({
  id: "t2",
  name: "Drop 2",
  is_active: true,
  total_qty: 100,
  sold_qty: 0,
  reserved_qty: 0,
  sales_start_at: null,
  sales_end_at: null,
  opens_after_tier_id: null,
  released_at: null,
  ...over,
});
const all = [{ id: "t1", name: "Drop 1" }, { id: "t2", name: "Drop 2" }];

describe("tierReleaseState", () => {
  it("an ordinary tier is open", () => {
    expect(tierReleaseState(tier(), all, NOW)).toEqual({ kind: "open" });
  });

  it("a drop waits for the tier it follows until released", () => {
    const s = tierReleaseState(tier({ opens_after_tier_id: "t1" }), all, NOW);
    expect(s).toEqual({ kind: "waiting", afterId: "t1", afterName: "Drop 1" });
    expect(isUpcomingDrop(s)).toBe(true);
    expect(dropLabel(s)).toBe("Opens when Drop 1 sells out");
  });

  it("once released (sold out upstream, or opened by hand) it is open", () => {
    expect(tierReleaseState(tier({ opens_after_tier_id: "t1", released_at: "2026-11-22T17:00:00Z" }), all, NOW)).toEqual({ kind: "open" });
  });

  it("a future start date is scheduled, a past one is open", () => {
    const s = tierReleaseState(tier({ sales_start_at: "2026-11-23T19:00:00Z" }), all, NOW);
    expect(s.kind).toBe("scheduled");
    expect(isUpcomingDrop(s)).toBe(true);
    expect(dropLabel(s)).toMatch(/^Opens /);
    expect(tierReleaseState(tier({ sales_start_at: "2026-11-22T17:00:00Z" }), all, NOW)).toEqual({ kind: "open" });
  });

  it("a passed end date closes the tier", () => {
    const s = tierReleaseState(tier({ sales_end_at: "2026-11-22T17:00:00Z" }), all, NOW);
    expect(s).toEqual({ kind: "closed" });
    expect(isUpcomingDrop(s)).toBe(false);
    expect(dropLabel(s)).toBe("Sales closed");
  });

  it("sold out counts held tickets, like the database", () => {
    expect(tierReleaseState(tier({ total_qty: 10, sold_qty: 7, reserved_qty: 3 }), all, NOW)).toEqual({ kind: "sold_out" });
  });

  it("a switched-off tier is inactive whatever else is set", () => {
    expect(tierReleaseState(tier({ is_active: false, opens_after_tier_id: "t1" }), all, NOW)).toEqual({ kind: "inactive" });
  });

  it("an unknown parent still reads sensibly", () => {
    const s = tierReleaseState(tier({ opens_after_tier_id: "gone" }), all, NOW);
    expect(dropLabel(s)).toBe("Opens when the previous ticket sells out");
  });
});

describe("studioDropStatus", () => {
  it("says what the organiser needs to know", () => {
    expect(studioDropStatus({ kind: "waiting", afterId: "t1", afterName: "Drop 1" }, null)).toBe("Waiting for Drop 1 to sell out");
    expect(studioDropStatus({ kind: "open" }, null)).toBe("On sale");
    expect(studioDropStatus({ kind: "open" }, "2026-11-22T17:00:00Z")).toMatch(/^Opened /);
    expect(studioDropStatus({ kind: "inactive" }, null)).toBe("Hidden");
  });
});

describe("dropParentOptions", () => {
  const tiers = [
    { id: "a", opens_after_tier_id: null },
    { id: "b", opens_after_tier_id: "a" },
    { id: "c", opens_after_tier_id: "b" },
    { id: "d", opens_after_tier_id: null },
  ];
  it("never offers the tier itself", () => {
    expect(dropParentOptions("d", tiers).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
  it("never offers a tier that already waits for this one (no loops)", () => {
    expect(dropParentOptions("a", tiers).map((t) => t.id)).toEqual(["d"]);
    expect(dropParentOptions("b", tiers).map((t) => t.id)).toEqual(["a", "d"]);
  });
});
