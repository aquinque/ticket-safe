import { Link } from "react-router-dom";
import { ArrowRight, Ticket, Repeat2, ShieldCheck, QrCode, Lock, Sparkles, GraduationCap } from "lucide-react";
import Logo from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";

const Home = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <SEOHead
        title="TicketSafe — Buy event tickets or resell safely"
        description="Two ways to find your ticket: buy directly from verified event organizers, or trade on the secure resale marketplace."
      />

      {/* Ambient ESCP blue gradients */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-[44rem] h-[44rem] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(220 100% 30% / 0.35), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-40 w-[36rem] h-[36rem] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(210 100% 45% / 0.35), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-1/4 w-[32rem] h-[32rem] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(221 100% 56% / 0.30), transparent 70%)" }}
      />

      {/* Minimal top bar */}
      <header className="relative z-10">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center hover:opacity-90 transition-opacity">
            <Logo height={36} />
          </Link>
          <nav className="flex items-center gap-2 md:gap-4 text-sm">
            <Link
              to="/auth"
              className="inline-flex items-center px-4 py-2 rounded-lg font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center relative z-10 px-4 py-8 md:py-12">
        <div className="w-full max-w-5xl">
          {/* Positioning headline — explicitly says what TicketSafe is */}
          <div className="flex flex-col items-center text-center gap-4 mb-9 md:mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-border shadow-soft text-xs font-semibold tracking-wide text-foreground/80">
              <GraduationCap className="w-3.5 h-3.5 text-primary" />
              Student-only · Verified by university email
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-foreground leading-[1.05] tracking-tight max-w-3xl">
              The ticket platform built for{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                student events.
              </span>
            </h1>
          </div>

          {/* Two paths */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-slide-up">
            {/* Path 1 — Buy event tickets */}
            <Link
              to="/tickets"
              className="group relative rounded-3xl p-8 md:p-10 overflow-hidden text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-hover"
              style={{ background: "var(--gradient-hero)" }}
            >
              {/* Glow accent */}
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl group-hover:opacity-60 transition-opacity"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative">
                <div className="inline-flex w-14 h-14 rounded-2xl bg-white/15 backdrop-blur items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-white/25 transition-all">
                  <Ticket className="w-7 h-7 text-white" />
                </div>
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-white/80 mb-2">
                  <Sparkles className="w-3 h-3" />
                  New
                </div>
                <h2 className="text-2xl md:text-3xl font-black mb-3 leading-tight">
                  Buy event<br />tickets
                </h2>
                <p className="text-sm md:text-base text-white/80 mb-8 leading-relaxed max-w-sm">
                  All your campus events in one place. Tickets sold directly by student associations.
                </p>
                <div className="inline-flex items-center gap-2 font-bold text-white group-hover:gap-3 transition-all">
                  Browse events
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Path 2 — Resale marketplace */}
            <Link
              to="/resale"
              className="group relative rounded-3xl p-8 md:p-10 overflow-hidden bg-card border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-hover hover:border-primary/30"
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 blur-3xl group-hover:opacity-50 transition-opacity"
                style={{ background: "radial-gradient(circle, hsl(221 100% 56% / 0.35), transparent 70%)" }}
              />
              <div className="relative">
                <div
                  className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-6 group-hover:scale-110 transition-transform"
                  style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
                >
                  <Repeat2 className="w-7 h-7 text-white" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/80 mb-2">
                  Marketplace
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-foreground mb-3 leading-tight">
                  Resale<br />marketplace
                </h2>
                <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed max-w-sm">
                  Sold out? Find a ticket from another student. Got an extra? List it in two minutes and find a buyer fast.
                </p>
                <div className="inline-flex items-center gap-2 font-bold text-primary group-hover:gap-3 transition-all">
                  Go to marketplace
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-x-6 md:gap-x-8 gap-y-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-primary" />
              GDPR compliant
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-primary" />
              QR-verified tickets
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Escrow payments
            </span>
          </div>

          {/* Organizer micro-CTA */}
          <div className="mt-8 md:mt-10 text-center">
            <Link
              to="/organizers"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-primary transition-colors"
            >
              Are you organizing an event?
              <span className="text-primary">Apply for TicketSafe Studio</span>
              <ArrowRight className="w-3.5 h-3.5 text-primary" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer micro */}
      <footer className="relative z-10 py-5 border-t border-border/50 bg-background/50 backdrop-blur">
        <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
          <span className="text-border">·</span>
          <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          <span className="text-border">·</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <span className="text-border hidden sm:inline">·</span>
          <span className="hidden sm:inline">© {new Date().getFullYear()} TicketSafe</span>
        </div>
      </footer>
    </div>
  );
};

export default Home;
