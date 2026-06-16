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
  Loader2,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { detectCampus } from "@/lib/campus";
import { useAuth } from "@/hooks/useAuth";
import { useRecommendations } from "@/hooks/useRecommendations";
import { Sparkles } from "lucide-react";

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
    });
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
              <div className="mb-5">
                <BackButton />
              </div>
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
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading events…</p>
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
                        All upcoming events
                      </div>
                      <div className="flex-1 h-px bg-border" />
                    </div>
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
            <div className="text-xl font-black text-foreground leading-none">€{event.priceFrom}</div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-primary/70" />
              Protection TicketSafe incluse
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
  <div className="text-center py-20 max-w-md mx-auto">
    <div className="inline-flex w-16 h-16 rounded-2xl bg-muted items-center justify-center mb-4">
      <PartyPopper className="w-7 h-7 text-muted-foreground" />
    </div>
    <h3 className="text-xl font-bold text-foreground mb-2">
      {hasAnyEvent ? "No events match your filters" : "No events yet — be the first to organize one"}
    </h3>
    <p className="text-sm text-muted-foreground mb-5">
      {hasAnyEvent
        ? query
          ? <>No match for "<span className="font-semibold text-foreground">{query}</span>". Try a different campus or category.</>
          : category !== "all"
          ? "No events in this category yet. Try another."
          : `Nothing on ${campus === "all" ? "any campus" : campus} right now — check back soon.`
        : "ESCP organizers can create branded events with ticket tiers, secure QR delivery, and live sales — all in Ticket Safe Studio."}
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
