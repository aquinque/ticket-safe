import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RESALE_LISTINGS_QUERY_KEY,
  fetchResaleListing,
  fetchResaleListings,
  formatEuroCents,
  groupResaleListingsByEvent,
  listedAgo,
  parseResaleListingRows,
  resaleCardMeta,
  resaleCardPricing,
  resaleListingQueryKey,
  resaleListingsQueryKey,
  sortByPriceAsc,
  type ResaleListingRow,
} from "../lib/resaleListings";
import { calcBreakdown, RESALE_BUYER_FEE_PHRASE } from "../lib/fees";
import type { RpcCaller } from "../lib/supabaseRpc";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const row = (over: Partial<ResaleListingRow> = {}): ResaleListingRow => ({
  listing_id: "l-1",
  event_id: "e-1",
  tier_name: "Regular",
  price_cents: 1400,
  quantity: 1,
  listed_at: "2026-11-03T10:00:00Z",
  is_boosted: false,
  photo_url: null,
  video_url: null,
  is_own: false,
  is_reserved: false,
  event_title: "Halloween Party",
  event_slug: "halloween",
  event_date: "2026-11-07T21:00:00Z",
  event_ends_at: null,
  event_location: "Madrid",
  event_category: "party",
  event_university: "ESCP Business School",
  event_campus: "Madrid",
  event_banner_url: "https://example.test/banner.jpg",
  event_video_url: null,
  event_base_price: 12,
  ...over,
});

describe("parseResaleListingRows", () => {
  it("keeps only the contract fields, so a stray sensitive column never reaches the UI", () => {
    const leaky = { ...row(), seller_id: "s-1", qr_hash: "secret", notes: "call me 600 000 000", buyer_id: "b-1" };
    const [l] = parseResaleListingRows([leaky]);
    const json = JSON.stringify(l);
    for (const key of ["seller_id", "sellerId", "qr_hash", "qrHash", "notes", "buyer_id", "secret", "600 000 000"]) {
      expect(json).not.toContain(key);
    }
    expect(l).toMatchObject({
      id: "l-1",
      eventId: "e-1",
      tierName: "Regular",
      priceCents: 1400,
      quantity: 1,
      isOwn: false,
      isReserved: false,
      event: { id: "e-1", title: "Halloween Party", university: "ESCP Business School", basePrice: 12 },
    });
  });

  it("drops malformed rows and anything that isn't an array", () => {
    expect(parseResaleListingRows(null)).toEqual([]);
    expect(parseResaleListingRows({ listing_id: "x" })).toEqual([]);
    const rows = parseResaleListingRows([
      row({ listing_id: "ok" }),
      null,
      "garbage",
      { ...row(), listing_id: undefined },
      row({ listing_id: "no-price", price_cents: Number.NaN }),
      row({ listing_id: "neg", price_cents: -1 }),
      row({ listing_id: "zero-qty", quantity: 0 }),
      row({ listing_id: "frac", price_cents: 12.5 }),
      { ...row({ listing_id: "no-date" }), listed_at: null },
    ]);
    expect(rows.map((l) => l.id)).toEqual(["ok"]);
  });

  it("reads a numeric sent as a string (Postgres numeric) and defaults flags to false", () => {
    const [l] = parseResaleListingRows([{ ...row(), event_base_price: "12.50", is_boosted: null, is_own: "true" }]);
    expect(l.event.basePrice).toBe(12.5);
    expect(l.isBoosted).toBe(false);
    expect(l.isOwn).toBe(false);
  });
});

