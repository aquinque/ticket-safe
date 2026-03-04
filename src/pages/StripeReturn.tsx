/**
 * StripeReturn
 *
 * Landing page after the seller completes (or abandons) Stripe onboarding.
 * Stripe redirects here via the return_url set in accountLinks.create().
 *
 * We call stripe-account-status to get the freshest state, then show:
 *  - Success  : charges enabled → ready to receive payouts
 *  - Pending  : details submitted but not yet approved (review in progress)
 *  - Incomplete: seller didn't finish → offer to restart onboarding
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AccountStatus {
  has_account: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: "pending" | "restricted" | "complete";
}

const StripeReturn = () => {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-account-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setStatus(data);
      } catch {
        toast.error("Could not retrieve account status. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [user, authLoading]);

  const handleRestartOnboarding = async () => {
    setOnboardingLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-onboard-seller`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Failed to restart onboarding.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setOnboardingLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 flex items-center justify-center py-16">
        <div className="container mx-auto px-4 max-w-lg">
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p>Checking your account status…</p>
            </div>
          ) : status?.charges_enabled ? (
            /* ---- FULLY ENABLED ---- */
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h1 className="text-3xl font-bold mb-4">Payments Activated!</h1>
              <p className="text-muted-foreground mb-8">
                Your Stripe account is fully set up. You can now list tickets and
                receive payouts automatically when a sale completes.
              </p>
              <Button variant="hero" size="lg" asChild>
                <Link to="/marketplace/sell">List Your First Ticket</Link>
              </Button>
            </div>
          ) : status?.details_submitted ? (
            /* ---- UNDER REVIEW ---- */
            <div className="text-center">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="w-10 h-10 text-amber-600" />
              </div>
              <h1 className="text-3xl font-bold mb-4">Review in Progress</h1>
              <p className="text-muted-foreground mb-8">
                Stripe is verifying your information. This typically takes a few
                minutes to a couple of hours. You can already list tickets — payouts
                will activate automatically once approved.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="hero" asChild>
                  <Link to="/marketplace/sell">List a Ticket</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            /* ---- INCOMPLETE / NOT STARTED ---- */
            <Card>
              <CardHeader>
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-orange-600" />
                </div>
                <CardTitle>Setup Incomplete</CardTitle>
                <CardDescription>
                  You didn't finish the Stripe onboarding. You need to complete it
                  before you can receive payments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="hero"
                  className="w-full"
                  onClick={handleRestartOnboarding}
                  disabled={onboardingLoading}
                >
                  {onboardingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link to="/marketplace/sell">Do It Later</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default StripeReturn;
