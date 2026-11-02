/**
 * Where to send someone after they sign in or sign up.
 *
 * The sign-in page is opened as `/auth?next=<path>`, where `<path>` is the page the person was on
 * (an event, Resale, the home) or the protected page they were trying to open (checkout, My Tickets,
 * My Wallet, the promoter space, Ticket Studio). Once signed in they go straight back there.
 *
 * `next` comes from the address bar, so anyone can craft it: only a path on this site is accepted
 * (starts with a single "/", no "//", no backslash, no scheme). Anything else falls back to the home.
 * The account page is never a fallback: it is reached from the menu.
 */

export const DEFAULT_RETURN_PATH = "/";

const PROBE_ORIGIN = "https://return-to.invalid";

/** The path itself when it is a safe internal destination, null otherwise. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // Browsers read "\" as "/", so "/\evil.com" would leave the site. Control characters are never legitimate.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  // Coming back to the sign-in page itself would loop.
  if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) return null;
  return url.pathname + url.search + url.hash;
}

/** The safe destination, or the home. */
export const returnPathOr = (raw: string | null | undefined, fallback: string = DEFAULT_RETURN_PATH): string =>
  safeReturnPath(raw) ?? fallback;

/** The sign-in (or sign-up) page that brings the person back to `next` afterwards. */
export function authPath(next?: string | null, options: { signup?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (options.signup) params.set("mode", "signup");
  const target = safeReturnPath(next);
  if (target) params.set("next", target);
  const query = params.toString();
  return query ? `/auth?${query}` : "/auth";
}

/** The page currently open, as a `next` value. Null on the sign-in pages themselves. */
export function currentReturnPath(
  location: { pathname: string; search?: string; hash?: string } | undefined =
    typeof window !== "undefined" ? window.location : undefined,
): string | null {
  if (!location) return null;
  return safeReturnPath(location.pathname + (location.search ?? "") + (location.hash ?? ""));
}

/** The sign-in page for the page currently open. */
export const authPathHere = (options: { signup?: boolean } = {}): string => authPath(currentReturnPath(), options);

/**
 * The page a confirmation email (sign-up, resend) opens once the address is verified.
 *
 * The email hook turns a bare "/" into the account page, so the home goes through the sign-in page,
 * which forwards a signed-in person to `next` straight away (with replace, so Back skips it).
 */
export function emailConfirmLanding(next: string | null | undefined): string {
  const target = returnPathOr(next);
  return target === DEFAULT_RETURN_PATH ? authPath(DEFAULT_RETURN_PATH) : target;
}
