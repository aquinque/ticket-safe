import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Ticket, Repeat2, ShieldCheck, QrCode, Lock, Sparkles, GraduationCap, User, LogOut, LayoutDashboard } from "lucide-react";
import Logo from "@/components/Logo";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Home = () => {
  const { user, signOut } = useAuth();
  const { organizer } = useOrganizer();
  const navigate = useNavigate();
  const isStudioOrganizer = !!user && organizer?.status === "approved";

  const firstName = (() => {
    const fn = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;
    if (fn) return fn.split(" ")[0];
    return user?.email?.split("@")[0] ?? "you";
  })();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

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
        <div className="container mx-auto px-4 py-4 md:py-6 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center hover:opacity-90 transition-opacity flex-shrink-0">
            <Logo height={32} />
          </Link>
          <nav className="flex items-center gap-1 md:gap-2 text-sm">
            <Link
              to="/about"
              className="hidden sm:inline-flex px-3 py-2 rounded-lg font-semibold text-foreground/80 hover:text-primary transition-colors"
            >
              About
            </Link>
            <Link
              to="/contact"
              className="hidden md:inline-flex px-3 py-2 rounded-lg font-semibold text-foreground/80 hover:text-primary transition-colors"
            >
              Contact
            </Link>

            {/* Studio button — only visible when the signed-in user is an approved organizer */}
            {isStudioOrganizer && (
              <Link
                to="/studio"
                className="inline-flex items-center gap-1.5 px-3 md:px-4 min-h-[40px] rounded-lg font-bold text-sm text-white shadow-md hover:shadow-lg transition-all"
                style={{ background: "linear-gradient(135deg, #003399, #0066cc)" }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ticket Safe Studio</span>
                <span className="sm:hidden">Studio</span>
              </Link>
            )}

            {user ? (
              // ── Logged in: profile chip with dropdown ──────────────────
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-2 min-h-[40px] px-3 md:px-4 rounded-lg font-semibold text-primary border border-primary/20 hover:bg-primary/5 transition-colors">
                    <User className="w-4 h-4" />
                    <span className="hidden md:inline">Hi, {firstName}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User className="w-4 h-4 mr-2" />
                    My profile
                  </DropdownMenuItem>
                  {isStudioOrganizer && (
                    <DropdownMenuItem onClick={() => navigate("/studio")}>
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Ticket Safe Studio
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              // ── Logged out: Log in + Sign up ───────────────────────────
              <>
                <Link
                  to="/auth?next=/"
                  className="inline-flex items-center justify-center min-h-[40px] px-3 md:px-4 rounded-lg font-semibold text-foreground/80 hover:text-primary transition-colors"
                >
                  Log in
                </Link>
                <Link
                  to="/auth?mode=signup&next=/"
                  className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg font-bold text-white shadow-md hover:shadow-lg transition-all"
                  style={{ background: "linear-gradient(135deg, #003399, #0066cc)" }}
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center relative z-10 px-4 py-6 md:py-12">
        <div className="w-full max-w-5xl">
          {/* Positioning headline — explicitly says what TicketSafe is */}
          <div className="flex flex-col items-center text-center gap-3 md:gap-4 mb-7 md:mb-12 animate-fade-in">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-border shadow-soft text-[11px] md:text-xs font-semibold tracking-wide text-foreground/80">
              <GraduationCap className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="leading-tight">Student-only · Verified by university email</span>
            </div>
            <h1 className="text-[28px] sm:text-3xl md:text-5xl lg:text-6xl font-black text-foreground leading-[1.08] tracking-tight max-w-3xl">
              The ticket platform built for{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                student events.
              </span>
            </h1>
          </div>

          {/* ===== Holographic ticket showcase =====
              Compact horizontal ticket stub between headline and path
              cards. Wide-but-short so it doesn't push the two CTAs out
              of the fold. */}
          <div className="mb-6 md:mb-10">
            <HoloTicket />
          </div>

          {/* Two paths */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-6 animate-slide-up">
            {/* Path 1 — Buy event tickets */}
            <Link
              to="/tickets"
              className="group relative rounded-2xl md:rounded-3xl p-6 md:p-10 overflow-hidden text-white transition-all duration-300 active:scale-[0.99] md:hover:-translate-y-1 md:hover:shadow-hover"
              style={{ background: "var(--gradient-hero)" }}
            >
              {/* Glow accent */}
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl group-hover:opacity-60 transition-opacity"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative">
                <div className="inline-flex w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/15 backdrop-blur items-center justify-center mb-4 md:mb-6 group-hover:scale-110 group-hover:bg-white/25 transition-all">
                  <Ticket className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-white/80 mb-1.5 md:mb-2">
                  <Sparkles className="w-3 h-3" />
                  New
                </div>
                <h2 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">
                  Buy event tickets
                </h2>
                <p className="text-sm md:text-base text-white/80 mb-5 md:mb-8 leading-relaxed max-w-sm">
                  All your campus events in one place. Tickets sold directly by student associations.
                </p>
                <div className="inline-flex items-center gap-2 font-bold text-white text-sm md:text-base group-hover:gap-3 transition-all">
                  Browse events
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Path 2 — Resale marketplace */}
            <Link
              to="/resale"
              className="group relative rounded-2xl md:rounded-3xl p-6 md:p-10 overflow-hidden bg-card border border-border transition-all duration-300 active:scale-[0.99] md:hover:-translate-y-1 md:hover:shadow-hover hover:border-primary/30"
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 blur-3xl group-hover:opacity-50 transition-opacity"
                style={{ background: "radial-gradient(circle, hsl(221 100% 56% / 0.35), transparent 70%)" }}
              />
              <div className="relative">
                <div
                  className="inline-flex w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform"
                  style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
                >
                  <Repeat2 className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary/80 mb-1.5 md:mb-2">
                  Marketplace
                </div>
                <h2 className="text-xl md:text-3xl font-black text-foreground mb-2 md:mb-3 leading-tight">
                  Resale marketplace
                </h2>
                <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-8 leading-relaxed max-w-sm">
                  Sold out? Find a ticket from another student. Got an extra? List it in two minutes and find a buyer fast.
                </p>
                <div className="inline-flex items-center gap-2 font-bold text-primary text-sm md:text-base group-hover:gap-3 transition-all">
                  Go to marketplace
                  <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-7 md:mt-12 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 md:gap-x-8 gap-y-2 text-[11px] md:text-xs font-medium text-muted-foreground">
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
          <div className="mt-6 md:mt-10 text-center">
            <Link
              to="/organizers"
              className="inline-flex flex-wrap items-center justify-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-primary transition-colors"
            >
              Are you organizing an event?{" "}
              <span className="text-primary inline-flex items-center gap-1">
                Apply for TicketSafe Studio
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer micro */}
      <footer className="relative z-10 py-4 md:py-5 border-t border-border/50 bg-background/50 backdrop-blur">
        <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-x-4 md:gap-x-5 gap-y-1.5 text-[11px] md:text-xs text-muted-foreground">
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
