import { describe, it, expect } from "vitest";
import {
  isTonight,
  isThisWeek,
  isThisMonth,
  matchesDateFilter,
} from "../lib/dateFilters";

// Fixed reference point so the tests stay deterministic regardless of when CI runs.
const NOW = new Date("2026-05-15T18:00:00Z");

describe("isTonight", () => {
  it("returns true for an event later the same day", () => {
    expect(isTonight("2026-05-15T22:00:00Z", NOW)).toBe(true);
  });
  it("returns true for an event earlier the same day", () => {
    // Earlier in the day is fine — we treat 'tonight' as 'today calendar-wise'.
    expect(isTonight("2026-05-15T08:00:00Z", NOW)).toBe(true);
  });
  it("returns false for tomorrow", () => {
    expect(isTonight("2026-05-16T22:00:00Z", NOW)).toBe(false);
  });
  it("returns false for yesterday", () => {
    expect(isTonight("2026-05-14T22:00:00Z", NOW)).toBe(false);
  });
});

describe("isThisWeek", () => {
  it("returns true for an event 3 days from now", () => {
    expect(isThisWeek("2026-05-18T20:00:00Z", NOW)).toBe(true);
  });
  it("returns true for an event exactly 7 days away", () => {
    expect(isThisWeek("2026-05-22T18:00:00Z", NOW)).toBe(true);
  });
  it("returns false for an event 8 days away", () => {
    expect(isThisWeek("2026-05-23T19:00:00Z", NOW)).toBe(false);
  });
  it("returns false for an event in the past", () => {
    expect(isThisWeek("2026-05-14T18:00:00Z", NOW)).toBe(false);
  });
});

describe("isThisMonth", () => {
  it("returns true for an event later this month", () => {
    expect(isThisMonth("2026-05-30T20:00:00Z", NOW)).toBe(true);
  });
  it("returns false for an event next month", () => {
    expect(isThisMonth("2026-06-01T20:00:00Z", NOW)).toBe(false);
  });
  it("returns false for an event last month", () => {
    expect(isThisMonth("2026-04-30T20:00:00Z", NOW)).toBe(false);
  });
  it("returns false for an event earlier in the month (past)", () => {
    expect(isThisMonth("2026-05-10T20:00:00Z", NOW)).toBe(false);
  });
});

describe("matchesDateFilter", () => {
  it("all-dates always matches", () => {
    expect(matchesDateFilter("1999-01-01T00:00:00Z", "all-dates", NOW)).toBe(true);
    expect(matchesDateFilter("2099-12-31T00:00:00Z", "all-dates", NOW)).toBe(true);
  });
  it("dispatches to isTonight / isThisWeek / isThisMonth correctly", () => {
    expect(matchesDateFilter("2026-05-15T22:00:00Z", "tonight", NOW)).toBe(true);
    expect(matchesDateFilter("2026-05-18T20:00:00Z", "this-week", NOW)).toBe(true);
    expect(matchesDateFilter("2026-05-30T20:00:00Z", "this-month", NOW)).toBe(true);
    expect(matchesDateFilter("2026-06-15T20:00:00Z", "tonight", NOW)).toBe(false);
  });
});
