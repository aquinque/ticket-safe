import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/SEOHead";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { useI18n } from "@/contexts/I18nContext";
import { getEventImage } from "@/lib/eventImages";
import { toast } from "sonner";
import {
  ArrowRight,
  Banknote,
  Bell,
  Calendar,
  Clock,
  Filter,
  GraduationCap,
  HelpCircle,
  MapPin,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isTonight, matchesDateFilter, type DateFilterId } from "@/lib/dateFilters";

type ViewMode = "available" | "all";

const DATE_FILTERS = [
  { id: "all-dates", labelKey: "Any date" },
  { id: "tonight", labelKey: "Tonight" },
  { id: "this-week", labelKey: "This week" },
  { id: "this-month", labelKey: "This month" },
];

const CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "Parties", label: "Parties" },
  { id: "Galas", label: "Galas" },
  { id: "Conferences", label: "Conferences" },
  { id: "Sports", label: "Sports" },
  { id: "Sustainability", label: "Sustainability" },
  { id: "Other", label: "Other" },
];

export default function Marketplace() {
  const { t, language } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-US";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get("view");
  const view: ViewMode = viewParam === "all" ? "all" : "available";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dateFilter, setDateFilter] = useState("all-dates");

  const { events: allEvents, loading, error } = useESCPEvents({
    onlyWithTickets: view === "available",
  });

  const setView = useCallback(
    (v: ViewMode) => {
      setSearchParams(v === "all" ? { view: "all" } : {}, { replace: false });
    },
    [setSearchParams]
  );

  const filtered = allEvents.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(search.toLowerCase()) ||
      ev.location.toLowerCase().includes(search.toLowerCase()) ||
      (ev.organizer && ev.organizer.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = category === "all" || ev.category === category;
    const matchesDate = matchesDateFilter(ev.start_date, dateFilter as DateFilterId);
    return matchesSearch && matchesCategory && matchesDate;
  });

  const handleNotify = () => {
    // Ticket alerts are per-event. Send the user to the catalog so they can
    // open the event they care about and tap "Notify me" there.
    toast.info("Open the event you're after and tap \"Notify me\" — we'll email you when a ticket is listed.");
    setView("all");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="marketplace.title" descriptionKey="marketplace.subtitle" />
      <Header />

      <main className="flex-1 py-10">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Page header */}
          <div className="mb-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">{t('marketplace.title')}</h1>
            <p className="text-lg text-muted-foreground">{t('marketplace.subtitle')}</p>
          </div>

          {/* View toggle */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div
              role="group"
              aria-label="Marketplace view"
              className="inline-flex items-center bg-muted rounded-full p-1 gap-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={view === "available"}
                onClick={() => setView("available")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  view === "available"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t('marketplace.toggleAvailable')}
              </button>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  role="radio"
                  aria-checked={view === "all"}
                  onClick={() => setView("all")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    view === "all"
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t('marketplace.toggleAll')}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full pr-1"
                      aria-label="About All upcoming events view"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {t('marketplace.toggleAllTooltip')}
                  </TooltipContent>
                </Tooltip>
              </span>
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search events, venues, or organizers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    aria-label="Search events"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-muted-foreground">Category:</span>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                    {CATEGORY_FILTERS.map((f) => (
                      <Button
                        key={f.id}
                        variant={category === f.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCategory(f.id)}
                        className="rounded-full"
                        aria-pressed={category === f.id}
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-medium text-muted-foreground">When:</span>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by date">
                    {DATE_FILTERS.map((f) => (
                      <Button
                        key={f.id}
                        variant={dateFilter === f.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDateFilter(f.id)}
                        className="rounded-full"
                        aria-pressed={dateFilter === f.id}
                      >
                        {f.labelKey}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{error.message || "Failed to load events."}</p>
            </div>
          )}

          {/* Events grid */}
          {!loading && !error && filtered.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                {view === "available" && ` · ${filtered.filter(e => (e.available_tickets ?? 0) > 0).length} with tickets`}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((ev) => {
                  const hasTickets = (ev.available_tickets ?? 0) > 0;
                  const diffDays = Math.ceil((new Date(ev.start_date).getTime() - Date.now()) / 86400000);

                  return (
                    <Card
                      key={ev.id}
                      className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group"
                      onClick={() => navigate(`/event/${ev.id}/tickets`)}
                    >
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={getEventImage(ev.image_url, ev.category)}
                          alt={ev.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                        <div className="absolute top-3 right-3">
                          <Badge variant={hasTickets ? "default" : "secondary"}>
                            {ev.category || "Event"}
                          </Badge>
                        </div>
                        {hasTickets && (
                          <div className="absolute top-3 left-3">
                            <Badge variant="default" className="bg-green-600">
                              {ev.available_tickets} ticket{ev.available_tickets !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                        )}
                        {isTonight(ev.start_date) && (
                          <Badge className="absolute bottom-3 right-3 bg-amber-500 text-white border-transparent flex items-center gap-1">
                            <Clock className="w-3 h-3" />Tonight
                          </Badge>
                        )}
                        {!isTonight(ev.start_date) && diffDays === 1 && (
                          <Badge className="absolute bottom-3 right-3 bg-amber-500 text-white border-transparent flex items-center gap-1">
                            <Clock className="w-3 h-3" />Tomorrow
                          </Badge>
                        )}
                        {!isTonight(ev.start_date) && diffDays > 1 && diffDays <= 7 && (
                          <Badge className="absolute bottom-3 right-3 bg-white/90 text-foreground border-border flex items-center gap-1">
                            <Clock className="w-3 h-3" />In {diffDays} days
                          </Badge>
                        )}
                      </div>

                      <CardContent className="p-6">
                        <h3 className="text-xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                          {ev.title}
                        </h3>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>
                              {new Date(ev.start_date).toLocaleDateString(dateLocale, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="line-clamp-1">{ev.location}</span>
                          </div>
                          {ev.organizer && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Users className="w-4 h-4 flex-shrink-0" />
                              <span className="line-clamp-1">{ev.organizer}</span>
                            </div>
                          )}
                        </div>

                        {hasTickets && ev.min_price != null && (
                          <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                            <p className="text-xs text-muted-foreground">From</p>
                            <p className="text-2xl font-bold text-primary">€{ev.min_price.toFixed(2)}</p>
                          </div>
                        )}

                        <Button
                          variant={hasTickets ? "hero" : "outline"}
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasTickets) {
                              navigate(`/event/${ev.id}/tickets`);
                            } else {
                              navigate("/sell");
                            }
                          }}
                        >
                          {hasTickets ? (
                            <>
                              <ShoppingBag className="w-4 h-4 mr-2" />
                              {ev.min_price != null
                                ? t('marketplace.viewTickets', { price: ev.min_price.toFixed(2) })
                                : "View Tickets"}
                            </>
                          ) : (
                            <>
                              <Tag className="w-4 h-4 mr-2" />
                              {t('marketplace.sellYourTicket')}
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-16 max-w-lg mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {view === "available" ? t('marketplace.emptyTitle') : "No events found"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {view === "available"
                  ? t('marketplace.emptySubtitle')
                  : "Try adjusting your search or filters."}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {view === "available" && (
                  <Button
                    variant="hero"
                    onClick={() => setView("all")}
                    className="gap-2"
                    aria-label="Browse all upcoming events"
                  >
                    <Calendar className="w-4 h-4" />
                    {t('marketplace.browseCatalog')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleNotify}
                  className="gap-2"
                  aria-label="Get notified when tickets are listed"
                >
                  <Bell className="w-4 h-4" />
                  {t('marketplace.notifyMe')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/sell")}
                  className="gap-2"
                  aria-label="List your ticket"
                >
                  <Tag className="w-4 h-4" />
                  {t('marketplace.listYourTicket')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ===== How It Works (resale flow) ===== */}
        <section className="py-14 md:py-20 border-t border-border bg-muted/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">How resale works</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Safe student-to-student ticket resale in 4 simple steps.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto mb-10">
              {[
                { icon: GraduationCap, title: "Sign up", description: "Verify your student email instantly", color: "bg-primary/10", iconColor: "text-primary" },
                { icon: ShieldCheck, title: "Buy or list", description: "Browse verified tickets or list yours in 2 minutes", color: "bg-blue-500/10", iconColor: "text-blue-500" },
                { icon: QrCode, title: "Secure transfer", description: "Tickets are authenticated and transferred safely", color: "bg-purple-500/10", iconColor: "text-purple-500" },
                { icon: Banknote, title: "Pay or get paid", description: "Escrow protects buyers. Sellers get paid within 24h.", color: "bg-green-500/10", iconColor: "text-green-500" },
              ].map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="flex flex-col items-center text-center gap-3 p-4 rounded-xl bg-card border border-border hover:shadow-md transition-shadow">
                    <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${step.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center">
              <Button variant="outline" asChild className="font-semibold">
                <Link to="/how-it-works">
                  See full guide
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
