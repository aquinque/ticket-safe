import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
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
  MapPin,
  LocateFixed,
  Loader2,
  Flame,
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

type Category = "all" | "gala" | "party" | "conference" | "sports";

const categories: { id: Category; label: string }[] = [
  { id: "all", label: "All events" },
  { id: "gala", label: "Galas" },
  { id: "party", label: "Parties" },
  { id: "conference", label: "Conferences" },
  { id: "sports", label: "Sports" },
];

// ── Near you ────────────────────────────────────────────────────────────────
// Events carry a city (events.campus, derived from the organiser when it is
// not set). The page sorts the viewer's city first: from the phone's
// position when they allow it, else from their profile, else from a city
// they pick. Nothing is filtered out; far events just come after.

const CITIES = [
  { id: "paris", label: "Paris", lat: 48.8566, lng: 2.3522 },
  { id: "london", label: "London", lat: 51.5074, lng: -0.1278 },
  { id: "madrid", label: "Madrid", lat: 40.4168, lng: -3.7038 },
  { id: "berlin", label: "Berlin", lat: 52.52, lng: 13.405 },
  { id: "turin", label: "Turin", lat: 45.0703, lng: 7.6869 },
] as const;
type CityId = (typeof CITIES)[number]["id"];
const NEAR_KEY = "ts.nearCity";

function nearestCity(lat: number, lng: number): CityId {
  const d2 = (a: { lat: number; lng: number }) => {
    const dLat = ((a.lat - lat) * Math.PI) / 180;
    const dLng = ((a.lng - lng) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * Math.asin(Math.sqrt(x));
  };
  return [...CITIES].sort((a, b) => d2(a) - d2(b))[0].id;
}

function useNearCity(userId: string | undefined) {
  const [city, setCity] = useState<CityId | null>(() => {
    try {
      const saved = localStorage.getItem(NEAR_KEY);
      return CITIES.some((c) => c.id === saved) ? (saved as CityId) : null;
    } catch {
      return null;
    }
  });
  const [source, setSource] = useState<"gps" | "profile" | "manual" | null>(city ? "manual" : null);
  const [locating, setLocating] = useState(false);

  const remember = (id: CityId) => {
    try { localStorage.setItem(NEAR_KEY, id); } catch { /* private mode */ }
  };

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const id = nearestCity(pos.coords.latitude, pos.coords.longitude);
        setCity(id);
        setSource("gps");
        remember(id);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }, []);

  // If the browser already allowed location on an earlier visit, use it
  // without asking again. Never pops the permission prompt on its own.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: "geolocation" as PermissionName })
      .then((p) => { if (p.state === "granted") locate(); })
      .catch(() => undefined);
  }, [locate]);

  // Signed in and nothing known yet: their profile campus is a fine guess.
  useEffect(() => {
    if (city || !userId) return;
    supabase.from("profiles").select("campus").eq("id", userId).maybeSingle().then(({ data }) => {
      const match = CITIES.find((c) => c.label.toLowerCase() === ((data?.campus as string | null) ?? "").toLowerCase());
      if (match) { setCity(match.id); setSource("profile"); }
    });
  }, [userId, city]);

  const choose = (id: CityId) => { setCity(id); setSource("manual"); remember(id); };
  return { city, source, locating, locate, choose };
}

const DAY_MS = 86_400_000;
const daysFromNow = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);

