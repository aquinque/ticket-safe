/**
 * Where to go once a forgotten password has been replaced.
 *
 * The reset email can only open /reset-password (the email hook forces that page), so the page the
 * person was on when they clicked "Log in" / "Forgot your password?" is remembered in this browser
 * when the email is requested, and read back once the new password is saved. Opened on another
 * device, or after a day, there is nothing to read and the home is used.
 */
import { DEFAULT_RETURN_PATH, safeReturnPath } from "@/lib/returnTo";

export const RESET_RETURN_KEY = "ts.resetReturn";
/** Long enough for the email to arrive and be opened; the link itself expires sooner. */
export const RESET_RETURN_TTL_MS = 24 * 60 * 60 * 1000;

const storage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Remembers `path` (internal paths only) as the page to come back to after the reset. */
export function rememberResetReturn(path: string | null | undefined, now: number = Date.now()): void {
  const target = safeReturnPath(path);
  const store = storage();
  if (!store) return;
  try {
    if (!target) store.removeItem(RESET_RETURN_KEY);
    else store.setItem(RESET_RETURN_KEY, JSON.stringify({ path: target, at: now }));
  } catch {
    /* storage full or blocked: the home is used */
  }
}

/** The remembered page (and forgets it), or `fallback` when there is none, it is stale or unsafe. */
export function takeResetReturn(fallback: string = DEFAULT_RETURN_PATH, now: number = Date.now()): string {
  const store = storage();
  if (!store) return fallback;
  let raw: string | null = null;
  try {
    raw = store.getItem(RESET_RETURN_KEY);
    store.removeItem(RESET_RETURN_KEY);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof saved.at !== "number" || now - saved.at > RESET_RETURN_TTL_MS || saved.at > now + 60_000) return fallback;
    return safeReturnPath(typeof saved.path === "string" ? saved.path : null) ?? fallback;
  } catch {
    return fallback;
  }
}

/** The remembered page without forgetting it (to ask for a new link that still comes back there). */
export function peekResetReturn(now: number = Date.now()): string | null {
  const store = storage();
  let raw: string | null = null;
  try {
    raw = store?.getItem(RESET_RETURN_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof saved.at !== "number" || now - saved.at > RESET_RETURN_TTL_MS) return null;
    return safeReturnPath(typeof saved.path === "string" ? saved.path : null);
  } catch {
    return null;
  }
}

/** The sign-in page opened on "Forgot your password?", keeping the page to come back to. */
export function requestNewResetLinkPath(now: number = Date.now()): string {
  const params = new URLSearchParams({ mode: "reset" });
  const next = peekResetReturn(now);
  if (next && next !== DEFAULT_RETURN_PATH) params.set("next", next);
  return `/auth?${params.toString()}`;
}
