import { describe, it, expect } from "vitest";
import {
  LISTING_ERROR_MESSAGES,
  ListingRpcError,
  cancelMyListing,
  createStudioListing,
  fetchMyListings,
  fetchPendingListings,
  listingErrorCode,
  listingErrorMessage,
  parseSellerStats,
  updateMyListingPrice,
} from "@/lib/sellerListings";
import { groupFromPriceCents, groupResaleListingsByEvent, resaleCardPricing, type ResaleListing } from "@/lib/resaleListings";
import type { RpcCaller, RpcResult } from "@/lib/supabaseRpc";

/** Records each call and answers with the given result. */
function fakeRpc(result: RpcResult) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc: RpcCaller = async (name, args) => {
    calls.push({ name, args });
    return result;
  };
  return { rpc, calls };
}

describe("listing error codes", () => {
  it("finds the code in the function's message, with or without a prefix", () => {
    expect(listingErrorCode("TICKET_NOT_OWNED")).toBe("TICKET_NOT_OWNED");
    expect(listingErrorCode("ERROR: PRICE_ABOVE_CAP")).toBe("PRICE_ABOVE_CAP");
    expect(listingErrorCode("something else")).toBeNull();
    expect(listingErrorCode(null)).toBeNull();
  });

  it("has an English sentence for every code the listing functions raise", () => {
    for (const code of [
      "AUTH_REQUIRED", "TICKET_NOT_OWNED", "TICKET_NOT_VALID", "EVENT_CLOSED", "ALREADY_LISTED",
      "INVALID_PRICE", "PRICE_ABOVE_CAP", "INVALID_NOTES", "NOT_FOUND", "NOT_EDITABLE", "NOT_ADMIN",
    ] as const) {
      expect(LISTING_ERROR_MESSAGES[code]).toMatch(/^[A-Z].+\.$/);
      expect(listingErrorMessage(code, "fallback")).toBe(LISTING_ERROR_MESSAGES[code]);
    }
    expect(listingErrorMessage("connection reset", "Could not list your ticket.")).toBe("Could not list your ticket.");
  });
});

describe("create_studio_listing", () => {
  it("sends the Studio ticket, the price and trimmed notes, and returns the new id", async () => {
    const { rpc, calls } = fakeRpc({ data: "listing-1", error: null });
    const id = await createStudioListing(rpc, { studioTicketId: "st-1", sellingPrice: 12.5, notes: "  row 3 ", photoUrl: null });
    expect(id).toBe("listing-1");
    expect(calls).toEqual([{
      name: "create_studio_listing",
      args: { p_studio_ticket_id: "st-1", p_selling_price: 12.5, p_notes: "row 3", p_photo_url: null, p_video_url: null },
    }]);
  });

  it("sends no notes when they are blank", async () => {
    const { rpc, calls } = fakeRpc({ data: "listing-1", error: null });
    await createStudioListing(rpc, { studioTicketId: "st-1", sellingPrice: 10, notes: "   " });
    expect(calls[0].args.p_notes).toBeNull();
  });

  it("throws the function's code", async () => {
    const { rpc } = fakeRpc({ data: null, error: { message: "ALREADY_LISTED" } });
    await expect(createStudioListing(rpc, { studioTicketId: "st-1", sellingPrice: 10 })).rejects.toMatchObject({
      name: "ListingRpcError",
      code: "ALREADY_LISTED",
    });
  });
});

