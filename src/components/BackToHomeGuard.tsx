import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { HOME_PATH, entryDistance, needsHomeUnderneath, readMarks } from "@/lib/backToHome";
import { installBackGuard, runtime } from "@/lib/backToHomeRuntime";

const randomKey = () => Math.random().toString(36).slice(2, 10);

const writeDistance = (dist: number) => {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState({ ...state, tsDist: dist }, "");
};

/** Puts a home entry under the current page: the page's entry becomes "/", and the page is pushed again on top. */
function putHomeUnderneath() {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  const idx = typeof state.idx === "number" ? state.idx : 0;
  const { pathname, search, hash } = window.location;
  window.history.replaceState({ usr: null, key: randomKey(), idx, tsDist: 0 }, "", HOME_PATH);
  window.history.pushState({ ...state, idx: idx + 1, tsDist: 1, tsBackGuard: true }, "", pathname + search + hash);
}

/**
 * Mounted once, in App: makes the browser's back button (and the swipe-back of Safari iOS and Chrome Android, which
 * fire the same `popstate`) bring the visitor to the home page. The reasoning and the cases are in
 * src/lib/backToHome.ts; the listener is in src/lib/backToHomeRuntime.ts (installed at start-up, before the router's).
 * This component renders nothing and does nothing on the home page. It hands the router's `navigate` to the
 * listener, writes on each history entry how far home is, and gives the document's first page a home entry below it.
 * When it goes, it switches the listener off.
 */
const BackToHomeGuard = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const uninstall = installBackGuard(); // already done at start-up; this only matters if it was not
    runtime.navigate = (to, options) => navigateRef.current(to, options);
    runtime.enabled = true;
    return () => {
      runtime.enabled = false;
      runtime.navigate = null;
      uninstall();
    };
  }, []);

  // Every page the router shows: write its distance to home on its entry, and give this document's first page a home entry below it.
  useEffect(() => {
    const path = location.pathname;
    const marks = readMarks(window.history.state);
    if (path === HOME_PATH) runtime.redirects = 0;
    runtime.prevIdx = runtime.idx;
    runtime.prevPath = runtime.path;
    runtime.prevSearch = runtime.search;

    if (needsHomeUnderneath({ path, firstCommit: runtime.first, ownDist: marks.dist })) {
      putHomeUnderneath();
      runtime.idx = readMarks(window.history.state).idx;
      runtime.dist = 1;
    } else {
      const dist = entryDistance({ path, navType, previousDist: runtime.dist, ownDist: marks.dist });
      if (dist !== null && dist !== marks.dist) writeDistance(dist);
      runtime.idx = marks.idx ?? runtime.idx;
      runtime.dist = dist;
    }
    runtime.path = path;
    runtime.search = location.search;
    runtime.first = false;
  }, [location.key, location.pathname, location.search, navType]);

  return null;
};

export default BackToHomeGuard;
