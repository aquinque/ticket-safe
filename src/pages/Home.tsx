import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  QrCode,
  ShieldCheck,
  Lock,
  GraduationCap,
  Repeat2,
  LayoutDashboard,
} from "lucide-react";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { EventCarousel } from "@/components/EventCarousel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { useThemeMode } from "@/hooks/useThemeMode";
import { partnerLogos } from "@/config/partnerLogos";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/data/eventsData";

const HOW_IT_WORKS = [
  {
    icon: GraduationCap,
    title: "Verify your student email",
    desc: "Sign up in 30 seconds with your school email. Students only.",
  },
  {
    icon: Repeat2,
    title: "Buy or resell",
    desc: "Official tickets from your student union, or find/list a ticket on resale.",
  },
  {
    icon: QrCode,
    title: "Unique QR, protected payment",
    desc: "The QR lands in your inbox. Payment is only released once the ticket is validated.",
  },
];

const FAQS = [
  {
    q: "Is it limited to my school?",
    a: "Yes — sign-up requires your student email. Each campus has its own space, no unverified accounts.",
  },
  {
    q: "How do I know a resold ticket is real?",
    a: "Every ticket has a unique QR, verified before it's listed for sale. Payment stays held until the transfer is confirmed.",
  },
  {
    q: "How much does it cost?",
    a: "Direct purchase: fees included in the displayed price. Resale: a small commission taken at withdrawal, never at purchase.",
  },
  {
    q: "What if the event is cancelled?",
    a: "Full automatic refund, platform fees included, no support ticket needed.",
  },
  {
    q: "How do I get paid if I resell?",
    a: "Payment is released as soon as the buyer confirms they received the ticket, then you withdraw it by bank transfer.",
  },
];

