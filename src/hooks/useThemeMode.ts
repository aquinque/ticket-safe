import { useEffect } from "react";

/**
 * Applies a `.theme-night` / `.theme-studio` class to `document.body` for as
 * long as the calling page is mounted, then removes it on unmount.
 *
 * Why body and not just a wrapper div around the page's own JSX: several
 * pieces of UI are rendered globally in App.tsx, outside any single page's
 * markup — CookieConsent, the Toaster/Sonner toasts, ChatBubble. A theme
 * class scoped to a div inside one page's return value never reaches those
 * (found this the hard way: the cookie bar rendered light-themed floating
 * over the dark Home hero in Phase 3). Body-level toggling makes the theme
 * apply consistently to everything on screen while a themed page is active.
 */
export function useThemeMode(mode: "night" | "studio") {
  useEffect(() => {
    const cls = `theme-${mode}`;
    document.body.classList.add(cls);
    return () => {
      document.body.classList.remove(cls);
    };
  }, [mode]);
}