const Tickets = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  // null = no organization filter (the dropdown reads "Select").
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [allEvents, setAllEvents] = useState<PublishedEvent[]>([]);
  const { user } = useAuth();
  const near = useNearCity(user?.id);
  const nearCity = CITIES.find((c) => c.id === near.city) ?? null;

  // Organizations come from the real Ticket Studio accounts behind the
  // published events (name + logo from organizer_profiles), never a static
  // list — a new organizer shows up here the moment it publishes an event.
  const organizations = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; logo: string | null; color: string }>();
    for (const e of allEvents) {
      if (!seen.has(e.organizerId)) {
        seen.set(e.organizerId, { id: e.organizerId, label: e.organizer, logo: e.organizerLogo, color: e.organizerColor });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [allEvents]);
  const activeOrg = organizations.find((o) => o.id === selectedOrg) ?? null;
  const [loading, setLoading] = useState(true);

  // Personalised event recommendations when the viewer has past purchases.
  // The hook's row type is narrower than PublishedEvent in name only; the fields it reads are all there.
  const { recommended: recommendedRaw, reason } = useRecommendations(allEvents as unknown as Parameters<typeof useRecommendations>[0], user?.id, 4);
  const recommended = recommendedRaw as unknown as PublishedEvent[];

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
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "event_tiers" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const isNear = useCallback((e: PublishedEvent) => !!nearCity && e.campus === nearCity.id, [nearCity]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEvents
      .filter((e) => (selectedOrg ? e.organizerId === selectedOrg : true))
      .filter((e) => (category === "all" ? true : e.category === category))
      .filter((e) => (q ? (e.title + e.organizer + e.venue).toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const na = isNear(a) ? 0 : 1;
        const nb = isNear(b) ? 0 : 1;
        if (na !== nb) return na - nb;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [allEvents, selectedOrg, category, query, isNear]);

  const nearCount = useMemo(() => filteredEvents.filter(isNear).length, [filteredEvents, isNear]);
  const firstFar = useMemo(() => filteredEvents.findIndex((e) => !isNear(e)), [filteredEvents, isNear]);

  // The next seven days, soonest first, for the rail at the top.
  const soon = useMemo(
    () => [...allEvents].filter((e) => { const d = daysFromNow(e.date); return d >= 0 && d <= 7; }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 8),
    [allEvents],
  );
  const thisWeekCount = useMemo(() => allEvents.filter((e) => { const d = daysFromNow(e.date); return d >= 0 && d <= 7; }).length, [allEvents]);
  const tonightCount = useMemo(() => allEvents.filter((e) => daysFromNow(e.date) === 0).length, [allEvents]);
  const showReco = recommended.length > 0 && reason === "personalized" && query.trim() === "" && category === "all" && !selectedOrg;

  const chip = "shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-[40px] text-xs font-semibold border transition-colors";

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Student events near you — Ticket Safe"
        description="Buy tickets to student events near you: parties, galas, conferences and sports, sold directly by the organisers."
      />
      <HeaderNight />

      <main className="flex-1 pt-16 md:pt-20">
        {/* ===================== HERO — near you, this week ===================== */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, hsl(var(--primary) / 0.35) 0%, hsl(var(--background)) 55%, hsl(var(--background)) 100%)" }} />
            <div className="absolute -top-24 -left-20 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-40" style={{ background: "hsl(var(--primary))" }} />
            <div className="absolute -bottom-32 right-[-6rem] w-[22rem] h-[22rem] rounded-full blur-3xl opacity-25" style={{ background: "hsl(var(--cta))" }} />
          </div>
          <div className="relative container mx-auto px-4 py-7 md:py-10">
            <div className="mb-4"><BackButton /></div>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div className="min-w-0">
                <h1 className="font-display font-bold text-4xl md:text-6xl text-foreground leading-[0.98] text-balance motion-safe:animate-slide-up" style={{ letterSpacing: "-0.02em" }}>
                  Nights out{nearCity ? <> near <span className="text-primary">{nearCity.label}</span></> : " near you"}
                </h1>
                <p className="text-sm md:text-base text-muted-foreground mt-3 max-w-xl motion-safe:animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
                  Tickets sold directly by the organisers and associations behind them. Closest to you first.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 motion-safe:animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-2 pl-3 pr-2.5 min-h-[44px] font-semibold text-sm bg-card/80 backdrop-blur border border-border hover:border-primary/50 transition-colors">
                      {near.locating ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <MapPin className="w-4 h-4 text-primary" />}
                      {nearCity ? `Near ${nearCity.label}` : "Sort by my location"}
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="gap-2 py-2.5 font-semibold" onSelect={near.locate}>
                      <LocateFixed className="w-4 h-4 text-primary" /> Use my location
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {CITIES.map((c) => (
                      <DropdownMenuItem key={c.id} className="gap-2 py-2" onSelect={() => near.choose(c.id)}>
                        <span className="flex-1">{c.label}</span>
                        <Check className={`w-4 h-4 text-primary ${c.id === near.city ? "opacity-100" : "opacity-0"}`} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Link to="/resale" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-sm font-semibold text-foreground border border-border bg-card/60 hover:border-primary/50 transition-colors">
                  <Repeat2 className="w-4 h-4 text-primary" />
                  Resale
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== STICKY FILTER BAR — org, category, search ===================== */}
        <section className="sticky top-16 md:top-20 z-20 bg-background/90 backdrop-blur border-b border-border">
          <div className="container mx-auto px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="shrink-0 inline-flex items-center gap-2 pl-2.5 pr-2 min-h-[40px] font-semibold text-xs bg-card border border-border hover:border-primary/40 transition-colors">
                    {activeOrg?.logo ? (
                      <img src={activeOrg.logo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    ) : (
                      <Building2 className="w-4 h-4 text-primary" />
                    )}
                    <span className="max-w-[120px] truncate">{activeOrg?.label ?? "Organiser"}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {organizations.map((o, i) => (
                    <Fragment key={o.id}>
                      {i > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem className="gap-3 py-2.5 font-semibold" onSelect={() => setSelectedOrg((cur) => (cur === o.id ? null : o.id))}>
                        {o.logo ? (
                          <img src={o.logo} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-md flex items-center justify-center text-sm font-black text-white shrink-0" style={{ background: o.color }}>
                            {o.label[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                        <span className="flex-1 truncate">{o.label}</span>
                        <Check className={`w-4 h-4 text-primary ${o.id === selectedOrg ? "opacity-100" : "opacity-0"}`} />
                      </DropdownMenuItem>
                    </Fragment>
                  ))}
                  {organizations.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No organisers yet</div>}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="ts-chips order-3 w-full sm:order-none sm:w-auto sm:flex-1 flex gap-1.5 overflow-x-auto min-w-0 -mx-4 px-4 sm:mx-0 sm:px-0">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`${chip} ${category === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 sm:flex-none sm:w-56 md:w-72 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  aria-label="Search events"
                  className="w-full pl-9 pr-3 h-10 bg-muted/60 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 focus:bg-background transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ===================== HAPPENING SOON — next 7 days, swipeable ===================== */}
        {!loading && soon.length > 0 && query.trim() === "" && category === "all" && !selectedOrg && (
          <section className="pt-6 md:pt-8">
            <div className="container mx-auto px-4">
              <div className="flex items-end justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><Flame className="w-4 h-4" /></span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/70">Happening soon</div>
                    <div className="text-sm font-semibold">{tonightCount > 0 ? `${tonightCount} tonight, ${thisWeekCount} within the week` : "The next seven days"}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="ts-chips flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2 md:[&>*]:w-64 [&>*]:w-56">
              {soon.map((e, i) => (
                <div key={`soon-${e.id}`} className="snap-start shrink-0 animate-in fade-in slide-in-from-right-4 fill-mode-both" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="rounded-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_hsl(var(--primary)/0.7)]">
                    <EventCardShared event={toEventData(e)} onClick={() => navigate(`/e/${e.slug}`)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===================== EVENTS GRID ===================== */}
        <section className="py-6 md:py-10">
          <div className="container mx-auto px-4">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                {[0, 1, 2, 3, 4, 5].map((i) => <SharedEventCardSkeleton key={i} />)}
              </div>
            ) : filteredEvents.length === 0 ? (
              <EmptyState query={query} category={category} hasAnyEvent={allEvents.length > 0} />
            ) : (
              <>
                {showReco && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/15"><Sparkles className="w-4 h-4 text-primary" /></div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/70">Picked for you</div>
                        <div className="text-sm font-semibold">Based on what you've been to before</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {recommended.slice(0, 4).map((e, i) => (
                        <div key={`reco-${e.id}`} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: `${i * 50}ms` }}>
                          <div className="rounded-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_hsl(var(--primary)/0.7)]">
                            <EventCardShared event={toEventData(e)} onClick={() => navigate(`/e/${e.slug}`)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/70">
                    {nearCity && nearCount > 0 ? `Near ${nearCity.label} · ${nearCount}` : `All events · ${filteredEvents.length}`}
                    {query.trim() ? ` · “${query.trim()}”` : ""}
                  </div>
                  <div className="flex-1 h-px bg-border" />
                  {!nearCity && (
                    <button type="button" onClick={near.locate} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                      <LocateFixed className="w-3.5 h-3.5" /> Sort by my location
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                  {filteredEvents.map((e, i) => (
                    <Fragment key={e.id}>
                      {nearCity && nearCount > 0 && i === firstFar && (
                        <div className="col-span-2 md:col-span-3 lg:col-span-4 flex items-center gap-3 mt-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/70">Elsewhere · {filteredEvents.length - nearCount}</div>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                        <div className="rounded-lg transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_hsl(var(--primary)/0.7)]">
                          <EventCardShared event={toEventData(e)} onClick={() => navigate(`/e/${e.slug}`)} />
                        </div>
                      </div>
                    </Fragment>
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Ticket className="w-3 h-3" />
                Buying a ticket
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-foreground mb-2 md:mb-3 leading-tight">How it works</h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                Direct from the organiser. No middlemen, no waiting: your ticket lands in your inbox the moment you pay.
              </p>
            </div>
            <ol className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5">
              {[
                { step: "01", icon: MousePointerClick, title: "Pick your event", body: "Browse what's on near you and open the one you want." },
                { step: "02", icon: Ticket, title: "Choose your ticket", body: "Regular, VIP, table: pick a type and how many." },
                { step: "03", icon: CreditCard, title: "Pay securely", body: "Card, Apple Pay or Google Pay through Stripe. Your details stay protected." },
                { step: "04", icon: QrCode, title: "Ticket on the spot", body: "Your QR ticket is emailed right away. Show it at the door." },
              ].map(({ step, icon: Icon, title, body }) => (
                <li key={step} className="relative rounded-2xl bg-card border border-border p-5 md:p-6 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white" style={{ background: "var(--gradient-hero)" }}>
                      <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <span className="text-[10px] md:text-xs font-black tracking-[0.18em] text-muted-foreground">{step}</span>
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-foreground leading-tight mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 md:mt-8 text-center">
              <Link to="/how-it-works/tickets" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:gap-2 transition-all">
                See the full walkthrough
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: "var(--gradient-hero)" }}>
                <Repeat2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm md:text-base text-foreground leading-tight">Event sold out?</div>
                <div className="text-xs md:text-sm text-muted-foreground">Check the resale marketplace. Students often re-list at face value.</div>
              </div>
              <Link to="/resale" className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors">
                Go to resale
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== COMING SOON ===================== */}
        <section className="py-8 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border text-xs font-semibold text-muted-foreground">
              <Lock className="w-3 h-3" />
              More organisers coming soon
            </div>
          </div>
        </section>

        {/* ===================== CTA ORGANIZER ===================== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="relative max-w-4xl mx-auto bg-primary text-primary-foreground p-6 md:p-12 overflow-hidden rounded-3xl">
              <div className="absolute -right-10 -bottom-16 w-64 h-64 rounded-full bg-white/10 pointer-events-none" aria-hidden />
              <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
                <div className="flex-1">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary-foreground/80 mb-2">For event organisers</div>
                  <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">Selling tickets for your event?</h3>
                  <p className="text-primary-foreground/85 text-sm md:text-base max-w-md leading-relaxed">
                    Apply for Ticket Safe Studio: branded event pages, ticket types, a live dashboard, door scanning and payouts.
                  </p>
                </div>
                <Link to="/organizers" className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] font-bold bg-primary-foreground text-primary hover:bg-primary-foreground/90 transition-colors shrink-0">
                  Apply for Studio
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <style>{`
        .ts-chips { scrollbar-width: none; }
        .ts-chips::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

const EmptyState = ({ query, category, hasAnyEvent }: { query: string; category: Category; hasAnyEvent: boolean }) => (
  <div className="max-w-lg mx-auto my-8 md:my-12 rounded-2xl border border-border bg-card px-6 py-12 text-center">
    <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/15 items-center justify-center mb-4">
      <PartyPopper className="w-7 h-7 text-primary" />
    </div>
    <h3 className="text-xl font-bold text-foreground mb-2">{hasAnyEvent ? "Nothing matches" : "No events yet"}</h3>
    <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
      {hasAnyEvent
        ? query
          ? <>No match for "<span className="font-semibold text-foreground">{query}</span>". Try another word or category.</>
          : category !== "all"
          ? "No events in this category yet. Try another one."
          : "Nothing on right now. Check back soon."
        : "New student events will appear here as soon as organisers publish them."}
    </p>
    {!hasAnyEvent && (
      <Link to="/organizers" className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors">
        Apply for Studio
        <ArrowRight className="w-4 h-4" />
      </Link>
    )}
  </div>
);

export default Tickets;
