/**
 * Canonical site URL used for auth redirects.
 *
 * Order of precedence:
 *   1. VITE_SITE_URL env var (set per-environment)
 *   2. window.location.origin (browser fallback)
 *   3. Production fallback so emails sent from local dev still land
 *      somewhere usable instead of http://localhost:5173.
 *
 * Use this for any `redirectTo` / `emailRedirectTo` passed to Supabase auth.
 */

const PROD_FALLBACK = "https://ticket-safe.eu";

export const SITE_URL: string = (() => {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return origin.replace(/\/+$/, "");
    }
  }

  return PROD_FALLBACK;
})();

export const authRedirect = (path: string): string => {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
};
