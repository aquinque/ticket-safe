/**
 * The part of the "back always returns to the home page" guard that touches the browser: the `popstate` listener
 * and the bookkeeping it reads. The decisions themselves are in src/lib/backToHome.ts.
 *
 * It is installed once at start-up (src/main.tsx), BEFORE React Router registers its own `popstate` listener:
 * listeners on `window` run in the order they were added, so this one sees the move first, can stop it
 * (`stopImmediatePropagation`) and send the visitor home before the router has drawn the page being left. Doing it
 * from a component's effect would be too late: the router would already have drawn that page for a frame.
 *
 * src/components/BackToHomeGuard.tsx feeds it from React: the router's `navigate` and the page the router is on.
 */
import { HOME_PATH, consumeProgrammaticBack, decidePop, readMarks } from "@/lib/backToHome";

export interface GuardRuntime {
  /** Where the entry we are on stands: its index in React Router's numbering and its distance to home. */
  idx: number | null;
  dist: number | null;
  path: string;
  search: string;
  /** What the entry before was (before the router last moved), in case the router drew a move before we saw it. */
  prevIdx: number | null;
  prevPath: string;
  prevSearch: string;
  /** Still waiting for this document's first page. */
  first: boolean;
  /** Bounces in a row that have not ended on the home page. */
  redirects: number;
  jumpTimer: number;
  /** React Router's navigate, handed over by the guard component. */
  navigate: ((to: string, options: { replace: true }) => void) | null;
  /** Off until the guard component is mounted, and again once it is gone. */
  enabled: boolean;
}

export const runtime: GuardRuntime = {
  idx: null,
  dist: null,
  path: "",
  search: "",
  prevIdx: null,
  prevPath: "",
  prevSearch: "",
  first: true,
  redirects: 0,
  jumpTimer: 0,
  navigate: null,
  enabled: false,
};

function replaceByHome() {
  runtime.navigate?.(HOME_PATH, { replace: true });
}

function onPop(event: PopStateEvent) {
  if (!runtime.enabled) return;
  window.clearTimeout(runtime.jumpTimer);
  const marks = readMarks(window.history.state);
  const toPath = window.location.pathname;
  const toSearch = window.location.search;
  // Normally this runs before the router has seen the move, so `path`/`idx` still describe the page being left.
  // If the router got there first (this was installed too late), they already describe the page being reached:
  // then the page being left is the one remembered before.
  const routerGotThereFirst = runtime.path === toPath && runtime.search === toSearch && runtime.idx === marks.idx;
  const fromIdx = routerGotThereFirst ? runtime.prevIdx : runtime.idx;
  const fromPath = routerGotThereFirst ? runtime.prevPath : runtime.path;
  const fromSearch = routerGotThereFirst ? runtime.prevSearch : runtime.search;

  const decision = decidePop({
    toPath,
    toSamePage: toPath === fromPath && toSearch === fromSearch,
    fromIdx,
    toIdx: marks.idx,
    toDist: marks.dist,
    programmatic: consumeProgrammaticBack(),
    redirectsInRow: runtime.redirects,
  });
  if (decision.kind === "allow") {
    if (toPath === HOME_PATH) runtime.redirects = 0;
    return;
  }

  event.stopImmediatePropagation();
  runtime.redirects += 1;
  if (decision.kind === "go") {
    window.history.go(decision.delta);
    // If the jump did not happen (nothing there), fall back to replacing the page.
    runtime.jumpTimer = window.setTimeout(replaceByHome, 500);
  } else {
    replaceByHome();
  }
}

let installed = false;

/** Adds the listener, once. Returns the function that removes it. */
export function installBackGuard(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;
  window.addEventListener("popstate", onPop, true);
  return () => {
    window.removeEventListener("popstate", onPop, true);
    window.clearTimeout(runtime.jumpTimer);
    installed = false;
  };
}
