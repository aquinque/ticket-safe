import { Link } from "react-router-dom";
import { Linkedin, Instagram, Twitter } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background border-t border-border mt-auto animate-fade-in">
      {/* Main Footer Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {/* Column 1: Logo & Tagline */}
          <div className="text-center md:text-left">
            <Link to="/" className="inline-block mb-4">
              <img 
                src="/ticket-safe-logo.png" 
                alt="TicketSafe" 
                className="h-8 w-auto"
              />
            </Link>
            <p className="text-sm text-foreground/70 leading-relaxed">
              The trusted platform for students to safely buy and sell event tickets.
            </p>
          </div>

          {/* Column 2: Explore */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-foreground mb-4">Explore</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  to="/events" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Marketplace
                </Link>
              </li>
              <li>
                <Link 
                  to="/sell" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Sell Tickets
                </Link>
              </li>
              <li>
                <Link 
                  to="/campus-life" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Campus Life
                </Link>
              </li>
              <li>
                <Link 
                  to="/events" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Events
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: About */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-foreground mb-4">About</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  to="/about" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Our Mission
                </Link>
              </li>
              <li>
                <Link 
                  to="/about#careers" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link 
                  to="/contact" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link 
                  to="/about#press" 
                  className="text-sm text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
                >
                  Press
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Connect */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-foreground mb-4">Connect</h3>
            <div className="flex gap-4 justify-center md:justify-start">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--cta-blue))] hover:text-[hsl(var(--cta-blue-hover))] transition-all hover:scale-110"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-6 w-6" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--cta-blue))] hover:text-[hsl(var(--cta-blue-hover))] transition-all hover:scale-110"
                aria-label="Instagram"
              >
                <Instagram className="h-6 w-6" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--cta-blue))] hover:text-[hsl(var(--cta-blue-hover))] transition-all hover:scale-110"
                aria-label="X (Twitter)"
              >
                <Twitter className="h-6 w-6" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-foreground/70 text-center md:text-left">
              © {currentYear} TicketSafe. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <Link 
                to="/privacy" 
                className="text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-foreground/30">•</span>
              <Link 
                to="/privacy#terms" 
                className="text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
              >
                Terms & Conditions
              </Link>
              <span className="text-foreground/30">•</span>
              <Link 
                to="/privacy#cookies" 
                className="text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
              >
                Cookie Preferences
              </Link>
              <span className="text-foreground/30 hidden sm:inline">•</span>
              <Link 
                to="/sitemap" 
                className="text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
              >
                Site Map
              </Link>
              <span className="text-foreground/30 hidden sm:inline">•</span>
              <Link 
                to="/privacy#disclaimer" 
                className="text-foreground/70 hover:text-[hsl(var(--cta-blue))] transition-colors"
              >
                Disclaimer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
