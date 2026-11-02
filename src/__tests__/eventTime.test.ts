import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_EVENT_DURATION_HOURS,
  DEFAULT_EVENT_DURATION_MS,
  DOOR_GRACE_AFTER_END_MS,
  doorStillOpen,
  eventEnd,
  eventPhase,
  eventStart,
  isEventOver,
  isPastEvent,
} from "../../supabase/functions/_shared/eventTime.ts";
import * as web from "../lib/eventTime";
import { eventEnd as billingEventEnd, isEventOver as billingIsEventOver } from "../../supabase/functions/_shared/billingRules.ts";

const at = (iso: string) => new Date(iso);

describe("eventEnd", () => {
  it("uses ends_at when the organizer set one", () => {
    const end = eventEnd({ date: "2026-11-06T21:00:00+01:00", ends_at: "2026-11-07T04:00:00+01:00" });
    expect(end?.toISOString()).toBe("2026-11-07T03:00:00.000Z");
  });

  it("falls back to the start plus the default duration (8 h) without ends_at", () => {
    expect(DEFAULT_EVENT_DURATION_HOURS).toBe(8);
    expect(DEFAULT_EVENT_DURATION_MS).toBe(8 * 3_600_000);
    const end = eventEnd({ date: "2026-11-06T21:00:00+01:00", ends_at: null });
    expect(end?.toISOString()).toBe("2026-11-07T04:00:00.000Z");
  });

  it("ignores an end at or before the start", () => {
    expect(eventEnd({ date: "2026-11-06T21:00:00Z", ends_at: "2026-11-06T21:00:00Z" })?.toISOString()).toBe("2026-11-07T05:00:00.000Z");
    expect(eventEnd({ date: "2026-11-06T21:00:00Z", ends_at: "2026-11-06T10:00:00Z" })?.toISOString()).toBe("2026-11-07T05:00:00.000Z");
  });

  it("ignores an unreadable ends_at", () => {
    expect(eventEnd({ date: "2026-11-06T21:00:00Z", ends_at: "whenever" })?.toISOString()).toBe("2026-11-07T05:00:00.000Z");
  });

  it("is null without a readable start (and no end)", () => {
    expect(eventEnd({})).toBeNull();
    expect(eventEnd({ date: null, ends_at: null })).toBeNull();
    expect(eventEnd({ date: "not a date" })).toBeNull();
    expect(eventStart({ date: "not a date" })).toBeNull();
  });

  it("keeps an explicit end even when the start is missing", () => {
    expect(eventEnd({ date: null, ends_at: "2026-11-07T03:00:00Z" })?.toISOString()).toBe("2026-11-07T03:00:00.000Z");
  });
});

