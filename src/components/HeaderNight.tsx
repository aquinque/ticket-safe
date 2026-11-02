import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Globe, User, Ticket, Banknote, LayoutDashboard, Megaphone, LogOut, LogIn, UserPlus, CalendarDays, Repeat2, ChevronRight, type LucideIcon } from "lucide-react";
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

/** A labelled group of the mobile menu; groups are separated by a thin rule. */
const MenuSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="border-b border-border py-3 last:border-b-0">
    <p className="px-4 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
    <ul>{children}</ul>
  </section>
);

/** One entry of the mobile menu: thin icon, title, quiet subtitle, chevron. The page you are on gets the only accent. */
const MenuRow = ({
  to,
  icon: Icon,
  title,
  subtitle,
  active,
  onSelect,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  active: boolean;
  onSelect: () => void;
}) => (
  <li>
    <Link
      to={to}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3.5 min-h-[56px] pl-4 pr-3 py-2 border-l-2 transition-colors hover:bg-accent ${
        active ? "border-brand-200 bg-accent" : "border-transparent"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold leading-tight text-foreground">{title}</span>
        {subtitle && <span className="block text-[13px] leading-snug mt-0.5 text-muted-foreground truncate">{subtitle}</span>}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
    </Link>
  </li>
);

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

  // Mobile menu: every entry is the same kind of row (see MenuRow); sections in this order:
  // Explore, For promoters, For organizers, Account.
  const mobileNavMeta: Record<string, { icon: typeof CalendarDays; subtitle: string }> = {
    tickets: { icon: CalendarDays, subtitle: "Browse upcoming events" },
    resale: { icon: Repeat2, subtitle: "Buy or resell a ticket" },
  };
  const exploreLinks = navLinks.filter((link) => link.key !== "organizers");
  const close = () => setMenuOpen(false);
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

      {/* Full-screen mobile menu: one list, one row style, one accent (the page you are on). */}
      {menuOpen && (
        <div
          data-mobile-menu
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 bg-background flex flex-col md:hidden pt-[env(safe-area-inset-top)]"
        >
          <div className="px-4 h-16 flex items-center justify-between border-b border-border shrink-0">
            <Link to="/" onClick={close} aria-label="TicketSafe home" className="flex items-center min-h-[44px]">
              <Logo height={28} variant="light" />
            </Link>
            <button
              type="button"
              onClick={close}
              className="-mr-2 inline-flex items-center justify-center w-11 h-11 text-foreground hover:bg-accent transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain" aria-label="Main">
            <MenuSection label="Explore">
              {exploreLinks.map((link) => {
                const meta = mobileNavMeta[link.key];
                return (
                  <MenuRow
                    key={link.key}
                    to={link.to}
                    icon={meta?.icon ?? CalendarDays}
                    title={t(link.labelKey)}
                    subtitle={meta?.subtitle}
                    active={isActive(link.to)}
                    onSelect={close}
                  />
                );
              })}
            </MenuSection>

            {isPromoter && (
              <MenuSection label="For promoters">
                <MenuRow to="/promoter" icon={Megaphone} title="Promoter space" subtitle="Your link and your sales" active={isActive("/promoter")} onSelect={close} />
              </MenuSection>
            )}

            {organizersLink && (
              <MenuSection label="For organizers">
                <MenuRow
                  to={organizersLink.to}
                  icon={LayoutDashboard}
                  title="TicketSafe Studio"
                  subtitle={isStudioOrganizer ? "Sales, guests, scanning" : "Sell your tickets with 0% commission"}
                  active={isActive(organizersLink.to)}
                  onSelect={close}
                />
              </MenuSection>
            )}

            <MenuSection label="Account">
              {user ? (
                <>
                  <MenuRow to="/my-tickets" icon={Ticket} title="My Tickets" subtitle="Your tickets and QR codes" active={isActive("/my-tickets")} onSelect={close} />
                  <MenuRow to="/settings/listings" icon={Banknote} title="My Wallet" subtitle="Your resales and payouts" active={isActive("/settings/listings")} onSelect={close} />
                </>
              ) : (
                <>
                  <MenuRow to="/auth" icon={LogIn} title={t("nav.login")} subtitle="Find your tickets and resales" active={false} onSelect={close} />
                  <MenuRow to="/auth?mode=signup" icon={UserPlus} title={t("nav.signUp")} subtitle="Buy, resell and keep your tickets" active={false} onSelect={close} />
                </>
              )}
            </MenuSection>
          </nav>

          <div className="shrink-0 border-t border-border px-4 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
            <div role="group" aria-label="Language" className="flex items-center">
              <Globe className="w-4 h-4 mr-1 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              {LANGUAGES.map((l, i) => (
                <span key={l.code} className="flex items-center">
                  {i > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    aria-pressed={language === l.code}
                    aria-label={l.label}
                    className={`min-w-[44px] min-h-[44px] px-2 text-[13px] font-semibold tracking-wide transition-colors ${
                      language === l.code
                        ? "text-foreground underline underline-offset-[6px] decoration-2"
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
                className="inline-flex items-center gap-2 min-h-[44px] px-2 -mr-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {t("nav.signOut")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderNight;
