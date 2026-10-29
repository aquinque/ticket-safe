import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  EVENT_DRAFT_KEY,
  clearDraftFile,
  clearEventDraft,
  emptyEventDraft,
  isEventDraftEmpty,
  loadDraftFile,
  loadEventDraft,
  makeTier,
  parseEventDraft,
  saveDraftFile,
  saveEventDraft,
  type EventDraft,
} from "@/lib/eventDraft";

const STEPS = 5;
const USER = "user-1";

/**
 * The Node that runs vitest ships its own `localStorage` global, which is
 * undefined unless Node is started with --localstorage-file, and it shadows
 * jsdom's. The helpers read the bare global exactly like the browser does, so
 * give them a small in-memory Storage for the tests.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

const installMemoryStorage = () =>
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  });

const filled = (): EventDraft => ({
  ...emptyEventDraft(),
  savedAt: "2026-10-29T10:00:00.000Z",
  step: 2,
  title: "Winter Gala",
  description: "Black tie.",
  date: "2026-12-12T20:00",
  location: "Pavillon",
  primaryColor: "#AA00FF",
  slug: "winter-gala",
  tiers: [makeTier(), makeTier({ name: "VIP", priceEuros: "60", totalQty: "20", kind: "table", capacityPerUnit: "6" })],
  videoName: "teaser.mp4",
});

describe("event draft autosave", () => {
  beforeAll(installMemoryStorage);
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a draft through localStorage, keyed per user", () => {
    const d = filled();
    saveEventDraft(USER, d);
    expect(loadEventDraft(USER, STEPS)).toEqual(d);
    expect(loadEventDraft("someone-else", STEPS)).toBeNull();
    expect(localStorage.getItem(EVENT_DRAFT_KEY(USER))).not.toBeNull();
  });

  it("clears a draft", () => {
    saveEventDraft(USER, filled());
    clearEventDraft(USER);
    expect(loadEventDraft(USER, STEPS)).toBeNull();
  });

  it("ignores corrupt, foreign or outdated data", () => {
    expect(parseEventDraft(null, STEPS)).toBeNull();
    expect(parseEventDraft("{not json", STEPS)).toBeNull();
    expect(parseEventDraft('"a string"', STEPS)).toBeNull();
    expect(parseEventDraft(JSON.stringify({ ...filled(), v: 0 }), STEPS)).toBeNull();
  });

  it("repairs missing or malformed fields instead of crashing the wizard", () => {
    const parsed = parseEventDraft(
      JSON.stringify({
        v: 1,
        step: 99,
        title: 42,
        primaryColor: "not-a-colour",
        tiers: [{ name: "VIP", kind: "sofa" }, "garbage", null],
        limitEnabled: "yes",
      }),
      STEPS,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.step).toBe(STEPS - 1);
    expect(parsed!.title).toBe("");
    expect(parsed!.primaryColor).toBeNull();
    expect(parsed!.limitEnabled).toBe(true);
    expect(parsed!.category).toBe("party");
    expect(parsed!.tiers).toEqual([makeTier({ name: "VIP", kind: "ticket" })]);
  });

  it("keeps an explicitly empty tier list (the organizer removed every tier)", () => {
    const parsed = parseEventDraft(JSON.stringify({ ...filled(), tiers: [] }), STEPS);
    expect(parsed!.tiers).toEqual([]);
  });

  it("tells a pristine wizard apart from one with real input", () => {
    expect(isEventDraftEmpty(emptyEventDraft())).toBe(true);
    // Moving between steps or the autosave timestamp alone is not worth keeping.
    expect(isEventDraftEmpty({ ...emptyEventDraft(), step: 3, savedAt: "2026-10-29T10:00:00.000Z" })).toBe(true);
    expect(isEventDraftEmpty({ ...emptyEventDraft(), title: "G" })).toBe(false);
    expect(isEventDraftEmpty({ ...emptyEventDraft(), tiers: [] })).toBe(false);
    expect(isEventDraftEmpty({ ...emptyEventDraft(), videoName: "teaser.mp4" })).toBe(false);
    expect(isEventDraftEmpty({ ...emptyEventDraft(), primaryColor: "#003399" })).toBe(false);
  });

  it("survives a browser without storage", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(() => saveEventDraft(USER, filled())).not.toThrow();
      expect(loadEventDraft(USER, STEPS)).toBeNull();
      expect(() => clearEventDraft(USER)).not.toThrow();
    } finally {
      installMemoryStorage();
    }
  });

  it("file helpers degrade quietly when IndexedDB is missing (as in jsdom)", async () => {
    expect(typeof indexedDB).toBe("undefined");
    const file = new File(["x"], "banner.jpg", { type: "image/jpeg" });
    await expect(saveDraftFile(USER, "banner", file)).resolves.toBe(false);
    await expect(loadDraftFile(USER, "banner")).resolves.toBeNull();
    await expect(clearDraftFile(USER, "banner")).resolves.toBeUndefined();
  });
});
