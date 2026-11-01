import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Globe, User, Ticket, Banknote, LayoutDashboard, Megaphone, LogOut, CalendarDays, Repeat2, ChevronRight, ArrowRight } from "lucide-react";
import Logo from "@/components/Logo";
import WalletBalanceButton from "@/components/WalletBalanceButton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useIsPromoter } from "@/hooks/useIsPromoter";
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
  const isPromoter = useIsPromoter();
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

  // Mobile menu: Events and Resale are the two main doors, so they get big
  // tiles at the top. Organizers / Studio is a different audience: it sits
  // lower, in its own card.
  const mobileNavMeta: Record<string, { icon: typeof CalendarDays; subtitle: string }> = {
    tickets: { icon: CalendarDays, subtitle: "Browse upcoming events" },
    resale: { icon: Repeat2, subtitle: "Buy or resell a ticket safely" },
  };
  const exploreLinks = navLinks.filter((link) => link.key !== "organizers");
  const organizersLink = navLinks.find((link) => link.key === "organizers");

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
                  {isPromoter && (
                    <DropdownMenuItem onClick={() => navigate("/promoter")}>
                      <Megaphone className="w-4 h-4 mr-2" />
                      Promoter space
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

          <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col">
            <p className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Explore</p>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {exploreLinks.map((link) => {
                const meta = mobileNavMeta[link.key];
                const Icon = meta?.icon ?? CalendarDays;
                const active = isActive(link.to);
                const solid = link.key === "tickets";
                return (
                  <Link
                    key={link.key}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3.5 rounded-xl border px-3.5 min-h-[68px] transition-colors ${
                      solid
                        ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                        : "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
                    } ${active ? "ring-1 ring-foreground/35" : ""}`}
                  >
                    <span
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        solid ? "bg-white/15" : "bg-primary text-primary-foreground"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[17px] font-semibold leading-tight">{t(link.labelKey)}</span>
                      {meta?.subtitle && (
                        <span className={`block text-[13px] mt-0.5 truncate ${solid ? "text-white/75" : "text-muted-foreground"}`}>
                          {meta.subtitle}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>

            {isPromoter && (
              <div className="mt-7 pt-5 border-t border-border">
                <p className="px-1 mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">For promoters</p>
                <Link
                  to="/promoter"
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive("/promoter") ? "page" : undefined}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/50"
                >
                  <Megaphone className="w-5 h-5 shrink-0 text-primary" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold leading-tight text-foreground">Promoter space</span>
                    <span className="block text-[13px] mt-0.5 leading-snug text-muted-foreground">Your link and your sales.</span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
                </Link>
              </div>
            )}

            {organizersLink && (
              <div className="mt-7 pt-5 border-t border-border">
                <p className="px-1 mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">For organizers</p>
                <Link
                  to={organizersLink.to}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(organizersLink.to) ? "page" : undefined}
                  className="flex items-center gap-3 rounded-xl border border-[hsl(222_100%_84%/0.3)] bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-3.5 py-3 transition-colors hover:border-[hsl(222_100%_84%/0.55)]"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold leading-tight text-foreground">Ticket Safe Studio</span>
                    <span className="block text-[13px] mt-0.5 leading-snug text-muted-foreground">
                      {isStudioOrganizer ? "Sales, guests, scanning." : "Sell with 0% commission."}
                    </span>
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-foreground text-background text-[13px] font-semibold">
                    {isStudioOrganizer ? "Open Studio" : "Request access"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              </div>
            )}
          </nav>

          <div className="px-4 pb-6 pt-3 border-t border-border flex flex-col gap-3">
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
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                    <Link to="/my-tickets">My Tickets</Link>
                  </Button>
                  <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                    <Link to="/settings/listings">My Wallet</Link>
                  </Button>
                </div>
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
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" asChild onClick={() => setMenuOpen(false)}>
                    <Link to="/auth">{t("nav.login")}</Link>
                  </Button>
                  <Button variant="primary" size="lg" asChild onClick={() => setMenuOpen(false)}>
                    <Link to="/auth?mode=signup">{t("nav.signUp")}</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderNight;
