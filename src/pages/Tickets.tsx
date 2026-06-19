import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Calendar,
  MapPin,
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
  PartyPopper,
  ShieldCheck,
  ChevronDown,
  BadgeCheck,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { detectCampus } from "@/lib/campus";
import { useAuth } from "@/hooks/useAuth";
import { useRecommendations } from "@/hooks/useRecommendations";

type Campus = "all" | "paris" | "madrid" | "turin" | "berlin" | "london";

type Category = "all" | "gala" | "party" | "conference" | "sports";

type Event = {
  id: string;
  slug: string;
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
  bannerUrl: string | null;
  logoUrl: string | null;
};

const ICON_BY_CATEGORY: Record<string, typeof Music> = {
  party: Music,
  gala: GlassWater,
  conference: Mic2,
  sports: Trophy,
  other: Sparkles,
};

const GRADIENT_BY_CAMPUS: Record<string, string> = {
  paris: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))",
  madrid: "linear-gradient(135deg, hsl(14 90% 50%), hsl(35 100% 55%))",
  turin: "linear-gradient(135deg, hsl(140 70% 35%), hsl(180 70% 45%))",
  berlin: "linear-gradient(135deg, hsl(280 80% 45%), hsl(320 80% 55%))",
  london: "linear-gradient(135deg, hsl(220 60% 25%), hsl(240 70% 40%))",
};

const campuses: { id: Campus; label: string; city: string }[] = [
  { id: "all", label: "All campuses", city: "" },
  { id: "paris", label: "Paris", city: "France" },
  { id: "madrid", label: "Madrid", city: "Spain" },
  { id: "turin", label: "Turin", city: "Italy" },
  { id: "berlin", label: "Berlin", city: "Germany" },
  { id: "london", label: "London", city: "United Kingdom" },
];

/**
 * Hydrate a flat list of published events with their tier aggregates
 * (price floor, total capacity, total sold, tier count). Campus is read
 * from events.campus first; if the row is missing one, we derive it on
 * the fly from the organizer's identity so older rows still classify.
 */
