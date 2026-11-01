/**
 * "The back button always brings the visitor to the home page." The decisions behind it, kept free of React and
 * of `window` so they can be tested (the effects live in src/components/BackToHomeGuard.tsx).
 *
 * How it works. Every history entry the site is on remembers its distance to the nearest home entry below it
 * (`tsDist` in history.state: 0 for home itself). When a back press lands on a page that is not the home page, the
 * guard jumps straight to that home entry in one move (`history.go(-distance)`), without the router ever drawing
 * the page in between. When the distance is not known it replaces the page by "/" instead. The first entry of a
 * document that is not the home page (a link from Instagram, the return from a payment page) gets a home entry put
 * under it, so that one back press reaches home and the next one leaves the site normally.
 *
 * The visitor's own navigation is untouched: links and buttons push entries as usual, the home page is left alone
 * (back from it leaves the site), forward does nothing special, a change of #fragment is not a page change, and the
 * in-app "Back" buttons announce their `navigate(-1)` so it is not mistaken for the browser's button.
 */

export const HOME_PATH = "/";

export type NavType = "PUSH" | "POP" | "REPLACE";

/** What we read back from a history entry's state (React Router writes { usr, key, idx }; we add `tsDist`). */
export interface EntryMarks {
  idx: number | null;
  dist: number | null;
}

const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function readMarks(state: unknown): EntryMarks {
  const s = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { idx: asNumber(s.idx), dist: asNumber(s.tsDist) };
}

/**
 * How many entries back the nearest home entry is: 0 for a home entry, null when unknown.
 * A pushed page is one further than the entry it was pushed from; a replaced page sits where the old one was
 * (but when it replaces a home entry, what is below it is not known); a page reached by back/forward keeps the
 * distance written on its entry.
 */
export function entryDistance(input: {
  path: string;
  navType: NavType;
  previousDist: number | null;
  ownDist: number | null;
}): number | null {
  if (input.path === HOME_PATH) return 0;
  switch (input.navType) {
    case "PUSH":
      return input.previousDist === null ? null : input.previousDist + 1;
    case "REPLACE":
      return input.previousDist === null || input.previousDist === 0 ? null : input.previousDist;
    case "POP":
      return input.ownDist;
  }
}

/** The first page this document shows, when it is not the home page and has no mark yet: it needs home below it. */
export function needsHomeUnderneath(input: { path: string; firstCommit: boolean; ownDist: number | null }): boolean {
  return input.firstCommit && input.path !== HOME_PATH && input.ownDist === null;
}

export type PopDecision = { kind: "allow" } | { kind: "go"; delta: number } | { kind: "home" };

/** After this many bounces in a row that did not end on the home page, stop trusting the marks and just replace. */
export const MAX_REDIRECTS_IN_A_ROW = 2;

/**
 * What to do with a back/forward move that has just happened (a `popstate`).
 *  - allow: let the router draw it as usual;
 *  - go: jump `delta` entries (negative) to the nearest home entry;
 *  - home: replace the page by "/".
 */
export function decidePop(input: {
  /** pathname of the entry we landed on */
  toPath: string;
  /** only the #fragment differs from the page we were on */
  toSamePage: boolean;
  fromIdx: number | null;
  toIdx: number | null;
  toDist: number | null;
  /** the page itself asked for this move (an in-app "Back" button) */
  programmatic: boolean;
  redirectsInRow: number;
}): PopDecision {
  if (input.toPath === HOME_PATH) return { kind: "allow" };
  if (input.programmatic || input.toSamePage) return { kind: "allow" };
  const forward = input.fromIdx !== null && input.toIdx !== null && input.toIdx > input.fromIdx;
  if (forward) return { kind: "allow" };
  if (input.redirectsInRow >= MAX_REDIRECTS_IN_A_ROW) return { kind: "home" };
  if (input.toDist !== null && input.toDist >= 1) return { kind: "go", delta: -input.toDist };
  return { kind: "home" };
}

// ── In-app back buttons ───────────────────────────────────────────────────

const PROGRAMMATIC_WINDOW_MS = 1500;
let programmaticUntil = 0;

/**
 * Call right before `navigate(-1)` in a "Back" button of the page: that move is the page's own and must not be
 * sent to the home page like the browser's button is.
 */
export function allowNextHistoryBack(now: number = Date.now()): void {
  programmaticUntil = now + PROGRAMMATIC_WINDOW_MS;
}

/** True once for a move announced by allowNextHistoryBack, shortly after it. */
export function consumeProgrammaticBack(now: number = Date.now()): boolean {
  const announced = now <= programmaticUntil;
  programmaticUntil = 0;
  return announced;
}
