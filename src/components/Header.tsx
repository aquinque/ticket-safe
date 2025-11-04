import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Ticket, User, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPanel } from "@/components/SettingsPanel";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const navItems = [
    { path: "/", label: t('nav.home') },
    { path: "/events", label: t('nav.marketplace') },
    { path: "/sell", label: t('nav.sellTickets') },
    { path: "/campus-life", label: t('nav.campusLife') },
    { path: "/about", label: t('nav.about') },
    { path: "/contact", label: t('nav.contact') },
  ];

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

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              if (item.path === "/sell") {
                return (
                  <Button
                    key={item.path}
                    variant="marketplace"
                    size="sm"
                    className="px-4 py-2.5"
                    asChild
                  >
                    <Link to={item.path}>{item.label}</Link>
                  </Button>
                );
              }
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    isActive(item.path) ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="hover:bg-muted"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {t('nav.settings')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="hero" size="sm" className="shadow-glow hover:shadow-glow">
                      <User className="w-4 h-4 mr-2" />
                      {userName ? `${t('nav.myAccount').split(' ')[0]}, ${userName.split(' ')[0]}!` : t('nav.myAccount')}
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
              </>
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
            <nav className="flex flex-col gap-2 p-4">
              {navItems.map((item) => {
                if (item.path === "/sell") {
                  return (
                    <Button
                      key={item.path}
                      variant="marketplace"
                      size="sm"
                      className="w-full py-3"
                      asChild
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Link to={item.path}>{item.label}</Link>
                    </Button>
                  );
                }
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-muted ${
                      isActive(item.path) ? "text-primary bg-primary/10" : "text-muted-foreground"
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
                {user ? (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSettingsOpen(true);
                        setIsMenuOpen(false);
                      }}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      {t('nav.settings')}
                    </Button>
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

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
};

export default Header;
