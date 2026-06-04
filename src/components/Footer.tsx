import { Link } from "react-router-dom";
import { Instagram, ShieldCheck, Lock, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { TrustItem } from "@/components/common/TrustItem";

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
            <TrustItem
              icon={<Lock className="w-4 h-4 text-primary" aria-hidden="true" />}
              label={t('trust.escrowPayments')}
              explanation={t('trust.escrowPaymentsDesc')}
            />
            <TrustItem
              icon={<ShieldCheck className="w-4 h-4 text-green-500" aria-hidden="true" />}
              label={t('trust.buyerGuarantee')}
              explanation={t('trust.buyerGuaranteeDesc')}
            />
            <TrustItem
              icon={
                <img
                  src="/logos/stripe.svg"
                  alt=""
                  aria-hidden="true"
                  height={16}
                  className="h-4 w-auto"
                />
              }
              label={t('trust.stripe')}
              explanation={t('trust.stripeDesc')}
            />
            <TrustItem
              icon={<Users className="w-4 h-4 text-primary" aria-hidden="true" />}
              label={t('trust.verifiedStudents')}
              explanation={t('trust.verifiedStudentsDesc')}
            />
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
                  to="/marketplace"
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
                  to="/marketplace"
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
                Ticket Safe SAS · Capital social 1 000 € · RCS Paris 105 533 632 · TVA FR86 105 533 632 · Siège : 2 rue Wilhem, 75016 Paris
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
              <span className="text-muted-foreground/50">•</span>
              <Link
                to="/mentions-legales"
                className="text-muted-foreground hover:text-primary transition-all duration-300 hover:underline underline-offset-4"
              >
                Mentions légales
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
