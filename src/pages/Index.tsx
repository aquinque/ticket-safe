import Header from "@/components/Header";
import Hero from "@/components/Hero";
import WhyTicketSafe from "@/components/WhyTicketSafe";
import EventsSection from "@/components/EventsSection";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, X, Rocket } from "lucide-react";
import { useState } from "react";

const Index = () => {
  const [showBanner, setShowBanner] = useState(true);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />

      {/* Announcement Banner */}
      {showBanner && (
        <div className="bg-primary text-primary-foreground py-2.5 px-4 relative">
          <div className="container mx-auto flex items-center justify-center gap-2 text-sm text-center">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong>Your data is safe with us.</strong> TicketSafe is now fully GDPR-compliant — your privacy and cookie preferences are always in your control.{" "}
              <Link to="/cookie-policy" className="underline underline-offset-2 hover:opacity-80 font-medium">
                Learn more
              </Link>
            </span>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:opacity-70 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Header />

      <main className="flex-1">
        <Hero />

        <WhyTicketSafe />
        <EventsSection />

        {/* ===== STUDIO TEASER — for organizers ===== */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div
              className="relative max-w-4xl mx-auto rounded-3xl p-8 md:p-12 overflow-hidden text-white"
              style={{ background: "var(--gradient-hero)" }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-2">
                    For organizers
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black mb-3 leading-tight">
                    Organizing an event at EBS Paris?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-md leading-relaxed">
                    Apply for TicketSafe Studio — branded event pages, ticket tiers, real-time dashboard.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    to="/organizers"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold bg-white text-primary hover:bg-white/95 hover:scale-[1.02] transition-all"
                  >
                    <Rocket className="w-4 h-4" />
                    Discover Studio
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
