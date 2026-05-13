import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, MapPin, Users, ShoppingBag, Bell, Tag, Clock } from "lucide-react";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/SEOHead";
import { getEventImage } from "@/lib/eventImages";
import { toast } from "sonner";

function isTonight(d: string) { const ev = new Date(d), now = new Date(); return ev.getFullYear()===now.getFullYear()&&ev.getMonth()===now.getMonth()&&ev.getDate()===now.getDate(); }
function isThisWeek(d: string) { const ev = new Date(d), now = new Date(), end = new Date(now); end.setDate(now.getDate()+7); return ev>=now&&ev<=end; }
function isThisMonth(d: string) { const ev = new Date(d), now = new Date(); return ev.getFullYear()===now.getFullYear()&&ev.getMonth()===now.getMonth()&&ev>=now; }

const DATE_FILTERS = [
  { id: "all-dates", label: "Any date" },
  { id: "tonight",   label: "Tonight" },
  { id: "this-week", label: "This week" },
  { id: "this-month",label: "This month" },
];

const EventsCatalog = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all-dates");

  // Fetch ALL events (not filtered by tickets)
  const { events: allEvents, loading, error } = useESCPEvents({ onlyWithTickets: false });

  const filters = [
    { id: "all", label: "All Categories" },
    { id: "Parties", label: "Parties" },
    { id: "Galas", label: "Galas" },
    { id: "Conferences", label: "Conferences" },
    { id: "Sports", label: "Sports" },
    { id: "Sustainability", label: "Sustainability" },
    { id: "Other", label: "Other" }
  ];

  // Filter events based on search and category
  const filteredEvents = allEvents.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (event.organizer && event.organizer.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = selectedFilter === "all" || event.category === selectedFilter;
    const d = event.start_date;
    const matchesDate =
      dateFilter === "all-dates" ||
      (dateFilter === "tonight" && isTonight(d)) ||
      (dateFilter === "this-week" && isThisWeek(d)) ||
      (dateFilter === "this-month" && isThisMonth(d));
    return matchesSearch && matchesFilter && matchesDate;
  });

  const handleEventClick = (eventId: string) => {
    navigate(`/event/${eventId}/tickets`);
  };

  const handleNotifyMe = () => {
    toast.info("Ticket alerts coming soon — we'll notify you by email when tickets are listed for this category.");
  };

  const handleBuyTickets = (eventId: string, hasTickets: boolean) => {
    if (hasTickets) {
      navigate(`/event/${eventId}/tickets`);
    } else {
      navigate(`/sell`);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-4xl font-bold mb-2">ESCP Events Catalog</h1>
                <p className="text-lg text-muted-foreground">
                  Complete listing of all ESCP Campus Life events
                </p>
              </div>
              <Button
                variant="hero"
                onClick={() => navigate("/marketplace")}
                className="gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                Available Events
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} •
              {filteredEvents.filter(e => (e.available_tickets || 0) > 0).length} with tickets available
            </p>
          </div>

          {/* Search and Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search events, venues, or organizers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {filters.map((filter) => (
                    <Button
                      key={filter.id}
                      variant={selectedFilter === filter.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedFilter(filter.id)}
                      className="rounded-full"
                      aria-pressed={selectedFilter === filter.id}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium text-muted-foreground">When:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DATE_FILTERS.map((f) => (
                    <Button
                      key={f.id}
                      variant={dateFilter === f.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDateFilter(f.id)}
                      className="rounded-full"
                      aria-pressed={dateFilter === f.id}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
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

          {/* Error State */}
          {error && !loading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Error loading events</h3>
              <p className="text-muted-foreground">
                {error.message || 'Failed to load events. Please try again later.'}
              </p>
            </div>
          )}

          {/* Events Grid */}
          {!loading && !error && filteredEvents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map(event => {
                const hasTickets = (event.available_tickets || 0) > 0;

                return (
                  <Card
                    key={event.id}
                    className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group"
                    onClick={() => handleEventClick(event.id)}
                  >
                    {/* Event Image/Header */}
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={getEventImage(event.image_url, event.category)}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      <div className="absolute top-3 right-3">
                        <Badge variant={hasTickets ? "default" : "secondary"}>
                          {event.category || 'Event'}
                        </Badge>
                      </div>
                      {hasTickets && (
                        <div className="absolute top-3 left-3">
                          <Badge variant="default" className="bg-green-600">
                            {event.available_tickets} ticket{event.available_tickets !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      )}
                      {(() => {
                        const d = event.start_date;
                        if (isTonight(d)) return <Badge className="absolute bottom-3 right-3 bg-amber-500 text-white border-transparent flex items-center gap-1"><Clock className="w-3 h-3" />Tonight</Badge>;
                        const diffDays = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
                        if (diffDays === 1) return <Badge className="absolute bottom-3 right-3 bg-amber-500 text-white border-transparent flex items-center gap-1"><Clock className="w-3 h-3" />Tomorrow</Badge>;
                        if (diffDays > 1 && diffDays <= 7) return <Badge className="absolute bottom-3 right-3 bg-white/90 text-foreground border-border flex items-center gap-1"><Clock className="w-3 h-3" />In {diffDays} days</Badge>;
                        return null;
                      })()}
                    </div>

                    {/* Event Details */}
                    <CardContent className="p-6">
                      <h3 className="text-xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                        {event.title}
                      </h3>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {new Date(event.start_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="line-clamp-1">{event.location}</span>
                        </div>

                        {event.organizer && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="w-4 h-4 flex-shrink-0" />
                            <span className="line-clamp-1">{event.organizer}</span>
                          </div>
                        )}
                      </div>

                      {hasTickets && event.min_price && (
                        <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                          <p className="text-xs text-muted-foreground">From</p>
                          <p className="text-2xl font-bold text-primary">€{event.min_price.toFixed(2)}</p>
                        </div>
                      )}

                      <Button
                        variant={hasTickets ? "hero" : "outline"}
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBuyTickets(event.id, hasTickets);
                        }}
                      >
                        {hasTickets ? (
                          <>
                            <ShoppingBag className="w-4 h-4 mr-2" />
                            View Tickets
                          </>
                        ) : (
                          'Sell Your Ticket'
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Actionable Empty State */}
          {!loading && !error && filteredEvents.length === 0 && (
            <div className="text-center py-12 max-w-lg mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No events found</h3>
              <p className="text-muted-foreground mb-6">
                Try adjusting your search or filters — or take action below.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="hero"
                  onClick={() => navigate("/marketplace")}
                  className="gap-2"
                  aria-label="View events with available tickets"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Events with tickets
                </Button>
                <Button
                  variant="outline"
                  onClick={handleNotifyMe}
                  className="gap-2"
                  aria-label="Get notified when tickets are listed"
                >
                  <Bell className="w-4 h-4" />
                  Notify me
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/sell")}
                  className="gap-2"
                  aria-label="List your ticket for sale"
                >
                  <Tag className="w-4 h-4" />
                  List your ticket
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EventsCatalog;
