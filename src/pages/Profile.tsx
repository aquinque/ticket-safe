import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Settings,
  Ticket,
  Tag,
  Calendar as CalendarIcon,
  Sparkles,
  History as HistoryIcon,
  ShoppingBag,
} from "lucide-react";

interface Purchase {
  id: string;
  eventTitle: string;
  date: string;
  price: number;
  quantity: number;
  status: string;
  fileUrl: string | null;
}

interface Sale {
  id: string;
  eventTitle: string;
  date: string;
  salePrice: number;
  status: string;
}

const Profile = () => {
  const [userData, setUserData] = useState({
    name: "",
    email: "",
    campus: "",
  });
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-US";

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch user data when user is available
  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    const fetchUserData = async () => {
      try {
        setLoading(true);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Error fetching profile:", profileError);
        }

        if (!profile) {
          if (mounted) {
            setUserData({
              name:
                user.user_metadata?.full_name ||
                user.email?.split("@")[0] ||
                "User",
              email: user.email || "",
              campus: user.user_metadata?.university || "",
            });
            setPurchases([]);
            setSales([]);
            setLoading(false);
          }
          return;
        }

        // Fetch purchases — extended with file_url so we can show "View my ticket"
        const { data: purchaseData, error: purchaseError } = await supabase
          .from("transactions")
          .select(
            `*, ticket:tickets(file_url, event:events(title, date))`
          )
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false });

        if (purchaseError) {
          console.error("Error fetching purchases:", purchaseError);
        }

        const { data: saleData, error: saleError } = await supabase
          .from("tickets")
          .select(`*, event:events(title, date)`)
          .eq("seller_id", user.id)
          .order("created_at", { ascending: false });

        if (saleError) {
          console.error("Error fetching sales:", saleError);
        }

        // Primary tickets (Studio + Beta free claims) live in event_orders.
        // Fetch them too so they show up alongside resale purchases.
        const { data: orderData, error: orderError } = await supabase
          .from("event_orders")
          .select(
            `id, quantity, unit_price_cents, status, paid_at, created_at,
             event:events(title, date)`
          )
          .eq("buyer_id", user.id)
          .eq("status", "paid")
          .order("paid_at", { ascending: false });

        if (orderError) {
          console.error("Error fetching event orders:", orderError);
        }

        if (mounted) {
          setUserData({
            name:
              profile.full_name || user.email?.split("@")[0] || "User",
            email: profile.email || user.email || "",
            campus: profile.university || "",
          });

          const resalePurchases = (purchaseData ?? []).map((p) => ({
            id: p.id,
            eventTitle: p.ticket?.event?.title || "Unknown Event",
            date: p.ticket?.event?.date || p.created_at,
            price: p.amount,
            quantity: p.quantity ?? 1,
            status:
              p.status === "completed" ? "confirmed" : p.status,
            fileUrl: p.ticket?.file_url ?? null,
          }));

          const primaryPurchases = (orderData ?? []).map((o) => ({
            id: `order-${o.id}`,
            eventTitle: o.event?.title || "Unknown Event",
            date: o.event?.date || o.paid_at || o.created_at,
            price: (o.unit_price_cents ?? 0) * (o.quantity ?? 1) / 100,
            quantity: o.quantity ?? 1,
            status: "confirmed" as const,
            fileUrl: null,
          }));

          setPurchases([...primaryPurchases, ...resalePurchases]);

          setSales(
            (saleData ?? []).map((s) => ({
              id: s.id,
              eventTitle: s.event?.title || "Unknown Event",
              date: s.event?.date || s.created_at,
              salePrice: s.selling_price,
              status: s.status,
            }))
          );
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUserData();
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="py-16 flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t("profile.loadingProfile")}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  // Split upcoming vs past
  const now = new Date();
  const upcomingPurchases = purchases.filter((p) => new Date(p.date) >= now);
  const pastPurchases = purchases.filter((p) => new Date(p.date) < now);

  // Show active listings first, then sold; hide cancelled from the main view
  const activeListings = sales.filter((s) => s.status === "available");
  const soldListings = sales.filter((s) => s.status === "sold");
  const visibleSales = [...activeListings, ...soldListings];

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "long",
    });

  const initials = (userData.name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "?";
  const firstName = userData.name.split(" ")[0] || "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pb-16">
        {/* Hero band — gradient background with subtle decorative overlay */}
        <div className="relative overflow-hidden bg-gradient-hero text-white">
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.18), transparent 35%), radial-gradient(circle at 80% 60%, rgba(255,255,255,.12), transparent 40%)",
          }} />
          <div className="relative container mx-auto px-4 max-w-3xl py-10 md:py-12">
            <div className="mb-6">
              <BackButton />
            </div>
            <div className="flex items-center gap-4 md:gap-5">
              {/* Initials avatar */}
              <div
                className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center text-xl md:text-2xl font-black tracking-tight shadow-lg flex-shrink-0"
                aria-label={`${userData.name}'s initials`}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                  {userData.campus || "TicketSafe"}
                </p>
                <h1 className="text-3xl md:text-4xl font-black mt-1 leading-tight">
                  {t("profile.hello", { name: firstName })}
                </h1>
                <p className="text-sm text-white/75 mt-1 truncate">
                  {userData.email}
                </p>
              </div>
            </div>

            {/* Inline stat chips + Sell CTA */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium px-3 py-1.5 rounded-full bg-white/15 backdrop-blur border border-white/20">
                <Ticket className="w-3.5 h-3.5" />
                {upcomingPurchases.length} {upcomingPurchases.length === 1 ? "ticket" : "tickets"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs md:text-sm font-medium px-3 py-1.5 rounded-full bg-white/15 backdrop-blur border border-white/20">
                <Tag className="w-3.5 h-3.5" />
                {visibleSales.length} {visibleSales.length === 1 ? "listing" : "listings"}
              </span>
              <Button
                size="sm"
                onClick={() => navigate("/sell")}
                className="ml-auto gap-1.5 bg-white text-primary hover:bg-white/90 font-semibold shadow"
              >
                <Plus className="w-4 h-4" />
                {t("profile.sellATicket")}
              </Button>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-3xl -mt-6">
          {/* MES BILLETS */}
          <section className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Ticket className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg md:text-xl font-bold">
                  {t("profile.myTickets")}
                </h2>
              </div>
              {upcomingPurchases.length > 0 && (
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {upcomingPurchases.length} {upcomingPurchases.length === 1 ? "upcoming" : "upcoming"}
                </span>
              )}
            </div>

            {upcomingPurchases.length === 0 ? (
              <Card className="border-dashed bg-gradient-card">
                <CardContent className="p-10 text-center">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    {t("profile.noUpcomingTickets")}
                  </p>
                  <Button
                    variant="hero"
                    size="sm"
                    onClick={() => navigate("/marketplace")}
                    className="gap-1.5"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {t("profile.browseEvents")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingPurchases.map((p) => (
                  <Card
                    key={p.id}
                    className="group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-border"
                  >
                    {/* Brand accent bar */}
                    <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-hero" aria-hidden="true" />
                    <CardContent className="p-4 pl-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="hidden sm:flex w-10 h-10 rounded-lg bg-primary/10 items-center justify-center flex-shrink-0">
                          <CalendarIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                            {p.eventTitle}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            <span className="font-medium text-foreground/80">{formatDate(p.date)}</span>
                            <span className="mx-1.5">·</span>
                            <span className="font-bold text-primary">
                              {p.price > 0 ? `${p.price}€` : "Free"}
                            </span>
                          </p>
                        </div>
                      </div>
                      {p.fileUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="flex-shrink-0 group-hover:border-primary group-hover:text-primary"
                        >
                          <a
                            href={p.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t("profile.viewTicket")}
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex-shrink-0 italic">
                          {t("profile.ticketByEmail")}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* MES VENTES */}
          <section className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-secondary" />
                </div>
                <h2 className="text-lg md:text-xl font-bold">
                  {t("profile.mySales")}
                </h2>
              </div>
              {sales.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/settings/listings")}
                  className="gap-1.5 text-xs h-8"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t("profile.manageListings")}
                </Button>
              )}
            </div>

            {visibleSales.length === 0 ? (
              <Card className="border-dashed bg-gradient-card">
                <CardContent className="p-10 text-center">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center mb-4">
                    <Tag className="w-5 h-5 text-secondary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    {t("profile.noSalesYet")}
                  </p>
                  <Button
                    variant="hero"
                    size="sm"
                    onClick={() => navigate("/sell")}
                    className="gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {t("profile.sellATicket")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {visibleSales.slice(0, 5).map((s) => {
                  const isSold = s.status === "sold";
                  return (
                    <Card
                      key={s.id}
                      className="group relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-border"
                    >
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          isSold ? "bg-green-500" : "bg-amber-400"
                        }`}
                        aria-hidden="true"
                      />
                      <CardContent className="p-4 pl-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`hidden sm:flex w-10 h-10 rounded-lg items-center justify-center flex-shrink-0 ${
                              isSold ? "bg-green-500/10" : "bg-amber-400/10"
                            }`}
                          >
                            <Tag
                              className={`w-4 h-4 ${
                                isSold ? "text-green-600" : "text-amber-600"
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">
                              {s.eventTitle}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {isSold
                                ? t("profile.soldFor", { price: s.salePrice })
                                : t("profile.listedAt", { price: s.salePrice })}
                            </p>
                          </div>
                        </div>
                        {isSold ? (
                          <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 border-green-300 flex-shrink-0 font-semibold">
                            {t("profile.sold")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-700 border-amber-300 bg-amber-50 flex-shrink-0 font-semibold"
                          >
                            {t("profile.awaitingBuyer")}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {visibleSales.length > 5 && (
                  <div className="text-center pt-1">
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => navigate("/settings/listings")}
                    >
                      {t("profile.viewAll")} ({visibleSales.length})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* HISTORIQUE */}
          {pastPurchases.length > 0 && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-expanded={historyOpen}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <HistoryIcon className="w-4 h-4" />
                  {t("profile.historyToggle", { count: pastPurchases.length })}
                </span>
                {historyOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {historyOpen && (
                <div className="mt-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  {pastPurchases.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 px-4 text-sm rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-muted-foreground truncate flex-1">
                        {p.eventTitle}
                      </span>
                      <span className="text-xs text-muted-foreground/80 whitespace-nowrap ml-3 font-mono">
                        {new Date(p.date).toLocaleDateString(dateLocale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Profile;
