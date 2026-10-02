import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Calendar,
  MapPin,
  Pencil,
  ExternalLink,
  Copy,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import EventStatusBadge, { deriveEventStatusKind, type EventStatus } from "@/components/studio/EventStatusBadge";

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
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Events</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage, edit, and track every event you run.</p>
          </div>
          <Link
            to="/studio/events/new"
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New event
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or location…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "all", label: "All" },
              { key: "live", label: "Live" },
              { key: "draft", label: "Drafts" },
              { key: "past", label: "Past" },
            ] as { key: Filter; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full text-sm font-bold border transition-colors ${
                  filter === tab.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[11px] font-black ${filter === tab.key ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-14 px-6">
              <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4 text-white" style={{ background: "var(--gradient-hero)" }}>
                <Calendar className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black mb-1.5">Create your first event</h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                Set up a branded listing, add ticket types, and start selling in minutes.
              </p>
              <Link
                to="/studio/events/new"
                className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover"
              >
                <Plus className="w-4 h-4" />
                Create your first event
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No events match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Event</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Tickets</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Revenue</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const soldPct = e.total_capacity > 0 ? Math.round((e.sold_count / e.total_capacity) * 100) : 0;
                    const soldOut = e.total_capacity > 0 && e.sold_count >= e.total_capacity;
                    const accent = e.primary_color && /^#[0-9a-fA-F]{6}$/.test(e.primary_color) ? e.primary_color : null;
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 max-w-[260px]">
                          <Link to={`/studio/events/${e.id}`} className="flex items-center gap-3 group">
                            <div
                              className="w-11 h-11 rounded-lg shrink-0 overflow-hidden bg-cover bg-center"
                              style={{ background: accent ?? "var(--gradient-hero)" }}
                            >
                              {e.banner_url && <img src={e.banner_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{e.title}</div>
                              {e.location && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  {e.location}
                                </div>
                              )}
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <EventStatusBadge status={e.status} date={e.date} soldOut={soldOut} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[140px]">
                          {e.total_capacity > 0 ? (
                            <div>
                              <div className="h-1.5 w-28 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, soldPct)}%`, background: accent ?? "hsl(var(--primary))" }} />
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{e.sold_count}/{e.total_capacity} · {soldPct}%</div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertCircle className="w-3 h-3" />
                              No tiers
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">€{(e.revenue_cents / 100).toFixed(0)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              to={`/studio/events/${e.id}`}
                              title="Edit"
                              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Link>
                            {e.status === "published" && e.slug && (
                              <a
                                href={`/e/${e.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View public page"
                                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => duplicateEvent(e.id)}
                              disabled={duplicatingId === e.id}
                              title="Duplicate"
                              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50"
                            >
                              {duplicatingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StudioLayout>
  );
};

export default StudioEvents;
