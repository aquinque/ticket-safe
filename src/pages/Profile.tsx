import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/contexts/I18nContext";
import {
  Ticket,
  ShoppingBag,
  Calendar,
  MapPin,
  Euro,
  CheckCircle2,
  Clock,
  XCircle,
  Shield,
  History
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
  const [purchases, setPurchases] = useState<Array<Record<string, unknown>>>([]);
  const [sales, setSales] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { language, t } = useI18n();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch user data when user is available
  useEffect(() => {
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

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error fetching profile:', profileError);
        }

        if (!profile) {
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

        // Fetch purchases
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

        // Fetch sales
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="secondary" className="bg-accent/10 text-accent">{t('profile.confirmed')}</Badge>;
      case "sold":
        return <Badge variant="secondary" className="bg-accent/10 text-accent">{t('profile.sold')}</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-primary">{t('profile.pending')}</Badge>;
      case "active":
        return <Badge variant="default">{t('profile.active')}</Badge>;
      case "cancelled":
        return <Badge variant="destructive">{t('profile.cancelled')}</Badge>;
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{t('profile.loadingProfile')}</p>
          </div>
        </main>
      </div>
    );
  }

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
                    <h1 className="text-3xl font-bold mb-2">{t('profile.welcome', { name: userData.name.split(' ')[0] })}</h1>
                    <p className="text-muted-foreground mb-4">{userData.email}</p>
                    <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                      <Badge variant="secondary">{userData.campus}</Badge>
                      <Badge variant="outline">
                        {t('profile.memberSince')} {new Date(userData.memberSince).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                      </Badge>
                    </div>
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
                <p className="text-sm text-muted-foreground">{t('profile.purchasesCompleted')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Ticket className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold">{userData.totalSales}</h3>
                <p className="text-sm text-muted-foreground">{t('profile.salesCompleted')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Euro className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-2xl font-bold">{userData.totalSaved}€</h3>
                <p className="text-sm text-muted-foreground">{t('profile.saved')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-gradient-hero rounded-xl flex items-center justify-center mx-auto mb-3">
                  <History className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{purchases.length + sales.length}</h3>
                <p className="text-sm text-muted-foreground">{t('profile.totalTransactions')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">{t('profile.overview')}</TabsTrigger>
              <TabsTrigger value="purchases">{t('profile.purchases')}</TabsTrigger>
              <TabsTrigger value="sales">{t('profile.sales')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Purchases */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5" />
                      {t('profile.recentPurchases')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {purchases.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('profile.noTransactions')}</p>
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
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Recent Sales */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Ticket className="w-5 h-5" />
                      {t('profile.recentSales')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {sales.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('profile.noTransactions')}</p>
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
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="purchases" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('profile.purchaseHistory')}</CardTitle>
                  <CardDescription>
                    {t('profile.purchaseHistoryDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {purchases.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">{t('profile.noTransactions')}</p>
                    ) : (
                      purchases.map((purchase) => (
                        <div key={purchase.id} className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                          {getStatusIcon(purchase.status)}

                          <div className="flex-1 space-y-1">
                            <h3 className="font-medium">{purchase.eventTitle}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(purchase.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {purchase.campus}
                              </div>
                              <span>{t('profile.quantity')}: {purchase.quantity}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-semibold text-lg">{purchase.price}€</div>
                            {getStatusBadge(purchase.status)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('profile.salesHistory')}</CardTitle>
                  <CardDescription>
                    {t('profile.salesHistoryDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {sales.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">{t('profile.noTransactions')}</p>
                    ) : (
                      sales.map((sale) => (
                        <div key={sale.id} className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                          {getStatusIcon(sale.status)}

                          <div className="flex-1 space-y-1">
                            <h3 className="font-medium">{sale.eventTitle}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(sale.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {sale.campus}
                              </div>
                              <span>{t('profile.quantity')}: {sale.quantity}</span>
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
                      ))
                    )}
                  </div>
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
