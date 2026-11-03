import { describe, expect, it } from "vitest";
import { countdown } from "../lib/eventCountdown";

const start = Date.parse("2026-11-06T23:01:00Z");
const ev = { date: new Date(start).toISOString(), ends_at: new Date(start + 5 * 3_600_000).toISOString() };
const before = (ms: number) => countdown(ev, start - ms);
const H = 3_600_000;
const MIN = 60_000;

describe("the event page countdown", () => {
  it("counts days while more than 24 h are left", () => {
    expect(before(3 * 24 * H + 5 * H).label).toBe("Starts in 3 days");
    expect(before(24 * H + MIN).label).toBe("Starts in 1 day");
  });

  it("counts hours and minutes on the last day, then minutes", () => {
    expect(before(24 * H).label).toBe("Starts in 24 h 0 min");
    expect(before(5 * H + 51 * MIN + 33_000).label).toBe("Starts in 5 h 51 min");
    expect(before(51 * MIN).label).toBe("Starts in 51 min");
    expect(before(20_000).label).toBe("Starts in 1 min");
  });

  it("says the event is on while it runs", () => {
    expect(countdown(ev, start + H)).toEqual({ label: "Happening now", live: true, over: false });
  });

  it("is over once the event has ended", () => {
    expect(countdown(ev, start + 6 * H).over).toBe(true);
  });
});
