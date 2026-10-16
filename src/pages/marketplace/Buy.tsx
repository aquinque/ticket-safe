/**
 * Resale marketplace, kept simple for buyers.
 *
 * Top-down anatomy:
 *   1. A short intro: one headline, one line of reassurance, a search field
 *      and a Filters button (price, school and campus live behind it).
 *   2. Sticky category chips (All / Parties / Galas / ...).
 *   3. Result count and sort.
 *   4. One uniform grid of event cards: photo, title, date and place, the
 *      cheapest price and a "View tickets" button. The tickets of an event
 *      open inside its card.
 *
 * Same .theme-night tokens as the rest of the public site: navy surfaces,
 * brand-blue actions, the light blue only for urgency tags.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import { BackButton } from "@/components/BackButton";
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
  SlidersHorizontal,
  Ticket,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Flame,
  Clock,
  MessageSquare,
  X,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings, TicketListing } from "@/contexts/TicketListingsContext";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import { getOrCreateConversation } from "@/hooks/useChat";
import { calcBreakdown } from "@/lib/fees";
import { toast } from "sonner";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const isBoosted = (l: TicketListing): boolean =>
  !!l.boostedUntil && new Date(l.boostedUntil).getTime() > Date.now();

const daysUntil = (iso: string): number => {
  const target = new Date(iso).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (1000 * 60 * 60 * 24));
};

const eurLabel = (n: number): string => (Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2)}`);

const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// ────────────────────────────────────────────────────────────────────────────
// Data model — event groups derived from listings
// ────────────────────────────────────────────────────────────────────────────

interface EventGroup {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  tickets: TicketListing[];
  minPrice: number;
  totalAvailable: number;
  hasBoosted: boolean;
  photoUrl: string | null;
  videoUrl: string | null;
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
        tickets: [],
        minPrice: Infinity,
        totalAvailable: 0,
        hasBoosted: false,
        photoUrl: null,
        videoUrl: null,
      });
    }
    const g = map.get(eid)!;
    g.tickets.push(l);
    g.totalAvailable += l.quantity;
    if (l.sellingPrice < g.minPrice) g.minPrice = l.sellingPrice;
    if (isBoosted(l)) g.hasBoosted = true;
  }
  // Tickets inside a group: boosted first, then cheapest. The first ticket
  // with real media wins the card's photo/video, falling back to the event's
  // own official banner/video (set by the organizer) when no reseller
  // uploaded one, which is the common case.
  for (const g of map.values()) {
    g.tickets.sort((a, b) => {
      const ab = Number(isBoosted(b)) - Number(isBoosted(a));
      if (ab !== 0) return ab;
      return a.sellingPrice - b.sellingPrice;
    });
    g.photoUrl = g.tickets.find((t) => t.photoUrl)?.photoUrl ?? g.tickets.find((t) => t.eventBannerUrl)?.eventBannerUrl ?? null;
    g.videoUrl = g.tickets.find((t) => t.videoUrl)?.videoUrl ?? g.tickets.find((t) => t.eventVideoUrl)?.eventVideoUrl ?? null;
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
  { id: "party",      label: "Parties" },
  { id: "gala",       label: "Galas" },
  { id: "conference", label: "Conferences" },
  { id: "sports",     label: "Sports" },
];

const Buy = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listings, isLoading } = useTicketListings();

  // ── Filter state ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Filters behind the button (what the chip row and the search box don't show).
  const panelFilterCount =
    (activePriceBucket ? 1 : 0) + activeUniversities.size + activeCampuses.size;
  const activeFilterCount =
    panelFilterCount + activeCategories.size + (searchQuery.trim() ? 1 : 0);

  // ── Actions ────────────────────────────────────────────────────
  const handleMakeOffer = async (ticket: TicketListing) => {
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (user.id === ticket.sellerId) {
      toast.error("You can't make an offer on your own ticket.");
      return;
    }
    try {
      const convId = await getOrCreateConversation(ticket.id, user.id, ticket.sellerId);
      navigate(`/messages/${convId}`);
    } catch {
      toast.error("Couldn't start the conversation.");
    }
  };

  const handleBuy = (ticket: TicketListing) => {
    navigate(`/checkout?listing_id=${ticket.id}`);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead
        titleKey="marketplace.buy.title"
        descriptionKey="marketplace.buy.description"
      />
      <HeaderNight />

      {/* =================== INTRO =================== */}
      <section className="pt-16 md:pt-20">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 pt-6 md:pt-10 pb-6 md:pb-8">
          <BackButton className="mb-4" />
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
            Tickets, student to student.
          </h1>
          <p className="mt-2 md:mt-3 text-base md:text-lg text-muted-foreground max-w-xl">
            Buy from other students. Your payment is protected.
          </p>

          {/* Search + Filters */}
          <div className="mt-5 md:mt-7 flex items-center gap-2 max-w-2xl">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, schools…"
                className="h-12 pl-11 text-base bg-input text-foreground placeholder:text-muted-foreground border border-border focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={`shrink-0 inline-flex items-center gap-2 h-12 px-4 border text-sm font-semibold text-foreground transition-colors ${
                filtersOpen || panelFilterCount > 0
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {panelFilterCount > 0 && (
                <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center bg-primary text-primary-foreground text-[11px] font-bold tabular-nums">
                  {panelFilterCount}
                </span>
              )}
            </button>
          </div>

          {filtersOpen && (
            <div className="mt-3 max-w-2xl rounded-xl border border-border bg-card p-4 space-y-4">
              <FilterGroup label="Price">
                {PRICE_BUCKETS.map((b) => (
                  <Chip
                    key={b.id}
                    onCard
                    active={activePriceBucket === b.id}
                    onClick={() => setActivePriceBucket(activePriceBucket === b.id ? null : b.id)}
                  >
                    {b.label}
                  </Chip>
                ))}
              </FilterGroup>
              {allUniversities.length > 1 && (
                <FilterGroup label="School">
                  {allUniversities.map((u) => (
                    <Chip
                      key={u}
                      onCard
                      active={activeUniversities.has(u)}
                      onClick={() => setActiveUniversities(toggleInSet(activeUniversities, u))}
                    >
                      {u}
                    </Chip>
                  ))}
                </FilterGroup>
              )}
              {allCampuses.length > 1 && (
                <FilterGroup label="Campus">
                  {allCampuses.map((c) => (
                    <Chip
                      key={c}
                      onCard
                      active={activeCampuses.has(c)}
                      onClick={() => setActiveCampuses(toggleInSet(activeCampuses, c))}
                    >
                      {c}
                    </Chip>
                  ))}
                </FilterGroup>
              )}
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            Got a ticket to sell?{" "}
            <Link
              to="/marketplace/sell"
              className="font-semibold text-foreground underline underline-offset-4 decoration-border hover:decoration-primary transition-colors"
            >
              Sell yours
            </Link>
          </p>
        </div>
      </section>

      {/* =================== CATEGORIES (sticky) =================== */}
      <div className="sticky top-16 md:top-20 z-30 bg-background border-y border-border">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <Chip active={activeCategories.size === 0} onClick={() => setActiveCategories(new Set())}>
              All
            </Chip>
            {CATEGORY_CHIPS.map((c) => (
              <Chip
                key={c.id}
                active={activeCategories.has(c.id)}
                onClick={() => setActiveCategories(toggleInSet(activeCategories, c.id))}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* =================== RESULT BAR =================== */}
      <div id="marketplace-grid" className="container mx-auto max-w-6xl px-4 md:px-6 pt-5 md:pt-7">
        <div className="flex items-center justify-between gap-3 mb-4 md:mb-5">
          <p className="text-sm text-muted-foreground flex items-center gap-3 min-w-0">
            <span>
              <span className="font-semibold text-foreground tabular-nums">{filteredGroups.length}</span>{" "}
              event{filteredGroups.length === 1 ? "" : "s"}
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </p>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[170px] md:w-[200px] h-10 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="price-asc">Price: low to high</SelectItem>
              <SelectItem value="date-asc">Closest date</SelectItem>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 items-start">
              {filteredGroups.map((g, i) => (
                <EventCard
                  key={g.eventId}
                  group={g}
                  index={i}
                  expanded={expandedEvent === g.eventId}
                  onToggle={() => setExpandedEvent(expandedEvent === g.eventId ? null : g.eventId)}
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
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ts-fade-up { animation: ts-fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
        @media (prefers-reduced-motion: reduce) {
          .ts-fade-up { animation: none; }
        }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ────────────────────────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
  onCard = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Chip sits on a card surface (the filter panel) instead of the page background. */
  onCard?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 min-h-[40px] px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : onCard
          ? "bg-background text-foreground/80 hover:bg-background/70"
          : "bg-muted text-foreground/80 hover:bg-muted/80"
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Event card
// ────────────────────────────────────────────────────────────────────────────

function EventCard({
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
  const sellingFast = group.totalAvailable <= 3;
  const fromAllIn = calcBreakdown(group.minPrice, 1).buyerTotalEuros;

  return (
    <div
      className="ts-fade-up flex flex-col rounded-2xl overflow-hidden bg-card border border-border hover:border-primary/30 transition-colors duration-300"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {/* Photo — the seller's own when there is one, else the event banner,
          else a flat surface (never a broken image). */}
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {group.videoUrl ? (
          <video src={group.videoUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
        ) : group.photoUrl ? (
          <img src={group.photoUrl} alt={group.eventTitle} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />

        {/* One tag at most per corner: what's special, and how soon. */}
        {(group.hasBoosted || sellingFast) && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-cta text-cta-foreground text-[11px] font-bold uppercase tracking-wider">
            {group.hasBoosted ? <Sparkles className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
            {group.hasBoosted ? "Featured" : "Selling out"}
          </span>
        )}
        {days >= 0 && days <= 7 && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-card text-foreground text-[11px] font-bold uppercase tracking-wider">
            <Clock className="w-3 h-3" />
            {days === 0 ? "Tonight" : days === 1 ? "Tomorrow" : `In ${days}d`}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 md:p-5">
        <h3 className="font-bold text-foreground text-lg leading-snug line-clamp-2">
          {group.eventTitle}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground truncate">
          {shortDate(group.eventDate)}
          {group.eventLocation ? ` · ${group.eventLocation}` : ""}
        </p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">From · fees included</div>
            <div className="text-2xl font-black text-foreground tabular-nums leading-none mt-1">
              {eurLabel(fromAllIn)}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            {expanded ? "Hide" : `View ${group.totalAvailable} ticket${group.totalAvailable === 1 ? "" : "s"}`}
            {!expanded && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && <ExpandedTickets group={group} onBuy={onBuy} onOffer={onOffer} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tickets of one event, opened inside its card
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
    <div className="border-t border-border bg-muted/30 p-4 space-y-2.5">
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        Protected by TicketSafe · escrow payment
      </p>
      {group.tickets.map((t) => {
        const allIn = calcBreakdown(t.sellingPrice, 1).buyerTotalEuros;
        return (
          <div key={t.id} className="p-3.5 rounded-xl bg-card border border-border">
            <div className="flex items-baseline gap-2">
              <span className="font-black text-xl text-foreground tabular-nums">
                €{allIn.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">all fees included</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <span>{t.quantity} left</span>
              {isBoosted(t) && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cta text-cta-foreground font-bold uppercase text-[10px]">
                  <Sparkles className="w-2.5 h-2.5" />
                  Featured
                </span>
              )}
              {t.verified && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/15 text-success font-bold uppercase text-[10px]">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Verified
                </span>
              )}
            </div>
            {t.description && (
              <p className="mt-1.5 text-sm text-foreground/75 line-clamp-2">{t.description}</p>
            )}
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => onBuy(t)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                Buy
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onOffer(t)}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Make an offer
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-card border border-border">
          <div className="aspect-[16/10] bg-muted animate-pulse" />
          <div className="p-5 space-y-3">
            <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
            <div className="h-8 bg-muted rounded animate-pulse w-1/3" />
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
      <div className="inline-flex w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-5">
        <Ticket className="w-8 h-8 text-primary/70" strokeWidth={1.5} />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-2">
        {hasAnyListing ? "No tickets match" : "No tickets yet"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        {hasAnyListing
          ? "Try resetting your filters or searching for another event."
          : "Be the first to list a ticket for sale."}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {hasAnyListing ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Reset filters
          </button>
        ) : (
          <button
            type="button"
            onClick={onSell}
            className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Sell my ticket
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default Buy;