describe("my listings", () => {
  it("reads my_listings() and keeps the seller's own notes", async () => {
    const { rpc, calls } = fakeRpc({
      data: [
        { listing_id: "l1", event_id: "e1", selling_price: "15.00", quantity: 1, notes: "Seat 12", status: "available", verification_status: "verified", created_at: "2026-11-01T10:00:00Z", boosted_until: null, studio_ticket_id: "st-1" },
        { listing_id: "l2", event_id: "e2", selling_price: 20, quantity: 2, notes: null, status: "sold", verification_status: "verified", created_at: "2026-10-01T10:00:00Z", boosted_until: null, studio_ticket_id: null },
        { event_id: "e3" },
      ],
      error: null,
    });
    const rows = await fetchMyListings(rpc);
    expect(calls).toEqual([{ name: "my_listings", args: {} }]);
    expect(rows.map((r) => [r.id, r.sellingPrice, r.notes, r.status])).toEqual([
      ["l1", 15, "Seat 12", "available"],
      ["l2", 20, null, "sold"],
    ]);
  });

  it("changes the price and cancels through the RPCs, and reports NOT_EDITABLE", async () => {
    const ok = fakeRpc({ data: null, error: null });
    await updateMyListingPrice(ok.rpc, "l1", 18);
    await cancelMyListing(ok.rpc, "l1");
    expect(ok.calls).toEqual([
      { name: "update_my_listing_price", args: { p_listing_id: "l1", p_selling_price: 18 } },
      { name: "cancel_my_listing", args: { p_listing_id: "l1" } },
    ]);
    const sold = fakeRpc({ data: null, error: { message: "NOT_EDITABLE" } });
    const err = await cancelMyListing(sold.rpc, "l2").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ListingRpcError);
    expect((err as ListingRpcError).code).toBe("NOT_EDITABLE");
  });
});

describe("admin review queue", () => {
  it("maps the flat admin_pending_listings() rows to the event and seller the page renders", async () => {
    const { rpc, calls } = fakeRpc({
      data: [{
        id: "l1", status: "available", verification_status: "pending", selling_price: "25", quantity: 1, notes: "Paper ticket",
        qr_verified: false, created_at: "2026-11-02T09:00:00Z", event_id: "e1", event_title: "Gala", event_date: "2026-12-01T20:00:00Z",
        event_location: "Paris", event_campus: "Paris", seller_full_name: "Ana Diaz", seller_email: "ana@example.com", seller_campus: "Madrid",
      }],
      error: null,
    });
    expect(await fetchPendingListings(rpc)).toEqual([{
      id: "l1", status: "available", verification_status: "pending", selling_price: 25, quantity: 1, notes: "Paper ticket",
      qr_verified: false, created_at: "2026-11-02T09:00:00Z",
      event: { id: "e1", title: "Gala", date: "2026-12-01T20:00:00Z", location: "Paris", campus: "Paris" },
      seller: { full_name: "Ana Diaz", email: "ana@example.com", campus: "Madrid" },
    }]);
    expect(calls[0].name).toBe("admin_pending_listings");
  });

  it("throws NOT_ADMIN for a non-admin", async () => {
    const { rpc } = fakeRpc({ data: null, error: { message: "NOT_ADMIN" } });
    await expect(fetchPendingListings(rpc)).rejects.toMatchObject({ code: "NOT_ADMIN" });
  });
});

describe("seller trust stats", () => {
  it("keeps only the first name", () => {
    expect(parseSellerStats([{ first_name: "Ana", university: "ESCP", campus: "Paris", member_since: "2025-09-01T00:00:00Z", completed_sales: 3 }]))
      .toEqual({ firstName: "Ana", university: "ESCP", memberSince: "2025-09-01T00:00:00Z", completedSales: 3 });
    expect(parseSellerStats([{ first_name: "Ana Maria Diaz", completed_sales: null }])?.firstName).toBe("Ana");
    expect(parseSellerStats([{ full_name: "Ana Diaz" }])?.firstName).toBeNull();
    expect(parseSellerStats([])).toBeNull();
  });
});

describe("resale group From price", () => {
  const listing = (id: string, priceCents: number, quantity = 1): ResaleListing => ({
    id, eventId: "e1", tierName: "Standard", priceCents, quantity, listedAt: "2026-11-01T10:00:00Z", isBoosted: false,
    photoUrl: null, videoUrl: null, isOwn: false, isReserved: false,
    event: { id: "e1", title: "Gala", slug: null, date: null, endsAt: null, location: null, category: null, university: null, campus: null, bannerUrl: null, videoUrl: null, basePrice: null },
  });

  it("is the cheapest per-ticket price fee included, the same as the cheapest card", () => {
    const [group] = groupResaleListingsByEvent([listing("a", 1200), listing("b", 600, 2), listing("c", 900)]);
    const from = groupFromPriceCents(group);
    expect(from).toBe(resaleCardPricing({ priceCents: 600, quantity: 1 }).eachCents);
    expect(from).toBeGreaterThan(600);
  });
});
