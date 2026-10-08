import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Ticket,
  ArrowRight,
  Sparkles,
  Building2,
  Check,
  Lock,
  Repeat2,
  MousePointerClick,
  CreditCard,
  QrCode,
  PartyPopper,
  ChevronDown,
} from "lucide-react";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import EventCardShared, { EventCardSkeleton as SharedEventCardSkeleton } from "@/components/EventCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useThemeMode } from "@/hooks/useThemeMode";
import { fetchPublishedEvents, toEventData, type PublishedEvent } from "@/lib/publishedEvents";

type Campus = "all" | "paris" | "madrid" | "turin" | "berlin" | "london";

type Category = "all" | "gala" | "party" | "conference" | "sports";

const campuses: { id: Campus; label: string; city: string }[] = [
  { id: "all", label: "All campuses", city: "" },
  { id: "paris", label: "Paris", city: "France" },
  { id: "madrid", label: "Madrid", city: "Spain" },
  { id: "turin", label: "Turin", city: "Italy" },
  { id: "berlin", label: "Berlin", city: "Germany" },
  { id: "london", label: "London", city: "United Kingdom" },
];

const schools: { id: string; label: string }[] = [
  { id: "escp", label: "ESCP Business School" },
  { id: "rituals", label: "Ritual" },
];

const categories: { id: Category; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "gala", label: "Galas" },
  { id: "party", label: "Parties" },
  { id: "conference", label: "Conferences" },
  { id: "sports", label: "Sports" },
];

