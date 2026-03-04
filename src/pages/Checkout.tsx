import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings } from "@/contexts/TicketListingsContext";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PLATFORM_FEE_PERCENT = 5;

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");
  const { listings } = useTicketListings();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const listing = listings.find((l) => l.id === listingId);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // ---- loading / error states -------------------------------------------

  if (!listingId || (!authLoading && !listing)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.error" descriptionKey="common.error" />
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  No listing selected or it is no longer available.
                </p>
                <Button
                  onClick={() => navigate("/marketplace/buy")}
                  className="mt-4"
                >
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
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading ticket details…</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ---- amounts -----------------------------------------------------------

  const event = listing.event;
  const subtotal = listing.sellingPrice * listing.quantity;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_PERCENT) / 100;
  const totalAmount = subtotal + platformFee;

  const formatDate = () => {
    const start = new Date(event.date);
    const opts: Intl.DateTimeFormatOptions = {
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    if (event.endDate) {
      const end = new Date(event.endDate);
      return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
    }
    return start.toLocaleDateString("en-US", opts);
  };

  // ---- Stripe Checkout redirect ------------------------------------------

  const handleStripeCheckout = async () => {
    if (!user || !listingId) return;
    setIsProcessing(true);
    setPaymentError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ listingId }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setPaymentError(
          data.error ?? "Failed to start checkout. Please try again."
        );
        return;
      }

      // Redirect to Stripe-hosted Checkout page
      window.location.href = data.checkout_url;
    } catch {
      setPaymentError("Network error. Please check your connection and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---- render ------------------------------------------------------------

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
              <p className="text-muted-foreground">
                Review your order and proceed to secure payment
              </p>
            </div>

            {/* ---- Event / Ticket Details ---- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TicketIcon className="w-5 h-5" />
                  Ticket Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {event.image && (
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}

                <div>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="text-2xl font-bold">{event.title}</h2>
                    {listing.verified && (
                      <Badge className="bg-green-100 text-green-800 border-green-200 shrink-0">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>

                  {event.description && (
                    <p className="text-muted-foreground text-sm mb-4">
                      {event.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{formatDate()}</span>
                      {event.time && (
                        <span className="text-muted-foreground">
                          · Starting at {event.time}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Order summary */}
                <div className="space-y-3">
                  <h3 className="font-semibold">Order Summary</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price per ticket</span>
                    <span className="font-medium">
                      €{listing.sellingPrice.toFixed(2)}
                    </span>
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
                    <span className="text-muted-foreground">
                      Platform fee ({PLATFORM_FEE_PERCENT}%)
                    </span>
                    <span className="font-medium">€{platformFee.toFixed(2)}</span>
                  </div>
                  {listing.description && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <span className="font-medium">Seller note:</span>{" "}
                      {listing.description}
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">€{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ---- Payment ---- */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Secure Payment
                </CardTitle>
                <CardDescription>
                  You'll be redirected to Stripe's secure checkout page to
                  complete your purchase.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary box */}
                <div className="p-5 bg-muted/50 rounded-lg space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Event</span>
                      <span className="font-medium">{event.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Seller</span>
                      <span className="font-medium">{listing.sellerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-bold text-primary text-lg">
                        €{totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-900 dark:text-blue-100 flex items-start gap-1.5">
                      <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                      Your card details are never shared with us. All payments are
                      processed securely by Stripe, a PCI-DSS Level 1 certified
                      payment processor.
                    </p>
                  </div>
                </div>

                {/* Error message */}
                {paymentError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{paymentError}</AlertDescription>
                  </Alert>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate("/marketplace/buy")}
                    disabled={isProcessing}
                  >
                    Back to Marketplace
                  </Button>
                  <Button
                    variant="hero"
                    className="flex-1"
                    onClick={handleStripeCheckout}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Pay €{totalAmount.toFixed(2)} with Stripe
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  🔒 Powered by Stripe · No card data touches our servers
                </p>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  By completing this purchase, you agree to our{' '}
                  <a href="/terms" className="text-primary hover:underline">Terms & Conditions</a>
                  {' '}and{' '}
                  <a href="/refund-policy" className="text-primary hover:underline">Refund Policy</a>
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
