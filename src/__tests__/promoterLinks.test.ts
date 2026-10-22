import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

// The module under test builds its Supabase calls on the shared client, which needs real env variables to exist.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      insert: mocks.insert,
      update: (patch: Record<string, unknown>) => {
        mocks.update(patch);
        return { eq: mocks.eq };
      },
    }),
  },
}));

import {
  PROMOTER_CODE_PATTERN,
  PROMOTER_LINKS_MAX,
  PROMOTER_NAME_MAX,
  conversionRate,
  createPromoterLink,
  fetchPromoterStats,
  formatRate,
  isPromoterCode,
  makePromoterCode,
  orderPromoterLinks,
  parsePromoterStats,
  promoterLinkUrl,
  promoterShare,
  readPromoterRef,
  setPromoterLinkArchived,
  slugifyForCode,
  trackPromoterVisit,
  type PromoterLinkStats,
} from "../lib/promoterLinks";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("promoter code in the address", () => {
  it("reads ?ref=, whatever else is in the query", () => {
    expect(readPromoterRef("?ref=lea-k3x")).toBe("lea-k3x");
    expect(readPromoterRef("?checkout=cancelled&ref=lea-k3x&utm_source=ig")).toBe("lea-k3x");
  });

  it("lowercases and trims, like the database lookup does", () => {
    expect(readPromoterRef("?ref=LEA-K3X")).toBe("lea-k3x");
    expect(readPromoterRef("?ref=%20lea-k3x%20")).toBe("lea-k3x");
  });

  it("ignores a missing or malformed code", () => {
    expect(readPromoterRef("")).toBeNull();
    expect(readPromoterRef("?ref=")).toBeNull();
    expect(readPromoterRef("?other=1")).toBeNull();
    expect(readPromoterRef("?ref=a")).toBeNull();
    expect(readPromoterRef("?ref=-lea")).toBeNull();
    expect(readPromoterRef("?ref=lea-")).toBeNull();
    expect(readPromoterRef("?ref=le%20a")).toBeNull();
    expect(readPromoterRef("?ref=l%C3%A9a")).toBeNull();
    expect(readPromoterRef("?ref=lea;drop")).toBeNull();
  });

  it("accepts 3 to 40 characters", () => {
    expect(isPromoterCode("abc")).toBe(true);
    expect(isPromoterCode("a".repeat(40))).toBe(true);
    expect(isPromoterCode("ab")).toBe(false);
    expect(isPromoterCode("a".repeat(41))).toBe(false);
    expect(isPromoterCode(undefined)).toBe(false);
  });
});

describe("making a code from a name", () => {
  it("drops accents and punctuation", () => {
    expect(slugifyForCode("Léa — Insta")).toBe("lea-insta");
    expect(slugifyForCode("  BDE Sciences & Co.  ")).toBe("bde-sciences-co");
    expect(slugifyForCode("@soireesparis")).toBe("soireesparis");
  });

  it("keeps at most 24 characters and never ends on a hyphen", () => {
    const slug = slugifyForCode("Association des étudiants de la faculté de droit");
    expect(slug.length).toBeLessThanOrEqual(24);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("association-des")).toBe(true);
  });

  it("is empty when nothing usable is left", () => {
    expect(slugifyForCode("🎉🎉")).toBe("");
    expect(slugifyForCode("   ")).toBe("");
  });

  it("adds three characters after the name", () => {
    expect(makePromoterCode("Léa", () => 0)).toBe("lea-aaa");
    expect(makePromoterCode("Léa", () => 0.999999)).toBe("lea-999");
  });

  it("always gives a code the database accepts", () => {
    for (const name of ["Léa", "A", "9", "🎉", "", "   ", "x".repeat(200), "Élodie & Théo — Lyon 2", "-", "@@"]) {
      for (let i = 0; i < 25; i++) {
        const code = makePromoterCode(name);
        expect(PROMOTER_CODE_PATTERN.test(code), `${name} -> ${code}`).toBe(true);
      }
    }
  });

  it("builds the link on the public event page", () => {
    expect(promoterLinkUrl("soiree-gala", "lea-k3x")).toBe("https://ticket-safe.eu/e/soiree-gala?ref=lea-k3x");
  });
});

