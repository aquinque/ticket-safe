import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Ticket,
  Repeat2,
  ShieldCheck,
  Building2,
  Sparkles,
  Target,
  Users,
  Lock,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";

const paths = [
  {
    icon: Ticket,
    title: "Buy event tickets",
    body: "Galas, parties, sports, conferences — sold directly by your campus societies. Your QR ticket is emailed the moment your payment clears.",
    to: "/tickets",
    cta: "Browse events",
    gradient: "var(--gradient-hero)",
  },
  {
    icon: Repeat2,
    title: "Resale marketplace",
    body: "Sold out? Find a ticket from another student. Got an extra? List it in two minutes. Bank-to-bank, escrow-protected.",
    to: "/resale",
    cta: "Go to resale",
    gradient: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))",
  },
];

const values = [
  {
    icon: Building2,
    title: "Centralized, not scattered",
    body: "Every campus event in one feed — no more hunting through stories, WhatsApp groups or DMs.",
  },
  {
    icon: ShieldCheck,
    title: "Real protection, not promises",
    body: "Escrow on resale, direct-to-organizer for primary sales, automatic QR delivery. The platform handles the moving parts.",
  },
  {
    icon: Users,
    title: "Students only",
    body: "University email verification at sign-up. No scalpers, no bots — only the people on your campus.",
  },
  {
    icon: Lock,
    title: "Bank-grade payments",
    body: "Stripe handles every transaction. Card data never touches our servers. Payouts are direct to your bank.",
  },
];

const roadmap = [
  {
    phase: "Phase 1",
    title: "ESCP",
    body: "5 campuses live — Paris, Madrid, Turin, Berlin, London.",
    active: true,
  },
  {
    phase: "Phase 2",
    title: "Top business schools",
    body: "HEC, ESSEC, EM Lyon, EDHEC, Mines and more.",
    active: false,
  },
];

const About = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="About — Ticket Safe"
        description="Ticket Safe centralizes student event tickets — buy direct from organizers, or trade safely on the resale marketplace."
      />
      <Header />

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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] mb-4">
              <Sparkles className="w-3 h-3" />
              About Ticket Safe
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5 max-w-3xl">
              The ticket platform built for student events.
            </h1>
            <p className="text-sm md:text-lg text-white/80 max-w-2xl leading-relaxed">
              One place for everything campus — from the official BDE gala to the seat someone needs to resell at 3 a.m. before the event.
            </p>
          </div>
        </section>

        {/* ============== TWO PATHS ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Target className="w-3 h-3" />
                Two ways to use it
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                One platform, two paths
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Whether you are buying for the first time or chasing a sold-out event — Ticket Safe covers both.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {paths.map(({ icon: Icon, title, body, to, cta, gradient }) => (
                <Link
                  key={title}
                  to={to}
                  className="group relative rounded-2xl md:rounded-3xl p-6 md:p-8 overflow-hidden text-white transition-all duration-300 active:scale-[0.99] md:hover:-translate-y-1 md:hover:shadow-hover"
                  style={{ background: gradient }}
                >
                  <div
                    className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl group-hover:opacity-50 transition-opacity"
                    style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
                  />
                  <div className="relative">
                    <div className="inline-flex w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/15 backdrop-blur items-center justify-center mb-4 md:mb-5">
                      <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-black mb-2 md:mb-3 leading-tight">
                      {title}
                    </h3>
                    <p className="text-sm md:text-base text-white/85 mb-5 md:mb-6 leading-relaxed">
                      {body}
                    </p>
                    <div className="inline-flex items-center gap-2 font-bold text-sm md:text-base group-hover:gap-3 transition-all">
                      {cta}
                      <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ============== MISSION ============== */}
        <section className="py-12 md:py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                  Our mission
                </div>
                <h2 className="text-2xl md:text-4xl font-black mb-4 md:mb-5 leading-tight">
                  Stop chasing tickets across five apps.
                </h2>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                  Campus tickets live everywhere — Instagram stories, BDE bot, WhatsApp groups, screenshots of QR codes you cannot verify. We are bringing them all into one place.
                </p>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  Organizers sell directly, students resell safely, and the whole campus stops worrying about whether a transfer is real.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {values.map(({ icon: Icon, title, body }) => (
                  <div
                    key={title}
                    className="rounded-2xl bg-card border border-border p-4 md:p-5"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-sm md:text-base font-bold text-foreground leading-tight mb-1">
                      {title}
                    </h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============== ROADMAP ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-8 md:mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                Where we are going
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Starting at ESCP, scaling out
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                We are starting with one school we know inside and out, then opening up.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {roadmap.map(({ phase, title, body, active }) => (
                <div
                  key={phase}
                  className={`rounded-2xl p-5 md:p-6 border ${
                    active
                      ? "bg-primary/5 border-primary/30 shadow-soft"
                      : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-[10px] md:text-xs font-black tracking-[0.18em] uppercase ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {phase}
                    </span>
                    {active && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Live
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg md:text-xl font-black text-foreground leading-tight mb-2">
                    {title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============== HOW IT WORKS LINKS ============== */}
        <section className="py-12 md:py-20 bg-muted/30 border-t border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-10">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                See exactly how it works
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Two flows, two dedicated walkthroughs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <Link
                to="/how-it-works/tickets"
                className="group flex items-center gap-4 rounded-2xl bg-card border border-border p-5 md:p-6 hover:border-primary/30 hover:shadow-soft transition-all"
              >
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Ticket className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm md:text-base text-foreground leading-tight">
                    Buying tickets
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground">
                    Direct from your campus organizers.
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform shrink-0" />
              </Link>

              <Link
                to="/how-it-works"
                className="group flex items-center gap-4 rounded-2xl bg-card border border-border p-5 md:p-6 hover:border-primary/30 hover:shadow-soft transition-all"
              >
                <div
                  className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
                >
                  <Repeat2 className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm md:text-base text-foreground leading-tight">
                    Resale marketplace
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground">
                    Buy or list between students, escrow-protected.
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform shrink-0" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== FINAL CTA ============== */}
        <section className="py-12 md:py-20">
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
                    Find your next event in one place.
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-lg leading-relaxed">
                    Verified students from your school, real organizers, automatic QR delivery.
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
                    to="/resale"
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all"
                  >
                    Resale marketplace
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

export default About;
