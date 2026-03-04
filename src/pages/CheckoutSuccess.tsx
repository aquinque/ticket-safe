/**
 * CheckoutSuccess
 *
 * Shown after a successful Stripe Checkout payment.
 * URL: /checkout/success?session_id=<stripe_session_id>
 *
 * The webhook (checkout.session.completed) already updated the DB,
 * so this page is purely informational.
 */

import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();
  // session_id is available if needed for future order lookup
  const _sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 flex items-center justify-center py-16">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>

          <h1 className="text-3xl font-bold mb-4">Payment Confirmed!</h1>

          <p className="text-muted-foreground mb-2">
            Your ticket purchase is complete. A receipt has been sent to your
            email address by Stripe.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            The seller has been notified. Your ticket details will appear in your
            purchase history shortly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" asChild>
              <Link to="/settings/purchases">View My Tickets</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/marketplace/buy">Browse More Tickets</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutSuccess;
