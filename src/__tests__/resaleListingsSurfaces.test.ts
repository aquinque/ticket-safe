import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/** Source without comments, so a mention in a comment never counts as code. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("event page: Tickets on resale", () => {
  const page = code("src/pages/EventPublic.tsx");

  it("renders the section twice: desktop aside and mobile column, both only for an event that hasn't ended", () => {
    const uses = [...page.matchAll(/\{!isPast && <EventResaleListings eventId=\{event\.id\} headingId="([^"]+)"/g)];
    expect(uses.map((m) => m[1])).toEqual(["resale-heading-desktop", "resale-heading-mobile"]);
    expect(page.match(/<EventResaleListings/g)?.length).toBe(2);
  });

  it("puts the desktop section after the sticky order summary and before the teaser video, inside the aside", () => {
    const aside = page.slice(page.indexOf("<aside"), page.indexOf("</aside>"));
    const summary = aside.indexOf('<div className="lg:sticky lg:top-24">{renderSummary(true)}</div>');
    const resale = aside.indexOf('<EventResaleListings eventId={event.id} headingId="resale-heading-desktop"');
    const teaser = aside.indexOf("<TeaserVideo");
    expect(summary).toBeGreaterThan(-1);
    expect(resale).toBeGreaterThan(summary);
    expect(teaser).toBeGreaterThan(resale);
    // After the attendees section too.
    expect(resale).toBeGreaterThan(aside.indexOf("renderAttendees()"));
  });

  it("puts the mobile section after the #checkout summary and before the mobile teaser video", () => {
    const checkout = page.indexOf('<div id="checkout"');
    const resale = page.indexOf('headingId="resale-heading-mobile" className="lg:hidden"');
    const teaser = page.indexOf('<div className="lg:hidden"><TeaserVideo');
    expect(checkout).toBeGreaterThan(-1);
    expect(resale).toBeGreaterThan(checkout);
    expect(teaser).toBeGreaterThan(resale);
  });

  it("is shown when the event is sold out, and the old resale link is gone", () => {
    for (const m of page.matchAll(/^.*<EventResaleListings.*$/gm)) expect(m[0]).not.toContain("eventSoldOut");
    expect(page).not.toContain("Resale: {resaleCount}");
    expect(page).not.toMatch(/\/event\/\$\{event\.id\}\/tickets/);
    expect(page).not.toContain('from("tickets")');
    expect(page).toContain("useResaleListings({ eventId: event?.id, enabled: resaleOpen })");
  });

  it("renders nothing while loading, on error or with no listing, and logs the error", () => {
    const section = code("src/components/resale/EventResaleListings.tsx");
    expect(section).toContain("if (isLoading || isError || !listings || listings.length === 0) return null;");
    expect(section).toContain("console.error(");
    expect(section).not.toMatch(/No tickets on resale/);
    expect(section).not.toContain("onOffer");
    expect(section).toContain("Tickets on resale");
    expect(section).toContain("listed</span>");
    expect(section).toContain('rounded-2xl border border-border bg-card/50 p-4 lg:p-5');
    expect(section).toContain("Every resale ticket is checked before it's listed and reissued in your name, with a new QR code.");
  });

  it("promises a reissued ticket with a new QR code only when every listing is a Studio ticket", () => {
    const section = code("src/components/resale/EventResaleListings.tsx");
    expect(section).toContain("const allStudio = listings.every((l) => l.tierName !== null);");
    expect(section).toMatch(/\{allStudio\s*\?\s*"Every resale ticket is checked before it's listed and reissued in your name, with a new QR code\."\s*:\s*"Every resale ticket is checked before it's listed\."\}/);
  });

  it("logs a listings error from one placement only", () => {
    const section = code("src/components/resale/EventResaleListings.tsx");
    expect(section).toContain("if (logErrors && isError && !logged.current)");
    const placements = [...page.matchAll(/<EventResaleListings[^>]*>/g)].map((m) => m[0]);
    expect(placements).toHaveLength(2);
    expect(placements.filter((p) => /\blogErrors\b/.test(p))).toHaveLength(1);
  });

  it("points to the resale listings from the sold-out summary when there are some", () => {
    const soldOut = page.slice(page.indexOf("if (eventSoldOut) {"), page.indexOf("if (!selected) {"));
    expect(soldOut).toContain("{resaleCount > 0 && (");
    expect(soldOut).toContain("Some tickets are on resale below.");
  });
});

describe("resale page", () => {
  const page = code("src/pages/marketplace/Buy.tsx");

  it("reads listings from resale_listings and renders the shared card list with offers", () => {
    expect(page).toContain("useResaleListings()");
    expect(page).toContain("<ResaleListingList");
    expect(page).toContain("onOffer={onOffer}");
    expect(page).toContain("groupResaleListingsByEvent");
    expect(page).not.toContain("useTicketListings");
  });

  it("keeps loading, error and empty states", () => {
    expect(page).toContain("<SkeletonGrid />");
    expect(page).toContain('role="alert"');
    expect(page).toContain("Try again");
    expect(page).toContain("No tickets on resale at the moment.");
  });

  it("never handles the seller's id or notes", () => {
    expect(page).not.toMatch(/sellerId|seller_id|\bnotes\b|\b(?:t|l|ticket|listing)\.description\b/);
  });

  it("shows the group's From price fee included, like the cards", () => {
    expect(page).toContain("{formatEuroCents(groupFromPriceCents(group))}");
    expect(page).not.toContain("group.minPriceCents / 100");
  });
});

describe("checkout", () => {
  const page = code("src/pages/Checkout.tsx");

  it("accepts listing_id and the older listing parameter, and reads through resale_listings", () => {
    expect(page).toContain('searchParams.get("listing_id") ?? searchParams.get("listing")');
    expect(page).toContain("useResaleListing(listingId)");
    expect(page).not.toContain("seller:profiles");
    expect(page).not.toContain('from("tickets")');
    expect(page).not.toMatch(/\bnotes\b/);
  });

  it("blocks paying for your own listing or one someone else is paying for", () => {
    expect(page).toContain("listing.isOwn");
    expect(page).toContain("listing.isReserved && !cameBackFromStripe");
    expect(page).toContain('"RESERVED"');
    expect(page).toContain('"PRICE_CHANGED"');
    expect(page).toContain("<SellerTrust listingId={listing.id} />");
  });
});

describe("seller trust panel", () => {
  it("shows the seller's first name only", () => {
    const panel = code("src/components/SellerTrust.tsx");
    expect(panel).toContain("parseSellerStats(data)");
    expect(panel).toContain("stats?.firstName");
    expect(panel).not.toMatch(/full_name|fullName/);
  });
});

describe("seller notes are not public", () => {
  it("are not read or shown on public pages", () => {
    for (const path of [
      "src/pages/GalaESCP.tsx",
      "src/pages/BuyTicket.tsx",
      "src/pages/EventTicketsMarketplace.tsx",
      "src/components/resale/ResaleListingCard.tsx",
      "src/contexts/TicketListingsContext.tsx",
    ]) {
      const source = code(path);
      expect(source, path).not.toMatch(/\b(?:t|l|ticket|listing|row)\.(?:description|notes)\b|\bnotes\b/);
    }
  });
});

// ── Repo-wide: the front never reads a protected tickets column ──────────────

const PROTECTED = /\b(qr_hash|file_url|buyer_id|verification_errors|studio_ticket_id|reserved_[a-z_]+)\b/;
/** Granted to neither anon nor authenticated: a seller reads their own rows through my_listings(). */
const SELLER_PRIVATE = /\b(seller_id|notes)\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !full.endsWith(join("integrations", "supabase", "types.ts"))) {
      out.push(full);
    }
  }
  return out;
}

