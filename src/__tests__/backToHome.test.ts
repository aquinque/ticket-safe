import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOME_PATH,
  MAX_REDIRECTS_IN_A_ROW,
  allowNextHistoryBack,
  consumeProgrammaticBack,
  decidePop,
  entryDistance,
  needsHomeUnderneath,
  readMarks,
} from "../lib/backToHome";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("what an entry remembers", () => {
  it("reads the router's index and our distance from a history state, and nothing from anything else", () => {
    expect(readMarks({ usr: null, key: "abc", idx: 3, tsDist: 2 })).toEqual({ idx: 3, dist: 2 });
    expect(readMarks({ idx: "3", tsDist: NaN })).toEqual({ idx: null, dist: null });
    expect(readMarks(null)).toEqual({ idx: null, dist: null });
    expect(readMarks("x")).toEqual({ idx: null, dist: null });
  });

  it("is 0 on the home page whatever way it was reached", () => {
    for (const navType of ["PUSH", "POP", "REPLACE"] as const) {
      expect(entryDistance({ path: HOME_PATH, navType, previousDist: 4, ownDist: null }), navType).toBe(0);
    }
  });

  it("grows by one for each page pushed on top of home", () => {
    expect(entryDistance({ path: "/tickets", navType: "PUSH", previousDist: 0, ownDist: null })).toBe(1);
    expect(entryDistance({ path: "/e/gala", navType: "PUSH", previousDist: 1, ownDist: null })).toBe(2);
    expect(entryDistance({ path: "/e/gala", navType: "PUSH", previousDist: null, ownDist: null })).toBeNull();
  });

  it("stays the same when a page is replaced, but is unknown when a page replaces home itself", () => {
    expect(entryDistance({ path: "/tickets", navType: "REPLACE", previousDist: 1, ownDist: null })).toBe(1);
    expect(entryDistance({ path: "/auth", navType: "REPLACE", previousDist: 0, ownDist: null })).toBeNull();
    expect(entryDistance({ path: "/auth", navType: "REPLACE", previousDist: null, ownDist: null })).toBeNull();
  });

  it("keeps what was written on the entry when it is reached again by back or forward", () => {
    expect(entryDistance({ path: "/tickets", navType: "POP", previousDist: 0, ownDist: 1 })).toBe(1);
    expect(entryDistance({ path: "/tickets", navType: "POP", previousDist: 0, ownDist: null })).toBeNull();
  });
});

describe("the first page of a document", () => {
  it("gets a home entry under it when it is not the home page and nothing is written on it yet", () => {
    expect(needsHomeUnderneath({ path: "/e/gala", firstCommit: true, ownDist: null })).toBe(true);
    expect(needsHomeUnderneath({ path: HOME_PATH, firstCommit: true, ownDist: null })).toBe(false);
    // a reload keeps what was written on the entry
    expect(needsHomeUnderneath({ path: "/e/gala", firstCommit: true, ownDist: 2 })).toBe(false);
    // only the document's first page: never in the middle of the history
    expect(needsHomeUnderneath({ path: "/e/gala", firstCommit: false, ownDist: null })).toBe(false);
  });
});

