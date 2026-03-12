import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, User, ShoppingCart, Info, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { getEventImage } from "@/lib/eventImages";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateConversation } from "@/hooks/useChat";
import { toast } from "sonner";

interface EventInfo {
  id: string;
  title: string;
  date: string;
  location: string | null;
  category: string;
  image_url: string | null;
}

interface Listing {
  id: string;
  seller_id: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  created_at: string;
  seller: { full_name: string } | null;
}

const EventTicketsMarketplace = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!eventId) return;

    async function fetchData() {
      setLoading(true);

      // Fetch event directly by ID (no base_price / is_active filter)
      const { data: eventData, error: eventErr } = await supabase
        .from("events")
        .select("id, title, date, location, category, image_url")
        .eq("id", eventId)
        .single();

      if (eventErr || !eventData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(eventData as EventInfo);

      // Fetch available tickets for this event directly
      const { data: ticketData, error: ticketErr } = await supabase
        .from("tickets")
        .select("id, seller_id, selling_price, quantity, notes, created_at, seller:profiles(full_name)")
        .eq("event_id", eventId)
        .in("status", ["available", "reserved"])
        .order("created_at", { ascending: false });

      if (ticketErr) console.error("Ticket fetch error:", ticketErr);
      setListings((ticketData as unknown as Listing[]) ?? []);
      setLoading(false);
    }

    fetchData();
  }, [eventId]);

  const handleBuyTicket = (listingId: string) => {
    navigate(`/checkout?listing_id=${listingId}`);
  };

  const handleMakeOffer = async (listing: Listing) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (user.id === listing.seller_id) {
      toast.error("You can't make an offer on your own ticket");
      return;
    }
    try {
      const convId = await getOrCreateConversation(listing.id, user.id, listing.seller_id);
      navigate(`/messages/${convId}`);
    } catch {
      toast.error("Failed to start conversation");
    }
  };

  if (loading) {
    return (
      <>
        <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
        <Header />
        <main className="min-h-screen bg-background py-8">
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
        <Header />
        <main className="min-h-screen bg-background py-8">
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
      <Header />
      <main className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Event Header */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="relative w-full md:w-64 h-40 md:h-48 rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={getEventImage(event.image_url, event.category)}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
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
                      {new Date(event.date).toLocaleDateString('en-US', {
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

          {/* Make an offer hint */}
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <MessageSquare className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-primary/90">
              <span className="font-semibold">Not happy with the price?</span> Use <span className="font-semibold">"Make an Offer"</span> on any listing to chat directly with the seller and negotiate.
            </p>
          </div>

          {/* Listings */}
          {listings.length === 0 ? (
            <Alert className="max-w-2xl mx-auto">
              <Info className="w-4 h-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">No tickets available yet</p>
                <p className="text-sm text-muted-foreground">
                  Be the first to list your ticket for this event, or check back later for new listings.
                </p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map(listing => (
                <Card key={listing.id} className="overflow-hidden hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-0">
                    {/* Ticket Header */}
                    <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 border-b">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">
                            {listing.quantity} ticket{listing.quantity > 1 ? 's' : ''}
                          </Badge>
                          </div>
                      </div>

                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Price per ticket</p>
                        <p className="text-4xl font-bold text-primary">€{(listing.selling_price ?? 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Ticket Details */}
                    <div className="p-6 space-y-4">
                      {/* Seller Info */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">Sold by</p>
                          <p className="font-semibold truncate">{listing.seller?.full_name ?? "Anonymous"}</p>
                        </div>
                      </div>

                      {/* Notes */}
                      {listing.notes && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm line-clamp-3">{listing.notes}</p>
                        </div>
                      )}

                      {/* Posted Time */}
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Listed {new Date(listing.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        <Button
                          variant="hero"
                          size="lg"
                          className="w-full"
                          onClick={() => handleBuyTicket(listing.id)}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Buy Now
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full border-primary/40 text-primary hover:bg-primary/5 hover:border-primary"
                          onClick={() => handleMakeOffer(listing)}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Make an Offer — Chat with Seller
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default EventTicketsMarketplace;
