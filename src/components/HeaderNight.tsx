import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Globe, User, Ticket, Banknote, LayoutDashboard, LogOut } from "lucide-react";
import Logo from "@/components/Logo";
import WalletBalanceButton from "@/components/WalletBalanceButton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Public header for the "night" theme (Home, /tickets, /resale, event
 * pages — Phase 3/4). Meant to render inside a `.theme-night`-wrapped
 * layout, so it leans on theme-relative tokens (bg-card, border-border,
 * text-foreground) rather than hardcoding dark colors.
 *
 * Distinct component from the existing `Header.tsx` on purpose — that one
 * is used across many already-live pages and rebuilding it in place risked
 * breaking those. This one carries its own (lighter) signed-in account
 * menu so pages that adopt it, starting with Home in Phase 3, don't lose
 * quick access to My Tickets / My Wallet / Studio for logged-in users.
 */
const NAV_LINKS = [
  { key: "tickets", to: "/tickets", labelKey: "nav.events" as const },
  { key: "resale", to: "/resale", labelKey: "nav.resale" as const },
  { key: "organizers", to: "/organizers", labelKey: "nav.organizers" as const },
];

const LANGUAGES: { code: "fr" | "en" | "es"; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

const HeaderNight = () => {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organizer } = useOrganizer();
  const isStudioOrganizer = !!user && organizer?.status === "approved";
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const firstName = (() => {
    const fn = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;
    if (fn) return fn.split(" ")[0];
    return user?.email?.split("@")[0] ?? "";
  })();

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

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

  // Once an account already has Studio access, the "Organizers" tab should
  // drop them straight into their dashboard instead of the public pitch
  // page (apply CTA + "How it works") meant for people who don't have
  // access yet.
  const navLinks = NAV_LINKS.map((link) =>
    link.key === "organizers" && isStudioOrganizer ? { ...link, to: "/studio" } : link,
  );

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
            {navLinks.map((link) => (
              <Link
                key={link.key}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Choose language"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {language.toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {LANGUAGES.map((l) => (
                  <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code)} className="font-semibold">
                    {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <WalletBalanceButton />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-2 h-9 px-3 rounded-md font-semibold text-sm text-foreground border border-border hover:bg-secondary transition-colors">
                    <User className="w-4 h-4" />
                    {firstName && <span className="max-w-[8rem] truncate">{firstName}</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User className="w-4 h-4 mr-2" />
                    {t("nav.profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-tickets")}>
                    <Ticket className="w-4 h-4 mr-2" />
                    My Tickets
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings/listings")}>
                    <Banknote className="w-4 h-4 mr-2" />
                    My Wallet
                  </DropdownMenuItem>
                  {isStudioOrganizer && (
                    <DropdownMenuItem onClick={() => navigate("/studio")}>
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Ticket Safe Studio
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings")}>{t("nav.settings")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("nav.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth" className="text-foreground">
                    {t("nav.login")}
                  </Link>
                </Button>
                <Button variant="primary" size="sm" asChild>
                  <Link to="/auth?mode=signup">{t("nav.signUp")}</Link>
                </Button>
              </>
            )}
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
            {navLinks.map((link) => (
              <Link
                key={link.key}
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
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={`flex-1 h-11 rounded-md text-sm font-bold border transition-colors ${
                    language === l.code
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border"
                  }`}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
            {user ? (
              <>
                <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                  <Link to="/my-tickets">My Tickets</Link>
                </Button>
                <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                  <Link to="/settings/listings">My Wallet</Link>
                </Button>
                {isStudioOrganizer && (
                  <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                    <Link to="/studio">Ticket Safe Studio</Link>
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    setMenuOpen(false);
                    handleSignOut();
                  }}
                >
                  {t("nav.signOut")}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                  <Link to="/auth">{t("nav.login")}</Link>
                </Button>
                <Button variant="primary" size="lg" asChild onClick={() => setMenuOpen(false)}>
                  <Link to="/auth?mode=signup">{t("nav.signUp")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderNight;
