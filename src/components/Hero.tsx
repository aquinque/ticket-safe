import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden bg-gradient-subtle">
      <div className="container mx-auto px-4 py-20 md:py-28 lg:py-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 animate-fade-in">
            <Shield className="w-4 h-4" />
            Verified Student Platform
          </div>

          {/* Main Heading */}
          <h1 className="mb-6 animate-fade-in text-balance">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              {t('hero.titleLine1')}
            </span>
            <br />
            <span className="text-foreground">
              {t('hero.titleLine2')}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl mb-12 max-w-2xl mx-auto animate-slide-up text-balance">
            {t('hero.subtitle')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up">
            <Button variant="hero" size="lg" className="group" asChild>
              <Link to="/events">
                <Search className="w-5 h-5 transition-transform group-hover:scale-110" />
                Browse Events
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="group border-2" asChild>
              <Link to="/sell">
                List Your Tickets
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          {/* Trust Indicators - Cleaner Design */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="group p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-card transition-all duration-300">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{t('hero.securePaymentsTitle')}</h3>
                <p className="text-sm leading-relaxed">
                  {t('hero.securePaymentsDesc')}
                </p>
              </div>
            </div>

            <div className="group p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-card transition-all duration-300">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{t('hero.verifiedStudentsTitle')}</h3>
                <p className="text-sm leading-relaxed">
                  {t('hero.verifiedStudentsDesc')}
                </p>
              </div>
            </div>

            <div className="group p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-card transition-all duration-300">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Search className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{t('hero.fastMatchingTitle')}</h3>
                <p className="text-sm leading-relaxed">
                  {t('hero.fastMatchingDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;