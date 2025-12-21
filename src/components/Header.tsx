import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Ticket, User, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
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

  return (
    <header className={`sticky top-0 z-50 w-full border-b border-border transition-all duration-300 ${
      isScrolled ? 'bg-background/80 backdrop-blur-xl shadow-lg' : 'bg-background/95 backdrop-blur-lg shadow-soft'
    }`}>
      <div className="container mx-auto px-4">
        <div className="flex h-16 md:h-20 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-gradient-hero rounded-lg flex items-center justify-center">
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <span className="bg-gradient-hero bg-clip-text text-transparent">{t('common.appName')}</span>
          </Link>

          {/* Desktop Navigation - Reorganized */}
          <nav className="hidden md:flex items-center flex-1 justify-between ml-8">
            {/* PRIMARY CTAs - Left/Center (where eye lands first) */}
            <div className="flex items-center gap-3">
              {/* Marketplace Dropdown - Primary CTA */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="marketplace"
                    size="sm"
                    className={`font-semibold gap-1 ${
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
                size="sm"
                className="font-semibold"
                asChild
              >
                <Link to="/sell">{t('nav.sellTickets')}</Link>
              </Button>
            </div>

            {/* SECONDARY NAVIGATION - Right side (informational) */}
            <div className="flex items-center gap-4">
              <Link
                to="/about"
                className={`text-xs transition-colors hover:text-muted-foreground/80 ${
                  isActive("/about") ? "text-muted-foreground" : "text-muted-foreground/60"
                }`}
              >
                {t('nav.about')}
              </Link>
              <Link
                to="/contact"
                className={`text-xs transition-colors hover:text-muted-foreground/80 ${
                  isActive("/contact") ? "text-muted-foreground" : "text-muted-foreground/60"
                }`}
              >
                {t('nav.contact')}
              </Link>
            </div>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="hero" size="sm" className="shadow-glow hover:shadow-glow">
                    <User className="w-4 h-4 mr-2" />
                    {userName ? `${t('nav.welcome')}, ${userName.split(' ')[0]}!` : t('nav.myAccount')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    {t('nav.profile')}
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
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth" className="text-muted-foreground hover:text-primary">
                    {t('nav.login')}
                  </Link>
                </Button>
                <Button variant="hero" size="sm" className="shadow-glow hover:shadow-glow" asChild>
                  <Link to="/auth">
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
            <nav className="flex flex-col gap-3 p-4">
              {/* PRIMARY CTAs - Marketplace & Sell Ticket */}
              <div className="flex flex-col gap-2 mb-2 pb-3 border-b border-border">
                <Button
                  variant="marketplace"
                  size="sm"
                  className="w-full py-3 font-semibold"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/events">{t('nav.marketplace')}</Link>
                </Button>
                <Button
                  variant="marketplace"
                  size="sm"
                  className="w-full py-3 font-semibold"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/sell">{t('nav.sellTickets')}</Link>
                </Button>
              </div>

              {/* SECONDARY navigation - About & Contact */}
              <div className="flex flex-col gap-1 mb-2 pb-3 border-b border-border">
                <Link
                  to="/about"
                  className={`px-3 py-2 rounded-md text-xs transition-colors hover:bg-muted ${
                    isActive("/about") ? "text-muted-foreground" : "text-muted-foreground/60"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('nav.about')}
                </Link>
                <Link
                  to="/contact"
                  className={`px-3 py-2 rounded-md text-xs transition-colors hover:bg-muted ${
                    isActive("/contact") ? "text-muted-foreground" : "text-muted-foreground/60"
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('nav.contact')}
                </Link>
              </div>

              {/* User account section */}
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
                {user ? (
                  <>
                    <Button variant="outline" size="sm" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/profile">
                        <User className="w-4 w-4 mr-2" />
                        {t('nav.myAccount')}
                      </Link>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
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
                    <Button variant="outline" size="sm" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/auth">{t('nav.login')}</Link>
                    </Button>
                    <Button variant="hero" size="sm" asChild onClick={() => setIsMenuOpen(false)}>
                      <Link to="/auth">{t('nav.signUp')}</Link>
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
