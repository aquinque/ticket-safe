import { Button } from "@/components/ui/button";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden bg-background pt-4 pb-8 md:pb-8">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="relative container mx-auto px-4">
        <div className="max-w-5xl mx-auto text-center">
          {/* Main Heading - Mobile optimized */}
          <h1 className="mb-3 md:mb-4 animate-fade-in text-3xl md:text-5xl lg:text-6xl font-bold">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              {t('hero.titleLine1')}
            </span>
            <br />
            <span className="text-foreground">
              {t('hero.titleLine2')}
            </span>
          </h1>

          {/* Subtitle - Hidden on mobile */}
          <p className="hidden md:block text-lg md:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto leading-relaxed animate-slide-up">
            {t('hero.subtitle')}
          </p>

          {/* Mobile tagline */}
          <p className="md:hidden text-sm text-muted-foreground mb-6 animate-slide-up">
            Bank-secure payments · Easier to find tickets and buyers
          </p>

          {/* CTA Buttons — primary = Find a ticket, secondary = Sell.
              On PC we push them BIG to make them the spotlight of the hero;
              mobile keeps the existing comfortable tap target. */}
          <div className="flex flex-col gap-3 md:flex-row md:gap-5 justify-center mb-6 md:mb-10 animate-slide-up">
            <Button
              variant="hero"
              size="lg"
              asChild
              className="h-14 md:h-16 px-6 md:px-10 text-base md:text-xl font-bold rounded-xl md:rounded-2xl shadow-lg md:shadow-2xl transition-transform"
            >
              <Link to="/marketplace" aria-label="Find a ticket on the marketplace">
                <Search className="w-5 h-5 md:w-6 md:h-6" />
                Find a Ticket
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="h-14 md:h-16 px-6 md:px-10 text-base md:text-xl font-bold rounded-xl md:rounded-2xl border-2 transition-transform"
            >
              <Link to="/sell" aria-label="List your ticket for sale">
                Sell a Ticket
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;