describe("the limits match the database and the checkout functions", () => {
  // If you change one of these, change all of them: the migration, both Studio checkout functions and the client.
  const core = "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]";

  it("uses the same code pattern everywhere", () => {
    expect(PROMOTER_CODE_PATTERN.source).toBe(`^${core}$`);
    expect(read("supabase/migrations/20261021120000_event_promoter_links.sql")).toContain(`'^${core}$'`);
    expect(read("supabase/functions/revolut-create-checkout/index.ts")).toContain(`/^${core}$/`);
    expect(read("supabase/functions/stripe-connect-create-checkout/index.ts")).toContain(`/^${core}$/`);
  });

  it("uses the same name and link limits as the migration", () => {
    const sql = read("supabase/migrations/20261021120000_event_promoter_links.sql");
    expect(sql).toContain(`BETWEEN 1 AND ${PROMOTER_NAME_MAX}`);
    expect(sql).toContain(`v_active >= ${PROMOTER_LINKS_MAX}`);
  });

  it("sends the code to both Studio checkouts under the same key the client uses", () => {
    expect(read("supabase/functions/revolut-create-checkout/index.ts")).toContain("body.promoter_code");
    expect(read("supabase/functions/stripe-connect-create-checkout/index.ts")).toContain("body.promoter_code");
    expect(read("src/pages/EventPublic.tsx")).toContain("promoter_code: promoterRef");
  });
});

describe("reading the organizer's numbers", () => {
  const payload = {
    links: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Léa",
        code: "lea-k3x",
        created_at: "2026-10-20T08:00:00+00:00",
        archived_at: null,
        visits: 120,
        last_visit_day: "2026-10-21",
        checkouts: 9,
        paid_orders: 5,
        tickets: 7,
        revenue_cents: "7000",
        last_sale_at: "2026-10-21T17:30:00+00:00",
        series: [
          { day: "2026-10-20", visits: 30, tickets: 0 },
          { day: "2026-10-21", visits: 90, tickets: 7 },
        ],
      },
    ],
    other: { paid_orders: 4, tickets: 6, revenue_cents: 6000 },
    as_of: "2026-10-22",
  };

  it("maps a normal answer", () => {
    const stats = parsePromoterStats(payload);
    expect(stats.links).toHaveLength(1);
    expect(stats.links[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Léa",
      code: "lea-k3x",
      archivedAt: null,
      visits: 120,
      checkouts: 9,
      paidOrders: 5,
      tickets: 7,
      revenueCents: 7000,
      lastSaleAt: "2026-10-21T17:30:00+00:00",
    });
    expect(stats.links[0].series).toEqual(payload.links[0].series);
    expect(stats.other).toEqual({ paidOrders: 4, tickets: 6, revenueCents: 6000 });
  });

  it("turns anything unexpected into zero instead of failing", () => {
    for (const raw of [null, undefined, [], "oops", 12, {}, { links: "x", other: 3 }]) {
      const stats = parsePromoterStats(raw);
      expect(stats.links).toEqual([]);
      expect(stats.other).toEqual({ paidOrders: 0, tickets: 0, revenueCents: 0 });
    }
  });

  it("skips rows with no id or code, and bad numbers count as zero", () => {
    const stats = parsePromoterStats({
      links: [{ name: "no id", code: "abc" }, { id: "x" }, { id: "y", code: "xyz", visits: "NaN", tickets: null, series: [{ visits: 1 }, "bad"] }],
    });
    expect(stats.links).toHaveLength(1);
    expect(stats.links[0]).toMatchObject({ id: "y", name: "xyz", visits: 0, tickets: 0, series: [] });
  });
});

const link = (over: Partial<PromoterLinkStats>): PromoterLinkStats => ({
  id: "id",
  name: "name",
  code: "code",
  createdAt: "2026-10-20T00:00:00Z",
  archivedAt: null,
  visits: 0,
  checkouts: 0,
  paidOrders: 0,
  tickets: 0,
  revenueCents: 0,
  lastSaleAt: null,
  series: [],
  ...over,
});

