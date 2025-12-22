import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import {
  ShoppingBag,
  Calendar,
  MapPin,
  Euro,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react";

const PurchaseHistory = () => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchPurchases = async () => {
      try {
        setLoading(true);

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

        setPurchases(purchaseData?.map(p => ({
          id: p.id,
          eventTitle: p.ticket?.event?.title || "Unknown Event",
          date: p.ticket?.event?.date || p.created_at,
          price: p.amount,
          quantity: p.quantity,
          status: p.status === 'completed' ? 'confirmed' : p.status,
          campus: p.ticket?.event?.university || "Unknown",
          purchaseDate: p.created_at
        })) || []);
      } catch (error) {
        console.error("Error fetching purchase history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPurchases();
  }, [user, navigate]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="secondary" className="bg-accent/10 text-accent">Confirmed</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-primary">Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle2 className="w-4 h-4 text-accent" />;
      case "pending":
        return <Clock className="w-4 h-4 text-primary" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton fallbackPath="/settings" />
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-green-600" />
              </div>
              <h1 className="text-4xl font-bold">Purchase History</h1>
            </div>
            <p className="text-muted-foreground">
              View all your ticket purchases and transaction details
            </p>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">{purchases.length}</h3>
                <p className="text-sm text-muted-foreground">Total Purchases</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-2xl font-bold">
                  {purchases.filter(p => p.status === 'confirmed').length}
                </h3>
                <p className="text-sm text-muted-foreground">Confirmed</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Euro className="w-5 h-5 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold">
                  {purchases.reduce((sum, p) => sum + (p.price as number || 0), 0)}€
                </h3>
                <p className="text-sm text-muted-foreground">Total Spent</p>
              </CardContent>
            </Card>
          </div>

          {/* Purchase History */}
          <Card>
            <CardHeader>
              <CardTitle>All Purchases</CardTitle>
              <CardDescription>
                Complete list of all your ticket purchases
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading purchases...</p>
                </div>
              ) : purchases.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No purchases yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your ticket purchases will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      {getStatusIcon(purchase.status as string)}

                      <div className="flex-1 space-y-1">
                        <h3 className="font-medium">{purchase.eventTitle as string}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(purchase.date as string).toLocaleDateString(
                              language === 'fr' ? 'fr-FR' : 'en-US'
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {purchase.campus as string}
                          </div>
                          <span>Qty: {purchase.quantity as number}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Purchased on{' '}
                          {new Date(purchase.purchaseDate as string).toLocaleDateString(
                            language === 'fr' ? 'fr-FR' : 'en-US'
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold text-lg">{purchase.price as number}€</div>
                        {getStatusBadge(purchase.status as string)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PurchaseHistory;
