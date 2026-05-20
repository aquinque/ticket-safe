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
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";

type School = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  color: string;
  available: boolean;
};

type Category = "all" | "gala" | "party" | "conference" | "sports";

type Event = {
  id: string;
  title: string;
  organizer: string;
  date: string;
  time: string;
  venue: string;
  category: Exclude<Category, "all">;
  priceFrom: number;
  tiersCount: number;
  capacity: number;
  sold: number;
  gradient: string;
  icon: typeof Music;
};

const schools: School[] = [
  { id: "ebs", name: "EBS Paris", shortName: "EBS Paris", city: "Paris", color: "hsl(195 85% 35%)", available: true },
  { id: "hec", name: "HEC Paris", shortName: "HEC", city: "Jouy-en-Josas", color: "hsl(0 80% 45%)", available: false },
  { id: "sciencespo", name: "Sciences Po", shortName: "Sciences Po", city: "Paris", color: "hsl(280 80% 45%)", available: false },
  { id: "sorbonne", name: "Sorbonne University", shortName: "Sorbonne", city: "Paris", color: "hsl(35 90% 50%)", available: false },
  { id: "dauphine", name: "Paris-Dauphine", shortName: "Dauphine", city: "Paris", color: "hsl(180 70% 40%)", available: false },
];

const ebsEvents: Event[] = [
  {
    id: "ebs-winter-ball-2026",
    title: "EBS Winter Ball 2026",
    organizer: "BDE EBS Paris",
    date: "2026-12-19",
    time: "20:00",
    venue: "Pavillon d'Armenonville, Paris",
    category: "gala",
    priceFrom: 70,
    tiersCount: 3,
    capacity: 700,
    sold: 528,
    gradient: "linear-gradient(135deg, hsl(195 85% 35%), hsl(220 80% 50%))",
    icon: GlassWater,
  },
  {
    id: "ebs-welcome-week",
    title: "Welcome Week Rooftop",
    organizer: "EBS Events",
    date: "2026-09-12",
    time: "22:00",
    venue: "Wanderlust, Paris",
    category: "party",
    priceFrom: 16,
    tiersCount: 2,
    capacity: 550,
    sold: 498,
    gradient: "linear-gradient(135deg, hsl(280 90% 55%), hsl(320 90% 60%))",
    icon: Music,
  },
  {
    id: "ebs-entrepreneurship-summit",
    title: "EBS Entrepreneurship Summit",
    organizer: "EBS Startup Society",
    date: "2026-10-24",
    time: "09:00",
    venue: "EBS Paris Campus",
    category: "conference",
    priceFrom: 15,
    tiersCount: 2,
    capacity: 350,
    sold: 142,
    gradient: "linear-gradient(135deg, hsl(0 80% 50%), hsl(20 90% 55%))",
    icon: Mic2,
  },
  {
    id: "ebs-sports-cup",
    title: "EBS Sports Cup — Final",
    organizer: "EBS Sports",
    date: "2026-05-30",
    time: "18:30",
    venue: "Stade Jean Bouin, Paris",
    category: "sports",
    priceFrom: 9,
    tiersCount: 2,
    capacity: 1000,
    sold: 312,
    gradient: "linear-gradient(135deg, hsl(140 70% 35%), hsl(180 70% 45%))",
    icon: Trophy,
  },
  {
    id: "ebs-international-night",
    title: "EBS International Night",
    organizer: "EBS Alumni Network",
    date: "2026-11-14",
    time: "19:30",
    venue: "Pavillon Cambon Capucines",
    category: "gala",
    priceFrom: 85,
    tiersCount: 3,
    capacity: 300,
    sold: 96,
    gradient: "linear-gradient(135deg, hsl(220 60% 25%), hsl(240 70% 40%))",
    icon: GraduationCap,
  },
  {
    id: "ebs-spring-festival",
    title: "EBS Spring Festival",
    organizer: "BDE EBS Paris",
    date: "2026-04-18",
    time: "21:00",
    venue: "Faust, Paris",
    category: "party",
    priceFrom: 14,
    tiersCount: 2,
    capacity: 650,
    sold: 198,
    gradient: "linear-gradient(135deg, hsl(180 80% 45%), hsl(210 80% 55%))",
    icon: Music,
  },
];

