import Header from "@/components/Header";
import Hero from "@/components/Hero";
import WhyTicketSafe from "@/components/WhyTicketSafe";
import EventsSection from "@/components/EventsSection";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, QrCode, Banknote, GraduationCap, Lock, X } from "lucide-react";
import { useState } from "react";

const steps = [
  {
    icon: GraduationCap,
    title: "Sign up",
    description: "Verify your student email instantly",
    color: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    icon: ShieldCheck,
    title: "Buy or List",
    description: "Browse verified tickets or list yours in 2 minutes",
    color: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: QrCode,
    title: "Secure Transfer",
    description: "Tickets are authenticated and transferred safely",
    color: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  {
    icon: Banknote,
    title: "Pay or Get Paid",
    description: "Escrow protects buyers. Sellers get paid within 24h.",
    color: "bg-green-500/10",
    iconColor: "text-green-500",
  },
];

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

        {/* How It Works Teaser */}
        <section className="py-14 md:py-20 border-y border-border bg-muted/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">How It Works</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Safe student ticket resale in 4 simple steps
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto mb-10">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={index} className="flex flex-col items-center text-center gap-3 p-4 rounded-xl bg-card border border-border hover:shadow-md transition-shadow">
                    <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${step.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center">
              <Button variant="outline" asChild className="font-semibold">
                <Link to="/how-it-works">
                  See Full Guide
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <WhyTicketSafe />
        <EventsSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
