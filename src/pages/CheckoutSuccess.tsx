/**
 * CheckoutSuccess
 *
 * Shown after a successful Stripe Checkout payment.
 * URL: /checkout/success?session_id=<stripe_session_id>
 *
 * The webhook (checkout.session.completed) already updated the DB,
 * so this page is purely informational.
 */

import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, Mail, Ticket } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";

/**
 * Fire a brand-blue confetti burst on mount. Loaded from esm.sh at runtime
 * so canvas-confetti never ships in the bundle — non-buyers never pay the
 * ~5 KB cost. Silent-fail on network errors: the page still works, the
 * user just doesn't see the celebration.
 */
async function fireConfetti(): Promise<void> {
  try {
    const mod = await import(
      /* @vite-ignore */ "https://esm.sh/canvas-confetti@1.9.3"
    );
    const confetti = (mod as { default?: (opts: unknown) => void }).default
      ?? (mod as unknown as (opts: unknown) => void);
    const colours = ["#003399", "#0066cc", "#3b82f6", "#1d4ed8", "#ffffff"];
    // Three timed bursts: a big one straight up, then two from the sides
    // for a "fountain" feel. Matches the Stripe / Pretix success vibe.
    confetti({
      particleCount: 60,
      spread: 70,
      startVelocity: 35,
      origin: { x: 0.5, y: 0.4 },
      colors: colours,
      scalar: 0.9,
    });
    setTimeout(() => {
      confetti({
        particleCount: 35,
        angle: 60,
        spread: 55,
        startVelocity: 30,
        origin: { x: 0.05, y: 0.6 },
        colors: colours,
        scalar: 0.85,
      });
      confetti({
        particleCount: 35,
        angle: 120,
        spread: 55,
        startVelocity: 30,
        origin: { x: 0.95, y: 0.6 },
        colors: colours,
        scalar: 0.85,
      });
    }, 250);
  } catch {
    // Network or browser blocked — silent fail, success state still works.
  }
}

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();
  // session_id is available if needed for future order lookup
  const _sessionId = searchParams.get("session_id");

  useEffect(() => {
    // Skip celebration for prefers-reduced-motion users
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    void fireConfetti();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <div className="mb-4 text-left">
            <BackButton fallbackPath="/my-tickets" />
          </div>
          {/* Check icon with branded halo. animate-in scales it up on mount
              so the moment lands with motion, not a static badge. */}
          <div className="relative w-24 h-24 mx-auto mb-7 animate-in zoom-in-50 duration-500 ease-out">
            <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-10 h-10" strokeWidth={2.5} />
            </div>
          </div>

          <div className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Payment confirmed
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            You're in!
          </h1>

          <p className="text-base md:text-lg text-foreground/85 mb-2">
            Your ticket purchase is complete.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            A receipt is on its way by email. Your tickets are already in your account.
          </p>

          {/* Quick "what's next" tile */}
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6 text-left shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              What's next
            </div>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground/85">
                  Check your inbox — your QR ticket is included as a scannable image and a PDF.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Ticket className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground/85">
                  Open <span className="font-semibold">My tickets</span> anytime to re-display the QR at the door.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="hero" asChild className="h-11 text-base font-semibold">
              <Link to="/my-tickets">Show my QR ticket</Link>
            </Button>
            <Button variant="outline" asChild className="h-11">
              <Link to="/tickets">Browse more events</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CheckoutSuccess;
