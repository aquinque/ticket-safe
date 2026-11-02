import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The module under test also exports the Supabase fetch, built on the shared client, which needs real env
// variables to exist at import time. Only the pure selection is exercised here.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { selectPublishedEvents, type PublishedEventRow } from "@/lib/publishedEvents";

const NOW = new Date("2026-11-02T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

type Row = PublishedEventRow & { title: string };
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  slug: `event-${id}`,
  date: hours(24),
  ends_at: null,
  title: `Event ${id}`,
  ...over,
});
const ids = (rows: Row[]) => selectPublishedEvents(rows, NOW).map((e) => e.id);

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** The code without its comments, so a comment that explains what the code must not do is not mistaken for it. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("selectPublishedEvents", () => {
  it("lists a row that comes twice once, keeping the first occurrence", () => {
    const out = selectPublishedEvents([row("a", { title: "First copy" }), row("b"), row("a", { title: "Second copy" })], NOW);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
    expect(out[0].title).toBe("First copy");
  });

  it("drops an event that started 9 h ago without an end: it ended 8 h after its start", () => {
    expect(ids([row("a", { date: hours(-9) })])).toEqual([]);
  });

  it("keeps an event that started 2 h ago: it is live", () => {
    expect(ids([row("a", { date: hours(-2) })])).toEqual(["a"]);
  });

  it("keeps an event that started yesterday when the organizer set its end for tomorrow", () => {
    expect(ids([row("a", { date: hours(-24), ends_at: hours(24) })])).toEqual(["a"]);
  });

  it("drops an event at the instant it ends, and not a moment before", () => {
    expect(ids([row("a", { date: hours(-3), ends_at: NOW.toISOString() })])).toEqual([]);
    expect(ids([row("a", { date: hours(-3), ends_at: new Date(NOW.getTime() + 1).toISOString() })])).toEqual(["a"]);
  });

  it("drops rows without a slug: they have no public page", () => {
    expect(ids([row("a", { slug: null }), row("b", { slug: "" }), row("c")])).toEqual(["c"]);
  });

  it("sorts by start, soonest first, and keeps the input order between equal starts", () => {
    const rows = [row("later", { date: hours(72) }), row("soon-1", { date: hours(2) }), row("soon-2", { date: hours(2) }), row("live", { date: hours(-1) })];
    expect(ids(rows)).toEqual(["live", "soon-1", "soon-2", "later"]);
  });

  it("never drops an event whose start cannot be read, and lists it last", () => {
    expect(ids([row("odd", { date: "someday" }), row("a")])).toEqual(["a", "odd"]);
  });

  it("passes the whole row through, ends_at included", () => {
    const out = selectPublishedEvents([row("a", { ends_at: hours(30) })], NOW);
    expect(out[0]).toMatchObject({ id: "a", slug: "event-a", ends_at: hours(30), title: "Event a" });
  });

  it("reads the clock it is given, today's by default", () => {
    const rows = [row("a", { date: hours(-9) })];
    expect(selectPublishedEvents(rows, new Date(NOW.getTime() - 2 * 3_600_000)).map((e) => e.id)).toEqual(["a"]);
    // Without a clock, the real one: an event of 2000 is over and one of 2100 is to come, whatever today is.
    const out = selectPublishedEvents([row("old", { date: "2000-01-01T00:00:00Z" }), row("far", { date: "2100-01-01T00:00:00Z" })]);
    expect(out.map((e) => e.id)).toEqual(["far"]);
  });
});

describe("the public events pages", () => {
  it("decide what is over with the shared rule, never with a grace or a duration of their own", () => {
    const published = code("src/lib/publishedEvents.ts");
    expect(published).toContain('from "@/lib/eventTime"');
    expect(published).not.toMatch(/12 \* 60 \* 60 \* 1000/);
    const eventPage = code("src/pages/EventPublic.tsx");
    expect(eventPage).toContain('from "@/lib/eventTime"');
    expect(eventPage).not.toMatch(/\d+ \* 3_600_000/);
    expect(eventPage).toContain("This event has ended.");
    const profile = code("src/pages/Profile.tsx");
    expect(profile).toContain('from "@/lib/eventTime"');
    expect(profile).not.toMatch(/UPCOMING_GRACE_MS|12 \* 60 \* 60 \* 1000/);
  });

  it("list each event once: one grid on /tickets, no rail or picks, and no other events on an event's page", () => {
    const tickets = code("src/pages/Tickets.tsx");
    expect(tickets.match(/<EventCardShared/g) ?? []).toHaveLength(1);
    expect(tickets).not.toMatch(/Happening soon|Picked for you|useRecommendations|More organisers coming soon/);
    const eventPage = code("src/pages/EventPublic.tsx");
    expect(eventPage).not.toMatch(/fetchPublishedEvents|EventCard|useRecommendations/);
  });
});
