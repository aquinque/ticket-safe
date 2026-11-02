import { describe, expect, it } from "vitest";
import { deriveEventStatusKind } from "../lib/eventStatus";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date("2026-11-07T22:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("deriveEventStatusKind: ended follows the end of the event, not its start", () => {
  it("published and ended (ends_at in the past) -> ended", () => {
    expect(deriveEventStatusKind("published", ago(2 * DAY), false, ago(DAY), now)).toBe("ended");
  });

  it("published, started, ends_at tomorrow -> live, even though the start has passed", () => {
    expect(deriveEventStatusKind("published", ago(3 * HOUR), false, ahead(DAY), now)).toBe("live");
  });

  it("published, no ends_at, started 9 h ago -> ended (start + 8 h)", () => {
    expect(deriveEventStatusKind("published", ago(9 * HOUR), false, null, now)).toBe("ended");
    expect(deriveEventStatusKind("published", ago(9 * HOUR), false, undefined, now)).toBe("ended");
  });

  it("published, no ends_at, started 2 h ago -> live", () => {
    expect(deriveEventStatusKind("published", ago(2 * HOUR), false, null, now)).toBe("live");
  });

  it("ends at the end instant itself, and is live just before", () => {
    expect(deriveEventStatusKind("published", ago(8 * HOUR), false, null, now)).toBe("ended");
    expect(deriveEventStatusKind("published", ago(8 * HOUR - 1), false, null, now)).toBe("live");
  });

  it("an end at or before the start is ignored (falls back to start + 8 h)", () => {
    expect(deriveEventStatusKind("published", ago(2 * HOUR), false, ago(5 * HOUR), now)).toBe("live");
  });

  it("is never ended without a readable date", () => {
    expect(deriveEventStatusKind("published", null, false, null, now)).toBe("live");
    expect(deriveEventStatusKind("published", undefined, false, undefined, now)).toBe("live");
    expect(deriveEventStatusKind("published", "not a date", false, null, now)).toBe("live");
  });

  it("upcoming published -> live", () => {
    expect(deriveEventStatusKind("published", ahead(3 * DAY), false, null, now)).toBe("live");
  });
});

describe("deriveEventStatusKind: draft, cancelled and sold out keep their meaning whatever the date", () => {
  it("draft stays draft", () => {
    expect(deriveEventStatusKind("draft", ago(2 * DAY), false, ago(DAY), now)).toBe("draft");
    expect(deriveEventStatusKind("draft", ahead(DAY), false, null, now)).toBe("draft");
    expect(deriveEventStatusKind(null, ago(2 * DAY), false, null, now)).toBe("draft");
    expect(deriveEventStatusKind(undefined, ahead(DAY), false, null, now)).toBe("draft");
  });

  it("cancelled stays cancelled", () => {
    expect(deriveEventStatusKind("cancelled", ago(2 * DAY), false, ago(DAY), now)).toBe("cancelled");
    expect(deriveEventStatusKind("cancelled", ahead(DAY), true, null, now)).toBe("cancelled");
  });

  it("sold out: the stored status, or a published event the caller found full", () => {
    expect(deriveEventStatusKind("sold_out", ahead(DAY), false, null, now)).toBe("soldout");
    expect(deriveEventStatusKind("sold_out", ago(2 * DAY), false, ago(DAY), now)).toBe("soldout");
    expect(deriveEventStatusKind("published", ahead(DAY), true, null, now)).toBe("soldout");
    expect(deriveEventStatusKind("draft", ahead(DAY), true, null, now)).toBe("draft");
  });
});

describe("deriveEventStatusKind: the previous call shape (no endsAt, no now) still works", () => {
  it("reads the clock itself and uses start + 8 h", () => {
    const realNow = Date.now();
    expect(deriveEventStatusKind("published", new Date(realNow - 9 * HOUR).toISOString())).toBe("ended");
    expect(deriveEventStatusKind("published", new Date(realNow - HOUR).toISOString())).toBe("live");
    expect(deriveEventStatusKind("published", new Date(realNow + DAY).toISOString())).toBe("live");
    expect(deriveEventStatusKind("published", new Date(realNow + DAY).toISOString(), true)).toBe("soldout");
    expect(deriveEventStatusKind("draft", new Date(realNow - 9 * HOUR).toISOString())).toBe("draft");
    expect(deriveEventStatusKind("cancelled")).toBe("cancelled");
    expect(deriveEventStatusKind("published")).toBe("live");
  });
});
