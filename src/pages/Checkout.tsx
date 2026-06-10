import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  Calendar,
  MapPin,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEventImage } from "@/lib/eventImages";

const PLATFORM_FEE_PERCENT = 6;

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
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");
  const agreedPriceParam = searchParams.get("agreed_price");
  const agreedPrice = agreedPriceParam ? parseFloat(agreedPriceParam) : null;

  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Negotiated price from an accepted offer (auto-detected below). Takes
  // precedence over the listing price so the displayed total matches what the
  // server charges, no matter how the buyer reached this page.
  const [offerPrice, setOfferPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      const next = `/checkout${window.location.search}`;
      navigate(`/auth?next=${encodeURIComponent(next)}`);
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

  // Auto-detect the buyer's accepted offer for this listing (mirrors the server,
  // which charges this price regardless of the URL).
  useEffect(() => {
    if (!listingId || !user) return;
    let active = true;
    // offers/conversations aren't in the generated Supabase types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("offers")
      .select("price, conversation:conversations!inner(ticket_id, buyer_id)")
      .eq("status", "accepted")
      .eq("conversations.ticket_id", listingId)
      .eq("conversations.buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { price: number } | null }) => {
        if (active && data && Number.isFinite(data.price)) setOfferPrice(data.price);
      });
    return () => {
      active = false;
    };
  }, [listingId, user]);

  // --- Loading ---
  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
        <Header />
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 max-w-2xl">
            <Skeleton className="h-9 w-24 mb-6" />
            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* Event banner skeleton */}
                <div className="flex gap-4 items-start">
                  <Skeleton className="w-24 h-24 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                <Separator />
                {/* Pricing breakdown skeleton */}
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Separator />
                  <Skeleton className="h-8 w-1/2 ml-auto" />
                </div>
                {/* CTA skeleton */}
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          </div>
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
                <Button onClick={() => navigate("/marketplace")}>
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
  // Accepted offer (auto-detected) wins, then a URL hint, then the listing price.
  const event = listing.event;
  const negotiatedPrice = offerPrice ?? agreedPrice;
  const unitPrice = negotiatedPrice ?? listing.selling_price;
  const subtotal = unitPrice * listing.quantity;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_PERCENT) / 100;
  const total = subtotal + platformFee;

  const formattedDate = new Date(event.date).toLocaleDateString(
    language === "fr" ? "fr-FR" : "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );

  const isDev = import.meta.env.DEV;

  // --- Dev: simulate purchase without Stripe ---
  const handleSimulate = async () => {
    if (!user || !listingId) return;
    setIsProcessing(true);
    setPaymentError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { navigate("/auth"); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-simulate-purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ listingId, ...(agreedPrice ? { agreedPrice } : {}) }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setPaymentError(data.error ?? "Simulation failed"); return; }
      navigate(`/checkout/success?session_id=dev_${data.transactionId}`);
    } catch {
      setPaymentError("Network error.");
    } finally {
      setIsProcessing(false);
    }
  };

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
        navigate(`/auth?next=${encodeURIComponent(`/checkout${window.location.search}`)}`);
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
          body: JSON.stringify({ listingId, ...(agreedPrice ? { agreedPrice } : {}) }),
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
                {negotiatedPrice && negotiatedPrice !== listing.selling_price && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md mb-2">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      Negotiated price: €{negotiatedPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Original listing: €{listing.selling_price.toFixed(2)}
                    </p>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {listing.quantity} ticket{listing.quantity > 1 ? "s" : ""} x €{unitPrice.toFixed(2)}
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
              {isDev ? (
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  onClick={handleSimulate}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    "[DEV] Simulate Purchase — skip Stripe"
                  )}
                </Button>
              ) : (
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
              )}

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                {isDev ? "Dev mode — Stripe disabled" : "Secure payment powered by Stripe"}
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
