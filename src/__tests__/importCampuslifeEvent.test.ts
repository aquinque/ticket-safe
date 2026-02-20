/**
 * Tests for the CampusLife event import logic.
 *
 * We extract the pure business-logic functions from the script
 * and test them in isolation (no Supabase connection needed).
 *
 * Coverage:
 *  - upsertExternalEvent is idempotent (same call twice → only 1 row)
 *  - unique (external_source, external_event_id) constraint respected
 *  - placeholder created when no data is available
 *  - needs_review set correctly
 *  - parseCampusGroupsEvent handles missing fields gracefully
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Inline copies of pure functions from the import script
// (avoids Node.js-only APIs like fs/fetch in the Vitest env)
// ---------------------------------------------------------------------------

interface EventDetails {
  title: string;
  description: string | null;
  date: string;
  location: string;
  category: string;
  university: string;
  campus: string | null;
  is_active: boolean;
  base_price: number | null;
  image_url: string | null;
  needs_review?: boolean;
}

interface UpsertPayload extends EventDetails {
  externalSource: string;
  externalEventId: string;
}

interface DbRow extends EventDetails {
  id: string;
  external_source: string;
  external_event_id: string;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

/** In-memory DB for tests */
class FakeDb {
  rows: DbRow[] = [];
  private nextId = 1;

  async findByExternal(source: string, id: string): Promise<DbRow | null> {
    return (
      this.rows.find(
        (r) => r.external_source === source && r.external_event_id === id
      ) ?? null
    );
  }

  async insert(row: Omit<DbRow, "id">): Promise<DbRow> {
    // Enforce unique constraint
    const existing = await this.findByExternal(
      row.external_source,
      row.external_event_id
    );
    if (existing) throw new Error("UNIQUE CONSTRAINT: (external_source, external_event_id)");
    const newRow: DbRow = { ...row, id: String(this.nextId++) };
    this.rows.push(newRow);
    return newRow;
  }

  async update(id: string, patch: Partial<DbRow>): Promise<DbRow> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Row not found");
    this.rows[idx] = { ...this.rows[idx], ...patch };
    return this.rows[idx];
  }

  count() {
    return this.rows.length;
  }
}

async function upsertExternalEvent(
  db: FakeDb,
  { externalSource, externalEventId, ...details }: UpsertPayload
): Promise<{ action: "inserted" | "updated"; event: DbRow }> {
  const existing = await db.findByExternal(externalSource, externalEventId);

  const payload = {
    ...details,
    external_source: externalSource,
    external_event_id: externalEventId,
    needs_review: details.needs_review ?? false,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const event = await db.update(existing.id, payload);
    return { action: "updated", event };
  } else {
    const event = await db.insert({
      ...payload,
      created_at: new Date().toISOString(),
    });
    return { action: "inserted", event };
  }
}

function buildPlaceholder(eventId: string): EventDetails & { needs_review: boolean } {
  return {
    title: `ESCP CampusLife Event #${eventId}`,
    description: `Auto-imported placeholder. Source: https://campuslife.escp.eu/feeds?type=event&type_id=${eventId}&tab=details`,
    date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    location: "TBC",
    category: "Event",
    university: "ESCP Business School",
    campus: null,
    is_active: true,
    base_price: null,
    image_url: null,
    needs_review: true,
  };
}

function parseCampusGroupsEvent(data: Record<string, unknown>): Partial<EventDetails> | null {
  const ev = (data?.event ?? data?.data ?? data) as Record<string, unknown>;
  if (!ev) return null;
  return {
    title: (ev.name ?? ev.title ?? null) as string | null,
    description: (ev.description ?? ev.about ?? null) as string | null,
    date: (ev.start_date ?? ev.start_time ?? ev.date ?? null) as string | null,
    location: (ev.location ?? ev.venue ?? null) as string | null,
    category: ((ev.category ?? ev.type ?? "Event") as string),
    university: ((ev.organization ?? ev.organizer ?? "ESCP Business School") as string),
    campus: (ev.campus ?? null) as string | null,
    is_active: true,
    base_price: ev.price ? parseFloat(ev.price as string) : null,
    image_url: (ev.image_url ?? ev.photo_url ?? null) as string | null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SOURCE = "campusgroups/campuslife.escp.eu";

const knownEvent378362: EventDetails = {
  title: "ESCP Intercampus Games 2026",
  description: "Multi-campus sports event, Madrid, March 6–8 2026.",
  date: "2026-03-06T09:00:00+01:00",
  location: "La Elipa Sports Club - Madrid",
  category: "Sports",
  university: "ESCP Business School",
  campus: null,
  is_active: true,
  base_price: null,
  image_url: null,
};

describe("upsertExternalEvent — idempotency", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  it("inserts a new event on first call", async () => {
    const result = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
    });
    expect(result.action).toBe("inserted");
    expect(db.count()).toBe(1);
  });

  it("updates (not inserts) on second call with same (source, id)", async () => {
    await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
    });
    const result = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
      title: "ESCP Intercampus Games 2026 (updated)",
    });

    expect(result.action).toBe("updated");
    expect(db.count()).toBe(1); // still only 1 row
    expect(result.event.title).toBe("ESCP Intercampus Games 2026 (updated)");
  });

  it("stores external_source and external_event_id on the row", async () => {
    const { event } = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
    });
    expect(event.external_source).toBe(SOURCE);
    expect(event.external_event_id).toBe("378362");
  });

  it("two different event IDs create two rows", async () => {
    await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
    });
    await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "999999",
      ...knownEvent378362,
      title: "Another Event",
    });
    expect(db.count()).toBe(2);
  });
});

