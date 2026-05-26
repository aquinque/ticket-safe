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
import { Plus, ChevronDown, ChevronUp, ExternalLink, Settings } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="py-10 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Top bar: back + sell CTA */}
          <div className="mb-8 flex items-center justify-between">
            <BackButton />
            <Button
              variant="hero"
              size="sm"
              onClick={() => navigate("/sell")}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t("profile.sellATicket")}
            </Button>
          </div>

          {/* Compact header — name + minimal meta */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold">
              {t("profile.hello", {
                name: userData.name.split(" ")[0] || "",
              })}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {userData.campus ? `${userData.campus} · ` : ""}
              {userData.email}
            </p>
          </div>

          {/* MES BILLETS — upcoming tickets you bought */}
          <section className="mb-12">
            <h2 className="text-lg font-semibold mb-4">
              {t("profile.myTickets")}
            </h2>
            {upcomingPurchases.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("profile.noUpcomingTickets")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/marketplace")}
                  >
                    {t("profile.browseEvents")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingPurchases.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {p.eventTitle}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {formatDate(p.date)} · {p.price > 0 ? `${p.price}€` : "Free (Beta)"}
                        </p>
                      </div>
                      {p.fileUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="flex-shrink-0"
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
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {t("profile.ticketByEmail")}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* MES VENTES — listings you're selling */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {t("profile.mySales")}
              </h2>
              {sales.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/settings/listings")}
                  className="gap-1.5 text-xs"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t("profile.manageListings")}
                </Button>
              )}
            </div>
            {visibleSales.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("profile.noSalesYet")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/sell")}
                  >
                    {t("profile.sellATicket")}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {visibleSales.slice(0, 5).map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">
                          {s.eventTitle}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {s.status === "sold"
                            ? t("profile.soldFor", { price: s.salePrice })
                            : t("profile.listedAt", { price: s.salePrice })}
                        </p>
                      </div>
                      {s.status === "sold" ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-500/10 text-green-700 hover:bg-green-500/10 border-green-200 flex-shrink-0"
                        >
                          {t("profile.sold")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground flex-shrink-0"
                        >
                          {t("profile.awaitingBuyer")}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {visibleSales.length > 5 && (
                  <div className="text-center pt-2">
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

          {/* HISTORIQUE — past tickets, collapsed by default */}
          {pastPurchases.length > 0 && (
            <section>
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm py-1"
                aria-expanded={historyOpen}
              >
                {historyOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                {t("profile.historyToggle", { count: pastPurchases.length })}
              </button>
              {historyOpen && (
                <div className="mt-4 space-y-1.5">
                  {pastPurchases.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 px-3 text-sm rounded-md hover:bg-muted/30"
                    >
                      <span className="text-muted-foreground truncate flex-1">
                        {p.eventTitle}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
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
