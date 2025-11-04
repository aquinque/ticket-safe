import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Calendar, ChevronDown, ChevronUp, Ticket } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";

interface TicketListing {
  id: string;
  event_id: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  seller_id: string;
  created_at: string;
}

const Buy = () => {
  const navigate = useNavigate();
  const { data: events, isLoading: eventsLoading } = useEvents();
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Fetch all available ticket listings
  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ["available-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TicketListing[];
    },
  });

  // Group tickets by event
  const eventListings = events?.map((event) => {
    const eventTickets = listings?.filter((t) => t.event_id === event.id) || [];
    const minPrice = eventTickets.length > 0 
      ? Math.min(...eventTickets.map((t) => t.selling_price))
      : event.base_price || 0;
    
    return {
      event,
      tickets: eventTickets,
      minPrice,
      totalAvailable: eventTickets.reduce((sum, t) => sum + t.quantity, 0),
    };
  }).filter((item) => item.totalAvailable > 0) || [];

  // Filter based on search and price
  const filteredListings = eventListings.filter((item) => {
    const matchesSearch = item.event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.event.location.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPrice = priceRange === "all" || 
                        (priceRange === "under20" && item.minPrice < 20) ||
                        (priceRange === "20to50" && item.minPrice >= 20 && item.minPrice <= 50) ||
                        (priceRange === "over50" && item.minPrice > 50);
    
    return matchesSearch && matchesPrice;
  });

  const toggleEventExpansion = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const handleBuyTicket = (listingId: string) => {
    // For now, show a toast - can integrate Stripe later
    navigate(`/checkout?listing_id=${listingId}`);
  };

  const isLoading = eventsLoading || listingsLoading;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="marketplace.buy.title" descriptionKey="marketplace.buy.description" />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Buy a Ticket</h1>
            <p className="text-lg text-muted-foreground">
              Browse available tickets from verified students
            </p>
          </div>

          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search events or venues..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={priceRange} onValueChange={setPriceRange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Price range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All prices</SelectItem>
                    <SelectItem value="under20">Under €20</SelectItem>
                    <SelectItem value="20to50">€20 - €50</SelectItem>
                    <SelectItem value="over50">Over €50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading tickets...</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredListings.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center">
                <Ticket className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No tickets available yet</h3>
                <p className="text-muted-foreground">
                  Check back soon or try adjusting your filters
                </p>
              </CardContent>
            </Card>
          )}

          {/* Event Listings */}
          <div className="space-y-4">
            {filteredListings.map((item) => (
              <Card key={item.event.id} className="overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  {/* Event Image */}
                  {item.event.image_url && (
                    <div className="md:w-48 h-48 md:h-auto bg-muted flex-shrink-0">
                      <img
                        src={item.event.image_url}
                        alt={item.event.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Event Info */}
                  <div className="flex-1">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-2xl mb-2">{item.event.title}</CardTitle>
                          <CardDescription className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {new Date(item.event.date).toLocaleDateString("en-US", {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{item.event.location}</span>
                            </div>
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="text-base px-3 py-1">
                          {item.event.category}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {item.totalAvailable} ticket{item.totalAvailable !== 1 ? "s" : ""} available from
                          </p>
                          <p className="text-2xl font-bold text-primary">
                            €{item.minPrice.toFixed(2)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => toggleEventExpansion(item.event.id)}
                          className="gap-2"
                        >
                          View tickets
                          {expandedEvents.has(item.event.id) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      {/* Expanded Ticket Listings */}
                      {expandedEvents.has(item.event.id) && (
                        <div className="space-y-3 pt-4 border-t">
                          {item.tickets.map((ticket) => (
                            <div
                              key={ticket.id}
                              className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="font-semibold text-lg">
                                    €{ticket.selling_price.toFixed(2)}
                                  </span>
                                  <Badge variant="outline">
                                    {ticket.quantity} available
                                  </Badge>
                                </div>
                                {ticket.notes && (
                                  <p className="text-sm text-muted-foreground">{ticket.notes}</p>
                                )}
                              </div>
                              <Button
                                variant="hero"
                                onClick={() => handleBuyTicket(ticket.id)}
                                className="ml-4"
                              >
                                Buy
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Buy;
