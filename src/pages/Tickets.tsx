import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Calendar,
  MapPin,
  Users,
  Ticket,
  ArrowRight,
  Sparkles,
  Music,
  Trophy,
  Mic2,
  GlassWater,
  GraduationCap,
  Check,
  Clock,
  Flame,
  Lock,
  Repeat2,
  MousePointerClick,
  CreditCard,
  QrCode,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";

type Campus = "all" | "paris" | "madrid" | "turin" | "berlin" | "london";

type Category = "all" | "gala" | "party" | "conference" | "sports";

type Event = {
  id: string;
  title: string;
  organizer: string;
  date: string;
  time: string;
  venue: string;
  campus: Exclude<Campus, "all">;
  category: Exclude<Category, "all">;
  priceFrom: number;
  tiersCount: number;
  capacity: number;
  sold: number;
  gradient: string;
  icon: typeof Music;
};

const campuses: { id: Campus; label: string; city: string }[] = [
  { id: "all", label: "All campuses", city: "" },
  { id: "paris", label: "Paris", city: "France" },
  { id: "madrid", label: "Madrid", city: "Spain" },
  { id: "turin", label: "Turin", city: "Italy" },
  { id: "berlin", label: "Berlin", city: "Germany" },
  { id: "london", label: "London", city: "United Kingdom" },
];

const escpEvents: Event[] = [
  {
    id: "escp-paris-winter-gala-2026",
    title: "ESCP Winter Gala 2026",
    organizer: "BDE ESCP Paris",
    date: "2026-12-12",
    time: "20:00",
    venue: "Pavillon d'Armenonville, Paris",
    campus: "paris",
    category: "gala",
    priceFrom: 65,
    tiersCount: 3,
    capacity: 800,
    sold: 612,
    gradient: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))",
    icon: GlassWater,
  },
  {
    id: "escp-madrid-welcome-party",
    title: "Madrid Welcome Party",
    organizer: "ESCP Madrid Events",
    date: "2026-09-12",
    time: "22:00",
    venue: "Sala Equis, Madrid",
    campus: "madrid",
    category: "party",
    priceFrom: 16,
    tiersCount: 2,
    capacity: 500,
    sold: 452,
    gradient: "linear-gradient(135deg, hsl(14 90% 50%), hsl(35 100% 55%))",
    icon: Music,
  },
  {
    id: "escp-berlin-startup-summit",
    title: "ESCP Berlin Startup Summit",
    organizer: "ESCP Berlin Entrepreneurs",
    date: "2026-10-17",
    time: "09:00",
    venue: "Heizhaus, Berlin",
    campus: "berlin",
    category: "conference",
    priceFrom: 15,
    tiersCount: 2,
    capacity: 350,
    sold: 142,
    gradient: "linear-gradient(135deg, hsl(280 80% 45%), hsl(320 80% 55%))",
    icon: Mic2,
  },
  {
    id: "escp-turin-sports-cup",
    title: "ESCP Turin Sports Cup",
    organizer: "ESCP Turin Sports",
    date: "2026-05-30",
    time: "16:30",
    venue: "Cit Turin Stadium",
    campus: "turin",
    category: "sports",
    priceFrom: 9,
    tiersCount: 2,
    capacity: 900,
    sold: 312,
    gradient: "linear-gradient(135deg, hsl(140 70% 35%), hsl(180 70% 45%))",
    icon: Trophy,
  },
  {
    id: "escp-london-alumni-night",
    title: "London Alumni Night",
    organizer: "ESCP London Alumni",
    date: "2026-11-14",
    time: "19:30",
    venue: "The Ned, London",
    campus: "london",
    category: "gala",
    priceFrom: 85,
    tiersCount: 3,
    capacity: 280,
    sold: 96,
    gradient: "linear-gradient(135deg, hsl(220 60% 25%), hsl(240 70% 40%))",
    icon: GraduationCap,
  },
  {
    id: "escp-paris-spring-festival",
    title: "Spring Festival Paris",
    organizer: "BDE ESCP Paris",
    date: "2026-04-18",
    time: "21:00",
    venue: "Faust, Paris",
    campus: "paris",
    category: "party",
    priceFrom: 14,
    tiersCount: 2,
    capacity: 650,
    sold: 198,
    gradient: "linear-gradient(135deg, hsl(180 80% 45%), hsl(210 80% 55%))",
    icon: Music,
  },
];

const categories: { id: Category; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "gala", label: "Galas" },
  { id: "party", label: "Parties" },
  { id: "conference", label: "Conferences" },
  { id: "sports", label: "Sports" },
];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const daysUntil = (iso: string): number => {
  const target = new Date(iso).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (1000 * 60 * 60 * 24));
};

