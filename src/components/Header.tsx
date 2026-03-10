import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, User, LogOut, ChevronDown, Settings, MessageSquare } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { unreadCount, markAllRead } = useUnreadMessages();

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
    } else {
      setUserName("");
    }
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const eventsMenuActive = location.pathname === "/events" || location.pathname === "/catalog";

  useEffect(() => {
    if (location.pathname.startsWith("/messages")) {
      markAllRead();
    }
  }, [location.pathname]);

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
            {/* PRIMARY CTAs - Left/Center (where eye lands first) */}
            <div className="flex items-center gap-3">
              {/* Marketplace Dropdown - Primary CTA */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="marketplace"
                    className={`font-semibold gap-1.5 h-10 px-4 ${
                      eventsMenuActive ? "shadow-glow" : ""
                    }`}
                  >
                    {t('nav.marketplace')}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => navigate("/events")}>
                    Available Events
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/catalog")}>
                    Full Catalog
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sell Ticket - Primary CTA */}
              <Button
                variant="marketplace"
                className="font-semibold h-10 px-4"
                asChild
              >
                <Link to="/sell">{t('nav.sellTickets')}</Link>
              </Button>
            </div>

            {/* SECONDARY NAVIGATION - Right side (informational) */}
            <div className="flex items-center gap-5 ml-auto mr-4">
              <Link
                to="/how-it-works"
                className={`text-sm transition-colors hover:text-muted-foreground ${
                  isActive("/how-it-works") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                }`}
              >
                How It Works
              </Link>
              <Link
                to="/about"
                className={`text-sm transition-colors hover:text-muted-foreground ${
                  isActive("/about") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                }`}
              >
                {t('nav.about')}
              </Link>
              <Link
                to="/contact"
                className={`text-sm transition-colors hover:text-muted-foreground ${
                  isActive("/contact") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                }`}
              >
                {t('nav.contact')}
              </Link>
              {user && (
                <Link
                  to="/messages"
                  className={`relative text-sm transition-colors hover:text-muted-foreground ${
                    location.pathname.startsWith("/messages") ? "text-muted-foreground" : "text-muted-foreground/70"
                  }`}
                  onClick={markAllRead}
                >
                  <MessageSquare className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
              )}
              {user && (
                <Link
                  to="/settings"
                  className={`text-sm transition-colors hover:text-muted-foreground ${
                    isActive("/settings") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </Link>
              )}
            </div>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="hero" className="shadow-glow hover:shadow-glow h-10 px-4">
                    <User className="w-4 h-4 mr-2" />
                    {userName ? `${t('nav.welcome')}, ${userName.split(' ')[0]}!` : t('nav.myAccount')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    {t('nav.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings/purchases")}>
                    My Purchases
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings/listings")}>
                    My Listings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('nav.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="h-10 px-4" asChild>
                  <Link to="/auth" className="text-muted-foreground hover:text-primary">
                    {t('nav.login')}
                  </Link>
                </Button>
                <Button variant="hero" className="shadow-glow hover:shadow-glow h-10 px-4" asChild>
                  <Link to="/auth?mode=signup">
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
              {/* PRIMARY CTAs - Marketplace & Sell Ticket */}
              <div className="flex flex-col gap-2.5 mb-2 pb-3 border-b border-border">
                <Button
                  variant="marketplace"
                  className="w-full h-12 font-semibold text-base"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/events">{t('nav.marketplace')}</Link>
                </Button>
                <Button
                  variant="marketplace"
                  className="w-full h-12 font-semibold text-base"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/sell">{t('nav.sellTickets')}</Link>
                </Button>
              </div>

              {/* SECONDARY navigation - About, Contact & Settings */}
              <div className="flex flex-col gap-1.5 mb-2 pb-4 border-b border-border">
                <Link
                  to="/about"
                  className={`px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted ${
                    isActive("/about") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('nav.about')}
                </Link>
                <Link
                  to="/contact"
                  className={`px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted ${
                    isActive("/contact") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('nav.contact')}
                </Link>
                {user && (
                  <Link
                    to="/messages"
                    className={`px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted flex items-center gap-2 ${
                      location.pathname.startsWith("/messages") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                    }`}
                    onClick={() => { setIsMenuOpen(false); markAllRead(); }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Messages
                    {unreadCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Link>
                )}
                {user && (
                  <Link
                    to="/settings"
                    className={`px-3 py-2.5 rounded-md text-sm transition-colors hover:bg-muted flex items-center gap-2 ${
                      isActive("/settings") ? "text-muted-foreground font-medium" : "text-muted-foreground/70"
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4" />
                    {t('nav.settings')}
                  </Link>
                )}
              </div>

              {/* User account section */}
              <div className="flex flex-col gap-2.5 mt-2 pt-4 border-t border-border">
                {user ? (
                  <>
                    <Button variant="outline" className="h-11" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/profile">
                        <User className="w-4 h-4 mr-2" />
                        {t('nav.myAccount')}
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => {
                        handleSignOut();
                        setIsMenuOpen(false);
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('nav.signOut')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="h-11" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/auth">{t('nav.login')}</Link>
                    </Button>
                    <Button variant="hero" className="h-11" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/auth?mode=signup">{t('nav.signUp')}</Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
