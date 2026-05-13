import { Link } from "react-router-dom";
import { Instagram, ShieldCheck, Lock, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";

const Footer = () => {
  const { t } = useI18n();
  const currentYear = new Date().getFullYear();
  const footerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [ticketsSold, setTicketsSold] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .then(({ count }) => {
        if (count && count >= 10) setTicketsSold(count);
      });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    const currentFooter = footerRef.current;
    if (currentFooter) {
      observer.observe(currentFooter);
    }

    return () => {
      if (currentFooter) {
        observer.unobserve(currentFooter);
      }
    };
  }, []);

  return (
    <footer
      ref={footerRef}
      className={`bg-muted/30 border-t border-border mt-auto transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Trust signals bar */}
      <div className="border-b border-border bg-muted/50 py-4">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5" title="Money held in escrow until you confirm receipt">
              <Lock className="w-4 h-4 text-primary" aria-hidden="true" />
              <span className="font-medium">Escrow Payments</span>
            </div>
            <div className="flex items-center gap-1.5" title="100% refund if ticket is invalid or event cancelled">
              <ShieldCheck className="w-4 h-4 text-green-500" aria-hidden="true" />
              <span className="font-medium">Buyer Guarantee</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {/* Stripe trust mark */}
              <svg role="img" aria-label="Powered by Stripe" className="h-5" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M59.64 14.28c0-2.428-1.17-4.36-3.42-4.36-2.258 0-3.624 1.932-3.624 4.34 0 2.86 1.617 4.312 3.934 4.312 1.13 0 1.986-.256 2.632-.616v-1.896c-.646.324-1.387.524-2.327.524-1.923 0-2.655-.702-2.814-2.082h5.595c0-.14.024-.7.024-.222zm-5.657-.892c0-1.554.953-2.2 1.82-2.2.84 0 1.73.646 1.73 2.2H53.98zm-7.75-3.468c-.663 0-1.09.31-1.33.527l-.086-.42H42.87v11.162l1.995-.424.008-2.71c.248.18.612.436 1.217.436 1.23 0 2.351-.99 2.351-3.166 0-1.99-1.133-3.405-2.21-3.405zm-.39 5.247c-.405 0-.645-.145-.812-.323l-.01-2.553c.178-.197.43-.335.822-.335.628 0 1.062.703 1.062 1.598 0 .918-.424 1.613-1.062 1.613zm-5.58-6.085v-1.9h-2.01v9.62h2.01v-6.54c.475-.62 1.28-.507 1.528-.422V8.11c-.258-.092-1.21-.262-1.527.5zm-4.12-.5c-.66 0-1.076.308-1.31.523l-.08-.416h-1.94v9.62h1.99v-6.54c.47-.62 1.27-.507 1.52-.422V8.11c-.26-.092-1.21-.262-1.52.5h-.66zM28.97 7.1l-2.01.432v1.618l2.01-.432V7.1zM26.96 8.62h2.01v9.62h-2.01V8.62zm-3.34 3.5c0-.82.674-1.136 1.79-1.136.506 0 1.025.05 1.53.14V9.14a9.94 9.94 0 00-1.53-.13c-2.56 0-4.3 1.348-4.3 3.194 0 3.122 4.3 2.62 4.3 3.968 0 .97-.84 1.288-2.026 1.288a8.4 8.4 0 01-2.01-.264v1.998c.617.12 1.24.182 1.864.182 2.62 0 4.39-1.298 4.39-3.208 0-3.278-4.38-2.758-4.38-4.048h-.04z" fill="currentColor" opacity=".6"/>
              </svg>
            </div>
            {ticketsSold !== null && (
              <div className="flex items-center gap-1.5">
                <Ticket className="w-4 h-4 text-primary" aria-hidden="true" />
                <span className="font-medium">{ticketsSold}+ tickets sold safely</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          {/* Column 1: Tagline & CTA */}
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-[260px] mx-auto md:mx-0">
              {t('footer.tagline')}
            </p>
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Join our community</p>
              <Button
                variant="hero"
                size="sm"
                asChild
              >
                <Link to="/auth">{t('nav.signUp')}</Link>
              </Button>
            </div>
          </div>

          {/* Column 2: Explore */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-foreground mb-5">Explore</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/events"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Marketplace
                </Link>
              </li>
              <li>
                <Link
                  to="/how-it-works"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  to="/sell"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Sell Tickets
                </Link>
              </li>
              <li>
                <Link
                  to="/campus-life"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Campus Life
                </Link>
              </li>
              <li>
                <Link
                  to="/events"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Events
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: About */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-foreground mb-5">About</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Our Mission
                </Link>
              </li>
              <li>
                <Link
                  to="/about#careers"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  to="/about#press"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Press
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Connect */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-foreground mb-5">Follow Us</h3>
            <div className="flex gap-4 justify-center md:justify-start">
              <a
                href="https://www.instagram.com/ticketsafe.eu"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group"
                aria-label="Instagram"
              >
                <div className="absolute inset-0 bg-primary/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                <div className="relative p-2 transition-all duration-300 group-hover:scale-110">
                  <Instagram className="h-5 w-5 text-primary transition-all duration-300 group-hover:drop-shadow-lg" />
                </div>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              @ticketsafe.eu
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border">
        <div className="container mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground text-center md:text-left">
              <p className="mb-1">{t('footer.copyright', { year: currentYear })}</p>
              <p className="text-[10px]">
                TicketSafe SARL • France • Company Registration: [Pending] • VAT: [Pending]
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <Link
                to="/privacy"
                className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              <span className="text-muted-foreground/50">•</span>
              <Link
                to="/terms"
                className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline underline-offset-4"
              >
                Terms & Conditions
              </Link>
              <span className="text-muted-foreground/50">•</span>
              <Link
                to="/cookie-policy"
                className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline underline-offset-4"
              >
                Cookie Policy
              </Link>
              <span className="text-muted-foreground/50 hidden sm:inline">•</span>
              <Link
                to="/refund-policy"
                className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline underline-offset-4"
              >
                Refund Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
