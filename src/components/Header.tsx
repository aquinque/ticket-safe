import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, User, LogOut, Settings, MessageSquare, Sparkles, Ticket as TicketIcon, Shield, Banknote } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface HeaderProps {
  /** When true, hides the Marketplace dropdown and Sell Tickets CTA. Used on pages
   *  that are not part of the resale flow (e.g. /tickets primary sales). */
  minimal?: boolean;
}

const Header = ({ minimal = false }: HeaderProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { unreadCount, markAllRead } = useUnreadMessages();
  const { organizer } = useOrganizer();
  const isStudioOrganizer = !!user && organizer?.status === "approved";

  useEffect(() => {
    if (location.pathname.startsWith("/messages")) markAllRead();
  }, [location.pathname]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (user) {
      const metaName = user.user_metadata?.full_name;
      if (metaName) {
        setUserName(metaName);
      } else {
        const fetchUserProfile = async () => {
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .maybeSingle();

            if (data && !error) {
              setUserName(data.full_name);
            }
          } catch (error) {
            console.error('Error fetching profile:', error);
          }
        };
        fetchUserProfile();
      }

      // Admin role check — unlocks the Review queue + Payouts shortcuts in
      // the dropdown so admins don't have to remember the URLs.
      (async () => {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        setIsAdmin(!!data);
      })();
    } else {
      setUserName("");
      setIsAdmin(false);
    }
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    // Hard reload so every part of the app re-initialises with no session —
    // guarantees you're signed out everywhere, not just in this component.
    window.location.href = "/auth";
  };

  return (
    <header className={`sticky top-0 z-50 w-full border-b border-border transition-all duration-300 ${
      isScrolled ? 'bg-background/80 backdrop-blur-xl shadow-lg' : 'bg-background/95 backdrop-blur-lg shadow-soft'
    }`}>
      <div className="container mx-auto px-3 md:px-4">
        <div className="flex h-14 md:h-16 lg:h-20 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center hover:opacity-85 transition-opacity">
            <Logo height={34} />
          </Link>

          {/* Desktop Navigation - Reorganized */}
          <nav className="hidden md:flex items-center flex-1 ml-8">
            {/* Primary CTAs intentionally removed from the header. They live in
                the hero of each landing page so they're not duplicated up here. */}

            {/* RIGHT NAV — the user's own stuff is front and centre. Logged-in:
                My Tickets + My Wallet. Logged-out: just How It Works (for
                conversion). About / Contact live lower — in the account menu
                and the footer — so they don't compete with the user's hub. */}
            <div className="flex items-center gap-5 ml-auto mr-4">
              {user ? (
                <>
                  <Link
                    to="/my-tickets"
                    className={`inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:text-primary ${
                      isActive("/my-tickets") ? "text-primary" : "text-foreground"
                    }`}
                  >
                    <TicketIcon className="w-4 h-4" />
                    My Tickets
                  </Link>
                  <Link
                    to="/settings/listings"
                    className={`inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:text-primary ${
                      isActive("/settings/listings") ? "text-primary" : "text-foreground"
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    My Wallet
                  </Link>
                </>
              ) : (
                !minimal && (
                  <Link
                    to="/how-it-works"
                    className={`text-sm font-semibold transition-colors hover:text-primary ${
                      isActive("/how-it-works") ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    How It Works
                  </Link>
                )
              )}
            </div>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isStudioOrganizer && (
              <Link
                to="/studio"
                className={`inline-flex items-center gap-2 px-4 h-10 rounded-lg font-bold text-sm text-white shadow-md hover:shadow-lg transition-all whitespace-nowrap ${
                  location.pathname.startsWith("/studio") ? "ring-2 ring-offset-2 ring-primary/30" : ""
                }`}
                style={{ background: "linear-gradient(135deg, #003399, #0066cc)" }}
              >
                <Sparkles className="w-4 h-4" />
                Ticket Safe Studio
              </Link>
            )}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="hero" className="shadow-glow hover:shadow-glow h-10 px-4">
                    <User className="w-4 h-4 mr-2" />
                    {userName ? `${t('nav.welcome')}, ${userName.split(' ')[0]}!` : t('nav.myAccount')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {/* My Profile, then My Tickets + My Wallet right beneath it */}
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="font-semibold">
                    <User className="h-4 w-4 mr-2" />
                    {t('nav.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-tickets")} className="font-semibold">
                    <TicketIcon className="h-4 w-4 mr-2" />
                    My Tickets
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings/listings")} className="font-semibold">
                    <Banknote className="h-4 w-4 mr-2" />
                    My Wallet
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings/purchases")}>
                    My Purchases
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="h-4 w-4 mr-2" />
                    {t('nav.settings')}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/admin/review")}>
                        <Shield className="h-4 w-4 mr-2" />
                        Admin · Review tickets
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/admin/payouts")}>
                        <Banknote className="h-4 w-4 mr-2" />
                        Admin · SEPA payouts
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/admin/organizers")}>
                        <User className="h-4 w-4 mr-2" />
                        Admin · Organizers
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/admin/debug")}>
                        <Settings className="h-4 w-4 mr-2" />
                        Admin · System health
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-muted-foreground text-xs" onClick={() => navigate("/how-it-works")}>
                    How It Works
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-muted-foreground text-xs" onClick={() => navigate("/about")}>
                    {t('nav.about')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-muted-foreground text-xs" onClick={() => navigate("/contact")}>
                    {t('nav.contact')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSignOutOpen(true); }}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('nav.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="h-10 px-4 font-semibold" asChild>
                  <Link
                    to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`}
                    className="text-foreground hover:text-primary"
                  >
                    {t('nav.login')}
                  </Link>
                </Button>
                <Button variant="hero" className="shadow-glow hover:shadow-glow h-10 px-4" asChild>
                  <Link to={`/auth?mode=signup&next=${encodeURIComponent(location.pathname + location.search)}`}>
                    {t('nav.signUp')}
                  </Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-md">
            <nav className="flex flex-col gap-2.5 p-4">
              {isStudioOrganizer && (
                <div className="mb-2 pb-3 border-b border-border">
                  <Link
                    to="/studio"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-lg font-bold text-base text-white shadow-md"
                    style={{ background: "linear-gradient(135deg, #003399, #0066cc)" }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Ticket Safe Studio
                  </Link>
                </div>
              )}

              {/* Primary CTAs removed from the mobile menu too — they live in
                  the hero of each landing page, no duplication here. */}

              {/* PROMINENT — the user's own stuff, front and centre on phone */}
              {user && (
                <div className="flex flex-col gap-2 mb-2 pb-4 border-b border-border">
                  <Link
                    to="/my-tickets"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 h-12 rounded-lg font-bold text-base transition-colors ${isActive("/my-tickets") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                  >
                    <TicketIcon className="w-5 h-5" />
                    My Tickets
                  </Link>
                  <Link
                    to="/settings/listings"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 h-12 rounded-lg font-bold text-base transition-colors ${isActive("/settings/listings") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                  >
                    <Banknote className="w-5 h-5" />
                    My Wallet
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 h-12 rounded-lg font-bold text-base transition-colors ${isActive("/profile") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                  >
                    <User className="w-5 h-5" />
                    My Profile
                  </Link>
                  <Link
                    to="/messages"
                    onClick={() => { setIsMenuOpen(false); markAllRead(); }}
                    className={`flex items-center gap-2.5 px-3 h-11 rounded-lg font-semibold text-sm transition-colors ${location.pathname.startsWith("/messages") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Messages
                    {unreadCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 h-11 rounded-lg font-semibold text-sm transition-colors ${isActive("/settings") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                  >
                    <Settings className="w-4 h-4" />
                    {t('nav.settings')}
                  </Link>
                </div>
              )}

              {/* DE-EMPHASIZED — informational pages, lower down */}
              <div className="flex flex-col gap-0.5 mb-2 pb-4 border-b border-border">
                {!minimal && (
                  <Link
                    to="/how-it-works"
                    onClick={() => setIsMenuOpen(false)}
                    className={`px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${isActive("/how-it-works") ? "text-primary" : "text-muted-foreground"}`}
                  >
                    How It Works
                  </Link>
                )}
                <Link
                  to="/about"
                  onClick={() => setIsMenuOpen(false)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${isActive("/about") ? "text-primary" : "text-muted-foreground"}`}
                >
                  {t('nav.about')}
                </Link>
                <Link
                  to="/contact"
                  onClick={() => setIsMenuOpen(false)}
                  className={`px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted ${isActive("/contact") ? "text-primary" : "text-muted-foreground"}`}
                >
                  {t('nav.contact')}
                </Link>
              </div>

              {/* Auth / sign out */}
              <div className="flex flex-col gap-2.5">
                {user ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => {
                        setIsMenuOpen(false);
                        setSignOutOpen(true);
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('nav.signOut')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="h-11" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to={`/auth?next=${encodeURIComponent(location.pathname + location.search)}`}>
                        {t('nav.login')}
                      </Link>
                    </Button>
                    <Button variant="hero" className="h-11" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to={`/auth?mode=signup&next=${encodeURIComponent(location.pathname + location.search)}`}>
                        {t('nav.signUp')}
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('nav.signOut')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'fr'
                ? "Vous devrez vous reconnecter pour acheter, vendre ou voir vos messages."
                : "You'll need to sign in again to buy, sell, or see your messages."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>
              {t('nav.signOut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};

export default Header;
