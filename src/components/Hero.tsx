import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/20 pt-4 pb-8 md:pb-8">
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

          {/* Mobile tagline - Short version */}
          <p className="md:hidden text-sm text-muted-foreground mb-6 animate-slide-up">
            Buy and sell ESCP tickets securely
          </p>

          {/* CTA Buttons - Mobile optimized with larger touch targets */}
          <div className="flex flex-col gap-3 md:flex-row md:gap-4 justify-center mb-6 md:mb-8 animate-slide-up">
            <Button variant="hero" size="lg" asChild className="h-14 md:h-12 text-base font-semibold">
              <Link to="/events">
                <Search className="w-5 h-5" />
                Buy Tickets
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="marketplace" size="lg" asChild className="h-14 md:h-12 text-base font-semibold">
              <Link to="/sell">
                Sell Tickets
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>

          {/* Trust Indicators - Simplified on mobile */}
          <div className="hidden md:grid md:grid-cols-3 gap-8 lg:gap-12 max-w-4xl mx-auto">
            <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card/50 hover:bg-card transition-colors">
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{t('hero.verifiedStudentsTitle')}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                {t('hero.verifiedStudentsDesc')}
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card/50 hover:bg-card transition-colors">
              <div className="w-14 h-14 bg-secondary/10 rounded-xl flex items-center justify-center">
                <Shield className="w-7 h-7 text-secondary" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{t('hero.securePaymentsTitle')}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                {t('hero.securePaymentsDesc')}
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card/50 hover:bg-card transition-colors">
              <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center">
                <Search className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{t('hero.fastMatchingTitle')}</h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                {t('hero.fastMatchingDesc')}
              </p>
            </div>
          </div>

          {/* Mobile: Simple trust badges */}
          <div className="md:hidden flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              <span>Secure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Search className="w-4 h-4" />
              <span>Fast</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;