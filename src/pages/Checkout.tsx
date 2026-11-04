import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CreditCard,
  Calendar,
  MapPin,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SellerTrust } from "@/components/SellerTrust";
import { calcBreakdown, buyerFeeRateFor } from "@/lib/fees";
import { authPathHere } from "@/lib/returnTo";
import { useResaleListing } from "@/hooks/useResaleListings";

/** Shown when someone else holds the listing at checkout (also the server's 409 RESERVED message). */
const RESERVED_MESSAGE =
  "Someone is checking out this ticket right now. If they don't complete, it comes back within 35 minutes.";
const PRICE_CHANGED_MESSAGE = "The price of this ticket just changed. We've updated it below.";

const Checkout = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  // listing_id from the site's own links; listing from older links and emails.
  const listingId = searchParams.get("listing_id") ?? searchParams.get("listing");
  // Back from a Stripe page the buyer left: their own reservation may still be in place, and the server
  // hands it back to them, so paying again is allowed.
  const cameBackFromStripe = searchParams.get("checkout") === "cancelled";
  const agreedPriceParam = searchParams.get("agreed_price");
  const agreedPrice = agreedPriceParam ? parseFloat(agreedPriceParam) : null;

  // Read through the resale_listings function: still returned while reserved (isReserved), not once sold.
  const { data: listing = null, isLoading: loading, isError, refetch } = useResaleListing(listingId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Negotiated price from an accepted offer (auto-detected below). Takes
  // precedence over the listing price so the displayed total matches what the
  // server charges, no matter how the buyer reached this page.
  const [offerPrice, setOfferPrice] = useState<number | null>(null);
  // Guest checkout — no account required. Only used when !user.
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const toldCancelled = useRef(false);
  useEffect(() => {
    if (cameBackFromStripe && !toldCancelled.current) {
      toldCancelled.current = true;
      toast("Payment cancelled.");
    }
  }, [cameBackFromStripe]);

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
  if ((loading && !!listingId) || authLoading) {
    return (
      <div className="theme-night min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
        <HeaderNight />
        <main className="flex-1 pt-16 pb-12 md:pt-20">
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
  if (!listingId || isError || !listing) {
    return (
      <div className="theme-night min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="common.error" descriptionKey="common.error" />
        <HeaderNight />
        <main className="flex-1 pt-16 pb-12 md:pt-20">
          <div className="container mx-auto px-4 max-w-2xl">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground mb-4">
                  {isError ? "Couldn't load this ticket." : "This ticket is no longer available."}
                </p>
                {isError ? (
                  <Button onClick={() => void refetch()}>Try again</Button>
                ) : (
                  <Button onClick={() => navigate("/marketplace/buy")}>
                    Browse Tickets
                  </Button>
                )}
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
  const listingPrice = listing.priceCents / 100;
  const unitPrice = negotiatedPrice ?? listingPrice;
  // Buyer fee from src/lib/fees.ts, the same rounding as the server.
  const bd = calcBreakdown(unitPrice, listing.quantity);
  const subtotal = bd.listPriceEuros;
  const platformFee = bd.buyerFeeEuros;
  const total = bd.buyerTotalEuros;
  const feePercent = Math.round(buyerFeeRateFor(unitPrice) * 100);

  const formattedDate = event.date
    ? new Date(event.date).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  // Someone else is paying for it right now. The buyer coming back from their own Stripe page may retry:
  // the server gives a buyer's own reservation back to them.
  const blockedByReservation = listing.isReserved && !cameBackFromStripe;
  const payDisabled = isProcessing || listing.isOwn || blockedByReservation;

  // --- Stripe Checkout — no account required (guest checkout) ---
  const handleCheckout = async () => {
    if (!listingId) return;
    if (!user) {
      if (!guestName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
        setPaymentError("Please enter your name and a valid email address.");
        return;
      }
    }
    setIsProcessing(true);
    setPaymentError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          toast.error("Session expired. Please log in again.");
          navigate(authPathHere());
          return;
        }
        headers.Authorization = `Bearer ${token}`;
      }

      // Resale is paid through Stripe: the money waits on Ticket Safe's account
      // and the seller is paid out after the event (stripe-connect-payout-cron).
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-resale-checkout`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            listingId,
            ...(agreedPrice ? { agreedPrice } : {}),
            ...(user ? {} : { guest: { name: guestName.trim(), email: guestEmail.trim() } }),
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const code = typeof data?.code === "string" ? data.code : null;
        if (code === "RESERVED") {
          setPaymentError(RESERVED_MESSAGE);
          void refetch();
        } else if (code === "PRICE_CHANGED") {
          setPaymentError(PRICE_CHANGED_MESSAGE);
          void refetch();
        } else {
          setPaymentError(data?.error ?? "Failed to start checkout. Please try again.");
        }
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
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <HeaderNight />
      <main className="flex-1 pt-16 pb-12 md:pt-20">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <Card className="overflow-hidden">
            {/* Event image */}
            {event.bannerUrl ? (
              <img
                src={event.bannerUrl}
                alt={event.title}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-muted flex items-center justify-center p-4">
                <span className="text-sm font-medium text-muted-foreground text-center line-clamp-3">
                  {event.title}
                </span>
              </div>
            )}

            <CardContent className="p-6 space-y-5">
              {/* Event info */}
              <div>
                <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
                {listing.tierName && <p className="text-sm text-foreground/80 mb-2">{listing.tierName}</p>}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {formattedDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formattedDate}
                    </div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      {event.location}
                    </div>
                  )}
                </div>
              </div>

              {/* Seller trust panel — name, verified student, sales, escrow. */}
              <SellerTrust listingId={listing.id} />

              <Separator />

              {/* Guest checkout — no account required. Your ticket + receipt
                  go straight to this email. */}
              {!user && (
                <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Your details
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="guest-name">Full name</Label>
                      <Input
                        id="guest-name"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Jamie Smith"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="guest-email">Email</Label>
                      <Input
                        id="guest-email"
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    No account needed — your ticket and receipt go straight to this email.
                  </p>
                </div>
              )}

              {/* Order summary */}
              <div className="space-y-2">
                {negotiatedPrice && negotiatedPrice !== listingPrice && (
                  <div className="p-3 bg-success/10 border border-success/30 rounded-md mb-2">
                    <p className="text-sm font-medium text-success">
                      Negotiated price: €{negotiatedPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-success/80">
                      Original listing: €{listingPrice.toFixed(2)}
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
                  <span className="text-muted-foreground">Service fee ({feePercent}%)</span>
                  <span>€{platformFee.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">€{total.toFixed(2)}</span>
                </div>
              </div>

              {listing.isOwn && (
                <Alert>
                  <AlertDescription>This is your listing. You can change or remove it in My listings.</AlertDescription>
                </Alert>
              )}
              {blockedByReservation && !paymentError && (
                <Alert>
                  <Clock className="w-4 h-4" />
                  <AlertDescription>{RESERVED_MESSAGE}</AlertDescription>
                </Alert>
              )}

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
                disabled={payDisabled}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Redirecting to secure payment…
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
                Secure payment by Stripe · card, Apple Pay, Google Pay
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
