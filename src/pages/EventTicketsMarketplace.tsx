import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import HeaderNight from "@/components/HeaderNight";
import { useThemeMode } from "@/hooks/useThemeMode";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, ShoppingCart, Info, MessageSquare, BarChart3, TrendingUp, TrendingDown, Minus, Ticket } from "lucide-react";
import { useEventPriceIntel } from "@/hooks/useEventPriceIntel";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { authPathHere } from "@/lib/returnTo";
import { useResaleListings } from "@/hooks/useResaleListings";
import { useResaleActions } from "@/hooks/useResaleActions";
import { ResaleListingList } from "@/components/resale/ResaleListingList";

interface EventInfo {
  id: string;
  title: string;
  date: string;
  location: string | null;
  category: string;
  banner_url: string | null;
}

const EventTicketsMarketplace = () => {
  useThemeMode("night");
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-GB";

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // Listings through the resale_listings function (cheapest first), not a direct read of tickets.
  const { data: listings = [], isLoading: listingsLoading } = useResaleListings({ eventId, enabled: !!eventId });
  const actions = useResaleActions();
  const [notFound, setNotFound] = useState(false);
  const [notifying, setNotifying] = useState(false);
  // Live price intel for this event — used by the market-insight card and
  // by the "best deal" badge on each listing card.
  const { intel } = useEventPriceIntel(eventId);

  useEffect(() => {
    if (!eventId) return;

    async function fetchData() {
      setLoading(true);

      // Fetch event directly by ID (no base_price / is_active filter)
      const { data: eventData, error: eventErr } = await supabase
        .from("events")
        .select("id, title, date, location, category, banner_url")
        .eq("id", eventId)
        .single();

      if (eventErr || !eventData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(eventData as EventInfo);
      setLoading(false);
    }

    fetchData();
  }, [eventId]);

  const handleNotifyMe = async () => {
    if (!user) {
      navigate(authPathHere());
      return;
    }
    if (!eventId) return;
    setNotifying(true);
    // ticket_alerts isn't in the generated Supabase types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("ticket_alerts")
      .insert({ user_id: user.id, event_id: eventId });
    setNotifying(false);
    if (error) {
      if (error.code === "23505") {
        toast.success("You're already on the list — we'll email you when a ticket is listed.");
      } else {
        toast.error("Could not set up the alert. Please try again.");
      }
      return;
    }
    toast.success("Done! We'll email you the moment a ticket is listed for this event.");
  };

  if (loading || listingsLoading) {
    return (
      <>
        <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
        <HeaderNight />
        <main className="theme-night min-h-screen bg-background pt-20 pb-8 md:pt-24">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="mb-6"><BackButton /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <Card key={i} className="overflow-hidden">
                  <div className="bg-muted/30 p-6 border-b space-y-3">
                    <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                    <div className="h-10 bg-muted rounded w-1/2 mx-auto animate-pulse" />
                  </div>
                  <div className="p-6 space-y-3">
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
                    <div className="h-10 bg-muted rounded animate-pulse" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (notFound || !event) {
    return (
      <>
        <HeaderNight />
        <main className="theme-night min-h-screen bg-background pt-20 pb-8 md:pt-24">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="mb-6"><BackButton /></div>
            <Alert className="max-w-2xl mx-auto">
              <Info className="w-4 h-4" />
              <AlertDescription>Event not found.</AlertDescription>
            </Alert>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
      <HeaderNight />
      <main className="theme-night min-h-screen bg-background pt-20 pb-8 md:pt-24">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Event Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="relative w-full md:w-64 h-40 md:h-48 overflow-hidden flex-shrink-0 bg-muted">
                {event.banner_url ? (
                  <img
                    src={event.banner_url}
                    alt={event.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <span className="text-sm font-medium text-muted-foreground text-center line-clamp-3">
                      {event.title}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <Badge variant="secondary" className="mb-2">
                  {event.category || 'Event'}
                </Badge>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">{event.title}</h1>
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">
                      {new Date(event.date).toLocaleDateString(dateLocale, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{event.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Page Title */}
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Available Tickets
              {listings.length > 0 && (
                <span className="ml-3 text-lg font-normal text-muted-foreground">
                  ({listings.length} listing{listings.length !== 1 ? 's' : ''})
                </span>
              )}
            </h2>
            <p className="text-muted-foreground">
              Browse tickets listed by verified students for this event
            </p>
          </div>

          {/* Listings */}
          {listings.length === 0 ? (
            <div className="max-w-lg mx-auto text-center py-10">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Info className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No tickets listed yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                No one has listed a ticket for this event yet. Be the first, or get notified when one appears.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="hero" onClick={() => navigate("/sell")} aria-label="Sell your ticket for this event">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  List your ticket
                </Button>
                <Button variant="outline" onClick={handleNotifyMe} disabled={notifying} aria-label="Get notified when a ticket is listed">
                  {notifying ? "Setting up…" : "Notify me"}
                </Button>
              </div>
            </div>
          ) : (
            <>
            {/* ===== Market insight card — live price intelligence =====
                Average sold, lowest available, last sold price, 7-day
                trend. Lets a buyer eyeball whether the current listings
                are a fair deal vs. what's actually been transacted on
                the platform. Only renders when we have at least one
                completed sale to anchor the stats. */}
            {intel.recentSalesCount > 0 && (
              <div className="mb-6 rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10">
                      <BarChart3 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Market insight
                      </div>
                      <div className="text-sm font-semibold">
                        Based on {intel.recentSalesCount} sale{intel.recentSalesCount > 1 ? "s" : ""} in the last 30 days
                      </div>
                    </div>
                  </div>
                  {intel.trend && intel.trendPct != null && (
                    <div
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        intel.trend === "up"
                          ? "bg-primary/10 text-primary"
                          : intel.trend === "down"
                          ? "bg-muted text-foreground/70"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {intel.trend === "up" ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : intel.trend === "down" ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : (
                        <Minus className="w-3 h-3" />
                      )}
                      {intel.trend === "flat"
                        ? "Stable"
                        : `${intel.trendPct > 0 ? "+" : ""}${intel.trendPct.toFixed(0)}% this week`}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-muted/40 px-3 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Avg sold
                    </div>
                    <div className="text-xl md:text-2xl font-semibold tabular-nums text-foreground leading-none">
                      €{intel.avgSold != null ? intel.avgSold.toFixed(0) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/40 px-3 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Lowest now
                    </div>
                    <div className="text-xl md:text-2xl font-semibold tabular-nums text-primary leading-none">
                      €{intel.lowestAvailable != null ? intel.lowestAvailable.toFixed(0) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-muted/40 px-3 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Last sold
                    </div>
                    <div className="text-xl md:text-2xl font-semibold tabular-nums text-foreground leading-none">
                      €{intel.lastSold ? intel.lastSold.price.toFixed(0) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Make an offer hint — only shown when listings exist */}
            <div className="mb-8 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <MessageSquare className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-primary/90">
                <span className="font-semibold">Not happy with the price?</span> Use <span className="font-semibold">"Make an offer"</span> on any listing to chat directly with the seller and negotiate.
              </p>
            </div>
            <div className="max-w-2xl">
              <ResaleListingList listings={listings} onOffer={actions.offer} offerBusy={actions.offerBusy} />
            </div>

            {/* Sell for this event — shown after the browse grid, not instead of it */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Ticket className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Got a ticket to sell for this event?</p>
                  <p className="text-xs text-muted-foreground">List it in a couple of minutes — protected, escrow payment.</p>
                </div>
              </div>
              <Button variant="hero" onClick={() => navigate("/sell")} className="shrink-0" aria-label="Sell your ticket for this event">
                <ShoppingCart className="w-4 h-4 mr-2" />
                Sell your ticket
              </Button>
            </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default EventTicketsMarketplace;
