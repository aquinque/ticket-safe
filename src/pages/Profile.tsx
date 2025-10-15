import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  User, 
  Ticket, 
  ShoppingBag, 
  History, 
  Settings, 
  Calendar,
  MapPin,
  Euro,
  CheckCircle2,
  Clock,
  XCircle
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
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchUserData = async () => {
      try {
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;

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

        if (!profileError && profile) {
          setUserData({
            name: profile.full_name || "",
            email: profile.email || user.email || "",
            campus: profile.university || "",
            memberSince: profile.created_at || "",
            totalPurchases: purchaseData?.length || 0,
            totalSales: saleData?.filter(s => s.status === 'sold').length || 0,
            totalSaved: 0, // Calculate based on actual data if needed
          });
        }

        if (!purchaseError && purchaseData) {
          setPurchases(purchaseData.map(p => ({
            id: p.id,
            eventTitle: p.ticket?.event?.title || "Unknown Event",
            date: p.ticket?.event?.date || p.created_at,
            price: p.amount,
            quantity: p.quantity,
            status: p.status === 'completed' ? 'confirmed' : p.status,
            campus: p.ticket?.event?.university || "Unknown"
          })));
        }

        if (!saleError && saleData) {
          setSales(saleData.map(s => ({
            id: s.id,
            eventTitle: s.event?.title || "Unknown Event",
            date: s.event?.date || s.created_at,
            originalPrice: s.original_price,
            salePrice: s.selling_price,
            quantity: s.quantity,
            status: s.status,
            campus: s.event?.university || "Unknown"
          })));
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user, navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 flex items-center justify-center">
          <p className="text-muted-foreground">Loading profile...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-16">
        <div className="container mx-auto px-4 max-w-6xl">
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

                  <Button variant="outline" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Paramètres
                  </Button>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="purchases">Mes achats</TabsTrigger>
              <TabsTrigger value="sales">Mes ventes</TabsTrigger>
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
                       <p className="text-sm text-muted-foreground text-center py-4">No purchases yet</p>
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
                       <p className="text-sm text-muted-foreground text-center py-4">No sales yet</p>
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
                       <p className="text-center text-muted-foreground py-8">You haven't made any purchases yet.</p>
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
                       <p className="text-center text-muted-foreground py-8">You haven't listed any tickets for sale yet.</p>
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
           </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Profile;