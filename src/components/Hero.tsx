import { Button } from "@/components/ui/button";
import { ArrowRight, Search, ShieldCheck, GraduationCap, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/contexts/I18nContext";
import heroImage from "@/assets/hero-bg.jpg";

const trustPoints = [
  {
    icon: Sparkles,
    title: "Everything in one place",
    desc: "Every campus event, every listing, in a single feed. No more chasing tickets through stories, WhatsApp groups, or DMs.",
    tint: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    icon: ShieldCheck,
    title: "Bank-grade, escrow-protected",
    desc: "Stripe handles every euro. Your money stays locked in escrow until the QR ticket reaches your inbox.",
    tint: "bg-secondary/10",
    iconColor: "text-secondary",
  },
  {
    icon: GraduationCap,
    title: "Your school's students only",
    desc: "Every account is verified at sign-up with a university email. No scalpers, no bots — just your campus.",
    tint: "bg-accent/10",
    iconColor: "text-accent",
  },
];

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
              className="h-14 md:h-16 px-6 md:px-10 text-base md:text-xl font-bold rounded-xl md:rounded-2xl shadow-lg md:shadow-2xl hover:scale-[1.02] transition-transform"
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
              className="h-14 md:h-16 px-6 md:px-10 text-base md:text-xl font-bold rounded-xl md:rounded-2xl border-2 hover:scale-[1.02] transition-transform"
            >
              <Link to="/sell" aria-label="List your ticket for sale">
                Sell a Ticket
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
              </Link>
            </Button>
          </div>

          {/* Trust Indicators - 3 punchy points */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {trustPoints.map(({ icon: Icon, title, desc, tint, iconColor }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card/60 border border-border hover:border-primary/30 hover:shadow-soft transition-all"
              >
                <div className={`w-14 h-14 ${tint} rounded-2xl flex items-center justify-center`}>
                  <Icon className={`w-7 h-7 ${iconColor}`} />
                </div>
                <h3 className="font-bold text-lg text-foreground text-center leading-tight">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Mobile: 3 punchy badges */}
          <div className="md:hidden grid grid-cols-3 gap-2 max-w-md mx-auto">
            {trustPoints.map(({ icon: Icon, title, tint, iconColor }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card/60 border border-border"
              >
                <div className={`w-9 h-9 ${tint} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <span className="text-[11px] font-bold text-foreground text-center leading-tight">
                  {title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;