describe("ordering the links", () => {
  it("puts active links before archived ones, then most tickets, most visits, newest", () => {
    const ordered = orderPromoterLinks([
      link({ id: "archived-best", tickets: 99, archivedAt: "2026-10-21T00:00:00Z" }),
      link({ id: "few-visits", visits: 5 }),
      link({ id: "sold-2", tickets: 2 }),
      link({ id: "sold-5", tickets: 5 }),
      link({ id: "many-visits", visits: 50 }),
      link({ id: "newer", visits: 5, createdAt: "2026-10-21T00:00:00Z" }),
    ]).map((l) => l.id);
    expect(ordered).toEqual(["sold-5", "sold-2", "many-visits", "newer", "few-visits", "archived-best"]);
  });

  it("keeps a link just created on top", () => {
    const ordered = orderPromoterLinks([link({ id: "best", tickets: 9 }), link({ id: "fresh" })], "fresh").map((l) => l.id);
    expect(ordered).toEqual(["fresh", "best"]);
  });

  it("does not change the list it is given", () => {
    const input = [link({ id: "a" }), link({ id: "b", tickets: 1 })];
    orderPromoterLinks(input);
    expect(input.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("conversion and share", () => {
  it("is paid orders per visit, and nothing without visits", () => {
    expect(conversionRate(0, 3)).toBeNull();
    expect(conversionRate(200, 5)).toBeCloseTo(0.025);
    expect(conversionRate(4, 9)).toBe(1);
    expect(conversionRate(10, 0)).toBe(0);
  });

  it("is written short", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.034)).toBe("3.4%");
    expect(formatRate(0.125)).toBe("13%");
    expect(formatRate(1)).toBe("100%");
  });

  it("counts the tickets that came through promoter links", () => {
    const stats = {
      links: [link({ tickets: 6 }), link({ id: "b", tickets: 4, archivedAt: "2026-10-21T00:00:00Z" })],
      other: { paidOrders: 3, tickets: 10, revenueCents: 10000 },
    };
    expect(promoterShare(stats)).toEqual({ viaLinks: 10, total: 20, percent: 50 });
    expect(promoterShare({ links: [], other: { paidOrders: 0, tickets: 0, revenueCents: 0 } })).toEqual({ viaLinks: 0, total: 0, percent: 0 });
  });
});

describe("talking to Supabase", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.insert.mockReset();
    mocks.update.mockReset();
    mocks.eq.mockReset();
  });

  it("counts a visit with the slug and the code, and never throws", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await trackPromoterVisit("gala", "lea-k3x");
    expect(mocks.rpc).toHaveBeenCalledWith("track_promoter_visit", { p_slug: "gala", p_code: "lea-k3x" });

    mocks.rpc.mockRejectedValueOnce(new Error("offline"));
    await expect(trackPromoterVisit("gala", "lea-k3x")).resolves.toBeUndefined();
  });

  it("reads the stats of one event", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { links: [], other: { paid_orders: 1, tickets: 2, revenue_cents: 3 } }, error: null });
    const stats = await fetchPromoterStats("event-1");
    expect(mocks.rpc).toHaveBeenCalledWith("promoter_link_stats", { p_event_id: "event-1" });
    expect(stats.other).toEqual({ paidOrders: 1, tickets: 2, revenueCents: 3 });

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "not allowed", code: "42501" } });
    await expect(fetchPromoterStats("event-1")).rejects.toThrow("not allowed");
  });

  it("creates a link and returns its code", async () => {
    mocks.insert.mockResolvedValueOnce({ data: null, error: null });
    const code = await createPromoterLink("event-1", "  Léa  ", "user-1");
    expect(PROMOTER_CODE_PATTERN.test(code)).toBe(true);
    expect(code.startsWith("lea-")).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith({ event_id: "event-1", name: "Léa", code, created_by: "user-1" });
  });

  it("tries a new code when one is already taken on the event", async () => {
    mocks.insert
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ data: null, error: null });
    await createPromoterLink("event-1", "Léa", null);
    expect(mocks.insert).toHaveBeenCalledTimes(3);
    expect(mocks.insert.mock.calls[2][0]).not.toHaveProperty("created_by");
  });

  it("gives up after four taken codes", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    await expect(createPromoterLink("event-1", "Léa", null)).rejects.toThrow(/free code/);
    expect(mocks.insert).toHaveBeenCalledTimes(4);
  });

  it("shows the organizer the limit message, and hides technical errors", async () => {
    mocks.insert.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "An event can have at most 50 active promoter links. Archive one first." },
    });
    await expect(createPromoterLink("event-1", "Léa", null)).rejects.toThrow("An event can have at most 50 active promoter links. Archive one first.");

    mocks.insert.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "relation \"x\" exploded" } });
    await expect(createPromoterLink("event-1", "Léa", null)).rejects.toThrow("Could not save the link. Please try again.");
  });

  it("refuses an empty name without calling the database", async () => {
    await expect(createPromoterLink("event-1", "   ", null)).rejects.toThrow(/name/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("archives and restores", async () => {
    mocks.eq.mockResolvedValue({ data: null, error: null });
    await setPromoterLinkArchived("link-1", true);
    expect(mocks.update.mock.calls[0][0].archived_at).toEqual(expect.any(String));
    expect(mocks.eq).toHaveBeenCalledWith("id", "link-1");

    await setPromoterLinkArchived("link-1", false);
    expect(mocks.update.mock.calls[1][0]).toEqual({ archived_at: null });

    mocks.eq.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "An event can have at most 50 active promoter links. Archive one first." } });
    await expect(setPromoterLinkArchived("link-1", false)).rejects.toThrow(/at most 50/);
  });
});
