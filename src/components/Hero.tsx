import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useI18n();
  
  return (
    <section className="relative overflow-hidden">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="relative container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-fade-in">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              Resell your ticket.
            </span>
            <br />
            <span className="text-foreground">
              Find your spot.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up">
            {t('hero.subtitle')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up">
            <Button variant="hero" size="lg" className="shadow-glow hover:shadow-glow" asChild>
              <Link to="/events">
                <Search className="w-5 h-5" />
                {t('hero.browseEvents')}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="outline-primary" size="lg" className="backdrop-blur-sm border-2" asChild>
              <Link to="/sell">
                {t('hero.sellMyTickets')}
              </Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Verified Students Only</h3>
              <p className="text-sm text-muted-foreground text-center">
                Only students with verified university emails can join
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="font-semibold text-foreground">Secure Payments</h3>
              <p className="text-sm text-muted-foreground text-center">
                Protected transactions with trusted payment processing
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                <Search className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground">Fast Matching</h3>
              <p className="text-sm text-muted-foreground text-center">
                Quick connections between sellers and buyers
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;