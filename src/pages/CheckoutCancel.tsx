/**
 * CheckoutCancel
 *
 * Shown when the buyer cancels the Stripe Checkout session.
 * URL: /checkout/cancel?listing_id=<ticket_id>
 *
 * The webhook (checkout.session.expired) will revert the listing back
 * to 'available' once the 30-minute session window expires.
 * The "Try Again" button lets the buyer restart immediately.
 */

import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

const CheckoutCancel = () => {
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get("listing_id");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 flex items-center justify-center py-16">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-600" />
          </div>

          <h1 className="text-3xl font-bold mb-4">Payment Cancelled</h1>

          <p className="text-muted-foreground mb-8">
            Your payment was cancelled and no charge was made. The ticket may
            still be available — check the marketplace.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {listingId && (
              <Button variant="hero" asChild>
                <Link to={`/checkout?listing_id=${listingId}`}>Try Again</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/marketplace/buy">Back to Marketplace</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutCancel;
