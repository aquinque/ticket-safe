import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, User, ShoppingCart, FileImage, Info, ShieldCheck } from "lucide-react";
import { ESCPEvent, useESCPEvents } from "@/hooks/useESCPEvents";
import { useTicketListings } from "@/contexts/TicketListingsContext";
import { SEOHead } from "@/components/SEOHead";

const EventTicketsMarketplace = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { events } = useESCPEvents({ onlyWithTickets: true });
  const { listings } = useTicketListings();
  const [event, setEvent] = useState<ESCPEvent | null>(null);

  useEffect(() => {
    const foundEvent = events.find(e => e.id === eventId);
    if (foundEvent) {
      setEvent(foundEvent);
    } else if (events.length > 0) {
      navigate("/events");
    }
  }, [eventId, navigate, events]);

  if (!event) {
    return null;
  }

  // Filter listings for this specific event
  const eventListings = listings.filter(listing => listing.event.id === event.id);

  const handleBuyTicket = (listingId: string) => {
    // TODO: Navigate to checkout with listing details
    navigate(`/checkout`, { state: { listingId } });
  };

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
              <div className="relative w-full md:w-64 h-40 md:h-48 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-primary/20 to-primary/5">
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
                      {new Date(event.start_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{event.location}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Page Title */}
          <div className="mb-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Available Tickets</h2>
            <p className="text-muted-foreground">
              Browse tickets listed by verified students for this event
            </p>
          </div>

          {/* Listings */}
          {eventListings.length === 0 ? (
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
              {eventListings.map(listing => (
                <Card key={listing.id} className="overflow-hidden hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-0">
                    {/* Ticket Header */}
                    <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 border-b">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">
                            {listing.quantity} ticket{listing.quantity > 1 ? 's' : ''}
                          </Badge>
                          {listing.verified && (
                            <Badge variant="default" className="bg-green-600 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Verified
                            </Badge>
                          )}
                        </div>
                        {listing.files.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileImage className="w-3 h-3" />
                            <span>{listing.files.length}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-1">Price per ticket</p>
                        <p className="text-4xl font-bold text-primary">€{listing.sellingPrice.toFixed(2)}</p>
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
                          <p className="font-semibold truncate">{listing.sellerName}</p>
                        </div>
                      </div>

                      {/* Description */}
                      {listing.description && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm line-clamp-3">{listing.description}</p>
                        </div>
                      )}

                      {/* Posted Time */}
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Listed {new Date(listing.timestamp).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>

                      {/* Buy Button */}
                      <Button
                        variant="hero"
                        size="lg"
                        className="w-full"
                        onClick={() => handleBuyTicket(listing.id)}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Buy This Ticket
                      </Button>

                      {/* Photos Indicator */}
                      {listing.files.length > 0 && (
                        <div className="pt-4 border-t">
                          <p className="text-xs text-center text-muted-foreground">
                            Seller has attached {listing.files.length} photo{listing.files.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
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
