import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Globe, User, Ticket, Banknote, LayoutDashboard, Megaphone, LogOut, ArrowRight, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";
import WalletBalanceButton from "@/components/WalletBalanceButton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useIsPromoter } from "@/hooks/useIsPromoter";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { authPath, currentReturnPath } from "@/lib/returnTo";
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

/** The mobile menu's items rise in one after the other, 40 ms apart (see .menu-rise in index.css). */
const rise = (i: number): React.CSSProperties => ({ animationDelay: `${i * 40}ms` });

const HeaderNight = () => {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organizer } = useOrganizer();
  const isStudioOrganizer = !!user && organizer?.status === "approved";
  const isPromoter = useIsPromoter();
  const isAdmin = useIsAdmin();
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

  // Escape closes the menu, like any dialog.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;

  // Once an account already has Studio access, the "Organizers" tab should
  // drop them straight into their dashboard instead of the public pitch
  // page (apply CTA + "How it works") meant for people who don't have
  // access yet.
  const navLinks = NAV_LINKS.map((link) =>
    link.key === "organizers" && isStudioOrganizer ? { ...link, to: "/studio" } : link,
  );

  const exploreLinks = navLinks.filter((link) => link.key !== "organizers");
  const close = () => setMenuOpen(false);
  // Promoters open their space; anyone else signed in lands on its empty state, which explains the invitations;
  // signed out, the sign-in page brings them back there.
  const promoterHref = user ? "/promoter" : authPath("/promoter");
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
            {isAdmin && (
              <Link
                to="/admin/events"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-bold bg-brand-200/15 text-brand-200 border border-brand-200/40 hover:bg-brand-200/25 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Admin
              </Link>
            )}
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
                      TicketSafe Studio
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
                  <Link to={authPath(currentReturnPath(location))} className="text-foreground">
                    {t("nav.login")}
                  </Link>
                </Button>
                <Button variant="primary" size="sm" asChild>
                  <Link to={authPath(currentReturnPath(location), { signup: true })}>{t("nav.signUp")}</Link>
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

      {/* Full-screen mobile menu: the two main doors in large type, the Studio card, and the account and language
          at the bottom. Items rise in one after the other (none of it with reduced motion). */}
      {menuOpen && (
        <div
          data-mobile-menu
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 bg-background flex flex-col md:hidden pt-[env(safe-area-inset-top)]"
        >
          <div className="px-4 h-16 flex items-center justify-between shrink-0">
            <Link to="/" onClick={close} aria-label="TicketSafe home" className="flex items-center min-h-[44px]">
              <Logo height={28} variant="light" />
            </Link>
            <button
              type="button"
              onClick={close}
              className="-mr-2.5 inline-flex items-center justify-center w-11 h-11 text-foreground hover:text-muted-foreground transition-colors"
              aria-label="Close menu"
            >
              <X className="w-6 h-6" strokeWidth={1.5} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6" aria-label="Main">
            <ul className="flex flex-col gap-1">
              {exploreLinks.map((link, i) => {
                const active = isActive(link.to);
                return (
                  <li key={link.key} className="menu-rise" style={rise(i)}>
                    <Link
                      to={link.to}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center justify-between gap-4 min-h-[64px] font-display text-[38px] font-bold leading-none tracking-[-0.02em] transition-colors ${
                        active ? "text-brand-200" : "text-foreground hover:text-brand-200"
                      }`}
                    >
                      {t(link.labelKey)}
                      <ArrowRight
                        className={`w-6 h-6 shrink-0 transition-transform group-hover:translate-x-1 ${active ? "text-brand-200" : "text-muted-foreground"}`}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
              {organizersLink && (
                <li className="menu-rise mt-1" style={rise(exploreLinks.length)}>
                  <Link
                    to={organizersLink.to}
                    onClick={close}
                    aria-current={isActive(organizersLink.to) ? "page" : undefined}
                    className="group relative block overflow-hidden border border-brand-200/25 bg-background bg-[radial-gradient(130%_100%_at_100%_0%,hsl(var(--brand-500)/0.28),transparent_62%)] p-6 transition-[transform,opacity] duration-150 active:scale-[0.98] active:opacity-90"
                  >
                    <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">For organizers</span>
                    <span className="mt-3 block font-display text-[28px] font-bold leading-[1.05] tracking-[-0.02em] text-foreground">Sell your event</span>
                    <span className="mt-6 flex items-end justify-between gap-4">
                      <span className="inline-flex items-center h-7 px-3 rounded-full border border-border text-[12px] font-semibold text-muted-foreground">0% commission</span>
                      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-brand-200/40 text-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                        <ArrowRight className="w-5 h-5" strokeWidth={1.5} />
                      </span>
                    </span>
                  </Link>
                </li>
              )}
              <li className="menu-rise mt-3" style={rise(exploreLinks.length + 1)}>
                <Link
                  to={promoterHref}
                  onClick={close}
                  aria-current={isActive("/promoter") ? "page" : undefined}
                  className="group block border border-brand-200/25 bg-background px-6 py-5 transition-[transform,opacity] duration-150 active:scale-[0.98] active:opacity-90"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">For promoters</span>
                  <span className="mt-2.5 block font-display text-[23px] font-bold leading-[1.05] tracking-[-0.02em] text-foreground">Promote &amp; earn</span>
                  <span className="mt-4 flex items-end justify-between gap-4">
                    <span className="inline-flex items-center h-7 px-3 rounded-full border border-border text-[12px] font-semibold text-muted-foreground">Track your link &amp; sales</span>
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-brand-200/40 text-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                      <ArrowRight className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    </span>
                  </span>
                </Link>
              </li>
            </ul>

          </nav>

          <div className="menu-rise shrink-0 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={rise(exploreLinks.length + 2)}>
            {user ? (
              <div className="flex flex-col">
                {[
                  ...(isAdmin ? [{ to: "/admin/events", label: "Admin · All events", icon: ShieldCheck }] : []),
                  { to: "/my-tickets", label: "My tickets", icon: Ticket },
                  { to: "/settings/listings", label: "My wallet", icon: Banknote },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={close}
                    aria-current={isActive(item.to) ? "page" : undefined}
                    className={`flex items-center gap-3 min-h-[44px] text-[15px] font-semibold transition-colors ${
                      isActive(item.to) ? "text-brand-200" : "text-foreground hover:text-brand-200"
                    }`}
                  >
                    <item.icon className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" asChild onClick={close}>
                  <Link to={authPath(currentReturnPath(location), { signup: true })}>Sign up</Link>
                </Button>
                <Button variant="outline" asChild onClick={close}>
                  <Link to={authPath(currentReturnPath(location))}>Log in</Link>
                </Button>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-3">
              <div role="group" aria-label="Language" className="-ml-2 flex items-center">
                {LANGUAGES.map((l, i) => (
                  <span key={l.code} className="flex items-center">
                    {i > 0 && <span className="text-[11px] text-muted-foreground" aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={() => setLanguage(l.code)}
                      aria-pressed={language === l.code}
                      aria-label={l.label}
                      className={`min-w-[44px] min-h-[44px] px-2 text-[12px] font-semibold tracking-wide transition-colors ${
                        language === l.code
                          ? "text-foreground underline underline-offset-[5px]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l.code.toUpperCase()}
                    </button>
                  </span>
                ))}
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    handleSignOut();
                  }}
                  className="-mr-2 min-h-[44px] px-2 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderNight;
