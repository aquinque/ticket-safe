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
  XCircle,
  QrCode,
  ArrowRight,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

type Purchase = {
  id: string;
  source: "resale" | "studio";
  orderId: string;
  eventTitle: string;
  date: string;
  price: number;
  status: string;
  campus: string;
  quantity: number;
};

const PurchaseHistory = () => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchPurchases = async () => {
      try {
        setLoading(true);

        // Resale purchases (transactions table)
        const resaleQuery = supabase
          .from("transactions")
          .select(`*, ticket:tickets(event:events(title, university, date))`)
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false });

        // Studio primary-sale purchases (event_orders table)
        const studioQuery = supabase
          .from("event_orders")
          .select(`
            id, status, quantity, total_cents, created_at,
            event:events(title, university, campus, date, slug)
          `)
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false });

        const [resaleRes, studioRes] = await Promise.all([resaleQuery, studioQuery]);

        if (resaleRes.error) console.error("[purchases] resale fetch error:", resaleRes.error);
        if (studioRes.error) console.error("[purchases] studio fetch error:", studioRes.error);

        const resale: Purchase[] = (resaleRes.data ?? []).map((p: { id: string; amount: number; quantity: number; status: string; created_at: string; ticket: { event: { title?: string; university?: string; date?: string } } | null }) => ({
          id: `resale-${p.id}`,
          source: "resale",
          orderId: p.id,
          eventTitle: p.ticket?.event?.title || "Unknown Event",
          date: p.ticket?.event?.date || p.created_at,
          price: p.amount,
          quantity: p.quantity,
          status: p.status === "completed" ? "confirmed" : p.status,
          campus: p.ticket?.event?.university || "Unknown",
        }));

        const studio: Purchase[] = (studioRes.data ?? []).map((o: { id: string; status: string; quantity: number; total_cents: number; created_at: string; event: { title?: string; university?: string; campus?: string; date?: string } | null }) => ({
          id: `studio-${o.id}`,
          source: "studio",
          orderId: o.id,
          eventTitle: o.event?.title || "Unknown Event",
          date: o.event?.date || o.created_at,
          price: o.total_cents / 100,
          quantity: o.quantity,
          status: o.status === "paid" ? "confirmed" : o.status,
          campus: o.event?.campus || o.event?.university || "Unknown",
        }));

        const merged = [...resale, ...studio].sort((a, b) => +new Date(b.date) - +new Date(a.date));
        setPurchases(merged);
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

                      {/* Bottom row: meta + badge + source */}
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
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                            purchase.source === "studio"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {purchase.source === "studio" ? (
                            <>
                              <Sparkles className="w-2.5 h-2.5" />
                              Studio
                            </>
                          ) : (
                            <>
                              <Repeat2 className="w-2.5 h-2.5" />
                              Resale
                            </>
                          )}
                        </span>
                      </div>

                      {/* Studio order: link to QR tickets */}
                      {purchase.source === "studio" && purchase.status === "confirmed" && (
                        <div className="mt-2 ml-6">
                          <Link
                            to={`/my-tickets/${purchase.orderId}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:gap-2 transition-all"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            View QR tickets
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}

                      {/* Resale purchase: link to the My Tickets hub where
                          Studio-transferred tickets show the buyer's fresh
                          QR and external resales link to the seller's file. */}
                      {purchase.source === "resale" && purchase.status === "confirmed" && (
                        <div className="mt-2 ml-6">
                          <Link
                            to="/my-tickets"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:gap-2 transition-all"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            View ticket
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
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
