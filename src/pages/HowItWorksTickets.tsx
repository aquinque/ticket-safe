import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  MousePointerClick,
  Ticket,
  CreditCard,
  QrCode,
  ShieldCheck,
  Mail,
  Repeat2,
  GraduationCap,
  Building2,
  Sparkles,
} from "lucide-react";

const steps = [
  {
    step: "01",
    icon: MousePointerClick,
    title: "Pick your event",
    body: "Browse student events across Paris, Madrid, Turin, Berlin and London. Use filters to narrow by campus, category or date.",
  },
  {
    step: "02",
    icon: Ticket,
    title: "Choose your tier",
    body: "Pick the tier you want (regular, VIP, table) and how many tickets. Tier availability updates in real time.",
  },
  {
    step: "03",
    icon: CreditCard,
    title: "Pay securely",
    body: "Card payment via Stripe. The organizer is paid directly — Ticket Safe never holds your money longer than needed.",
  },
  {
    step: "04",
    icon: QrCode,
    title: "Ticket on the spot",
    body: "Your QR ticket lands in your inbox the moment your payment clears. Scan it at the door — no waiting, no chasing anyone.",
  },
];

const trust = [
  {
    icon: Building2,
    title: "Direct from the organizer",
    body: "Every event is listed by a verified student society. No middlemen, no resellers, no markups.",
  },
  {
    icon: ShieldCheck,
    title: "Refund if the event is cancelled",
    body: "If the organizer officially cancels the event, you get a full automatic refund — no support ticket needed.",
  },
  {
    icon: Mail,
    title: "QR delivered automatically",
    body: "Tickets are emailed instantly after payment. Each QR is unique and validated at the door.",
  },
];

const faqs = [
  {
    q: "How do I know an event is real?",
    a: "Only verified student societies (BDE, sports clubs, alumni associations) can list events. We check the organizer's identity and campus affiliation before they go live.",
  },
  {
    q: "What payment methods are accepted?",
    a: "All major cards via Stripe Checkout — Visa, Mastercard, Amex. In some campuses, Apple Pay and Google Pay are also available.",
  },
  {
    q: "Can I get a refund if I change my mind?",
    a: "Refunds are decided by the organizer's policy, which is shown on the event page before you pay. Full refunds are automatic only if the organizer cancels the event.",
  },
  {
    q: "Where is my ticket delivered?",
    a: "It is emailed to the address on your Ticket Safe account, right after payment. You can also find it any time under My Purchases.",
  },
  {
    q: "What if the event is sold out?",
    a: "Head to the resale marketplace — students often re-list tickets at face value. Payment is held in escrow until the QR is delivered.",
  },
];

const HowItWorksTickets = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="How buying tickets works — Ticket Safe"
        description="How to buy student event tickets on Ticket Safe — direct from event organizers, paid securely, QR delivered instantly."
      />
      <Header minimal />

      <main className="flex-1">
        {/* ============== HERO ============== */}
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

          <div className="container mx-auto px-4 py-12 md:py-20 relative max-w-5xl">
            <div className="mb-5">
              <BackButton fallbackPath="/tickets" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] mb-4">
              <Sparkles className="w-3 h-3" />
              Buying tickets
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5 max-w-3xl">
              Direct from the organizers,<br />
              <span className="text-white/85">straight to your inbox.</span>
            </h1>
            <p className="text-sm md:text-lg text-white/80 max-w-2xl leading-relaxed">
              Four steps, no middlemen. Pay once and your QR ticket is delivered the moment your payment clears.
            </p>
          </div>
        </section>

        {/* ============== STEPS ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                How it works
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Four simple steps from browsing to walking through the door.
              </p>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {steps.map(({ step, icon: Icon, title, body }) => (
                <li
                  key={step}
                  className="relative rounded-2xl bg-card border border-border p-5 md:p-7 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <Icon className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <span className="text-xs md:text-sm font-black tracking-[0.18em] text-muted-foreground">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-foreground leading-tight mb-2">
                    {title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============== TRUST ============== */}
        <section className="py-12 md:py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Why it is safe
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Direct sales mean fewer moving parts. Here is what protects you.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              {trust.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl bg-card border border-border p-5 md:p-6"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 md:mb-4">
                    <Icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-foreground leading-tight mb-1.5">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============== FAQ ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Frequently asked
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Quick answers about direct ticket purchases.
              </p>
            </div>

            <div className="space-y-3">
              {faqs.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-xl border border-border bg-card overflow-hidden"
                >
                  <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 font-bold text-sm md:text-base text-foreground hover:bg-muted/50 transition-colors">
                    <span>{q}</span>
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black flex-shrink-0 group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 -mt-1 text-sm text-muted-foreground leading-relaxed">
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============== RESALE FALLBACK ============== */}
        <section className="pb-12 md:pb-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
              >
                <Repeat2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm md:text-base text-foreground leading-tight">
                  Event sold out?
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">
                  Students often re-list at face value on the resale marketplace.
                </div>
              </div>
              <Link
                to="/resale"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                Go to resale
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== FINAL CTA ============== */}
        <section className="pb-16 md:pb-24">
          <div className="container mx-auto px-4 max-w-5xl">
            <div
              className="relative rounded-2xl md:rounded-3xl p-6 md:p-12 overflow-hidden text-white"
              style={{ background: "var(--gradient-hero)" }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
                <div className="flex-1">
                  <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">
                    Ready to find your next event?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-lg leading-relaxed">
                    Browse upcoming student events across all campuses.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Link
                    to="/tickets"
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 transition-all"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Browse events
                  </Link>
                  <Link
                    to="/organizers"
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all"
                  >
                    I am an organizer
                    <ArrowRight className="w-4 h-4" />
                  </Link>
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

export default HowItWorksTickets;