const eventsBySchool: Record<string, Event[]> = {
  ebs: ebsEvents,
};

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
  const [selectedSchool, setSelectedSchool] = useState<string>("ebs");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");

  const school = useMemo(() => schools.find((s) => s.id === selectedSchool)!, [selectedSchool]);
  const allEvents = eventsBySchool[selectedSchool] ?? [];

  const filteredEvents = useMemo(() => {
    return allEvents
      .filter((e) => (category === "all" ? true : e.category === category))
      .filter((e) =>
        query.trim().length === 0
          ? true
          : (e.title + e.organizer + e.venue).toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }, [allEvents, category, query]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="EBS Paris events — TicketSafe"
        description="Buy tickets to EBS Paris events, sold directly by verified student societies."
      />
      <Header minimal />

      <main className="flex-1">
        {/* ===================== HERO ===================== */}
        <section
          className="relative overflow-hidden text-white"
          style={{ background: "var(--gradient-hero)" }}
        >
          {/* Ambient orbs */}
          <div
            className="pointer-events-none absolute -top-32 -left-32 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute top-20 -right-32 w-[28rem] h-[28rem] rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(240 100% 67%), transparent 70%)" }}
          />

          <div className="container mx-auto px-4 py-14 md:py-20 relative">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-xs font-semibold tracking-wider uppercase mb-5">
                <Sparkles className="w-3 h-3" />
                Beta — Direct from campus
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
                EBS Paris events,<br />
                <span className="text-white/90">straight from the organizers.</span>
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-xl mb-8 leading-relaxed">
                Buy tickets for galas, parties, conferences and sports — sold and verified by EBS Paris student societies. No scalpers, no fake tickets.
              </p>

              {/* School picker */}
              <div className="mb-5">
                <div className="text-xs uppercase tracking-[0.2em] font-bold text-white/70 mb-3">
                  Your school
                </div>
                <div className="flex flex-wrap gap-2">
                  {schools.map((s) => {
                    const selected = s.id === selectedSchool;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => s.available && setSelectedSchool(s.id)}
                        disabled={!s.available}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                          selected
                            ? "bg-white text-primary shadow-lg scale-[1.02]"
                            : s.available
                            ? "bg-white/10 backdrop-blur hover:bg-white/20 text-white border border-white/20"
                            : "bg-white/5 text-white/40 cursor-not-allowed border border-white/10"
                        }`}
                      >
                        {selected && <Check className="w-4 h-4" />}
                        {s.shortName}
                        {!s.available && (
                          <span className="text-[10px] uppercase tracking-wider opacity-80 font-bold ml-1">
                            Soon
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Big resale CTA — replaces the marketplace/sell-tickets header buttons */}
              <Link
                to="/resale"
                className="group relative block w-full max-w-3xl rounded-2xl overflow-hidden bg-white text-foreground p-5 md:p-6 hover:scale-[1.01] hover:shadow-2xl transition-all duration-300"
              >
                <div
                  className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl"
                  style={{ background: "radial-gradient(circle, hsl(221 100% 56% / 0.5), transparent 70%)" }}
                />
                <div className="relative flex items-center gap-4 md:gap-5">
                  <div
                    className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Repeat2 className="w-7 h-7 md:w-8 md:h-8 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary mb-1">
                      Resale marketplace
                    </div>
                    <div className="text-lg md:text-xl font-black text-foreground leading-tight">
                      Buy or resell a ticket
                    </div>
                    <div className="text-xs md:text-sm text-muted-foreground mt-0.5">
                      Secondhand seats from any campus — every listing verified, payments held in escrow.
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shrink-0 group-hover:gap-3 transition-all">
                    Go
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <ArrowRight className="sm:hidden w-5 h-5 text-primary shrink-0" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== FILTER & SEARCH ===================== */}
        <section className="sticky top-0 z-20 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
                  style={{ background: school.color }}
                >
                  {school.shortName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-foreground leading-none">{school.shortName}</div>
                  <div className="text-xs text-muted-foreground">{school.city}</div>
                </div>
              </div>

              <div className="hidden md:block w-px h-8 bg-border mx-1" />

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
          </div>
        </section>

        {/* ===================== EVENTS GRID ===================== */}
        <section className="py-10 md:py-14">
          <div className="container mx-auto px-4">
            {filteredEvents.length === 0 ? (
              <EmptyState query={query} category={category} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredEvents.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ===================== COMING SCHOOLS ===================== */}
        <section className="py-12 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                  <Lock className="w-3 h-3" />
                  Rolling out soon
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-foreground">
                  More schools joining the beta
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  We're onboarding new campuses every month.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {schools.filter((s) => !s.available).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold text-foreground/70"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    {s.shortName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== CTA ORGANIZER ===================== */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div
              className="relative max-w-4xl mx-auto rounded-3xl p-8 md:p-12 overflow-hidden text-white"
              style={{ background: "var(--gradient-hero)" }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-2">
                    For student societies
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black mb-3 leading-tight">
                    Selling tickets for your event?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-md leading-relaxed">
                    Apply for TicketSafe Studio — branded event pages, VIP tiers, real-time dashboard. Built for student organizers.
                  </p>
                </div>
                <Link
                  to="/organizers"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold bg-white text-primary hover:bg-white/95 hover:scale-[1.03] transition-all shrink-0"
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
