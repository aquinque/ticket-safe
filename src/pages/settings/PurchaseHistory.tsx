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
  const [purchases, setPurchases] = useState<Array<{ id: string; eventTitle: string; date: string; price: number; status: string; campus: string; quantity: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchPurchases = async () => {
      try {
        setLoading(true);
        const { data: purchaseData, error: purchaseError } = await supabase
          .from('transactions')
          .select(`*, ticket:tickets(event:events(title, university, date))`)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (purchaseError) console.error('Error fetching purchases:', purchaseError);

        setPurchases(purchaseData?.map(p => ({
          id: p.id,
          eventTitle: p.ticket?.event?.title || "Unknown Event",
          date: p.ticket?.event?.date || p.created_at,
          price: p.amount,
          quantity: p.quantity,
          status: p.status === 'completed' ? 'confirmed' : p.status,
          campus: p.ticket?.event?.university || "Unknown",
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
        return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Confirmed</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-primary text-xs">Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive" className="text-xs">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed": return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
      case "pending":   return <Clock className="w-4 h-4 text-primary shrink-0" />;
      case "cancelled": return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
      default:          return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const totalSpent = purchases.reduce((sum, p) => sum + (p.price || 0), 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-8 md:py-16 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-5">
            <BackButton fallbackPath="/settings" />
          </div>

          {/* Page Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">Purchase History</h1>
              <p className="text-sm text-muted-foreground">All your ticket purchases</p>
            </div>
          </div>

          {/* Stats — 3 compact cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xl font-bold">{purchases.length}</p>
                <p className="text-xs text-muted-foreground leading-tight">Purchases</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-xl font-bold">{purchases.filter(p => p.status === 'confirmed').length}</p>
                <p className="text-xs text-muted-foreground leading-tight">Confirmed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                  <Euro className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-xl font-bold">{totalSpent.toFixed(0)}€</p>
                <p className="text-xs text-muted-foreground leading-tight">Total spent</p>
              </CardContent>
            </Card>
          </div>

          {/* Purchase list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All Purchases</CardTitle>
              <CardDescription className="text-xs">Complete list of your ticket purchases</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : purchases.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No purchases yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Your ticket purchases will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {purchases.map((purchase) => (
                    <div key={purchase.id} className="py-3.5 first:pt-0 last:pb-0">
                      {/* Top row: icon + title + price */}
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5">{getStatusIcon(purchase.status)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm leading-snug truncate">{purchase.eventTitle}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-bold text-base leading-none">{Number(purchase.price).toFixed(2)}€</p>
                        </div>
                      </div>

                      {/* Bottom row: meta + badge */}
                      <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(purchase.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {purchase.campus}
                        </span>
                        <span className="text-xs text-muted-foreground">× {purchase.quantity}</span>
                        {getStatusBadge(purchase.status)}
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
