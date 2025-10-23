import { Link } from "react-router-dom";
import { Linkedin, Instagram, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const footerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (footerRef.current) {
      observer.observe(footerRef.current);
    }

    return () => {
      if (footerRef.current) {
        observer.unobserve(footerRef.current);
      }
    };
  }, []);

  return (
    <footer 
      ref={footerRef}
      className={`bg-[#F1F5F9] border-t border-[#E2E8F0] mt-auto transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Main Footer Content */}
      <div className="container mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          {/* Column 1: Tagline & CTA */}
          <div className="text-center md:text-left">
            <p className="text-[0.95rem] text-[#64748B] leading-relaxed mb-6 max-w-[260px] mx-auto md:mx-0">
              The trusted platform for students to safely buy and sell event tickets.
            </p>
            <div>
              <p className="text-sm font-medium text-[#0F172A] mb-3">Join our community</p>
              <Button 
                asChild
                className="bg-[#1E5EFF] hover:bg-[#184BDC] text-white rounded-full px-6 py-2 text-sm font-medium transition-all duration-300 hover:shadow-lg"
              >
                <Link to="/auth">Sign Up</Link>
              </Button>
            </div>
          </div>

          {/* Column 2: Explore */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-[#0F172A] mb-5">Explore</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  to="/events" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Marketplace
                </Link>
              </li>
              <li>
                <Link 
                  to="/sell" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Sell Tickets
                </Link>
              </li>
              <li>
                <Link 
                  to="/campus-life" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Campus Life
                </Link>
              </li>
              <li>
                <Link 
                  to="/events" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Events
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: About */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-[#0F172A] mb-5">About</h3>
            <ul className="space-y-3">
              <li>
                <Link 
                  to="/about" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Our Mission
                </Link>
              </li>
              <li>
                <Link 
                  to="/about#careers" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link 
                  to="/contact" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link 
                  to="/about#press" 
                  className="text-[0.95rem] font-normal text-[#475569] hover:text-[#1E5EFF] transition-colors duration-300 hover:underline underline-offset-4"
                >
                  Press
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Connect */}
          <div className="text-center md:text-left">
            <h3 className="font-semibold text-base text-[#0F172A] mb-5">Connect</h3>
            <div className="flex gap-4 justify-center md:justify-start">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group"
                aria-label="LinkedIn"
              >
                <div className="absolute inset-0 bg-[#1E5EFF]/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                <div className="relative p-2 transition-all duration-300 group-hover:scale-115">
                  <Linkedin className="h-5 w-5 text-[#1E5EFF] transition-all duration-300 group-hover:drop-shadow-[0_2px_8px_rgba(30,94,255,0.3)]" />
                </div>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group"
                aria-label="Instagram"
              >
                <div className="absolute inset-0 bg-[#1E5EFF]/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                <div className="relative p-2 transition-all duration-300 group-hover:scale-115">
                  <Instagram className="h-5 w-5 text-[#1E5EFF] transition-all duration-300 group-hover:drop-shadow-[0_2px_8px_rgba(30,94,255,0.3)]" />
                </div>
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="relative group"
                aria-label="X (Twitter)"
              >
                <div className="absolute inset-0 bg-[#1E5EFF]/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                <div className="relative p-2 transition-all duration-300 group-hover:scale-115">
                  <Twitter className="h-5 w-5 text-[#1E5EFF] transition-all duration-300 group-hover:drop-shadow-[0_2px_8px_rgba(30,94,255,0.3)]" />
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-[#E2E8F0]">
        <div className="container mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[0.85rem] text-[#94A3B8] text-center md:text-left">
              © {currentYear} TicketSafe. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-[0.85rem]">
              <Link 
                to="/privacy" 
                className="text-[#94A3B8] hover:text-[#1E5EFF] transition-all duration-300 hover:underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              <span className="text-[#CBD5E1]">•</span>
              <Link 
                to="/privacy#terms" 
                className="text-[#94A3B8] hover:text-[#1E5EFF] transition-all duration-300 hover:underline underline-offset-4"
              >
                Terms & Conditions
              </Link>
              <span className="text-[#CBD5E1]">•</span>
              <Link 
                to="/privacy#cookies" 
                className="text-[#94A3B8] hover:text-[#1E5EFF] transition-all duration-300 hover:underline underline-offset-4"
              >
                Cookie Preferences
              </Link>
              <span className="text-[#CBD5E1] hidden sm:inline">•</span>
              <Link 
                to="/sitemap" 
                className="text-[#94A3B8] hover:text-[#1E5EFF] transition-all duration-300 hover:underline underline-offset-4"
              >
                Site Map
              </Link>
              <span className="text-[#CBD5E1] hidden sm:inline">•</span>
              <Link 
                to="/privacy#disclaimer" 
                className="text-[#94A3B8] hover:text-[#1E5EFF] transition-all duration-300 hover:underline underline-offset-4"
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
