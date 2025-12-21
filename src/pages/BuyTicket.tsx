import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, CreditCard, ShieldCheck, FileImage } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings } from "@/contexts/TicketListingsContext";

const BuyTicket = () => {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const { listings } = useTicketListings();

  const listing = listings.find(l => l.id === listingId);

  useEffect(() => {
    if (!listingId || !listing) {
      navigate("/marketplace/buy");
    }
  }, [listingId, listing, navigate]);

  if (!listing) {
    return null;
  }

  const event = listing.event;
  const totalPrice = listing.sellingPrice * listing.quantity;
  const platformFee = totalPrice * 0.05;
  const finalPrice = totalPrice + platformFee;

  const formatDateRange = () => {
    const startDate = new Date(event.date);
    const endDate = event.endDate ? new Date(event.endDate) : null;

    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };

    if (endDate) {
      return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    }
    return startDate.toLocaleDateString('en-US', options);
  };

  const handleProceedToCheckout = () => {
    navigate(`/checkout?listing_id=${listingId}`);
  };

  return (
    <>
      <SEOHead titleKey="nav.buyTickets" descriptionKey="hero.subtitle" />
      <Header />
      <main className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Event Image */}
            <div className="relative h-80 md:h-auto rounded-xl overflow-hidden">
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4">
                <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                  {event.category}
                </span>
              </div>
              {listing.verified && (
                <div className="absolute top-4 left-4">
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    Verified Ticket
                  </Badge>
                </div>
              )}
            </div>

            {/* Ticket Details & Purchase */}
            <div className="flex flex-col">
              <div className="mb-6">
                <h1 className="text-3xl font-bold mb-4">{event.title}</h1>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-3 text-muted-foreground">
                    <Calendar className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Date</p>
                      <p>{formatDateRange()}</p>
                      <p className="text-sm">Starting at {event.time}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-muted-foreground">
                    <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Location</p>
                      <p>{event.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-muted-foreground">
                    <Users className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Seller</p>
                      <p>{listing.sellerName}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">About this event</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {event.description}
                  </p>

                  {listing.description && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <h4 className="font-semibold text-sm mb-1">Seller's note</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {listing.description}
                      </p>
                    </div>
                  )}
                </div>

                {listing.files && listing.files.length > 0 && (
                  <div className="bg-muted/50 p-4 rounded-lg mb-6">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <FileImage className="w-4 h-4" />
                      Ticket Photos
                    </h3>
                    <div className="space-y-2">
                      {listing.files.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileImage className="w-4 h-4" />
                          <span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Price & Payment */}
              <Card className="p-6 mt-auto">
                <div className="space-y-3 mb-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">Price per ticket</span>
                    <span className="text-lg font-semibold">
                      €{listing.sellingPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="text-lg font-semibold">
                      {listing.quantity}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-lg font-semibold">
                      €{totalPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground text-sm">Platform fee (5%)</span>
                    <span className="text-sm font-medium">
                      €{platformFee.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-border">
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="text-3xl font-bold text-primary">
                        €{finalPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-6">
                  {listing.verified
                    ? "This is a verified authentic ticket from a trusted seller."
                    : "Price includes platform fees and secure payment processing."}
                </p>

                <Button
                  size="lg"
                  className="w-full"
                  variant="hero"
                  onClick={handleProceedToCheckout}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Proceed to Checkout
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  Secure payment powered by Revolut
                </p>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default BuyTicket;
