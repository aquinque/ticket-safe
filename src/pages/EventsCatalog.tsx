import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, MapPin, Users, ShoppingBag } from "lucide-react";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/SEOHead";

const EventsCatalog = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

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
    return matchesSearch && matchesFilter;
  });

  const handleEventClick = (eventId: string) => {
    navigate(`/event/${eventId}`);
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
                onClick={() => navigate("/events")}
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

                <div className="flex flex-wrap gap-2">
                  {filters.map((filter) => (
                    <Button
                      key={filter.id}
                      variant={selectedFilter === filter.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedFilter(filter.id)}
                      className="rounded-full"
                    >
                      {filter.label}
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
                    <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
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

          {/* No Results */}
          {!loading && !error && filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No events found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EventsCatalog;
