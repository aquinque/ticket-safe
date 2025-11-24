import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, CreditCard, Calendar, MapPin, Ticket as TicketIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch ticket listing details
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ["ticket-listing", listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", listingId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!listingId,
  });

  // Fetch event details
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event", listing?.event_id],
    queryFn: async () => {
      if (!listing?.event_id) return null;
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", listing.event_id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!listing?.event_id,
  });

  const isLoading = authLoading || listingLoading || eventLoading;

  if (!listingId || (!isLoading && !listing)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.error" descriptionKey="common.error" />
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No listing selected</p>
                <Button onClick={() => navigate("/marketplace/buy")} className="mt-4">
                  Back to Marketplace
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
        <Header />
        <main className="flex-1 py-12 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading ticket details...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const totalAmount = listing.selling_price * listing.quantity;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-4xl font-bold mb-2">Buy Tickets</h1>
              <p className="text-muted-foreground">Review your order and proceed to payment</p>
            </div>

            {/* Event Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TicketIcon className="w-5 h-5" />
                  Event Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {event?.image_url && (
                  <img 
                    src={event.image_url} 
                    alt={event.title}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}
                
                <div>
                  <h2 className="text-2xl font-bold mb-2">{event?.title}</h2>
                  <p className="text-muted-foreground text-sm mb-4">{event?.description}</p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{event?.date ? format(new Date(event.date), "PPP") : "Date TBA"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{event?.location}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="font-semibold">Order Summary</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price per ticket</span>
                    <span className="font-medium">€{listing.selling_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="font-medium">{listing.quantity}</span>
                  </div>
                  {listing.notes && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <span className="font-medium">Seller note:</span> {listing.notes}
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total Amount</span>
                    <span className="text-primary">€{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Payment (Stripe Integration Coming Soon)
                </CardTitle>
                <CardDescription>
                  Secure payment processing will be available soon
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-6 bg-muted/50 rounded-lg text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Ready for Stripe Integration</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This page is prepared for secure payment processing. Once Stripe is integrated,
                      buyers will complete their purchase here.
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Event ID: {event?.id}</p>
                      <p>Listing ID: {listing.id}</p>
                      <p>Amount: €{totalAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/marketplace/buy")}
                  >
                    Back to Marketplace
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={() => {
                      // Placeholder - will integrate Stripe here
                      navigate("/profile");
                    }}
                  >
                    Proceed to Payment
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Checkout;
