import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Calendar,
  Pencil,
  ExternalLink,
  Copy,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import EventStatusBadge, { deriveEventStatusKind, type EventStatus } from "@/components/studio/EventStatusBadge";
import { FilterChips } from "@/components/studio/FilterChips";
import { eur, plural, phaseOf, whenLabel, startOfDay } from "@/lib/studioFormat";

interface EventRow {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: EventStatus;
  slug: string | null;
  banner_url: string | null;
  primary_color: string | null;
  sold_count: number;
  total_capacity: number;
  revenue_cents: number;
}

type Filter = "all" | "live" | "draft" | "past";

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * /studio/events — event MANAGEMENT: a dense, filterable, searchable list
 * with status/date/sold-capacity/actions, built for organizers juggling
 * several events at once. Deliberately not the dashboard's card-grid
 * "browse" view (see StudioDashboard.tsx) — this is where you come to
 * find and act on a specific event, not to admire a KPI overview.
 */
const StudioEvents = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoading(true);
    const { data: evRows } = await supabase
      .from("events")
      .select("id, title, date, location, status, slug, banner_url, primary_color")
      .eq("organizer_id", organizer.id)
      .neq("status", "cancelled")
      .order("date", { ascending: false });

    const ids = (evRows ?? []).map((e: { id: string }) => e.id);
    type Agg = { sold: number; total: number; revenue: number };
    let agg: Record<string, Agg> = {};
    if (ids.length) {
      const { data: tiers } = await supabase
        .from("event_tiers")
        .select("event_id, sold_qty, total_qty, price_cents")
        .in("event_id", ids);
      agg = (tiers ?? []).reduce((acc, t: { event_id: string; sold_qty: number; total_qty: number; price_cents: number }) => {
        const cur = acc[t.event_id] ?? { sold: 0, total: 0, revenue: 0 };
        cur.sold += t.sold_qty;
        cur.total += t.total_qty;
        cur.revenue += t.sold_qty * t.price_cents;
        acc[t.event_id] = cur;
        return acc;
      }, {} as Record<string, Agg>);
    }

    setEvents(
      (evRows ?? []).map((e) => ({
        ...(e as Omit<EventRow, "sold_count" | "total_capacity" | "revenue_cents">),
        sold_count: agg[e.id]?.sold ?? 0,
        total_capacity: agg[e.id]?.total ?? 0,
        revenue_cents: agg[e.id]?.revenue ?? 0,
      })),
    );
    setLoading(false);
  }, [organizer]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      all: events.length,
      live: events.filter((e) => deriveEventStatusKind(e.status, e.date, e.sold_count >= e.total_capacity && e.total_capacity > 0) === "live").length,
      draft: events.filter((e) => (e.status ?? "draft") === "draft").length,
      past: events.filter((e) => new Date(e.date).getTime() < now).length,
    };
  }, [events]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return events
      .filter((e) => {
        if (filter === "past") return new Date(e.date).getTime() < now;
        if (filter === "draft") return (e.status ?? "draft") === "draft";
        if (filter === "live") return deriveEventStatusKind(e.status, e.date, e.sold_count >= e.total_capacity && e.total_capacity > 0) === "live";
        return true;
      })
      .filter((e) => (q ? e.title.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q) : true));
  }, [events, filter, search]);

  // Two groups, two orders: what is coming (soonest first) and what is done
  // (most recent first). The list reads as a timeline, not a database.
  const groups = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const upcoming = filtered
      .filter((e) => startOfDay(new Date(e.date)).getTime() >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const past = filtered
      .filter((e) => startOfDay(new Date(e.date)).getTime() < today)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { upcoming, past };
  }, [filtered]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (counts.live) parts.push(`${plural(counts.live, "event")} on sale`);
    if (counts.draft) parts.push(plural(counts.draft, "draft"));
    if (counts.past) parts.push(`${counts.past} past`);
    return parts.join(" · ") || "No events yet";
  }, [counts]);

  const duplicateEvent = async (eventId: string) => {
    if (!organizer || !user) return;
    setDuplicatingId(eventId);
    try {
      const { data: source, error: srcErr } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (srcErr || !source) throw new Error(srcErr?.message ?? "Could not load the source event.");

      let finalSlug = slugify(`${source.title}-copy`) || `event-${Date.now()}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: clash } = await supabase.from("events").select("id").eq("slug", finalSlug).maybeSingle();
        if (!clash) break;
        finalSlug = `${finalSlug}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 60);
      }

      const { data: newEvent, error: insErr } = await supabase
        .from("events")
        .insert({
          title: `${source.title} (Copy)`,
          description: source.description,
          date: source.date,
          ends_at: source.ends_at,
          location: source.location,
          category: source.category,
          campus: source.campus,
          university: source.university,
          base_price: source.base_price,
          organizer_id: organizer.id,
          slug: finalSlug,
          primary_color: source.primary_color,
          banner_url: source.banner_url,
          video_url: source.video_url,
          logo_url: source.logo_url,
          max_tickets_per_buyer: source.max_tickets_per_buyer,
          status: "draft",
          sold_via_studio: true,
          is_active: true,
        })
        .select("id")
        .single();
      if (insErr || !newEvent) throw new Error(insErr?.message ?? "Could not create the duplicate.");

      const { data: sourceTiers } = await supabase
        .from("event_tiers")
        .select("name, description, price_cents, currency, total_qty, sort_order, is_active, sales_start_at, sales_end_at, max_per_order, kind, capacity_per_unit, source")
        .eq("event_id", eventId)
        .neq("source", "external");

      if (sourceTiers && sourceTiers.length > 0) {
        const { error: tierErr } = await supabase.from("event_tiers").insert(
          sourceTiers.map((t) => ({ ...t, event_id: newEvent.id, sold_qty: 0, reserved_qty: 0 })),
        );
        if (tierErr) console.warn("[StudioEvents] tier duplication partially failed:", tierErr);
      }

      toast.success("Event duplicated — opening the draft.");
      navigate(`/studio/events/${newEvent.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate the event.");
    } finally {
      setDuplicatingId(null);
    }
  };

  if (!user || orgLoading) {
    return (
      <StudioLayout active="events" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout active="events" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Events · Studio" description="Manage all your events." />
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Events</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
          </div>
          <Link
            to="/studio/events/new"
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New event
          </Link>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find an event"
              aria-label="Find an event"
              className="w-full pl-9 pr-3 h-11 border border-border bg-card text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <FilterChips<Filter>
            label="Filter events"
            value={filter}
            onChange={setFilter}
            items={[
              { key: "all", label: "All", count: counts.all },
              { key: "live", label: "On sale", count: counts.live },
              { key: "draft", label: "Drafts", count: counts.draft },
              { key: "past", label: "Past", count: counts.past },
            ]}
          />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse" />)}</div>
        ) : events.length === 0 ? (
          <div className="text-center py-14 px-6 bg-card border border-border">
            <div className="inline-flex w-14 h-14 items-center justify-center mb-4 text-white" style={{ background: "var(--gradient-hero)" }}>
              <Calendar className="w-7 h-7" />
            </div>
            <h3 className="font-display text-2xl font-bold mb-1.5">Your first event starts here</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
              Name it, add ticket types, share the page. It takes a few minutes.
            </p>
            <Link
              to="/studio/events/new"
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="w-4 h-4" />
              Create an event
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10 bg-card border border-border">
            {search ? `Nothing matches "${search}".` : "Nothing here."}
          </p>
        ) : (
          <div className="space-y-6">
            {groups.upcoming.length > 0 && (
              <section aria-labelledby="upcoming-heading">
                <h2 id="upcoming-heading" className="text-sm font-bold mb-2">
                  Coming up <span className="text-muted-foreground font-medium">{groups.upcoming.length}</span>
                </h2>
                <ul className="bg-card border border-border divide-y divide-border">
                  {groups.upcoming.map((e, i) => (
                    <EventRow key={e.id} event={e} index={i} duplicating={duplicatingId === e.id} onDuplicate={() => duplicateEvent(e.id)} />
                  ))}
                </ul>
              </section>
            )}
            {groups.past.length > 0 && (
              <section aria-labelledby="past-heading">
                <h2 id="past-heading" className="text-sm font-bold mb-2">
                  Past <span className="text-muted-foreground font-medium">{groups.past.length}</span>
                </h2>
                <ul className="bg-card border border-border divide-y divide-border">
                  {groups.past.map((e, i) => (
                    <EventRow key={e.id} event={e} index={i} duplicating={duplicatingId === e.id} onDuplicate={() => duplicateEvent(e.id)} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </StudioLayout>
  );
};

/**
 * One event, read left to right as a sentence: when, what, how it is doing,
 * what it has made. Actions sit at the end and only ask for attention on
 * hover (always visible on touch screens, which have no hover).
 */
const EventRow = ({ event: e, index, duplicating, onDuplicate }: { event: EventRow; index: number; duplicating: boolean; onDuplicate: () => void }) => {
  const d = new Date(e.date);
  const phase = phaseOf(e.date);
  const soldPct = e.total_capacity > 0 ? Math.min(100, Math.round((e.sold_count / e.total_capacity) * 100)) : 0;
  const soldOut = e.total_capacity > 0 && e.sold_count >= e.total_capacity;
  const left = e.total_capacity - e.sold_count;
  const accent = e.primary_color && /^#[0-9a-fA-F]{6}$/.test(e.primary_color) ? e.primary_color : "hsl(var(--primary))";
  const salesNote =
    e.total_capacity === 0 ? "No ticket types yet" : soldOut ? "Sold out" : phase === "past" ? `${e.sold_count} attended` : `${left.toLocaleString("en-GB")} left`;
  const iconBtn = "w-9 h-9 border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 transition-colors";

  return (
    <li className="group relative motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, opacity: phase === "past" ? 0.35 : 1 }} />
      <div className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-4 gap-y-2 pl-5 pr-4 py-3 min-h-[72px]">
        <Link to={`/studio/events/${e.id}`} className="w-11 text-center leading-tight self-start md:self-center">
          <div className={`font-display text-xl font-bold tabular-nums ${phase === "past" ? "text-muted-foreground" : "text-foreground"}`}>{d.getDate()}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.toLocaleDateString("en-GB", { month: "short" })}</div>
        </Link>
        <div className="min-w-0">
          <Link to={`/studio/events/${e.id}`} className="block">
            <div className="text-sm font-semibold truncate hover:text-primary transition-colors">{e.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {whenLabel(e.date)}{e.location ? ` · ${e.location}` : ""}
            </div>
          </Link>
          {/* Phone: numbers under the title */}
          <div className="md:hidden mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <EventStatusBadge status={e.status} date={e.date} soldOut={soldOut} size="sm" />
            <span className="tabular-nums">{e.total_capacity > 0 ? `${e.sold_count}/${e.total_capacity} · ${salesNote}` : salesNote}</span>
            <span className="font-bold text-foreground tabular-nums ml-auto">{eur(e.revenue_cents)}</span>
          </div>
        </div>
        <div className="hidden md:block"><EventStatusBadge status={e.status} date={e.date} soldOut={soldOut} size="sm" /></div>
        <div className="hidden md:block w-44">
          {e.total_capacity > 0 ? (
            <>
              <div className="h-1.5 w-full bg-muted overflow-hidden" aria-hidden>
                <div className="h-full" style={{ width: `${soldPct}%`, background: accent }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1 tabular-nums">
                <span>{e.sold_count}/{e.total_capacity}</span>
                <span className={soldOut ? "font-bold text-foreground" : ""}>{salesNote}</span>
              </div>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><AlertCircle className="w-3 h-3" /> {salesNote}</span>
          )}
        </div>
        <div className="hidden md:block text-sm font-bold tabular-nums text-right w-20">{eur(e.revenue_cents)}</div>
        {/* Actions */}
        <div className="col-span-2 md:col-span-1 md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 flex items-center gap-1.5 md:bg-card md:pl-2 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
          <Link to={`/studio/events/${e.id}`} title="Edit" aria-label={`Edit ${e.title}`} className={iconBtn}><Pencil className="w-3.5 h-3.5" /></Link>
          {e.status === "published" && e.slug && (
            <a href={`/e/${e.slug}`} target="_blank" rel="noopener noreferrer" title="Public page" aria-label={`Open the public page of ${e.title}`} className={iconBtn}><ExternalLink className="w-3.5 h-3.5" /></a>
          )}
          <button type="button" onClick={onDuplicate} disabled={duplicating} title="Duplicate" aria-label={`Duplicate ${e.title}`} className={iconBtn}>
            {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <Link to={`/studio/events/${e.id}/attendees`} className="hidden md:inline-flex items-center gap-1 h-9 px-3 text-xs font-bold border border-border hover:border-primary/40 hover:text-primary transition-colors">
            Guests <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </li>
  );
};

export default StudioEvents;
