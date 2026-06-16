/**
 * Marketplace — Editorial Cinematic redesign.
 *
 * Top-down anatomy:
 *   1. Full-bleed navy gradient hero with editorial serif headline,
 *      animated KPI strip (total billets / new today / avg price), and a
 *      prominent search input.
 *   2. Sticky chip-filter rail (categories, price buckets, schools).
 *   3. Result bar with live count + sort dropdown.
 *   4. Bento grid: a Featured event card spans 2×2 (boosted listings float
 *      to the top), followed by uniform standard cards in a 3-column grid
 *      with staggered fade-in on mount and on filter change.
 *   5. Skeleton loading + editorial empty state.
 *
 * Motion rules
 * - prefers-reduced-motion: instantly snaps counters + disables stagger.
 * - Cards fade-in with a 50ms-per-index stagger when filterHash changes.
 * - Counter targets are debounced 250ms after filter state settles so the
 *   number doesn't twitch on every keystroke.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  Calendar,
  Ticket,
  ShieldCheck,
  Loader2,
  ArrowRight,
  Sparkles,
  GraduationCap,
  X,
  MessageSquare,
  Flame,
  Clock,
  Music,
  GlassWater,
  Mic2,
  Trophy,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings, TicketListing } from "@/contexts/TicketListingsContext";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateConversation } from "@/hooks/useChat";
import { calcBreakdown } from "@/lib/fees";
import { toast } from "sonner";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const isBoosted = (l: TicketListing): boolean =>
  !!l.boostedUntil && new Date(l.boostedUntil).getTime() > Date.now();

const isToday = (iso?: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};

const daysUntil = (iso: string): number => {
  const target = new Date(iso).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (1000 * 60 * 60 * 24));
};

const ICON_BY_CATEGORY: Record<string, typeof Music> = {
  party: Music,
  gala: GlassWater,
  conference: Mic2,
  sports: Trophy,
  other: Sparkles,
};

// Derive a deterministic navy-family gradient from any event id so cards
// without a banner still look intentional rather than blank.
const fallbackGradient = (eventId: string): string => {
  let h = 0;
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) | 0;
  const hue1 = 215 + (Math.abs(h) % 18);
  const hue2 = 200 + (Math.abs(h >> 4) % 22);
  return `linear-gradient(135deg, hsl(${hue1} 100% 28%), hsl(${hue2} 95% 45%))`;
};

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ────────────────────────────────────────────────────────────────────────────
// Animated counter — rAF easing, snaps under prefers-reduced-motion.
// ────────────────────────────────────────────────────────────────────────────

function useAnimatedCount(target: number, durationMs = 600, debounceMs = 250): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (reducedMotion()) {
        setDisplay(target);
        return;
      }
      const from = display;
      const start = performance.now();
      const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
      const tick = (now: number) => {
        const elapsed = Math.min((now - start) / durationMs, 1);
        const v = Math.round(from + (target - from) * easeOutQuart(elapsed));
        setDisplay(v);
        if (elapsed < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, debounceMs);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

// ────────────────────────────────────────────────────────────────────────────
// Data model — event groups derived from listings
// ────────────────────────────────────────────────────────────────────────────

interface EventGroup {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  eventCategory: string;
  eventUniversity: string;
  eventCampus: string | null;
  tickets: TicketListing[];
  minPrice: number;
  totalAvailable: number;
  hasBoosted: boolean;
}

function groupByEvent(listings: TicketListing[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const l of listings) {
    const eid = l.event.id;
    if (!map.has(eid)) {
      map.set(eid, {
        eventId: eid,
        eventTitle: l.event.title,
        eventDate: l.event.date,
        eventLocation: l.event.location,
        eventCategory: l.event.category,
        eventUniversity: l.university,
        eventCampus: l.campus,
        tickets: [],
        minPrice: Infinity,
        totalAvailable: 0,
        hasBoosted: false,
      });
    }
    const g = map.get(eid)!;
    g.tickets.push(l);
    g.totalAvailable += l.quantity;
    if (l.sellingPrice < g.minPrice) g.minPrice = l.sellingPrice;
    if (isBoosted(l)) g.hasBoosted = true;
  }
  // Sort tickets within each group: boosted first, then cheapest.
  for (const g of map.values()) {
    g.tickets.sort((a, b) => {
      const ab = Number(isBoosted(b)) - Number(isBoosted(a));
      if (ab !== 0) return ab;
      return a.sellingPrice - b.sellingPrice;
    });
  }
  return Array.from(map.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

const PRICE_BUCKETS: { id: string; label: string; matches: (p: number) => boolean }[] = [
  { id: "lt20", label: "< 20€",  matches: (p) => p < 20 },
  { id: "20to50", label: "20€ – 50€", matches: (p) => p >= 20 && p <= 50 },
  { id: "gt50", label: "50€+", matches: (p) => p > 50 },
];

const CATEGORY_CHIPS: { id: string; label: string }[] = [
  { id: "party",      label: "Soirées" },
  { id: "gala",       label: "Galas" },
  { id: "conference", label: "Conférences" },
  { id: "sports",     label: "Sport" },
];

const Buy = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listings, isLoading } = useTicketListings();

  // ── Filter state ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [activePriceBucket, setActivePriceBucket] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeUniversities, setActiveUniversities] = useState<Set<string>>(new Set());
  const [activeCampuses, setActiveCampuses] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"relevance" | "price-asc" | "date-asc">("relevance");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const resetAll = () => {
    setSearchQuery("");
    setActivePriceBucket(null);
    setActiveCategories(new Set());
    setActiveUniversities(new Set());
    setActiveCampuses(new Set());
  };

  const toggleInSet = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // ── Derived filter state ────────────────────────────────────────
  const allUniversities = useMemo(
    () => Array.from(new Set(listings.map((l) => l.university).filter(Boolean))).sort(),
    [listings],
  );
  const allCampuses = useMemo(
    () =>
      Array.from(
        new Set(listings.map((l) => l.campus).filter((c): c is string => !!c)),
      ).sort(),
    [listings],
  );

  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack =
          (l.event.title + " " + l.event.location + " " + (l.university || "") + " " + (l.campus || "")).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Price bucket
      if (activePriceBucket) {
        const bucket = PRICE_BUCKETS.find((b) => b.id === activePriceBucket);
        if (bucket && !bucket.matches(l.sellingPrice)) return false;
      }
      // Categories
      if (activeCategories.size && !activeCategories.has((l.event.category || "").toLowerCase())) {
        return false;
      }
      // Universities
      if (activeUniversities.size && !activeUniversities.has(l.university)) return false;
      // Campuses
      if (activeCampuses.size && !activeCampuses.has(l.campus || "")) return false;
      return true;
    });
  }, [listings, searchQuery, activePriceBucket, activeCategories, activeUniversities, activeCampuses]);

  const filteredGroups = useMemo(() => {
    const groups = groupByEvent(filteredListings);
    if (sortBy === "price-asc") {
      return [...groups].sort((a, b) => a.minPrice - b.minPrice);
    }
    if (sortBy === "date-asc") {
      return [...groups].sort(
        (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
      );
    }
    // relevance: boosted first, then nearest event date
    return [...groups].sort((a, b) => {
      if (a.hasBoosted !== b.hasBoosted) return a.hasBoosted ? -1 : 1;
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    });
  }, [filteredListings, sortBy]);

  // Featured group = first that has boosted, fallback to first group.
  const featuredGroup = filteredGroups.find((g) => g.hasBoosted) ?? filteredGroups[0] ?? null;
  const standardGroups = featuredGroup
    ? filteredGroups.filter((g) => g.eventId !== featuredGroup.eventId)
    : filteredGroups;

  // ── KPI targets ─────────────────────────────────────────────────
  const totalTickets = filteredListings.reduce((sum, l) => sum + l.quantity, 0);
  const newToday = filteredListings.filter((l) => isToday(l.timestamp)).length;
  const avgPrice = filteredListings.length
    ? Math.round(filteredListings.reduce((s, l) => s + l.sellingPrice, 0) / filteredListings.length)
    : 0;
  const displayTickets = useAnimatedCount(totalTickets);
  const displayNew = useAnimatedCount(newToday);
  const displayAvg = useAnimatedCount(avgPrice);

  // filterHash → unique key to retrigger stagger fade-in
  const filterHash = `${searchQuery}|${activePriceBucket}|${Array.from(activeCategories).sort().join(",")}|${Array.from(activeUniversities).sort().join(",")}|${Array.from(activeCampuses).sort().join(",")}|${sortBy}`;

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (activePriceBucket ? 1 : 0) +
    activeCategories.size +
    activeUniversities.size +
    activeCampuses.size;

  // ── Actions ────────────────────────────────────────────────────
  const handleMakeOffer = async (ticket: TicketListing) => {
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (user.id === ticket.sellerId) {
      toast.error("Tu ne peux pas faire une offre sur ton propre billet.");
      return;
    }
    try {
      const convId = await getOrCreateConversation(ticket.id, user.id, ticket.sellerId);
      navigate(`/messages/${convId}`);
    } catch {
      toast.error("Impossible de démarrer la conversation.");
    }
  };

  const handleBuy = (ticket: TicketListing) => {
    navigate(`/checkout?listing_id=${ticket.id}`);
  };

  const scrollToGrid = () => {
    document.getElementById("marketplace-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <SEOHead
        titleKey="marketplace.buy.title"
        descriptionKey="marketplace.buy.description"
      />
      <Header />

      {/* =================== EDITORIAL HERO =================== */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: "var(--gradient-hero)" }}
      >
        {/* Film grain overlay — editorial paper feel */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
        {/* Vignette glow */}
        <div
          className="absolute -top-32 -right-32 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[32rem] h-[32rem] rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(240 100% 70%), transparent 70%)" }}
        />

        <div className="relative container mx-auto max-w-6xl px-4 md:px-6 pt-12 md:pt-20 pb-10 md:pb-16">
          <p className="text-[10px] md:text-xs font-bold tracking-[0.3em] uppercase text-white/70 mb-5">
            Le marketplace étudiant
          </p>

          <h1
            className="font-bold leading-[0.95] tracking-tight mb-7 md:mb-9 max-w-4xl"
            style={{
              fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
              fontSize: "clamp(2.5rem, 7vw, 5.5rem)",
            }}
          >
            Des billets, <br className="hidden sm:block" />
            <span className="italic font-normal text-white/95">entre étudiants.</span>{" "}
            <span className="text-white/75">Protégés.</span>
          </h1>

          {/* KPI strip — three editorial metrics with animated count-up */}
          <div className="flex flex-wrap items-end gap-x-6 md:gap-x-10 gap-y-4 mb-8 md:mb-10">
            <div>
              <div className="text-3xl md:text-5xl font-black tabular-nums leading-none">
                {displayTickets.toLocaleString("fr-FR")}
              </div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-white/65 mt-1.5">
                billets dispos
              </div>
            </div>
            <div className="h-10 w-px bg-white/20 hidden md:block" />
            <div>
              <div className="text-3xl md:text-5xl font-black tabular-nums leading-none">
                {displayNew}
              </div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-white/65 mt-1.5">
                nouveaux aujourd'hui
              </div>
            </div>
            <div className="h-10 w-px bg-white/20 hidden md:block" />
            <div>
              <div className="text-3xl md:text-5xl font-black tabular-nums leading-none">
                €{displayAvg}
              </div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-white/65 mt-1.5">
                prix moyen
              </div>
            </div>
          </div>

          {/* Search — editorial, oversized, single CTA inline */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/55 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cherche un événement, une école, un campus…"
              className="h-14 md:h-16 pl-14 pr-32 md:pr-36 text-base md:text-lg bg-white text-foreground placeholder:text-muted-foreground/60 border-0 rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.45)] focus-visible:ring-2 focus-visible:ring-white/70"
            />
            <button
              onClick={scrollToGrid}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 md:h-12 px-4 md:px-5 inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-hover transition-colors"
            >
              Explorer
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* =================== FILTER RAIL (sticky) =================== */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {/* Category chips */}
            {CATEGORY_CHIPS.map((c) => {
              const active = activeCategories.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategories(toggleInSet(activeCategories, c.id))}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-foreground/75 hover:bg-muted/80"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
            <div className="h-5 w-px bg-border shrink-0 mx-1" />
            {/* Price buckets */}
            {PRICE_BUCKETS.map((b) => {
              const active = activePriceBucket === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setActivePriceBucket(active ? null : b.id)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-all tabular-nums ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-foreground/75 hover:bg-muted/80"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            {allUniversities.length > 0 && (
              <>
                <div className="h-5 w-px bg-border shrink-0 mx-1" />
                {allUniversities.map((u) => {
                  const active = activeUniversities.has(u);
                  return (
                    <button
                      key={u}
                      onClick={() => setActiveUniversities(toggleInSet(activeUniversities, u))}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-foreground/75 hover:bg-muted/80"
                      }`}
                    >
                      {u}
                    </button>
                  );
                })}
              </>
            )}
            {allCampuses.length > 0 && (
              <>
                <div className="h-5 w-px bg-border shrink-0 mx-1" />
                {allCampuses.map((c) => {
                  const active = activeCampuses.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setActiveCampuses(toggleInSet(activeCampuses, c))}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold whitespace-nowrap transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-foreground/75 hover:bg-muted/80"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={resetAll}
                className="shrink-0 ml-auto px-3 py-1.5 rounded-full text-xs md:text-sm font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =================== RESULT BAR =================== */}
      <div id="marketplace-grid" className="container mx-auto max-w-6xl px-4 md:px-6 pt-7 md:pt-10">
        <div className="flex items-end justify-between gap-3 mb-5 md:mb-7">
          <div>
            <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-muted-foreground">
              {activeFilterCount > 0 ? "Résultats filtrés" : "Tous les billets"}
            </div>
            <div className="text-2xl md:text-3xl font-black tabular-nums text-foreground leading-tight mt-0.5">
              {filteredGroups.length}
              <span className="text-base md:text-lg font-bold text-muted-foreground ml-1.5">
                événement{filteredGroups.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px] md:w-[210px] h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Pertinence</SelectItem>
              <SelectItem value="price-asc">Prix croissant</SelectItem>
              <SelectItem value="date-asc">Date proche</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* =================== GRID =================== */}
      <main className="flex-1">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 pb-16 md:pb-24">
          {isLoading ? (
            <SkeletonGrid />
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              onReset={resetAll}
              hasAnyListing={listings.length > 0}
              onSell={() => navigate("/marketplace/sell")}
            />
          ) : (
            <div
              key={filterHash}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 [grid-auto-flow:dense]"
            >
              {featuredGroup && (
                <FeaturedCard
                  key={featuredGroup.eventId}
                  group={featuredGroup}
                  index={0}
                  expanded={expandedEvent === featuredGroup.eventId}
                  onToggle={() =>
                    setExpandedEvent(
                      expandedEvent === featuredGroup.eventId ? null : featuredGroup.eventId,
                    )
                  }
                  onBuy={handleBuy}
                  onOffer={handleMakeOffer}
                />
              )}
              {standardGroups.map((g, i) => (
                <StandardCard
                  key={g.eventId}
                  group={g}
                  index={featuredGroup ? i + 1 : i}
                  expanded={expandedEvent === g.eventId}
                  onToggle={() =>
                    setExpandedEvent(expandedEvent === g.eventId ? null : g.eventId)
                  }
                  onBuy={handleBuy}
                  onOffer={handleMakeOffer}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      <style>{`
        @keyframes ts-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ts-fade-up { animation: ts-fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
        @media (prefers-reduced-motion: reduce) {
          .ts-fade-up { animation: none; }
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Featured card — 2×2 magazine cover layout
// ────────────────────────────────────────────────────────────────────────────

function FeaturedCard({
  group,
  index,
  expanded,
  onToggle,
  onBuy,
  onOffer,
}: {
  group: EventGroup;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onBuy: (t: TicketListing) => void;
  onOffer: (t: TicketListing) => void;
}) {
  const days = daysUntil(group.eventDate);
  const Icon = ICON_BY_CATEGORY[(group.eventCategory || "other").toLowerCase()] ?? Sparkles;
  return (
    <div
      className="ts-fade-up sm:col-span-2 lg:col-span-2 lg:row-span-2 relative rounded-2xl overflow-hidden bg-card border border-border shadow-sm group"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Hero image */}
      <div
        className="relative aspect-[16/10] sm:aspect-[16/9] overflow-hidden"
        style={{ background: fallbackGradient(group.eventId) }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-white/40">
          <Icon className="w-24 h-24" strokeWidth={1.2} aria-hidden="true" />
        </div>
        {/* Dark scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

        {/* Featured ribbon */}
        {group.hasBoosted && (
          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400 text-amber-950 font-bold text-[10px] uppercase tracking-wider shadow-md">
            <Sparkles className="w-3 h-3" />
            Featured
          </div>
        )}

        {/* Urgency badge */}
        {days >= 0 && days <= 7 && (
          <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-foreground font-bold text-[10px] uppercase tracking-wider shadow-md">
            <Clock className="w-3 h-3" />
            {days === 0 ? "Ce soir" : days === 1 ? "Demain" : `Dans ${days}j`}
          </div>
        )}

        {/* Title overlay bottom */}
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-white">
          <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-2">
            {group.eventUniversity || "Événement"} · {group.eventCategory || "Event"}
          </div>
          <h2
            className="font-bold leading-[0.98] tracking-tight mb-3 max-w-2xl"
            style={{
              fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
              fontSize: "clamp(1.5rem, 3.2vw, 2.5rem)",
            }}
          >
            {group.eventTitle}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm text-white/85">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(group.eventDate).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            {group.eventLocation && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {group.eventLocation}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer info bar */}
      <div className="p-5 md:p-6 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            À partir de
          </div>
          <div className="text-2xl md:text-3xl font-black text-foreground tabular-nums leading-none mt-0.5">
            €{group.minPrice.toFixed(0)}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-primary/70" />
            Protection TicketSafe incluse
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
            {group.totalAvailable} billet{group.totalAvailable === 1 ? "" : "s"}
          </div>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 px-4 md:px-5 py-2.5 rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-all hover:gap-2.5"
          >
            {expanded ? "Masquer" : "Voir les billets"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && <ExpandedTickets group={group} onBuy={onBuy} onOffer={onOffer} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Standard card
// ────────────────────────────────────────────────────────────────────────────

function StandardCard({
  group,
  index,
  expanded,
  onToggle,
  onBuy,
  onOffer,
}: {
  group: EventGroup;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onBuy: (t: TicketListing) => void;
  onOffer: (t: TicketListing) => void;
}) {
  const days = daysUntil(group.eventDate);
  const Icon = ICON_BY_CATEGORY[(group.eventCategory || "other").toLowerCase()] ?? Sparkles;
  const sellingFast = group.totalAvailable <= 3;

  return (
    <div
      className="ts-fade-up flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 hover:shadow-[0_18px_40px_-20px_hsl(220_100%_30%/0.25)] hover:-translate-y-0.5 transition-all duration-300"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Image */}
      <div
        className="relative aspect-[16/10] overflow-hidden"
        style={{ background: fallbackGradient(group.eventId) }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-white/35 group-hover:text-white/55 transition-colors">
          <Icon className="w-16 h-16" strokeWidth={1.2} aria-hidden="true" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {group.eventCategory && (
            <span className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
              {group.eventCategory}
            </span>
          )}
          {group.eventCampus && (
            <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur text-white text-[10px] font-bold uppercase tracking-wider">
              {group.eventCampus}
            </span>
          )}
          {sellingFast && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500 text-white text-[10px] font-bold uppercase tracking-wider">
              <Flame className="w-3 h-3" />
              Bientôt épuisé
            </span>
          )}
        </div>

        {days >= 0 && days <= 7 && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/95 text-foreground text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {days === 0 ? "Ce soir" : days === 1 ? "Demain" : `Dans ${days}j`}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-5">
        <div className="text-[10px] uppercase tracking-wider font-bold text-primary/80 mb-1">
          {group.eventUniversity || "Événement"}
        </div>
        <h3
          className="font-bold text-foreground leading-tight mb-2.5 line-clamp-2"
          style={{
            fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
            fontSize: "1.15rem",
          }}
        >
          {group.eventTitle}
        </h3>
        <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
          <div className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {new Date(group.eventDate).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          {group.eventLocation && (
            <div className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{group.eventLocation}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3 border-t border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              À partir de
            </div>
            <div className="text-xl font-black text-foreground tabular-nums leading-none mt-0.5">
              €{group.minPrice.toFixed(0)}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-primary/70" />
              Protection incluse
            </div>
          </div>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs bg-primary text-primary-foreground hover:bg-primary-hover transition-all hover:gap-2"
          >
            {expanded ? "Masquer" : "Voir"}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && <ExpandedTickets group={group} onBuy={onBuy} onOffer={onOffer} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Expanded tickets row — shared by Featured + Standard cards
// ────────────────────────────────────────────────────────────────────────────

function ExpandedTickets({
  group,
  onBuy,
  onOffer,
}: {
  group: EventGroup;
  onBuy: (t: TicketListing) => void;
  onOffer: (t: TicketListing) => void;
}) {
  return (
    <div className="border-t border-border bg-muted/30 p-5 space-y-2.5">
      {group.tickets.map((t) => {
        const allIn = calcBreakdown(t.sellingPrice, 1).buyerTotalEuros;
        return (
          <div
            key={t.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-card border border-border"
          >
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-black text-xl text-foreground tabular-nums">
                  €{allIn.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground -ml-0.5">tout compris</span>
                {isBoosted(t) && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold uppercase">
                    <Sparkles className="w-2.5 h-2.5" />
                    Featured
                  </span>
                )}
                {t.verified && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-100 text-green-900 text-[10px] font-bold uppercase">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Vérifié
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {t.quantity} dispo
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                <GraduationCap className="w-3 h-3" />
                Vendeur ESCP vérifié · paiement escrow
              </p>
              {t.description && (
                <p className="text-xs text-foreground/75 mt-1.5 line-clamp-2">{t.description}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onOffer(t)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary font-semibold text-xs hover:bg-primary/5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Offre
              </button>
              <button
                onClick={() => onBuy(t)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                Acheter
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton + empty state
// ────────────────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
      <div className="sm:col-span-2 lg:col-span-2 lg:row-span-2 rounded-2xl overflow-hidden bg-card border border-border">
        <div className="aspect-[16/9] bg-muted animate-pulse" />
        <div className="p-6 space-y-3">
          <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
          <div className="h-6 bg-muted rounded animate-pulse w-3/4" />
          <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border">
          <div className="aspect-[16/10] bg-muted animate-pulse" />
          <div className="p-5 space-y-3">
            <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
            <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onReset,
  hasAnyListing,
  onSell,
}: {
  onReset: () => void;
  hasAnyListing: boolean;
  onSell: () => void;
}) {
  return (
    <div className="text-center py-16 md:py-24 max-w-md mx-auto">
      <div className="inline-flex w-20 h-20 rounded-2xl bg-primary/8 items-center justify-center mb-5">
        <Ticket className="w-9 h-9 text-primary/60" strokeWidth={1.5} />
      </div>
      <h3
        className="text-2xl font-bold text-foreground mb-2"
        style={{ fontFamily: "ui-serif, Georgia, serif" }}
      >
        {hasAnyListing ? "Aucun billet ne correspond" : "Aucun billet pour l'instant"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        {hasAnyListing
          ? "Essaie de réinitialiser tes filtres ou de chercher un autre événement."
          : "Sois le premier à mettre un billet en vente."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {hasAnyListing ? (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Réinitialiser les filtres
          </button>
        ) : (
          <button
            onClick={onSell}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Vendre mon billet
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default Buy;