const Tickets = () => {
  // Default to "all" so newcomers see everything until they pick a campus.
  const [selectedCampus, setSelectedCampus] = useState<Campus>("all");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");

  const filteredEvents = useMemo(() => {
    return escpEvents
      .filter((e) => (selectedCampus === "all" ? true : e.campus === selectedCampus))
      .filter((e) => (category === "all" ? true : e.category === category))
      .filter((e) =>
        query.trim().length === 0
          ? true
          : (e.title + e.organizer + e.venue).toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }, [selectedCampus, category, query]);

  const selectedCampusMeta = campuses.find((c) => c.id === selectedCampus)!;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="ESCP events — Ticket Safe"
        description="Buy tickets to ESCP events across all campuses — Paris, Madrid, Turin, Berlin, London."
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

          <div className="container mx-auto px-4 py-10 md:py-20 relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] md:text-xs font-semibold tracking-wider uppercase mb-4 md:mb-5">
                <Sparkles className="w-3 h-3" />
                Beta — Direct from campus
              </div>
              <h1 className="text-3xl md:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5">
                ESCP events,<br />
                <span className="text-white/90">straight from the organizers.</span>
              </h1>
              <p className="text-sm md:text-lg text-white/80 max-w-xl mb-7 md:mb-8 leading-relaxed">
                All ESCP events in one place — tickets sold directly by your campus societies.
              </p>

              {/* School */}
              <div className="mb-5 md:mb-6">
                <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] font-bold text-white/70 mb-2 md:mb-3">
                  Your school
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl font-semibold text-sm bg-white text-primary shadow-lg cursor-default w-fit"
                    aria-pressed="true"
                  >
                    <Check className="w-4 h-4" />
                    ESCP Business School
                  </button>
                  <span className="text-xs text-white/70 italic">
                    Other schools coming soon
                  </span>
                </div>
              </div>

              {/* Campus picker */}
              <div>
                <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] font-bold text-white/70 mb-2 md:mb-3">
                  Campus
                </div>
                <div className="flex flex-wrap gap-2">
                  {campuses.map((c) => {
                    const selected = c.id === selectedCampus;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCampus(c.id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg font-semibold text-sm transition-all ${
                          selected
                            ? "bg-white text-primary shadow-md scale-[1.02]"
                            : "bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/20"
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Big resale CTA */}
              <Link
                to="/resale"
                className="group relative mt-6 md:mt-7 block w-full max-w-3xl rounded-2xl overflow-hidden bg-white text-foreground p-4 md:p-6 hover:shadow-2xl transition-all duration-300"
              >
                <div
                  className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl"
                  style={{ background: "radial-gradient(circle, hsl(221 100% 56% / 0.5), transparent 70%)" }}
                />
                <div className="relative flex items-center gap-3 md:gap-5">
                  <div
                    className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Repeat2 className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary mb-0.5 md:mb-1">
                      Resale marketplace
                    </div>
                    <div className="text-base md:text-xl font-black text-foreground leading-tight">
                      Buy or resell a ticket
                    </div>
                    <div className="hidden sm:block text-xs md:text-sm text-muted-foreground mt-0.5">
                      Secondhand seats between students — payments held in escrow.
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shrink-0 group-hover:gap-3 transition-all">
                    Go
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <ArrowRight className="md:hidden w-5 h-5 text-primary shrink-0" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== FILTER & SEARCH ===================== */}
        <section className="sticky top-0 z-20 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="container mx-auto px-4 py-3 md:py-4">
            {/* Desktop / tablet: school chip + categories + search on one row */}
            <div className="hidden md:flex md:items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  ES
                </div>
                <div>
                  <div className="font-bold text-foreground leading-none">ESCP</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedCampus === "all" ? "All campuses" : selectedCampusMeta.label}
                  </div>
                </div>
              </div>

              <div className="w-px h-8 bg-border mx-1" />

              {/* Categories */}
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 flex-1">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      category === c.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                />
              </div>
            </div>

            {/* Mobile: compact two-row layout — search + categories scroll */}
            <div className="md:hidden flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-white font-black text-[10px] flex-shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                  aria-hidden="true"
                >
                  ES
                </div>
                <span className="text-xs font-bold text-foreground truncate">
                  ESCP · {selectedCampus === "all" ? "All campuses" : selectedCampusMeta.label}
                </span>
                <div className="relative flex-1 ml-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                  />
                </div>
              </div>
              {/* Horizontal scrolling categories */}
              <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5 scrollbar-thin">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`shrink-0 px-3 min-h-[32px] rounded-full text-xs font-semibold transition-colors ${
                      category === c.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== EVENTS GRID ===================== */}
        <section className="py-8 md:py-14">
          <div className="container mx-auto px-4">
            {filteredEvents.length === 0 ? (
              <EmptyState query={query} category={category} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {filteredEvents.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===================== HOW IT WORKS (direct purchase) ===================== */}
        <section className="py-12 md:py-20 border-t border-border bg-muted/20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Ticket className="w-3 h-3" />
                Buying a ticket
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-foreground mb-2 md:mb-3 leading-tight">
                How it works
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Direct from the organizer. No middlemen, no waiting — your ticket lands in your inbox the moment you pay.
              </p>
            </div>

            {/* Steps */}
            <ol className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">
              {[
                {
                  step: "01",
                  icon: MousePointerClick,
                  title: "Pick your event",
                  body: "Browse ESCP events across the 5 campuses and open the one you want.",
                },
                {
                  step: "02",
                  icon: Ticket,
                  title: "Choose your tier",
                  body: "Regular, VIP, table — pick a tier and the number of tickets.",
                },
                {
                  step: "03",
                  icon: CreditCard,
                  title: "Pay securely",
                  body: "Card payment via Stripe. The organizer is paid directly.",
                },
                {
                  step: "04",
                  icon: QrCode,
                  title: "Ticket on the spot",
                  body: "Your QR ticket is emailed to you right away. Scan it at the door.",
                },
              ].map(({ step, icon: Icon, title, body }) => (
                <li
                  key={step}
                  className="relative rounded-2xl bg-card border border-border p-5 md:p-6 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-[10px] md:text-xs font-black tracking-[0.18em] text-muted-foreground">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-foreground leading-tight mb-1.5">
                    {title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>

            {/* Sold out fallback hint */}
            <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
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
                  Check the resale marketplace — students often re-list at face value.
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

        {/* ===================== COMING SOON ===================== */}
        <section className="py-8 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold text-muted-foreground">
              <Lock className="w-3 h-3" />
              More schools coming soon
            </div>
          </div>
        </section>

        {/* ===================== CTA ORGANIZER ===================== */}
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
              <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
                <div className="flex-1">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-2">
                    For student societies
                  </div>
                  <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">
                    Selling tickets for your event?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-md leading-relaxed">
                    Apply for Ticket Safe Studio — branded event pages, VIP tiers, real-time dashboard. Built for student organizers.
                  </p>
                </div>
                <Link
                  to="/organizers"
                  className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 hover:scale-[1.03] transition-all shrink-0"
                >
                  Apply for Studio
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

const EventCard = ({ event }: { event: Event }) => {
  const Icon = event.icon;
  const soldPct = Math.round((event.sold / event.capacity) * 100);
  const left = event.capacity - event.sold;
  const days = daysUntil(event.date);
  const isSellingFast = soldPct >= 70 && soldPct < 100;
  const soldOut = soldPct >= 100;

  return (
    <Link
      to={`/tickets/${event.id}`}
      className="group flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 hover:shadow-hover hover:-translate-y-1 transition-all duration-300"
    >
      {/* Visual banner */}
      <div className="relative aspect-[16/9] overflow-hidden" style={{ background: event.gradient }}>
        <div
          className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-50 blur-2xl bg-white/30"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-16 h-16 text-white/80 group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-black/30 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
            {event.category}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
            {event.campus}
          </span>
          {soldOut ? (
            <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider">
              Sold out
            </span>
          ) : isSellingFast ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider">
              <Flame className="w-3 h-3" />
              Selling fast
            </span>
          ) : null}
        </div>

        {/* Days countdown */}
        {days >= 0 && days <= 60 && !soldOut && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/95 text-foreground text-[10px] font-bold inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {days === 0 ? "Today" : `${days}d left`}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col">
        <div className="text-xs font-semibold text-primary mb-1">{event.organizer}</div>
        <h3 className="text-lg font-bold text-foreground leading-tight mb-3 line-clamp-2 group-hover:text-primary transition-colors">
          {event.title}
        </h3>

        <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDate(event.date)} · {event.time}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{event.venue}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5 shrink-0" />
            <span>{event.tiersCount} tiers available</span>
          </div>
        </div>

        {/* Progress bar */}
        {!soldOut && (
          <div className="mb-4">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${soldPct}%`,
                  background: isSellingFast
                    ? "linear-gradient(90deg, hsl(20 95% 55%), hsl(0 90% 60%))"
                    : "var(--gradient-accent)",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground mt-1.5">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {left} left
              </span>
              <span>{soldPct}% sold</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">From</div>
            <div className="text-xl font-black text-foreground leading-none">€{event.priceFrom}</div>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
            soldOut
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground group-hover:gap-2.5 group-hover:bg-primary-hover"
          }`}>
            {soldOut ? "Sold out" : "Get tickets"}
            {!soldOut && <ArrowRight className="w-3.5 h-3.5 transition-all" />}
          </div>
        </div>
      </div>
    </Link>
  );
};

const EmptyState = ({ query, category }: { query: string; category: Category }) => (
  <div className="text-center py-20">
    <div className="inline-flex w-16 h-16 rounded-2xl bg-muted items-center justify-center mb-4">
      <Search className="w-7 h-7 text-muted-foreground" />
    </div>
    <h3 className="text-xl font-bold text-foreground mb-2">No events found</h3>
    <p className="text-sm text-muted-foreground">
      {query
        ? <>No match for "<span className="font-semibold text-foreground">{query}</span>".</>
        : category !== "all"
        ? `No events in this category right now.`
        : `No events on this campus yet — check back soon.`}
    </p>
  </div>
);

export default Tickets;
