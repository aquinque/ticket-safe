import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Ticket, Repeat2, ShieldCheck, QrCode, Lock, User, LogOut, LayoutDashboard, Banknote } from "lucide-react";
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
    // Hard reload so the whole app re-initialises signed-out.
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <SEOHead
        title="TicketSafe — Buy event tickets or resell safely"
        description="Two ways to find your ticket: buy directly from verified event organizers, or trade on the secure resale marketplace."
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
                className="inline-flex items-center gap-1.5 px-3 md:px-4 min-h-[40px] rounded-lg font-bold text-sm text-white bg-primary hover:bg-primary/90 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
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
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="font-semibold">
                    <User className="w-4 h-4 mr-2" />
                    My profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-tickets")} className="font-semibold">
                    <Ticket className="w-4 h-4 mr-2" />
                    My Tickets
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings/listings")} className="font-semibold">
                    <Banknote className="w-4 h-4 mr-2" />
                    My Wallet
                  </DropdownMenuItem>
                  {isStudioOrganizer && (
                    <DropdownMenuItem onClick={() => navigate("/studio")}>
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Ticket Safe Studio
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
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
                  className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-lg font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
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
            <h1 className="text-[28px] sm:text-3xl md:text-5xl lg:text-6xl font-black text-foreground leading-[1.08] tracking-tight max-w-3xl">
              The ticket platform built for{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                student events.
              </span>
            </h1>
          </div>

          {/* Studio quick access — the single most important thing an approved
              organizer needs to find on this page, especially on a phone.
              Shown above the buyer paths, full-width, one tap to /studio. */}
          {isStudioOrganizer && (
            <Link
              to="/studio"
              className="group flex items-center gap-3 md:gap-4 mb-3.5 md:mb-6 px-4 md:px-6 py-4 md:py-5 rounded-lg text-white bg-primary hover:bg-primary/90 transition-colors animate-slide-up"
            >
              <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/75">
                  Welcome back
                </div>
                <div className="font-black text-base md:text-lg leading-tight">
                  Go to Ticket Safe Studio
                </div>
              </div>
              <ArrowRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}

          {/* Two paths — one vertical list, not two boxes side by side.
              Resale first (per 7f7015c: that's the primary use case). */}
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden animate-slide-up">
            <Link
              to="/resale"
              className="group flex items-center gap-4 p-5 md:p-6 hover:bg-muted/50 transition-colors"
            >
              <Repeat2 className="w-6 h-6 md:w-7 md:h-7 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-black text-base md:text-lg leading-tight text-foreground">
                  Resale marketplace
                </div>
                <p className="text-sm text-muted-foreground">
                  Buy from or sell to another student.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0 group-hover:translate-x-1 group-hover:text-primary transition-all" />
            </Link>

            <Link
              to="/tickets"
              className="group flex items-center gap-4 p-5 md:p-6 hover:bg-muted/50 transition-colors"
            >
              <Ticket className="w-6 h-6 md:w-7 md:h-7 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-black text-base md:text-lg leading-tight text-foreground">
                  Buy event tickets
                </div>
                <p className="text-sm text-muted-foreground">
                  Official tickets, sold directly by student organizers.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0 group-hover:translate-x-1 group-hover:text-primary transition-all" />
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
      <footer className="relative z-10 py-4 md:py-5 border-t border-border/50 bg-background/50">
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