describe("upsertExternalEvent — unique constraint", () => {
  it("FakeDb throws on direct double-insert (simulates DB constraint)", async () => {
    const db = new FakeDb();
    await db.insert({
      ...knownEvent378362,
      external_source: SOURCE,
      external_event_id: "378362",
      needs_review: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(
      db.insert({
        ...knownEvent378362,
        external_source: SOURCE,
        external_event_id: "378362",
        needs_review: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/UNIQUE CONSTRAINT/i);
  });
});

describe("Placeholder creation", () => {
  it("creates a placeholder with needs_review=true for unknown event", () => {
    const p = buildPlaceholder("999999");
    expect(p.needs_review).toBe(true);
    expect(p.title).toContain("999999");
    expect(p.location).toBe("TBC");
    expect(p.is_active).toBe(true); // still selectable!
  });

  it("placeholder has a future date (so it appears in the Sell Ticket select)", () => {
    const p = buildPlaceholder("999999");
    expect(new Date(p.date).getTime()).toBeGreaterThan(Date.now());
  });

  it("known event 378362 has needs_review=false (data is complete)", () => {
    const title = knownEvent378362.title;
    const location = knownEvent378362.location;
    const isPlaceholder =
      !title || !location || location === "TBC" || title.startsWith("ESCP CampusLife Event #");
    expect(isPlaceholder).toBe(false);
  });
});

describe("needs_review logic", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  it("needs_review=false for a complete event", async () => {
    const { event } = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "378362",
      ...knownEvent378362,
      needs_review: false,
    });
    expect(event.needs_review).toBe(false);
  });

  it("needs_review=true for a placeholder event", async () => {
    const placeholder = buildPlaceholder("000000");
    const { event } = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "000000",
      ...placeholder,
    });
    expect(event.needs_review).toBe(true);
  });

  it("can clear needs_review via a second upsert", async () => {
    const placeholder = buildPlaceholder("111111");
    await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "111111",
      ...placeholder,
    });
    const { event } = await upsertExternalEvent(db, {
      externalSource: SOURCE,
      externalEventId: "111111",
      ...placeholder,
      title: "Real Title Now",
      location: "Paris",
      needs_review: false,
    });
    expect(event.needs_review).toBe(false);
    expect(event.title).toBe("Real Title Now");
  });
});

describe("parseCampusGroupsEvent", () => {
  it("parses a standard CampusGroups JSON shape", () => {
    const raw = {
      name: "Sports Day",
      description: "Annual event",
      start_date: "2026-04-01T10:00:00",
      location: "Campus Ground",
      category: "Sports",
      organization: "ESCP Madrid",
      price: "15.00",
    };
    const result = parseCampusGroupsEvent(raw);
    expect(result?.title).toBe("Sports Day");
    expect(result?.date).toBe("2026-04-01T10:00:00");
    expect(result?.base_price).toBe(15);
  });

  it("handles missing optional fields gracefully", () => {
    const result = parseCampusGroupsEvent({});
    expect(result).not.toBeNull();
    expect(result?.title).toBeNull();
    expect(result?.date).toBeNull();
    expect(result?.category).toBe("Event");
    expect(result?.university).toBe("ESCP Business School");
  });

  it("returns an object with null fields for an empty/null payload (does not crash)", () => {
    // { event: null } → falls back to the top-level object → partial result with nulls
    const result = parseCampusGroupsEvent({ event: null } as Record<string, unknown>);
    expect(result).not.toBeNull();
    expect(result?.title).toBeNull();
    expect(result?.date).toBeNull();
    expect(result?.location).toBeNull();
  });

  it("parses nested event object", () => {
    const raw = { event: { title: "Gala Night", date: "2026-05-01", location: "Berlin" } };
    const result = parseCampusGroupsEvent(raw);
    expect(result?.title).toBe("Gala Night");
    expect(result?.location).toBe("Berlin");
  });
});
