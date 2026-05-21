import { Link } from "react-router-dom";
import {
  Sparkles,
  Rocket,
  ShieldCheck,
  BarChart3,
  Ticket,
  Wand2,
  ArrowRight,
  QrCode,
  Percent,
  Check,
  ChevronRight,
  TrendingUp,
  Lock,
  X as XIcon,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";

const features = [
  {
    icon: Wand2,
    title: "Branded event page",
    desc: "Your colors, your logo, your custom URL. Your event feels like yours — not a template.",
  },
  {
    icon: Ticket,
    title: "Unlimited ticket tiers",
    desc: "VIP, Early Bird, Standard, Backstage. Set quotas, prices, sale windows. You're in control.",
  },
  {
    icon: Percent,
    title: "Promo codes & early access",
    desc: "Private links, one-shot codes, automated early-bird. Reach the right audience at the right time.",
  },
  {
    icon: BarChart3,
    title: "Real-time dashboard",
    desc: "Sales, revenue, door scans. A clear view so you can move fast during your campaign.",
  },
  {
    icon: QrCode,
    title: "Secure QR tickets",
    desc: "Every ticket is signed and scannable. Anti-fraud by default, same standard as our resale marketplace.",
  },
  {
    icon: TrendingUp,
    title: "Official resale built in",
    desc: "If your buyers can't attend, they resell through TicketSafe. No more shady external listings.",
  },
];

const steps = [
  { n: "01", title: "Apply", desc: "Tell us about your organization and your first planned event. Takes 5 minutes." },
  { n: "02", title: "Get verified", desc: "We review your application within 24h. Connect Stripe to receive payouts." },
  { n: "03", title: "Build your event", desc: "Set up your page, tiers, and promo codes. Publish when you're ready." },
  { n: "04", title: "Sell & scan", desc: "Track sales live. On the day, scan tickets from the app at the door." },
];

const compareRows = [
  { feature: "Fees", others: "Fixed per ticket + commission", us: "5% on what sells, nothing else" },
  { feature: "Resale handling", others: "None — buyers go elsewhere", us: "Official resale built in" },
  { feature: "Event page", others: "Generic template", us: "Branded to your identity" },
  { feature: "Payout", others: "7–14 days after the event", us: "Within 24h, automatic" },
  { feature: "Setup time", others: "Hours of config", us: "Under an hour" },
];

const Organizers = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="TicketSafe Studio — Sell your event tickets"
        description="The ticketing platform for verified student organizers. Branded pages, secure QR ticketing, real-time dashboard."
      />

      <Header minimal />

      <main className="flex-1">
        {/* ===================== HERO ===================== */}
        <section
          className="relative overflow-hidden text-white"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div
            className="pointer-events-none absolute -top-32 -left-32 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute top-20 -right-32 w-[28rem] h-[28rem] rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(240 100% 67%), transparent 70%)" }}
          />

          <div className="container mx-auto px-4 py-12 md:py-24 relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] md:text-xs font-semibold tracking-wider uppercase mb-4 md:mb-5">
                <Sparkles className="w-3 h-3" />
                <span className="leading-tight">TicketSafe Studio — Beta for EBS Paris</span>
              </div>
              <h1 className="text-[28px] sm:text-3xl md:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5">
                Sell your event tickets,<br />
                <span className="text-white/90">the safe way.</span>
              </h1>
              <p className="text-sm md:text-lg text-white/80 max-w-xl mb-6 md:mb-8 leading-relaxed">
                Built for EBS Paris student societies. Branded event pages, ticket tiers, promo codes, real-time dashboard — and official resale built in for your buyers.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                <Link
                  to="/organizers/apply"
                  className="inline-flex items-center justify-center gap-2 px-6 min-h-[52px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 hover:scale-[1.02] transition-all shadow-lg text-sm md:text-base"
                >
                  <Rocket className="w-4 h-4" />
                  Request access
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[52px] rounded-xl font-semibold text-white/90 hover:text-white border border-white/25 hover:border-white/40 hover:bg-white/5 transition-colors text-sm md:text-base"
                >
                  How it works
                  <ChevronRight className="w-4 h-4" />
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-2 text-[11px] md:text-xs text-white/70 mt-6 md:mt-7">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Stripe Connect payouts
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> QR-verified tickets
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> GDPR compliant
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== FEATURES ===================== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8 md:mb-12 max-w-2xl mx-auto">
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary mb-2 md:mb-3">
                What you get
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-foreground mb-2 md:mb-3">
                Everything in one place.
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                No more juggling separate tools for sales, ticketing, communication and resale.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 md:gap-4 max-w-6xl mx-auto">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div
                    key={i}
                    className="group p-5 md:p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-card transition-all"
                  >
                    <div
                      className="inline-flex w-10 h-10 md:w-11 md:h-11 rounded-xl items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-bold text-foreground mb-1 md:mb-1.5">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section id="how" className="py-12 md:py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8 md:mb-12 max-w-2xl mx-auto">
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary mb-2 md:mb-3">
                Four steps
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-foreground mb-2 md:mb-3">
                From application to live event.
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Most organizers publish their first event the same week they're approved.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 md:gap-4 max-w-6xl mx-auto">
              {steps.map((s, i) => (
                <div key={i} className="relative p-5 md:p-6 rounded-2xl bg-card border border-border">
                  <div
                    className="text-3xl md:text-4xl font-black mb-2 md:mb-3 leading-none bg-clip-text text-transparent"
                    style={{ backgroundImage: "var(--gradient-hero)" }}
                  >
                    {s.n}
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1 md:mb-1.5">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  {i < steps.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-border" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== COMPARE ===================== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8 md:mb-10">
                <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary mb-2 md:mb-3">
                  The difference
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-foreground">
                  Why TicketSafe Studio.
                </h2>
              </div>

              {/* Mobile: stacked cards (per row) */}
              <div className="md:hidden space-y-3">
                {compareRows.map((row, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft"
                  >
                    <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                        {row.feature}
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 px-4 py-3 bg-primary/[0.04] border-b border-border">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-primary mb-0.5">
                          TicketSafe Studio
                        </div>
                        <div className="text-sm text-foreground leading-snug font-medium">{row.us}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 px-4 py-3">
                      <XIcon className="w-4 h-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5">
                          Other platforms
                        </div>
                        <div className="text-sm text-muted-foreground leading-snug">{row.others}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: 3-column table */}
              <div className="hidden md:block rounded-2xl border border-border overflow-hidden bg-card">
                <div className="grid grid-cols-[1fr_1fr_1fr] text-xs uppercase tracking-wider font-bold border-b border-border bg-muted/40">
                  <div className="px-4 py-3 text-muted-foreground">Feature</div>
                  <div className="px-4 py-3 text-muted-foreground">Other platforms</div>
                  <div className="px-4 py-3 text-primary">TicketSafe Studio</div>
                </div>
                {compareRows.map((row, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[1fr_1fr_1fr] text-sm ${
                      i < compareRows.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="px-4 py-3.5 font-semibold text-foreground">{row.feature}</div>
                    <div className="px-4 py-3.5 text-muted-foreground flex items-start gap-2">
                      <XIcon className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                      <span>{row.others}</span>
                    </div>
                    <div className="px-4 py-3.5 text-foreground flex items-start gap-2 bg-primary/[0.03]">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="font-medium">{row.us}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== CTA FINAL ===================== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div
              className="relative max-w-4xl mx-auto rounded-2xl md:rounded-3xl p-6 md:p-12 overflow-hidden text-white"
              style={{ background: "var(--gradient-hero)" }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative max-w-2xl">
                <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-2 md:mb-3">
                  Apply for the beta
                </div>
                <h2 className="text-2xl md:text-4xl font-black mb-3 md:mb-4 leading-tight">
                  Ready to run your event on TicketSafe?
                </h2>
                <p className="text-white/85 text-sm md:text-base mb-5 md:mb-7 leading-relaxed">
                  Tell us about your organization and your event. We review applications within 24h.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <Link
                    to="/organizers/apply"
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[52px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 hover:scale-[1.02] transition-all shadow-lg text-sm md:text-base"
                  >
                    <Rocket className="w-4 h-4" />
                    Request access
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <span className="text-xs text-white/70 sm:max-w-xs">
                    No credit card. You only pay when you sell.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Organizers;
