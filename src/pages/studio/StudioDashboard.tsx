import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  Plus,
  ArrowRight,
  Users,
  TrendingUp,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Banknote,
  Repeat2,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import EventStatusBadge from "@/components/studio/EventStatusBadge";

interface StudioEvent {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: "draft" | "published" | "cancelled" | "sold_out" | null;
  slug: string | null;
  banner_url: string | null;
  primary_color: string | null;
  sold_count: number;
  total_capacity: number;
  revenue_cents: number;
  /** Lowest tier price across the event, in cents. null when no tiers. */
  price_from_cents: number | null;
}

interface Earnings {
  net_earned_cents: number;
  gross_cents: number;
  platform_fee_cents: number;
  paid_orders: number;
  claimed_cents: number;
  available_cents: number;
  releasable_cents: number;
}

const StudioDashboard = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [resoldCount, setResoldCount] = useState<number | null>(null);
  const [dailySales, setDailySales] = useState<{ day: string; cents: number }[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio");
  }, [user, authLoading, navigate]);

  // Pull the organizer's live earnings the moment we know who they are.
  // The view does the heavy lifting — sums paid orders, subtracts already
  // claimed payouts, exposes `available_cents` (what they can withdraw now).
  const loadEarnings = useCallback(async () => {
    if (!organizer) return;
    const { data } = await supabase
      .from("organizer_earnings")
      .select("net_earned_cents, gross_cents, platform_fee_cents, paid_orders, claimed_cents, available_cents, releasable_cents")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    setEarnings((data as Earnings) ?? null);
  }, [organizer]);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  const loadEvents = useCallback(
    async (showSpinner = false) => {
      if (!organizer) {
        setLoadingEvents(false);
        return;
      }
      if (showSpinner) setLoadingEvents(true);

      // Hide cancelled events from the organizer's dashboard list — once an
      // event is killed it should disappear from view. They're still in the DB
      // for refunds and accounting, just not surfaced in the UI.
      const { data: evRows } = await supabase
        .from("events")
        .select("id, title, date, location, status, slug, banner_url, primary_color")
        .eq("organizer_id", organizer.id)
        .neq("status", "cancelled")
        .order("date", { ascending: false });

      const ids = (evRows ?? []).map((e: { id: string }) => e.id);
      type Agg = { sold: number; total: number; revenue: number; minPrice: number | null };
      let tierAgg: Record<string, Agg> = {};
      if (ids.length) {
        const { data: tiers } = await supabase
          .from("event_tiers")
          .select("event_id, sold_qty, total_qty, price_cents")
          .in("event_id", ids);
        tierAgg = (tiers ?? []).reduce(
          (acc, t: { event_id: string; sold_qty: number; total_qty: number; price_cents: number }) => {
            const cur = acc[t.event_id] ?? { sold: 0, total: 0, revenue: 0, minPrice: null };
            cur.sold += t.sold_qty;
            cur.total += t.total_qty;
            cur.revenue += t.sold_qty * t.price_cents;
            cur.minPrice = cur.minPrice == null ? t.price_cents : Math.min(cur.minPrice, t.price_cents);
            acc[t.event_id] = cur;
            return acc;
          },
          {} as Record<string, Agg>,
        );
      }

      setEvents(
        (evRows ?? []).map((e) => ({
          ...(e as Omit<StudioEvent, "sold_count" | "total_capacity" | "revenue_cents" | "price_from_cents">),
          sold_count: tierAgg[e.id]?.sold ?? 0,
          total_capacity: tierAgg[e.id]?.total ?? 0,
          revenue_cents: tierAgg[e.id]?.revenue ?? 0,
          price_from_cents: tierAgg[e.id]?.minPrice ?? null,
        })),
      );
      setLoadingEvents(false);
    },
    [organizer],
  );

  // Initial load (with spinner)
  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  // Realtime: re-fetch dashboard data on any change to this organizer's
  // events, their tier inventory, or any order tied to them. Cheap because
  // we only re-aggregate on push, not on a poll.
  useEffect(() => {
    if (!organizer) return;
    const channel = supabase
      .channel(`studio-dashboard-${organizer.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `organizer_id=eq.${organizer.id}` },
        () => loadEvents(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_orders", filter: `organizer_id=eq.${organizer.id}` },
        () => loadEvents(false),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers" },
        // event_tiers does not carry organizer_id directly. Filter on the
        // client side by checking the payload's event_id against our known
        // event ids before re-fetching.
        (payload: { new: { event_id?: string } }) => {
          const evId = payload.new?.event_id;
          if (!evId) return;
          if (events.some((e) => e.id === evId)) loadEvents(false);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizer, loadEvents, events]);

  // Resold count — of this organizer's tickets, how many are now listed on
  // the resale marketplace. Read-only count against the same `tickets`
  // table the resale marketplace itself lists from; no new table.
  useEffect(() => {
    const eventIds = events.map((e) => e.id);
    if (!eventIds.length) {
      setResoldCount(0);
      return;
    }
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds)
      .then(({ count }) => setResoldCount(count ?? 0));
  }, [events]);

  // Daily gross sales, last 14 days — bucketed client-side from
  // event_orders (already queried elsewhere on this page; organizer_id is
  // a direct column, no new join needed).
  useEffect(() => {
    if (!organizer) return;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 13);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("event_orders")
        .select("total_cents, created_at")
        .eq("organizer_id", organizer.id)
        .eq("status", "paid")
        .gte("created_at", since.toISOString());

      const buckets = new Map<string, number>();
      for (let i = 0; i < 14; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      for (const row of (data ?? []) as { total_cents: number; created_at: string }[]) {
        const key = row.created_at.slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.total_cents);
      }
      setDailySales(Array.from(buckets.entries()).map(([day, cents]) => ({ day, cents })));
    })();
  }, [organizer]);

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── No application yet ──────────────────────────────────────────────────
  if (!organizer) {
    return (
      <div className="theme-studio min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Ticket Safe Studio for student event organizers." />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-lg p-8 shadow-card">
            <div
              className="w-14 h-14 rounded-lg mx-auto flex items-center justify-center mb-5"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Apply for Studio</h1>
            <p className="text-sm text-muted-foreground mb-6">
              You need an approved organizer profile to access the Studio dashboard.
            </p>
            <Link
              to="/organizers/apply"
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
            >
              Apply now
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Pending / rejected / suspended ──────────────────────────────────────
  if (organizer.status !== "approved") {
    return (
      <div className="theme-studio min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Application status" />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-lg p-8 shadow-card">
            <div className="w-14 h-14 rounded-lg mx-auto flex items-center justify-center mb-5 bg-primary/10">
              {organizer.status === "pending" ? (
                <Clock className="w-7 h-7 text-primary" />
              ) : (
                <AlertCircle className="w-7 h-7 text-destructive" />
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {organizer.status === "pending" && "Application under review"}
              {organizer.status === "rejected" && "Application not approved"}
              {organizer.status === "suspended" && "Account suspended"}
            </h1>
            <p className="text-sm text-muted-foreground mb-2">
              {organizer.status === "pending" &&
                "We'll get back to you at " + organizer.contact_email + " within 24 hours."}
              {organizer.status === "rejected" &&
                (organizer.rejection_reason || "Please contact support for more details.")}
              {organizer.status === "suspended" &&
                "Please contact support to resolve this issue."}
            </p>
            <Link
              to="/contact"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Contact support
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Approved organizer dashboard ────────────────────────────────────────
  const stats = events.reduce(
    (acc, e) => ({
      sold: acc.sold + e.sold_count,
      capacity: acc.capacity + e.total_capacity,
      revenue: acc.revenue + e.revenue_cents,
      published: acc.published + (e.status === "published" ? 1 : 0),
    }),
    { sold: 0, capacity: 0, revenue: 0, published: 0 },
  );
  const fillRate = stats.capacity > 0 ? Math.round((stats.sold / stats.capacity) * 100) : null;
  const maxDailyCents = dailySales ? Math.max(1, ...dailySales.map((d) => d.cents)) : 1;

  return (
    <StudioLayout active="dashboard" organizer={{ name: organizer.name, logo_url: organizer.logo_url }}>
      <SEOHead title={`${organizer.name} · Studio`} description="Ticket Safe Studio dashboard" />

      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create events, sell tickets, and get paid — all in one place.
            </p>
          </div>
          <Link
            to="/studio/events/new"
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New event
          </Link>
        </div>

        {/* ===== KPI cards ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Tickets sold" value={stats.sold.toLocaleString("en-GB")} icon={Users} />
          <KpiCard label="Gross revenue" value={`€${(stats.revenue / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} icon={TrendingUp} />
          <KpiCard label="Fill rate" value={fillRate != null ? `${fillRate}%` : "—"} icon={Calendar} />
          <KpiCard
            label="Tickets resold"
            value={resoldCount != null ? String(resoldCount) : "—"}
            icon={Repeat2}
          />
        </div>

        {/* ===== Sales chart — gross, last 14 days ===== */}
        <div className="rounded-lg border border-border bg-card p-4 md:p-5 mb-6">
          <div className="text-sm font-bold text-foreground mb-4">Sales over the last 14 days</div>
          {dailySales ? (
            dailySales.every((d) => d.cents === 0) ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No sales in this period.</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {dailySales.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className="w-full rounded-sm bg-primary/70 hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(2, (d.cents / maxDailyCents) * 100)}%` }}
                      title={`${new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — €${(d.cents / 100).toFixed(0)}`}
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* ===== Earnings banner — manual SEPA payout via IBAN. No Stripe
            KYC for the organizer: they just type their IBAN, Ticket Safe
            wires the funds from its bank within 2-3 business days. */}
        {earnings && earnings.available_cents > 0 && (
          <div className="flex flex-col md:flex-row md:items-center gap-4 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-4 mb-6">
            <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm md:text-base text-emerald-900">
                €{(earnings.available_cents / 100).toFixed(2)} available — paid out within 2-3 business days once requested
              </div>
              <div className="text-xs md:text-sm text-emerald-800">
                SEPA IBAN only — no Stripe account, no SIREN, no KYC. TicketSafe fee: 0%.
              </div>
            </div>
            <Link
              to="/studio/payouts"
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-emerald-700 text-white hover:bg-emerald-800 shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
              Request payout
            </Link>
          </div>
        )}
        {earnings && earnings.claimed_cents > 0 && earnings.available_cents === 0 && (
          <div className="rounded-lg border border-border bg-card px-5 py-4 flex items-center gap-3 mb-6">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-foreground">
                €{(earnings.claimed_cents / 100).toFixed(2)} — payout in progress
              </div>
              <div className="text-xs text-muted-foreground">
                SEPA transfer sent within 2-3 business days to your IBAN.
              </div>
            </div>
          </div>
        )}

        {/* ===== Recent events — a glance, not the management view. Full
            list/search/filters/duplicate live on the dedicated Events tab
            (/studio/events); this is just "what's new" at a glance. ===== */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl md:text-2xl font-bold">Recent events</h2>
            {events.length > 0 && (
              <Link
                to="/studio/events"
                className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {loadingEvents ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <EventCardSkeleton key={i} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <EmptyEvents />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.slice(0, 4).map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </div>
      </div>

    </StudioLayout>
  );
};

const KpiCard = ({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) => (
  <div className="bg-card rounded-lg px-3.5 py-3.5 border border-border">
    <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
      <Icon className="w-3.5 h-3.5" />
      <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
    </div>
    <div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">{value}</div>
  </div>
);

const EventCardSkeleton = () => (
  <div className="bg-card border border-border rounded-2xl overflow-hidden">
    <div className="h-28 bg-muted animate-pulse" />
    <div className="p-4 space-y-3">
      <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
      <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
    </div>
  </div>
);

const EmptyEvents = () => (
  <div className="relative overflow-hidden text-center py-14 px-6 bg-card border border-border rounded-2xl shadow-soft">
    <div
      className="absolute inset-x-0 top-0 h-28 opacity-[0.07] pointer-events-none"
      style={{ background: "var(--gradient-hero)" }}
    />
    <div className="relative">
      <div
        className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-4 text-white shadow-card"
        style={{ background: "var(--gradient-hero)" }}
      >
        <Calendar className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black mb-1.5">Create your first event</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        Set up a branded listing, add your ticket types, and start selling in minutes — with
        built-in resale, door scanning, and SEPA payouts.
      </p>
      <Link
        to="/studio/events/new"
        className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover shadow-soft hover:shadow-card transition-all"
      >
        <Plus className="w-4 h-4" />
        Create your first event
      </Link>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          No setup fee
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Live in minutes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Get paid by SEPA
        </span>
      </div>
    </div>
  </div>
);

const EventRow = ({ event }: { event: StudioEvent }) => {
  const soldPct = event.total_capacity > 0 ? Math.round((event.sold_count / event.total_capacity) * 100) : 0;
  const soldOut = event.total_capacity > 0 && event.sold_count >= event.total_capacity;
  const accent = event.primary_color && /^#[0-9a-fA-F]{6}$/.test(event.primary_color) ? event.primary_color : null;
  const priceFrom =
    event.price_from_cents != null
      ? event.price_from_cents <= 0
        ? "Free"
        : `From €${(event.price_from_cents / 100) % 1 === 0 ? (event.price_from_cents / 100).toFixed(0) : (event.price_from_cents / 100).toFixed(2)}`
      : null;

  return (
    <Link
      to={`/studio/events/${event.id}`}
      className="group block bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-hover transition-all duration-300"
    >
      <div
        className="h-28 relative overflow-hidden"
        style={{ background: accent ?? "var(--gradient-hero)" }}
      >
        {event.banner_url && (
          <img
            src={event.banner_url}
            alt=""
            className="w-full h-full object-cover group- transition-transform duration-500"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/10" />
        <div className="absolute top-3 right-3">
          <EventStatusBadge status={event.status} date={event.date} soldOut={soldOut} size="sm" />
        </div>
        {priceFrom && (
          <span className="absolute bottom-3 left-3 inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-black text-foreground shadow-soft">
            {priceFrom}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="font-bold text-base text-foreground mb-1 line-clamp-1 group-hover:text-primary transition-colors">
          {event.title}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
          <Calendar className="w-3 h-3 shrink-0" />
          {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {event.location ? <span className="truncate"> · {event.location}</span> : null}
        </div>
        {event.total_capacity > 0 ? (
          <div className="mb-2">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, soldPct)}%`, background: accent ?? "hsl(var(--primary))" }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold">
                {event.sold_count}/{event.total_capacity} sold · {soldPct}%
              </span>
              <span className="font-bold text-foreground">€{(event.revenue_cents / 100).toFixed(0)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2 inline-flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Add ticket types to start selling
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-primary group-hover:gap-1.5 transition-all">
            <Eye className="w-3 h-3" /> Manage
            <ArrowRight className="w-3 h-3" />
          </span>
          {event.slug && event.status === "published" && (
            <a
              href={`/e/${event.slug}`}
              onClick={(ev) => ev.stopPropagation()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground font-semibold hover:text-primary hover:underline"
            >
              Public page
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
};

export default StudioDashboard;