const Home = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  const { events: upcomingEvents, loading: eventsLoading } = useESCPEvents({ onlyWithTickets: true });
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

  const carouselEvents: EventData[] = upcomingEvents.slice(0, 10).map((e) => ({
    id: e.id,
    title: e.title,
    date: e.start_date,
    time: "",
    location: e.location,
    organizer: e.organizer,
    description: e.description,
    category: e.category,
    filterCategory: e.category.toLowerCase(),
    image: e.image_url,
    isPastEvent: false,
    fromPriceCents: e.min_price != null ? Math.round(e.min_price * 100) : undefined,
  }));

  // Counters section: only real, verifiable numbers. Hidden individually
  // when null rather than showing a fabricated placeholder value.
  const counters = [
    { value: ticketsSold, label: "tickets sold safely" },
    { value: null, label: "active campuses" }, // TODO_DATA: no live "active campuses" count yet
  ].filter((c) => c.value != null) as { value: number; label: string }[];

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="TicketSafe — Your student nights. Zero scams."
        description="Buy tickets directly from your student union, or resell yours safely."
      />

      <HeaderNight />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className="relative min-h-[100svh] flex items-end md:items-center overflow-hidden">
          {/* Placeholder gradient background — swap for a real event photo/video
              once supplied. Expected location: public/hero/ (e.g.
              public/hero/home.jpg or .mp4), see TODO_DATA.md. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 30% 20%, hsl(227 77% 30% / 0.55), transparent 60%), radial-gradient(ellipse at 80% 70%, hsl(228 67% 25% / 0.5), transparent 55%), hsl(234 58% 6%)",
            }}
          />
          {/* ~70% darkening overlay, ready for when a real photo sits behind it */}
          <div className="absolute inset-0 bg-black/70" />

          <div className="relative container mx-auto px-4 pb-10 pt-28 md:pt-0 md:pb-0">
            <div className="max-w-2xl">
              <h1
                className="font-display font-bold text-foreground text-[40px] leading-[1.05] md:text-7xl lg:text-8xl mb-4 md:mb-6"
                style={{ letterSpacing: "-0.02em" }}
              >
                Your student nights.
                <br />
                Zero scams.
              </h1>
              <p className="text-base md:text-xl text-muted-foreground mb-7 md:mb-9 max-w-lg">
                Buy tickets directly from your student union, or resell yours safely.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-7 md:mb-9">
                <Button variant="buy" size="lg" asChild>
                  <Link to="/tickets">
                    View events
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild className="border-white/25 text-foreground hover:bg-white/5">
                  <Link to="/sell">Resell my ticket</Link>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs md:text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-primary" />
                  Verified QR codes
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Secure payment
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-primary" />
                  GDPR compliant
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ============ CAROUSEL — Upcoming events ============ */}
        <section className="py-12 md:py-16 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-5 md:mb-6">
              <h2 className="font-display font-bold text-2xl md:text-3xl text-foreground" style={{ letterSpacing: "-0.02em" }}>
                Upcoming events
              </h2>
              <Link to="/tickets" className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 shrink-0">
                See all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {!eventsLoading && carouselEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events with tickets yet — check back soon.
              </p>
            ) : (
              <EventCarousel
                events={carouselEvents}
                loading={eventsLoading}
                onEventClick={(event) => navigate(`/event/${event.id}/tickets`)}
              />
            )}
          </div>
        </section>

        {/* ============ SOCIAL PROOF ============ */}
        {(partnerLogos.length > 0 || counters.length > 0) && (
          <section className="py-10 md:py-12 border-t border-border">
            <div className="container mx-auto px-4">
              {partnerLogos.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70 mb-8">
                  {partnerLogos.map((logo) => (
                    <img key={logo.name} src={logo.src} alt={logo.name} className="h-6 md:h-8 w-auto" />
                  ))}
                </div>
              )}
              {counters.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
                  {counters.map((c) => (
                    <div key={c.label} className="text-center">
                      <div className="font-display font-bold text-3xl md:text-4xl text-foreground tabular-nums" style={{ letterSpacing: "-0.02em" }}>
                        {c.value}+
                      </div>
                      <div className="text-xs md:text-sm text-muted-foreground">{c.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============ HOW IT WORKS ============ */}
        <section className="py-14 md:py-20 border-t border-border">
          <div className="container mx-auto px-4">
            <h2 className="font-display font-bold text-2xl md:text-3xl text-foreground text-center mb-10 md:mb-14" style={{ letterSpacing: "-0.02em" }}>
              How it works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 max-w-4xl mx-auto">
              {HOW_IT_WORKS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="text-center">
                    <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-xs font-bold text-primary mb-1.5">{`0${i + 1}`}</div>
                    <h3 className="font-display font-bold text-lg text-foreground mb-2" style={{ letterSpacing: "-0.02em" }}>
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ ORGANIZERS SECTION ============ */}
        <section className="py-14 md:py-20 bg-secondary/50 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center max-w-5xl mx-auto">
              <div>
                <h2 className="font-display font-bold text-2xl md:text-4xl text-foreground mb-4" style={{ letterSpacing: "-0.02em" }}>
                  Running an event?
                </h2>
                <ul className="space-y-3 mb-6 text-sm md:text-base text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    Ticketing + secure resale, built in
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Repeat2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    Per-member sales links for your team
                  </li>
                  <li className="flex items-start gap-2.5">
                    <LayoutDashboard className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    Real-time dashboard — sales, check-in, payouts
                  </li>
                </ul>
                <p className="font-display font-bold text-3xl md:text-5xl text-foreground mb-1" style={{ letterSpacing: "-0.02em" }}>
                  €1.40 per ticket.
                </p>
                <p className="text-sm text-muted-foreground mb-6">That's it.</p>
                <Button variant="buy" size="lg" asChild>
                  <Link to="/organizers">
                    Launch my event with TicketSafe Studio
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>

              {/* Studio dashboard mockup placeholder — swap for a real
                  screenshot once available (public/hero/ or similar). */}
              <div className="rounded-lg border border-border bg-card p-4 shadow-card">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["Tickets sold", "Net revenue", "Fill rate"].map((label) => (
                    <div key={label} className="rounded-md bg-secondary p-2.5">
                      <div className="h-2 w-10 rounded bg-muted-foreground/30 mb-2" />
                      <div className="h-4 w-14 rounded bg-foreground/20 tabular-nums" />
                    </div>
                  ))}
                </div>
                <div className="rounded-md bg-secondary h-28 flex items-end gap-1.5 p-3">
                  {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="py-14 md:py-20 border-t border-border">
          <div className="container mx-auto px-4 max-w-2xl">
            <h2 className="font-display font-bold text-2xl md:text-3xl text-foreground text-center mb-8 md:mb-10" style={{ letterSpacing: "-0.02em" }}>
              Frequently asked questions
            </h2>
            <Accordion type="single" collapsible>
              {FAQS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left font-semibold text-foreground">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Home;
