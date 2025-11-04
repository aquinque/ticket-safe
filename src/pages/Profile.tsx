import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "@/hooks/use-toast";
import { 
  User as UserIcon, 
  Ticket, 
  ShoppingBag, 
  History, 
  Settings, 
  Calendar,
  MapPin,
  Euro,
  CheckCircle2,
  Clock,
  XCircle,
  Shield,
  Bell,
  Moon,
  Sun,
  Languages,
  LogOut,
  Save
} from "lucide-react";

const Profile = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    campus: "",
    memberSince: "",
    totalPurchases: 0,
    totalSales: 0,
    totalSaved: 0,
  });
  const [purchases, setPurchases] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  
  // Settings state
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notifications, setNotifications] = useState(() => {
    const stored = localStorage.getItem('notifications');
    return stored ? JSON.parse(stored) : true;
  });

  // Redirect to auth if not logged in (only after auth is loaded)
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Initialize settings state when user is available
  useEffect(() => {
    if (user) {
      setProfileName(user.user_metadata?.full_name || '');
      setProfileEmail(user.email || '');
    }
  }, [user]);

  // Fetch user data when user is available
  useEffect(() => {
    // Don't fetch if still loading auth or no user
    if (authLoading || !user) {
      return;
    }

    let mounted = true;

    const fetchUserData = async () => {
      try {
        setLoading(true);

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        // Allow PGRST116 (no rows) error - profile might not exist yet
        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error fetching profile:', profileError);
        }

        if (!profile) {
          // Profile doesn't exist yet - set default values from user metadata
          if (mounted) {
            setUserData({
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || "User",
              email: user.email || "",
              campus: user.user_metadata?.university || "",
              memberSince: new Date().toISOString(),
              totalPurchases: 0,
              totalSales: 0,
              totalSaved: 0,
            });
            setPurchases([]);
            setSales([]);
            setLoading(false);
          }
          return;
        }

        // Fetch purchases (transactions where user is buyer)
        const { data: purchaseData, error: purchaseError } = await supabase
          .from('transactions')
          .select(`
            *,
            ticket:tickets(
              event:events(title, university, date)
            )
          `)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (purchaseError) {
          console.error('Error fetching purchases:', purchaseError);
        }

        // Fetch sales (tickets sold by user)
        const { data: saleData, error: saleError } = await supabase
          .from('tickets')
          .select(`
            *,
            event:events(title, university, date),
            transactions(*)
          `)
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false });

        if (saleError) {
          console.error('Error fetching sales:', saleError);
        }

        if (mounted) {
          setUserData({
            name: profile.full_name || user.email?.split('@')[0] || "User",
            email: profile.email || user.email || "",
            campus: profile.university || "",
            memberSince: profile.created_at || new Date().toISOString(),
            totalPurchases: purchaseData?.length || 0,
            totalSales: saleData?.filter(s => s.status === 'sold').length || 0,
            totalSaved: 0,
          });

          setPurchases(purchaseData?.map(p => ({
            id: p.id,
            eventTitle: p.ticket?.event?.title || "Unknown Event",
            date: p.ticket?.event?.date || p.created_at,
            price: p.amount,
            quantity: p.quantity,
            status: p.status === 'completed' ? 'confirmed' : p.status,
            campus: p.ticket?.event?.university || "Unknown"
          })) || []);

          setSales(saleData?.map(s => ({
            id: s.id,
            eventTitle: s.event?.title || "Unknown Event",
            date: s.event?.date || s.created_at,
            originalPrice: s.original_price,
            salePrice: s.selling_price,
            quantity: s.quantity,
            status: s.status,
            campus: s.event?.university || "Unknown"
          })) || []);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchUserData();

    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  // Settings handlers
  const handleSaveProfile = async () => {
    try {
      if (profileName !== user?.user_metadata?.full_name) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: { full_name: profileName }
        });
        if (metaError) throw metaError;
      }

      if (profileEmail !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: profileEmail
        });
        if (emailError) throw emailError;
      }

      if (newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (passwordError) throw passwordError;
        setNewPassword('');
      }

      toast({
        title: t('toast.profileUpdated'),
        description: t('toast.profileUpdateSuccess'),
      });
      
      // Refresh user data
      setUserData({ ...userData, name: profileName, email: profileEmail });
    } catch (error: any) {
      toast({
        title: t('toast.error'),
        description: error.message || t('toast.profileUpdateFailed'),
        variant: "destructive",
      });
    }
  };

  const handleNotificationToggle = (checked: boolean) => {
    setNotifications(checked);
    localStorage.setItem('notifications', JSON.stringify(checked));
    toast({
      title: t('toast.settingsSaved'),
      description: checked ? t('toast.notificationsEnabled') : t('toast.notificationsDisabled'),
    });
  };

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    toggleTheme();
    toast({
      title: t('toast.themeChanged'),
      description: newTheme === 'dark' ? t('toast.switchedToDark') : t('toast.switchedToLight'),
    });
  };

  const handleLanguageChange = (lang: 'en' | 'fr') => {
    setLanguage(lang);
    const langName = lang === 'en' ? t('settings.languageEnglish') : t('settings.languageFrench');
    toast({
      title: t('toast.languageUpdated'),
      description: t('toast.languageChanged', { language: langName }),
    });
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
    toast({
      title: t('toast.loggedOut'),
      description: t('toast.loggedOutSuccess'),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
      case "sold":
        return <Badge variant="secondary" className="bg-accent/10 text-accent">Confirmé</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-primary">En attente</Badge>;
      case "active":
        return <Badge variant="default">En vente</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Annulé</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
      case "sold":
        return <CheckCircle2 className="w-4 h-4 text-accent" />;
      case "pending":
      case "active":
        return <Clock className="w-4 h-4 text-primary" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Show loading state while auth is loading
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading your profile...</p>
          </div>
        </main>
      </div>
    );
  }

  // Don't render if no user (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-6">
            <BackButton />
          </div>
          {/* Profile Header */}
          <div className="mb-8">
            <Card className="bg-gradient-card">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src="/placeholder-avatar.jpg" />
                    <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                      {userData.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="text-center md:text-left flex-1">
                    <h1 className="text-3xl font-bold mb-2">{userData.name}</h1>
                    <p className="text-muted-foreground mb-4">{userData.email}</p>
                    <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                      <Badge variant="secondary">{userData.campus}</Badge>
                      <Badge variant="outline">
                        Membre depuis {new Date(userData.memberSince).toLocaleDateString('fr-FR')}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => navigate("/privacy")}>
                      <Shield className="w-4 h-4" />
                      Privacy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <ShoppingBag className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">{userData.totalPurchases}</h3>
                <p className="text-sm text-muted-foreground">Achats réalisés</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Ticket className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold">{userData.totalSales}</h3>
                <p className="text-sm text-muted-foreground">Ventes réalisées</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Euro className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-2xl font-bold">{userData.totalSaved}€</h3>
                <p className="text-sm text-muted-foreground">Économisés</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-hero rounded-xl flex items-center justify-center mx-auto mb-3">
                  <History className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{purchases.length + sales.length}</h3>
                <p className="text-sm text-muted-foreground">Transactions totales</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="purchases">Mes achats</TabsTrigger>
              <TabsTrigger value="sales">Mes ventes</TabsTrigger>
              <TabsTrigger 
                value="settings" 
                className="bg-gradient-hero text-white shadow-glow hover:shadow-glow data-[state=active]:bg-gradient-hero data-[state=active]:text-white data-[state=active]:shadow-glow"
              >
                <Settings className="w-4 h-4 mr-2" />
                Paramètres
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Purchases */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5" />
                      Achats récents
                    </CardTitle>
                  </CardHeader>
                   <CardContent className="space-y-4">
                     {purchases.length === 0 ? (
                       <p className="text-sm text-muted-foreground text-center py-4">You don't have any transactions yet</p>
                     ) : (
                       purchases.slice(0, 3).map((purchase) => (
                      <div key={purchase.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="space-y-1">
                          <h4 className="font-medium text-sm">{purchase.eventTitle}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.date).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{purchase.price}€</div>
                          {getStatusBadge(purchase.status)}
                         </div>
                       </div>
                     )))}
                   </CardContent>
                 </Card>

                {/* Recent Sales */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Ticket className="w-5 h-5" />
                      Ventes récentes
                    </CardTitle>
                  </CardHeader>
                   <CardContent className="space-y-4">
                     {sales.length === 0 ? (
                       <p className="text-sm text-muted-foreground text-center py-4">You don't have any transactions yet</p>
                     ) : (
                       sales.map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="space-y-1">
                          <h4 className="font-medium text-sm">{sale.eventTitle}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(sale.date).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{sale.salePrice}€</div>
                          {getStatusBadge(sale.status)}
                         </div>
                       </div>
                     )))}
                   </CardContent>
                 </Card>
               </div>
             </TabsContent>

            <TabsContent value="purchases" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Historique des achats</CardTitle>
                  <CardDescription>
                    Tous tes tickets achetés sur Ticket Safe
                  </CardDescription>
                </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     {purchases.length === 0 ? (
                       <p className="text-center text-muted-foreground py-8">You don't have any transactions yet</p>
                     ) : (
                       purchases.map((purchase) => (
                      <div key={purchase.id} className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                        {getStatusIcon(purchase.status)}
                        
                        <div className="flex-1 space-y-1">
                          <h3 className="font-medium">{purchase.eventTitle}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(purchase.date).toLocaleDateString('fr-FR')}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {purchase.campus}
                            </div>
                            <span>Quantité: {purchase.quantity}</span>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="font-semibold text-lg">{purchase.price}€</div>
                          {getStatusBadge(purchase.status)}
                         </div>
                       </div>
                     )))}
                   </div>
                 </CardContent>
               </Card>
             </TabsContent>

            <TabsContent value="sales" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Historique des ventes</CardTitle>
                  <CardDescription>
                    Tous tes tickets mis en vente sur Ticket Safe
                  </CardDescription>
                </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     {sales.length === 0 ? (
                       <p className="text-center text-muted-foreground py-8">You don't have any transactions yet</p>
                     ) : (
                       sales.map((sale) => (
                      <div key={sale.id} className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                        {getStatusIcon(sale.status)}
                        
                        <div className="flex-1 space-y-1">
                          <h3 className="font-medium">{sale.eventTitle}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(sale.date).toLocaleDateString('fr-FR')}
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {sale.campus}
                            </div>
                            <span>Quantité: {sale.quantity}</span>
                          </div>
                        </div>
                        
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground line-through">
                              {sale.originalPrice}€
                            </span>
                            <span className="font-semibold text-lg text-accent">
                              {sale.salePrice}€
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            +{(((sale.salePrice - sale.originalPrice) / sale.originalPrice) * 100).toFixed(1)}%
                          </div>
                          {getStatusBadge(sale.status)}
                         </div>
                       </div>
                     )))}
                   </div>
                 </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserIcon className="w-5 h-5" />
                    {t('settings.profileTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('settings.profileDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('settings.fullName')}</Label>
                    <Input
                      id="name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder={t('settings.fullNamePlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t('settings.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder={t('settings.emailPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('settings.newPassword')}</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('settings.newPasswordPlaceholder')}
                    />
                  </div>

                  <Button onClick={handleSaveProfile} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    {t('settings.saveChanges')}
                  </Button>
                </CardContent>
              </Card>

              <Separator />

              {/* Notifications */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Bell className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{t('settings.notificationsTitle')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.notificationsDescription')}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={notifications}
                      onCheckedChange={handleNotificationToggle}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dark Mode */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        {theme === 'light' ? (
                          <Sun className="h-5 w-5 text-primary" />
                        ) : (
                          <Moon className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium">{t('settings.darkModeTitle')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.darkModeDescription')}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={theme === 'dark'}
                      onCheckedChange={handleThemeToggle}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Language */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Languages className="w-5 h-5" />
                    {t('settings.languageTitle')}
                  </CardTitle>
                  <CardDescription>
                    {t('settings.languageDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t('settings.languageEnglish')}</SelectItem>
                      <SelectItem value="fr">{t('settings.languageFrench')}</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Separator />

              {/* Logout */}
              <Card>
                <CardContent className="p-6">
                  <Button
                    onClick={handleLogout}
                    variant="destructive"
                    className="w-full"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t('settings.logoutTitle')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
         </div>
       </main>
       <Footer />
     </div>
   );
 };

export default Profile;