import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, CreditCard, Calendar, MapPin, Ticket as TicketIcon, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings } from "@/contexts/TicketListingsContext";
import { Badge } from "@/components/ui/badge";
import { mockRevolutPayment } from "@/lib/revolutPayment";
import { toast } from "sonner";

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");
  const { listings } = useTicketListings();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const listing = listings.find(l => l.id === listingId);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (!listingId || (!authLoading && !listing)) {
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

  if (authLoading || !listing) {
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

  const event = listing.event;
  const subtotal = listing.sellingPrice * listing.quantity;
  const platformFee = subtotal * 0.05;
  const totalAmount = subtotal + platformFee;

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

  const handleRevolutPayment = async () => {
    if (!user || !listing) return;

    setIsProcessingPayment(true);

    try {
      toast.loading('Processing payment with Revolut...', { id: 'payment' });

      // In production, this will redirect to Revolut checkout
      const result = await mockRevolutPayment(
        totalAmount,
        `Ticket purchase: ${event.title} - ${listing.quantity} ticket(s)`
      );

      if (result.success) {
        toast.success('Payment successful!', { id: 'payment' });

        // Here you would:
        // 1. Mark the listing as sold
        // 2. Transfer tickets to buyer
        // 3. Initiate payout to seller

        setTimeout(() => {
          navigate('/profile?tab=tickets');
        }, 1500);
      }
    } catch (error) {
      toast.error('Payment failed. Please try again.', { id: 'payment' });
      console.error('Payment error:', error);
    } finally {
      setIsProcessingPayment(false);
    }
  };

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
              <h1 className="text-4xl font-bold mb-2">Checkout</h1>
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
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-48 object-cover rounded-lg"
                />

                <div>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="text-2xl font-bold">{event.title}</h2>
                    {listing.verified && (
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">{event.description}</p>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{formatDateRange()}</span>
                      <span className="text-muted-foreground">• Starting at {event.time}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="font-semibold">Order Summary</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price per ticket</span>
                    <span className="font-medium">€{listing.sellingPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Quantity</span>
                    <span className="font-medium">{listing.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">€{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Platform fee (5%)</span>
                    <span className="font-medium">€{platformFee.toFixed(2)}</span>
                  </div>
                  {listing.description && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <span className="font-medium">Seller note:</span> {listing.description}
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
                  Secure Payment with Revolut
                </CardTitle>
                <CardDescription>
                  Complete your purchase securely through Revolut
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-6 bg-muted/50 rounded-lg space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <CreditCard className="w-8 h-8 text-primary" />
                    <div className="text-left">
                      <h3 className="font-semibold text-lg">Revolut Payment</h3>
                      <p className="text-sm text-muted-foreground">
                        Fast, secure, and trusted by millions
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Event:</span>
                      <span className="font-medium">{event.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Seller:</span>
                      <span className="font-medium">{listing.sellerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Amount:</span>
                      <span className="font-bold text-primary text-lg">€{totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-900 dark:text-blue-100">
                      <ShieldCheck className="w-4 h-4 inline mr-1" />
                      Your payment is protected by Revolut's advanced security features
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/marketplace/buy")}
                    disabled={isProcessingPayment}
                  >
                    Back to Marketplace
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={handleRevolutPayment}
                    disabled={isProcessingPayment}
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Pay with Revolut
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  🔒 Secure payment powered by Revolut
                </p>
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
