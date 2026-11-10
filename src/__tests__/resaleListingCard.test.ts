import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ResaleListingCard, type ResaleListingCardProps } from "../components/resale/ResaleListingCard";
import { ResaleListingList } from "../components/resale/ResaleListingList";
import type { ResaleListing } from "../lib/resaleListings";

const listing = (over: Partial<ResaleListing> = {}): ResaleListing => ({
  id: "11111111-2222-3333-4444-555555555555",
  eventId: "e-1",
  tierName: "Late, 1 Drink",
  priceCents: 1400,
  quantity: 1,
  listedAt: "2026-11-04T08:00:00Z",
  isBoosted: false,
  photoUrl: null,
  videoUrl: null,
  isOwn: false,
  isReserved: false,
  event: {
    id: "e-1",
    title: "Halloween",
    slug: null,
    date: null,
    endsAt: null,
    location: null,
    category: null,
    university: null,
    campus: null,
    bannerUrl: null,
    videoUrl: null,
    basePrice: null,
  },
  ...over,
});

const now = new Date("2026-11-04T18:00:00Z");
const render = (props: Partial<ResaleListingCardProps> & { listing: ResaleListing }) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ResaleListingCard, { now, ...props })));

/** The Buy link's aria-label. */
const ariaLabel = (html: string) => html.match(/aria-label="([^"]*)"/)?.[1] ?? "";

describe("ResaleListingCard", () => {
  it("shows the tier, the Verified resale badge and a Buy link to the checkout", () => {
    const html = render({ listing: listing() });
    expect(html).toMatch(/^<li>/);
    expect(html).toContain("Late, 1 Drink");
    expect(html).toContain("Verified resale");
    expect(html).toContain('href="/checkout?listing_id=11111111-2222-3333-4444-555555555555"');
    expect(html).toContain("€14.70");
    expect(html).toContain("Listed today · incl. 5% fee");
    expect(ariaLabel(html)).toContain("€14.70");
    expect(ariaLabel(html)).toContain("Late, 1 Drink");
    expect(html).not.toContain(" each");
  });

  it("falls back to a generic name when the ticket has no tier", () => {
    expect(render({ listing: listing({ tierName: null }) })).toContain("Resale ticket");
  });

  it("says 'each' and the lot total only when several tickets are sold together", () => {
    const html = render({ listing: listing({ quantity: 2 }) });
    expect(html).toContain("€14.70");
    expect(html).toContain(" each");
    expect(html).toContain("2 tickets, sold together · €29.40");
    expect(ariaLabel(html)).toContain("€14.70 each");
    expect(ariaLabel(html)).toContain("€29.40");
  });

  it("shows 'Your listing' and no Buy link on the seller's own listing", () => {
    const html = render({ listing: listing({ isOwn: true }), onOffer: () => {} });
    expect(html).toContain("Your listing");
    expect(html).not.toContain("/checkout?listing_id=");
    expect(html).not.toContain("Make an offer");
  });

  it("shows 'Make an offer' only when the page passes onOffer", () => {
    expect(render({ listing: listing() })).not.toContain("Make an offer");
    expect(render({ listing: listing(), onOffer: () => {} })).toContain("Make an offer");
  });

  it("tags a featured listing", () => {
    expect(render({ listing: listing({ isBoosted: true }) })).toContain("Featured");
    expect(render({ listing: listing() })).not.toContain("Featured");
  });

  it("never shows seller details", () => {
    const html = render({ listing: listing() });
    expect(html).not.toMatch(/Sold by|seller/i);
  });
});

describe("ResaleListingList", () => {
  it("renders a list with one card per listing", () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ResaleListingList, { listings: [listing({ id: "a" }), listing({ id: "b" })], now }),
      ),
    );
    expect(html).toMatch(/^<ul role="list"/);
    expect(html.match(/<li>/g)?.length).toBe(2);
    expect(html).toContain("listing_id=a");
    expect(html).toContain("listing_id=b");
  });
});
