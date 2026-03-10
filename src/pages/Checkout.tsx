import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  Calendar,
  MapPin,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEventImage } from "@/lib/eventImages";

const PLATFORM_FEE_PERCENT = 5;

interface ListingData {
  id: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  seller: { full_name: string } | null;
  event: {
    id: string;
    title: string;
    date: string;
    location: string | null;
    category: string;
    image_url: string | null;
  } | null;
}

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");

  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch the listing directly from Supabase
  useEffect(() => {
    if (!listingId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function fetchListing() {
      // Don't filter by status — the server handles availability when paying.
      // This prevents "not found" errors for tickets temporarily reserved.
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, selling_price, quantity, notes, status, seller:profiles(full_name), event:events(id, title, date, location, category, image_url)"
        )
        .eq("id", listingId)
        .not("status", "in", "(sold,cancelled)")
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setListing(data as unknown as ListingData);
      }
      setLoading(false);
    }

    fetchListing();
  }, [listingId]);

  // --- Loading ---
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
        <Header />
        <main className="flex-1 py-12 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  // --- Not found ---
  if (notFound || !listing || !listing.event) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.error" descriptionKey="common.error" />
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground mb-4">
                  This ticket is no longer available.
                </p>
                <Button onClick={() => navigate("/events")}>
                  Browse Events
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // --- Amounts ---
  const event = listing.event;
  const subtotal = listing.selling_price * listing.quantity;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_PERCENT) / 100;
  const total = subtotal + platformFee;

  const formattedDate = new Date(event.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // --- Stripe Checkout ---
  const handleCheckout = async () => {
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
        setPaymentError(data.error ?? "Failed to start checkout. Please try again.");
        return;
      }

      window.location.href = data.checkout_url;
    } catch {
      setPaymentError("Network error. Please check your connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <Card className="overflow-hidden">
            {/* Event image */}
            <img
              src={getEventImage(event.image_url, event.category)}
              alt={event.title}
              className="w-full h-48 object-cover"
            />

            <CardContent className="p-6 space-y-5">
              {/* Event info */}
              <div>
                <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {formattedDate}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {event.location}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Order summary */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {listing.quantity} ticket{listing.quantity > 1 ? "s" : ""} x €{listing.selling_price.toFixed(2)}
                  </span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service fee ({PLATFORM_FEE_PERCENT}%)</span>
                  <span>€{platformFee.toFixed(2)}</span>
                </div>
                {listing.seller?.full_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sold by</span>
                    <span>{listing.seller.full_name}</span>
                  </div>
                )}
                {listing.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                    {listing.notes}
                  </p>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">€{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Error */}
              {paymentError && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{paymentError}</AlertDescription>
                </Alert>
              )}

              {/* Pay button */}
              <Button
                variant="hero"
                size="lg"
                className="w-full"
                onClick={handleCheckout}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Redirecting to Stripe…
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Pay €{total.toFixed(2)}
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                Secure payment powered by Stripe
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Checkout;