describe("a back or forward move", () => {
  const base = { toPath: "/tickets", toSamePage: false, fromIdx: 2, toIdx: 1, toDist: 1, programmatic: false, redirectsInRow: 0 };

  it("does nothing on the home page, so a back press there leaves the site normally", () => {
    expect(decidePop({ ...base, toPath: HOME_PATH, toDist: 0 })).toEqual({ kind: "allow" });
  });

  it("jumps straight to the nearest home entry when a page is reached going back", () => {
    expect(decidePop({ ...base, toDist: 1 })).toEqual({ kind: "go", delta: -1 });
    expect(decidePop({ ...base, toDist: 3, toIdx: 4, fromIdx: 7 })).toEqual({ kind: "go", delta: -3 });
  });

  it("replaces the page by the home page when the distance is not known", () => {
    expect(decidePop({ ...base, toDist: null })).toEqual({ kind: "home" });
    expect(decidePop({ ...base, toDist: 0 })).toEqual({ kind: "home" });
    expect(decidePop({ ...base, fromIdx: null, toIdx: null, toDist: null })).toEqual({ kind: "home" });
  });

  it("leaves forward moves alone", () => {
    expect(decidePop({ ...base, fromIdx: 1, toIdx: 2 })).toEqual({ kind: "allow" });
  });

  it("leaves a change of #fragment on the same page alone", () => {
    expect(decidePop({ ...base, toSamePage: true, toDist: null })).toEqual({ kind: "allow" });
  });

  it("leaves a move the page itself asked for alone (the in-app Back buttons)", () => {
    expect(decidePop({ ...base, programmatic: true })).toEqual({ kind: "allow" });
  });

  it("never bounces more than twice in a row: then it just replaces the page, so it cannot loop", () => {
    expect(decidePop({ ...base, redirectsInRow: MAX_REDIRECTS_IN_A_ROW - 1 })).toEqual({ kind: "go", delta: -1 });
    expect(decidePop({ ...base, redirectsInRow: MAX_REDIRECTS_IN_A_ROW })).toEqual({ kind: "home" });
  });
});

describe("the in-app Back buttons", () => {
  it("announce their move once, for a short time", () => {
    expect(consumeProgrammaticBack(1000)).toBe(false);
    allowNextHistoryBack(1000);
    expect(consumeProgrammaticBack(1500)).toBe(true);
    expect(consumeProgrammaticBack(1500)).toBe(false); // used up
    allowNextHistoryBack(1000);
    expect(consumeProgrammaticBack(5000)).toBe(false); // too late: the move never happened
  });

  it("are the two places that call navigate(-1), and both announce it", () => {
    expect(read("src/components/BackButton.tsx")).toMatch(/allowNextHistoryBack\(\);\s*navigate\(-1\);/);
    expect(read("src/pages/EventPublic.tsx")).toMatch(/allowNextHistoryBack\(\); navigate\(-1\);/);
  });
});

describe("the guard", () => {
  const guard = read("src/components/BackToHomeGuard.tsx");
  const runtime = read("src/lib/backToHomeRuntime.ts");

  it("is mounted once, in App, inside the router, next to ScrollToTop", () => {
    const app = read("src/App.tsx");
    expect((app.match(/<BackToHomeGuard \/>/g) ?? []).length).toBe(1);
    expect(app.indexOf("<ScrollToTop />")).toBeLessThan(app.indexOf("<BackToHomeGuard />"));
  });

  it("listens to popstate before the router does: installed at start-up, ahead of the first render", () => {
    // Listeners on window run in the order they were added, so this has to come before React Router's.
    const main = read("src/main.tsx");
    expect(main).toContain("installBackGuard();");
    expect(main.indexOf("installBackGuard();")).toBeLessThan(main.indexOf("createRoot("));
    expect(runtime).toContain('window.addEventListener("popstate", onPop, true)');
    expect(runtime).toContain("event.stopImmediatePropagation()");
  });

  it("switches itself off, and its listener with it, when the component goes", () => {
    expect(guard).toContain("runtime.enabled = false");
    expect(guard).toContain("uninstall()");
    expect(runtime).toContain('window.removeEventListener("popstate", onPop, true)');
    expect(runtime).toContain("if (!runtime.enabled) return;");
  });

  it("copes with a router that drew the move first: it then reads the page it left from what it remembered before", () => {
    expect(runtime).toContain("routerGotThereFirst");
    expect(runtime).toContain("runtime.prevIdx");
  });

  it("pushes a sentinel entry (tsBackGuard) with the page's own address, and does it for a document's first page only", () => {
    expect(guard).toMatch(/pushState\(\{ \.\.\.state, idx: idx \+ 1, tsDist: 1, tsBackGuard: true \}, "", pathname \+ search \+ hash\)/);
    expect(guard).toContain("needsHomeUnderneath({ path, firstCommit: runtime.first, ownDist: marks.dist })");
  });

  it("replaces through the router (no extra entry), never with location.replace or location.href", () => {
    expect(runtime).toContain("runtime.navigate?.(HOME_PATH, { replace: true })");
    expect(guard + runtime).not.toMatch(/location\.(replace|assign|href\s*=)/);
  });
});