/** The query chain that starts at each `.from("tickets")`, up to the end of its statement or the next query. */
function ticketsQueries(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\.from\(\s*["'`]tickets["'`]\s*\)/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const rest = source.slice(start);
    const end = rest.search(/;|\n\s*\n|\.from\(|\.rpc\(|callRpc\(/);
    out.push(rest.slice(0, end === -1 ? 600 : end));
  }
  return out;
}

describe("no front read of protected tickets columns", () => {
  const files = sourceFiles(resolve(root, "src")).map((f) => ({ path: relative(root, f), source: code(relative(root, f)) }));

  it("scans the front sources", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.path.endsWith("EventPublic.tsx"))).toBe(true);
  });

  it("selects and filters only granted columns from tickets", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const query of ticketsQueries(source)) {
        for (const sel of query.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
          const columns = sel[2];
          if (columns.trim() === "*") offenders.push(`${path}: select("*") on tickets`);
          if (PROTECTED.test(columns)) offenders.push(`${path}: selects ${columns.match(PROTECTED)?.[0]}`);
        }
        for (const filter of query.matchAll(/\.(eq|neq|in|is|not|gt|gte|lt|lte|like|ilike|order|match)\(\s*["'`]([a-z_]+)["'`]/g)) {
          if (PROTECTED.test(filter[2])) offenders.push(`${path}: filters on ${filter[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never writes tickets (inserts, updates and deletes go through RPCs)", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const query of ticketsQueries(source)) {
        const write = query.match(/\.(insert|update|delete|upsert)\(/);
        if (write) offenders.push(`${path}: .${write[1]}() on tickets`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never selects or filters the seller's id or notes on tickets (own and admin rows come from RPCs)", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const query of ticketsQueries(source)) {
        for (const sel of query.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
          if (SELLER_PRIVATE.test(sel[2])) offenders.push(`${path}: selects ${sel[2].match(SELLER_PRIVATE)?.[0]}`);
        }
        for (const filter of query.matchAll(/\.(eq|neq|in|is|not|gt|gte|lt|lte|like|ilike|order|match)\(\s*["'`]([a-z_]+)["'`]/g)) {
          if (SELLER_PRIVATE.test(filter[2])) offenders.push(`${path}: filters on ${filter[2]}`);
        }
        if (/\.or\([^)]*\b(?:seller_id|notes)\./.test(query)) offenders.push(`${path}: .or() on seller_id or notes`);
      }
      for (const m of source.matchAll(/(?<![\w])tickets(?:!\w+)?\(([^)]*)\)/g)) {
        if (SELLER_PRIVATE.test(m[1])) offenders.push(`${path}: tickets(${m[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("embeds tickets only with granted columns", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const m of source.matchAll(/(?<![\w])tickets(?:!\w+)?\(([^)]*)\)/g)) {
        if (m[1].trim() === "*" || PROTECTED.test(m[1])) offenders.push(`${path}: tickets(${m[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no longer reads the conversation_participant_names view", () => {
    const offenders = files
      .filter(({ source }) => /(?<!get_)conversation_participant_names/.test(source))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("finds a protected column when one is selected (the scan itself works)", () => {
    const sample = `await supabase.from("tickets").select("id, qr_hash").eq("id", x);`;
    const [query] = ticketsQueries(sample);
    expect(query).toContain("qr_hash");
    // A query on another table right after it (as in a Promise.all) is not part of it.
    const [first] = ticketsQueries(`supabase.from("tickets").select("id"), supabase.from("event_tickets").select("id").eq("buyer_id", u)`);
    expect(first).not.toContain("buyer_id");
    expect(PROTECTED.test("reserved_until")).toBe(true);
    expect(PROTECTED.test("selling_price, notes, seller_id")).toBe(false);
    expect(SELLER_PRIVATE.test("selling_price, notes")).toBe(true);
    expect(SELLER_PRIVATE.test("id, selling_price, status")).toBe(false);
    // Writes and seller filters are caught.
    const [write] = ticketsQueries(`await supabase.from("tickets").update({ selling_price: 5 }).eq("id", id);`);
    expect(write).toMatch(/\.update\(/);
    const [own] = ticketsQueries(`supabase.from("tickets").select("id, status").eq("seller_id", user.id)`);
    expect(own).toContain('.eq("seller_id"');
  });
});