describe("sorting and grouping", () => {
  const listings = parseResaleListingRows([
    row({ listing_id: "a", event_id: "e-1", price_cents: 1600, quantity: 1 }),
    row({ listing_id: "b", event_id: "e-2", price_cents: 900, quantity: 2, event_title: "Gala", is_boosted: true }),
    row({ listing_id: "c", event_id: "e-1", price_cents: 1300, quantity: 2, listed_at: "2026-11-04T09:00:00Z" }),
    row({ listing_id: "d", event_id: "e-1", price_cents: 1300, quantity: 1, listed_at: "2026-11-01T09:00:00Z" }),
  ]);

  it("sorts cheapest first, then oldest listing", () => {
    expect(sortByPriceAsc(listings).map((l) => l.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("groups by event, cheapest group first, with the lowest price and the number of tickets", () => {
    const groups = groupResaleListingsByEvent(listings);
    expect(groups.map((g) => g.event.id)).toEqual(["e-2", "e-1"]);
    const e1 = groups[1];
    expect(e1.listings.map((l) => l.id)).toEqual(["d", "c", "a"]);
    expect(e1.minPriceCents).toBe(1300);
    expect(e1.ticketCount).toBe(4);
    expect(e1.hasBoosted).toBe(false);
    expect(groups[0]).toMatchObject({ minPriceCents: 900, ticketCount: 2, hasBoosted: true });
  });
});

describe("card pricing and copy", () => {
  it("prices one ticket and a pair, fee included, like the checkout", () => {
    expect(resaleCardPricing({ priceCents: 1400, quantity: 1 })).toEqual({ eachCents: 1470, totalCents: 1470 });
    expect(resaleCardPricing({ priceCents: 1400, quantity: 2 })).toEqual({ eachCents: 1470, totalCents: 2940 });
  });

  it("matches calcBreakdown and the server's round(subtotal * 5 / 100) for every price", () => {
    for (let cents = 1; cents <= 30_000; cents += 7) {
      for (const qty of [1, 2, 3]) {
        const { eachCents, totalCents } = resaleCardPricing({ priceCents: cents, quantity: qty });
        expect(totalCents).toBe(calcBreakdown(cents / 100, qty).buyerTotalCents);
        expect(eachCents).toBe(calcBreakdown(cents / 100, 1).buyerTotalCents);
        const subtotal = cents * qty;
        expect(totalCents).toBe(subtotal + Math.round((subtotal * 5) / 100));
      }
    }
  });

  it("words when a single ticket was listed, with the fee from fees.ts", () => {
    const now = new Date("2026-11-04T18:00:00Z");
    const one = (listedAt: string) => resaleCardMeta({ priceCents: 1400, quantity: 1, listedAt }, now);
    expect(one("2026-11-04T08:00:00Z")).toBe(`Listed today · incl. ${RESALE_BUYER_FEE_PHRASE} fee`);
    expect(one("2026-11-03T23:30:00Z")).toBe(`Listed yesterday · incl. ${RESALE_BUYER_FEE_PHRASE} fee`);
    expect(one("2026-10-30T12:00:00Z")).toBe(`Listed 5 days ago · incl. ${RESALE_BUYER_FEE_PHRASE} fee`);
    expect(one("2026-11-04T08:00:00Z")).toBe("Listed today · incl. 5% fee");
    expect(listedAgo("not a date", now)).toBe("Listed recently");
    // A clock slightly behind the server never says "-1 days".
    expect(listedAgo("2026-11-05T09:00:00Z", now)).toBe("Listed today");
  });

  it("says a lot is sold together, with its all-in total", () => {
    expect(resaleCardMeta({ priceCents: 1400, quantity: 2, listedAt: "2026-11-04T08:00:00Z" })).toBe(
      "2 tickets, sold together · €29.40",
    );
    expect(formatEuroCents(2940)).toBe("€29.40");
  });
});

describe("fetching", () => {
  const fakeRpc = (result: { data: unknown; error: { message: string } | null }) => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc: RpcCaller = async (name, args) => {
      calls.push({ name, args });
      return result;
    };
    return { rpc, calls };
  };

  it("calls resale_listings with the event id, or null for every event", async () => {
    const { rpc, calls } = fakeRpc({ data: [row()], error: null });
    expect((await fetchResaleListings(rpc, "e-1")).map((l) => l.id)).toEqual(["l-1"]);
    await fetchResaleListings(rpc);
    await fetchResaleListings(rpc, null);
    expect(calls).toEqual([
      { name: "resale_listings", args: { p_event_id: "e-1" } },
      { name: "resale_listings", args: { p_event_id: null } },
      { name: "resale_listings", args: { p_event_id: null } },
    ]);
  });

  it("throws on an RPC error so the query shows its error state", async () => {
    const { rpc } = fakeRpc({ data: null, error: { message: "boom" } });
    await expect(fetchResaleListings(rpc, "e-1")).rejects.toThrow("boom");
    await expect(fetchResaleListing(rpc, "l-1")).rejects.toThrow("boom");
  });

  it("reads one listing by id, null when it's gone", async () => {
    const found = fakeRpc({ data: [row({ is_reserved: true })], error: null });
    const l = await fetchResaleListing(found.rpc, "l-1");
    expect(found.calls).toEqual([{ name: "resale_listings", args: { p_listing_id: "l-1" } }]);
    expect(l?.isReserved).toBe(true);
    expect(await fetchResaleListing(fakeRpc({ data: [], error: null }).rpc, "l-1")).toBeNull();
  });
});

describe("query keys and freshness", () => {
  it("shares one key prefix, so invalidating it refreshes every resale view", () => {
    expect(RESALE_LISTINGS_QUERY_KEY).toEqual(["resale-listings"]);
    expect(resaleListingsQueryKey("e-1")).toEqual(["resale-listings", "e-1"]);
    expect(resaleListingsQueryKey()).toEqual(["resale-listings", "all"]);
    expect(resaleListingsQueryKey(null)).toEqual(["resale-listings", "all"]);
    expect(resaleListingQueryKey("l-1")).toEqual(["resale-listings", "listing", "l-1"]);
  });

  it("refreshes after 30 s and on window focus, with no realtime channel", () => {
    const hook = read("src/hooks/useResaleListings.ts");
    expect(hook.match(/staleTime: 30_000/g)?.length).toBe(2);
    expect(hook.match(/refetchOnWindowFocus: true/g)?.length).toBe(2);
    expect(hook).not.toMatch(/channel\(/);
  });
});