describe("isPastEvent / isEventOver", () => {
  const party = { date: "2026-11-06T21:00:00+01:00", ends_at: "2026-11-07T04:00:00+01:00" };

  it("is false before the start and while the event is on", () => {
    expect(isPastEvent(party, at("2026-11-06T12:00:00+01:00"))).toBe(false);
    expect(isPastEvent(party, at("2026-11-07T01:30:00+01:00"))).toBe(false);
    expect(isPastEvent(party, at("2026-11-07T03:59:59.999+01:00"))).toBe(false);
  });

  it("is true from the end instant on", () => {
    expect(isPastEvent(party, at("2026-11-07T04:00:00+01:00"))).toBe(true);
    expect(isPastEvent(party, at("2026-11-20T00:00:00Z"))).toBe(true);
  });

  it("does not depend on the time zone the instants are written in", () => {
    const sameEnd = { date: "2026-11-06T20:00:00Z", ends_at: "2026-11-07T03:00:00Z" }; // = party in UTC
    for (const now of ["2026-11-07T02:59:59Z", "2026-11-06T21:59:59-05:00", "2026-11-07T11:59:59+09:00"]) {
      expect(isPastEvent(party, at(now))).toBe(false);
      expect(isPastEvent(sameEnd, at(now))).toBe(false);
    }
    for (const now of ["2026-11-07T03:00:00Z", "2026-11-06T22:00:00-05:00", "2026-11-07T12:00:00+09:00"]) {
      expect(isPastEvent(party, at(now))).toBe(true);
      expect(isPastEvent(sameEnd, at(now))).toBe(true);
    }
  });

  it("applies the 8 h default when there is no end: a 23:00 party is over at 07:00, not at midnight", () => {
    const late = { date: "2026-12-31T23:00:00+01:00", ends_at: null };
    expect(isPastEvent(late, at("2027-01-01T00:30:00+01:00"))).toBe(false);
    expect(isPastEvent(late, at("2027-01-01T06:59:00+01:00"))).toBe(false);
    expect(isPastEvent(late, at("2027-01-01T07:00:00+01:00"))).toBe(true);
  });

  it("never archives an event without a readable date", () => {
    expect(isPastEvent({}, at("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isPastEvent({ date: null }, at("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isPastEvent({ date: "soon" }, at("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("is the same function under both names", () => {
    expect(isPastEvent).toBe(isEventOver);
  });
});

describe("eventPhase", () => {
  const party = { date: "2026-11-06T21:00:00+01:00", ends_at: "2026-11-07T04:00:00+01:00" };

  it("is upcoming, then live, then past", () => {
    expect(eventPhase(party, at("2026-11-06T20:59:59+01:00"))).toBe("upcoming");
    expect(eventPhase(party, at("2026-11-06T21:00:00+01:00"))).toBe("live");
    expect(eventPhase(party, at("2026-11-07T01:00:00+01:00"))).toBe("live");
    expect(eventPhase(party, at("2026-11-07T04:00:00+01:00"))).toBe("past");
  });

  it("is live for an ongoing event that crossed midnight, whatever the calendar day says", () => {
    expect(eventPhase({ date: "2026-11-06T23:00:00+01:00", ends_at: null }, at("2026-11-07T02:00:00+01:00"))).toBe("live");
  });

  it("is upcoming without a readable date", () => {
    expect(eventPhase({}, at("2030-01-01T00:00:00Z"))).toBe("upcoming");
  });
});

describe("doorStillOpen", () => {
  it("keeps the door open until the end plus the tolerance", () => {
    const ev = { date: "2026-11-06T21:00:00Z", ends_at: "2026-11-07T03:00:00Z" };
    expect(DOOR_GRACE_AFTER_END_MS).toBe(4 * 3_600_000);
    expect(doorStillOpen(ev, at("2026-11-07T06:59:59Z"))).toBe(true);
    expect(doorStillOpen(ev, at("2026-11-07T07:00:00Z"))).toBe(false);
    expect(doorStillOpen({}, at("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("one rule everywhere", () => {
  it("the web app re-exports the very same functions", () => {
    expect(web.isPastEvent).toBe(isPastEvent);
    expect(web.eventEnd).toBe(eventEnd);
    expect(web.eventPhase).toBe(eventPhase);
    expect(web.DEFAULT_EVENT_DURATION_MS).toBe(DEFAULT_EVENT_DURATION_MS);
  });

  it("the billing rules use it too", () => {
    expect(billingEventEnd).toBe(eventEnd);
    expect(billingIsEventOver).toBe(isEventOver);
  });

  it("the SQL twin public.event_end() uses the same default duration", () => {
    const sql = readFileSync("supabase/migrations/20261102090000_sales_archive_vat_rate_and_past_event_lock.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.event_end"));
    expect(fn).toMatch(new RegExp(`p_date \\+ interval '${DEFAULT_EVENT_DURATION_HOURS} hours'`));
  });

  it("stays importable by Deno and by vitest alike (no import, no Deno API)", () => {
    const source = readFileSync("supabase/functions/_shared/eventTime.ts", "utf8");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/Deno\./);
  });
});