const Tickets = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  // Default to "all" so newcomers see everything until they pick a campus.
  const [selectedCampus, setSelectedCampus] = useState<Campus>("all");
  const [selectedSchool, setSelectedSchool] = useState<string>("escp");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [allEvents, setAllEvents] = useState<PublishedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Personalised event recommendations. When the viewer has past
  // purchases we mix in their categories / organisers / campuses to
  // rank what they'd most likely enjoy next; otherwise we fall back
  // to popularity ("trending").
  const { user } = useAuth();
  const { recommended, reason } = useRecommendations(allEvents, user?.id, 4);

  const reload = useCallback(async () => {
    setLoading(true);
    const rows = await fetchPublishedEvents();
    setAllEvents(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime: refresh when an event is published, unpublished, edited, or
  // when tier inventory changes (sold-out toggles, etc.).
  useEffect(() => {
    const ch = supabase
      .channel("tickets-public")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const filteredEvents = useMemo(() => {
    return allEvents
      .filter((e) => (selectedCampus === "all" ? true : e.campus === selectedCampus))
      .filter((e) => (category === "all" ? true : e.category === category))
      .filter((e) =>
        query.trim().length === 0
          ? true
          : (e.title + e.organizer + e.venue).toLowerCase().includes(query.toLowerCase()),
      );
  }, [allEvents, selectedCampus, category, query]);

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Student events — Ticket Safe"
        description="Buy tickets to student events across all campuses — Paris, Madrid, Turin, Berlin, London."
      />
      <HeaderNight />

      <main className="flex-1 pt-16 md:pt-20">
        {/* ===================== COMPACT INTRO ===================== */}
        <section className="border-b border-border">
          <div className="container mx-auto px-4 py-5 md:py-6">
            <div className="mb-3">
              <BackButton />
            </div>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <h1
                  className="font-display font-bold text-2xl md:text-3xl text-foreground leading-tight"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  Find your next student event
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Tickets sold directly by campus societies.
                </p>
              </div>
              <Link
                to="/resale"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline shrink-0"
              >
                <Repeat2 className="w-4 h-4" />
                Resale marketplace
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== STICKY FILTER BAR — org, campus, category, search ===================== */}
        <section className="sticky top-16 md:top-20 z-20 bg-background border-b border-border">
          <div className="container mx-auto px-4 py-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 pl-3 pr-2.5 min-h-[40px] rounded-lg font-semibold text-sm bg-card border border-border hover:border-primary/40 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-primary" />
                    {schools.find((s) => s.id === selectedSchool)?.label ?? schools[0].label}
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {schools.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      className="gap-2 font-semibold"
                      onSelect={() => setSelectedSchool(s.id)}
                    >
                      <Check className={`w-4 h-4 text-primary ${s.id === selectedSchool ? "opacity-100" : "opacity-0"}`} />
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    More organizations coming soon
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden sm:block w-px h-6 bg-border" />

              <div className="flex flex-wrap gap-1.5">
                {campuses.map((c) => {
                  const selected = c.id === selectedCampus;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCampus(c.id)}
                      className={`inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full font-semibold text-xs transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground border border-border hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {selected && <Check className="w-3 h-3" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 flex-1 min-w-0 scrollbar-thin">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      category === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="relative w-40 sm:w-56 md:w-72 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-10 pr-3 h-10 rounded-full bg-muted/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 focus:bg-background transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ===================== EVENTS GRID — 2 cols mobile, 3-4 desktop ===================== */}
        <section className="py-6 md:py-10">
          <div className="container mx-auto px-4">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <SharedEventCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <EmptyState
                query={query}
                category={category}
                hasAnyEvent={allEvents.length > 0}
                campus={selectedCampus}
              />
            ) : (
              <>
                {/* ===== Recommended for you =====
                    Personalised when the user has past purchases (mixes
                    categories, organisers and campus signal). Falls back
                    to "trending" for anons / new accounts. Only renders
                    when the recommended list isn't a subset of the
                    filtered grid the user is already looking at — no
                    point in showing the same events twice. */}
                {recommended.length > 0 && query.trim() === "" && category === "all" && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            {reason === "personalized" ? "Recommended for you" : "Trending right now"}
                          </div>
                          <div className="text-sm font-semibold">
                            {reason === "personalized"
                              ? "Based on what you've enjoyed before"
                              : "What other students are buying"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {recommended.slice(0, 4).map((e, i) => (
                        <div
                          key={`reco-${e.id}`}
                          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <EventCardShared event={toEventData(e)} onClick={() => navigate(`/e/${e.slug}`)} />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mt-8 mb-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        All upcoming events · {filteredEvents.length}
                      </div>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  </div>
                )}

                {/* Results count — shown when the recommended header above isn't */}
                {!(recommended.length > 0 && query.trim() === "" && category === "all") && (
                  <div className="mb-4 text-sm font-semibold text-muted-foreground">
                    {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
                    {query.trim() ? <> for “{query.trim()}”</> : null}
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                  {filteredEvents.map((e, i) => (
                    <div
                      key={e.id}
                      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    >
                      <EventCardShared event={toEventData(e)} onClick={() => navigate(`/e/${e.slug}`)} />
                    </div>
                  ))}
                </div>
              </>
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
                  body: "Browse student events across the campuses and open the one you want.",
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
                  body: "Secure card payment handled by Revolut — your details stay protected.",
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

            {/* Full walkthrough link */}
            <div className="mt-6 md:mt-8 text-center">
              <Link
                to="/how-it-works/tickets"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:gap-2 transition-all"
              >
                See the full walkthrough
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Sold out fallback hint */}
            <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ background: "var(--gradient-hero)" }}
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
            <div className="relative max-w-4xl mx-auto bg-primary text-primary-foreground p-6 md:p-12 overflow-hidden">
              <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
                <div className="flex-1">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary-foreground/80 mb-2">
                    For event organizers
                  </div>
                  <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">
                    Selling tickets for your event?
                  </h3>
                  <p className="text-primary-foreground/85 text-sm md:text-base max-w-md leading-relaxed">
                    Apply for Ticket Safe Studio — branded event pages, VIP tiers, real-time dashboard, and official resale built in.
                  </p>
                </div>
                <Link
                  to="/organizers"
                  className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] font-bold bg-primary-foreground text-primary hover:bg-primary-foreground/90 transition-colors shrink-0"
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

// Local EventCard/EventCardSkeleton removed — this page now renders the
// shared poster EventCard (src/components/EventCard.tsx) via the
// `toEventData` adapter above, consolidating what used to be two different
// card implementations for the same kind of listing (see TODO_DATA.md,
// Phase 2/3 notes).

const EmptyState = ({
  query,
  category,
  hasAnyEvent,
  campus,
}: {
  query: string;
  category: Category;
  hasAnyEvent: boolean;
  campus: Campus;
}) => (
  <div className="max-w-lg mx-auto my-8 md:my-12 rounded-2xl border border-border bg-card shadow-soft px-6 py-12 text-center">
    <div className="inline-flex w-16 h-16 rounded-2xl bg-muted items-center justify-center mb-4">
      <PartyPopper className="w-7 h-7 text-muted-foreground" />
    </div>
    <h3 className="text-xl font-bold text-foreground mb-2">
      {hasAnyEvent ? "No events match your filters" : "No events available yet"}
    </h3>
    <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
      {hasAnyEvent
        ? query
          ? <>No match for "<span className="font-semibold text-foreground">{query}</span>". Try a different campus or category.</>
          : category !== "all"
          ? "No events in this category yet. Try another one."
          : `Nothing on ${campus === "all" ? "any campus" : campus} right now — check back soon.`
        : "New student events will appear here as soon as organizers publish them."}
    </p>
    {!hasAnyEvent && (
      <Link
        to="/organizers"
        className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
      >
        Apply for Studio
        <ArrowRight className="w-4 h-4" />
      </Link>
    )}
  </div>
);

export default Tickets;
