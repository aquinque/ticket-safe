import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Globe } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Public header for the "night" theme (Home, /tickets, /resale, event
 * pages — Phase 3/4). NOT wired into any page yet: this component is meant
 * to render inside a `.theme-night`-wrapped layout, so it can lean on the
 * theme-relative tokens (bg-card, border-border, text-foreground) rather
 * than hardcoding dark colors — it'll pick up the right values once a
 * later phase actually wraps a page in `.theme-night`.
 *
 * Distinct from the existing `Header.tsx` on purpose: that one carries a
 * lot of signed-in-user chrome (My Tickets / My Wallet / admin dropdown)
 * built for the current light site and used across many pages already —
 * rebuilding it in place would risk breaking those. This is a fresh,
 * logged-out-first component for the redesigned public surface.
 */
const NAV_LINKS = [
  { to: "/tickets", labelKey: "nav.events" as const },
  { to: "/resale", labelKey: "nav.resale" as const },
  { to: "/organizers", labelKey: "nav.organizers" as const },
];

const HeaderNight = () => {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Full-screen mobile menu locks background scroll while open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-colors duration-200 ${
          isScrolled ? "bg-card/80 backdrop-blur-xl border-b border-border" : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="container mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0 flex items-center hover:opacity-90 transition-opacity">
            <Logo height={30} variant="light" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-colors ${
                  isActive(link.to) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "fr" : "en")}
              className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5" />
              {language.toUpperCase()}
            </button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth" className="text-foreground">
                {t("nav.login")}
              </Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link to="/auth?mode=signup">{t("nav.signUp")}</Link>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md text-foreground hover:bg-secondary transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Full-screen mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col md:hidden">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Logo height={30} variant="light" />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center justify-center w-11 h-11 rounded-md text-foreground hover:bg-secondary transition-colors"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="flex-1 flex flex-col justify-center gap-2 px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="font-display text-3xl font-bold text-foreground py-3"
                style={{ letterSpacing: "-0.02em" }}
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="p-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "fr" : "en")}
              className="inline-flex items-center justify-center gap-1.5 h-11 rounded-md text-sm font-bold text-muted-foreground border border-border"
            >
              <Globe className="w-4 h-4" />
              {language === "en" ? "English" : "Français"}
            </button>
            <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
              <Link to="/auth">{t("nav.login")}</Link>
            </Button>
            <Button variant="primary" size="lg" asChild onClick={() => setMenuOpen(false)}>
              <Link to="/auth?mode=signup">{t("nav.signUp")}</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderNight;