async function fetchPublishedEvents(): Promise<Event[]> {
  const { data: evRows, error } = await supabase
    .from("events")
    .select(
      `id, title, slug, date, location, campus, category, primary_color, banner_url, logo_url, status,
       organizer:organizer_profiles!events_organizer_id_fkey(id, name, slug, primary_color, contact_email, about, logo_url)`,
    )
    .eq("status", "published")
    .not("organizer_id", "is", null)
    .order("date", { ascending: true });

  if (error) {
    console.error("[tickets] fetch events:", error);
    return [];
  }

  const rows = (evRows ?? []) as Array<{
    id: string;
    title: string;
    slug: string | null;
    date: string;
    location: string | null;
    campus: string | null;
    category: string | null;
    primary_color: string | null;
    banner_url: string | null;
    logo_url: string | null;
    organizer: { id: string; name: string; slug: string; primary_color: string; contact_email: string; about: string | null; logo_url: string | null } | { id: string; name: string; slug: string; primary_color: string; contact_email: string; about: string | null; logo_url: string | null }[] | null;
  }>;

  const ids = rows.map((e) => e.id);
  let tierAgg: Record<string, { sold: number; total: number; minPriceCents: number; count: number }> = {};
  if (ids.length) {
    const { data: tiers } = await supabase
      .from("event_tiers")
      .select("event_id, sold_qty, total_qty, price_cents")
      .in("event_id", ids)
      .eq("is_active", true);
    tierAgg = (tiers ?? []).reduce(
      (acc, t: { event_id: string; sold_qty: number; total_qty: number; price_cents: number }) => {
        const cur = acc[t.event_id] ?? { sold: 0, total: 0, minPriceCents: Infinity, count: 0 };
        cur.sold += t.sold_qty;
        cur.total += t.total_qty;
        cur.minPriceCents = Math.min(cur.minPriceCents, t.price_cents);
        cur.count += 1;
        acc[t.event_id] = cur;
        return acc;
      },
      {} as Record<string, { sold: number; total: number; minPriceCents: number; count: number }>,
    );
  }

  return rows
    .filter((e) => e.slug)
    .map((e) => {
      const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer;
      const derivedCampus =
        (e.campus as Campus | null) ??
        detectCampus({
          slug: org?.slug,
          name: org?.name,
          contact_email: org?.contact_email,
          about: org?.about,
          location: e.location,
        }) ??
        "paris";
      const cat = (e.category ?? "other") as string;
      const allowedCats = ["gala", "party", "conference", "sports"] as const;
      const normCategory = (allowedCats as readonly string[]).includes(cat)
        ? (cat as Exclude<Category, "all">)
        : ("party" as Exclude<Category, "all">);
      const agg = tierAgg[e.id];
      return {
        id: e.id,
        slug: e.slug!,
        title: e.title,
        organizer: org?.name ?? "Organizer",
        date: e.date,
        time: new Date(e.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        venue: e.location ?? "",
        campus: derivedCampus as Exclude<Campus, "all">,
        category: normCategory,
        priceFrom: agg && agg.minPriceCents !== Infinity ? Math.ceil(agg.minPriceCents / 100) : 0,
        tiersCount: agg?.count ?? 0,
        capacity: agg?.total ?? 0,
        sold: agg?.sold ?? 0,
        gradient:
          e.primary_color
            ? `linear-gradient(135deg, ${e.primary_color}, hsl(210 100% 45%))`
            : GRADIENT_BY_CAMPUS[derivedCampus] ?? GRADIENT_BY_CAMPUS.paris,
        icon: ICON_BY_CATEGORY[normCategory] ?? Sparkles,
        bannerUrl: e.banner_url,
        logoUrl: e.logo_url ?? org?.logo_url ?? null,
      } satisfies Event;
    })
    // Hide past events. 12h grace so an event happening tonight stays visible
    // through the night and only drops off the next day.
    .filter((e) => new Date(e.date).getTime() >= Date.now() - 12 * 60 * 60 * 1000);
}

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
  const [allEvents, setAllEvents] = useState<Event[]>([]);
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

  const selectedCampusMeta = campuses.find((c) => c.id === selectedCampus)!;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Student events — Ticket Safe"
        description="Buy tickets to student events across all campuses — Paris, Madrid, Turin, Berlin, London."
      />
      <Header minimal />

      <main className="flex-1">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden text-white" style={{ background: "var(--gradient-hero)" }}>
          {/* One restrained glow for depth — no flashy blob cluster. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(70% 90% at 12% 0%, hsl(210 100% 60% / 0.35), transparent 60%)" }}
          />

          <div className="container mx-auto px-4 py-8 md:py-14 relative">
            <div className="mb-5">
              <BackButton />
            </div>

            <div className="grid lg:grid-cols-[1fr_20rem] gap-7 lg:gap-10 lg:items-end">
              {/* Left — intro + filters */}
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 ring-1 ring-white/20 text-[10px] md:text-[11px] uppercase tracking-[0.18em] font-bold text-white/90 mb-4">
                  <Ticket className="w-3 h-3" />
                  Student events marketplace
                </div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.06] mb-3">
                  Find your next student event
                </h1>
                <p className="text-sm md:text-lg text-white/80 max-w-xl mb-7 leading-relaxed">
                  Tickets sold directly by campus societies — discover, filter and buy in a couple of taps.
                </p>

                {/* School + campus filters */}
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] font-bold text-white/70 mb-2">
                      School
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 pl-3.5 pr-3 min-h-[44px] rounded-xl font-semibold text-sm bg-white text-foreground shadow-lg hover:bg-white/95 transition-colors w-fit"
                        >
                          <GraduationCap className="w-4 h-4 text-primary" />
                          ESCP Business School
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuItem className="gap-2 font-semibold" onSelect={(e) => e.preventDefault()}>
                          <Check className="w-4 h-4 text-primary" />
                          ESCP Business School
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          More schools coming soon
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div>
                    <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] font-bold text-white/70 mb-2">
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
                            className={`inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg font-semibold text-sm transition-colors ${
                              selected
                                ? "bg-white text-primary shadow-sm"
                                : "bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/25"
                            }`}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right — resale marketplace card */}
              <Link
                to="/resale"
                className="group block rounded-2xl bg-white text-foreground p-5 md:p-6 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Repeat2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary">
                      Resale marketplace
                    </div>
                    <div className="text-lg font-black text-foreground leading-tight">
                      Buy or resell a ticket
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Student-to-student resale with secure payment handling.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                    <ShieldCheck className="w-3 h-3 text-primary" />
                    Secure payment
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                    <BadgeCheck className="w-3 h-3 text-primary" />
                    Verified tickets
                  </span>
                </div>
                <div className="inline-flex w-full items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-bold text-sm group-hover:gap-2.5 transition-all">
                  Open resale marketplace
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== FILTER & SEARCH ===================== */}
        <section className="sticky top-0 z-20 bg-background/95 backdrop-blur-lg border-b border-border">
          <div className="container mx-auto px-4 py-3 md:py-3.5">
            {/* Desktop / tablet: context + categories + search on one row */}
            <div className="hidden md:flex md:items-center gap-3">
              <div className="inline-flex items-center gap-2 text-sm shrink-0">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span className="font-bold text-foreground leading-none">ESCP</span>
                <span className="text-muted-foreground">
                  · {selectedCampus === "all" ? "All campuses" : selectedCampusMeta.label}
                </span>
              </div>

              <div className="w-px h-6 bg-border mx-1" />

              {/* Categories */}
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

              {/* Search */}
              <div className="relative md:w-72 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search events…"
                  className="w-full pl-10 pr-3 h-10 rounded-full bg-muted/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 focus:bg-background transition-colors"
                />
              </div>
            </div>

            {/* Mobile: search row + scrolling categories */}
            <div className="md:hidden flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground truncate shrink-0">
                  <GraduationCap className="w-3.5 h-3.5 text-primary" />
                  ESCP
                </span>
                <div className="relative flex-1 ml-0.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search events…"
                    className="w-full pl-9 pr-3 h-10 rounded-full bg-muted/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 focus:bg-background transition-colors"
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
                    className={`shrink-0 px-3 min-h-[34px] rounded-full text-xs font-semibold border transition-colors ${
                      category === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border"
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
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <EventCardSkeleton key={i} />
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                      {recommended.slice(0, 4).map((e, i) => (
                        <div
                          key={`reco-${e.id}`}
                          className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <EventCard event={e} />
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                  {filteredEvents.map((e, i) => (
                    <div
                      key={e.id}
                      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    >
                      <EventCard event={e} />
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
  const hasCapacity = event.capacity > 0;
  const soldPct = hasCapacity ? Math.round((event.sold / event.capacity) * 100) : 0;
  const days = daysUntil(event.date);
  const isSellingFast = hasCapacity && soldPct >= 70 && soldPct < 100;
  const soldOut = hasCapacity && soldPct >= 100;

  return (
    <Link
      to={`/e/${event.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 hover:shadow-hover hover:-translate-y-1 transition-all duration-300"
    >
      {/* Visual — banner photo if available, organizer logo on a navy-tinted
          shell otherwise. One single fallback treatment so the grid reads as
          one product (was: slate-100→slate-200, which made the grid look like
          four different products). */}
      <div className="relative aspect-[16/9] overflow-hidden bg-[hsl(220_100%_30%/0.06)] dark:bg-[hsl(220_60%_30%/0.18)]">
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : event.logoUrl ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <img
              src={event.logoUrl}
              alt={event.organizer}
              className="max-h-[80%] max-w-[78%] object-contain group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="w-14 h-14 text-primary/30 group-hover:scale-110 group-hover:text-primary/45 transition-all duration-500" strokeWidth={1.5} />
          </div>
        )}

        {/* Badges — dark pills so they read on a photo or a light logo card */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
            {event.category}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
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

        {/* Scarcity nudge only — buyers don't see exact stock (Studio-only).
            Shown when fewer than 30% of the original tickets remain. */}
        {hasCapacity && !soldOut && soldPct >= 70 && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Few tickets remaining
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">From</div>
            <div className="text-xl font-black text-foreground leading-none">
              {event.priceFrom > 0 ? `€${event.priceFrom}` : "Free"}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-primary/70" />
              Ticket Safe protection included
            </div>
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

const EventCardSkeleton = () => (
  <div className="rounded-2xl overflow-hidden bg-card border border-border">
    <div className="aspect-[16/9] bg-muted animate-pulse" />
    <div className="p-5 space-y-3">
      <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
      <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
      <div className="space-y-2 pt-1">
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
        <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        <div className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  </div>
);

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
