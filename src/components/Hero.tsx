import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/20">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="relative container mx-auto px-4 py-16 md:py-24 lg:py-32">
        <div className="max-w-5xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="mb-6 animate-fade-in">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              {t('hero.titleLine1')}
            </span>
            <br />
            <span className="text-foreground">
              {t('hero.titleLine2')}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up">
            {t('hero.subtitle')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20 animate-slide-up">
            <Button variant="hero" size="lg" asChild>
              <Link to="/marketplace/buy">
                <Search className="w-5 h-5" />
                Buy Tickets
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="marketplace" size="lg" asChild>
              <Link to="/marketplace/sell">
                Sell Tickets
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 max-w-4xl mx-auto">
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
        </div>
      </div>
    </section>
  );
};

export default Hero;