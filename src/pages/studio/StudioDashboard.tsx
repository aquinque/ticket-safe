import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  Plus,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  QrCode,
  Share2,
  Ticket,
  Users,
  Banknote,
  CreditCard,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import EventStatusBadge from "@/components/studio/EventStatusBadge";
import { DAY_MS, startOfDay, eur, plural, phaseOf, whenLabel, relativeTime, fmtDay, type Phase } from "@/lib/studioFormat";

/**
 * Studio dashboard — the first screen after login.
 *
 * Built around time rather than totals: the organizer's next event is the
 * hero, with the numbers that matter for it right now (sold, this week,
 * checked in on the day) and the two or three actions that fit the moment
 * (share the page before, open the scanner on the day, see attendance
 * after). Below it: what happened this week, what still needs doing, and a
 * compact ledger of every event. Everything re-renders from Realtime, so a
 * sale shows up while the page is open.
 */

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

interface DaySales { day: string; cents: number; tickets: number }
interface Pace { sold7: number; lastSale: string | null }

// event_scan_staff is newer than the generated database types.
const staffLinks = () =>
  (supabase as unknown as {
    from: (table: "event_scan_staff") => {
      select: (columns: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => PromiseLike<{ data: unknown }> } };
    };
  }).from("event_scan_staff");

const StudioDashboard = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [dailySales, setDailySales] = useState<DaySales[] | null>(null);
  const [payments, setPayments] = useState<{ exists: boolean; active: boolean } | null>(null);
  const [checkedIn, setCheckedIn] = useState<number | null>(null);
  const [pace, setPace] = useState<Pace | null>(null);
  const [linkedEvents, setLinkedEvents] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio");
  }, [user, authLoading, navigate]);

  // Earlier-model earnings (manual payouts). Stripe events pay out on their
  // own after the event; this only matters while an older balance remains.
  const loadEarnings = useCallback(async () => {
    if (!organizer) return;
    const { data } = await supabase
      .from("organizer_earnings")
      .select("net_earned_cents, gross_cents, platform_fee_cents, paid_orders, claimed_cents, available_cents, releasable_cents")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    setEarnings((data as unknown as Earnings | null) ?? null);
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

      // Cancelled events stay in the database for refunds and accounting but
      // are not surfaced here.
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
      setLastUpdated(new Date());
    },
    [organizer],
  );

  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  // Daily sales, last 14 days: amount and ticket count per day.
  const loadDailySales = useCallback(async () => {
    if (!organizer) return;
    const since = startOfDay(new Date());
    since.setDate(since.getDate() - 13);
    const { data } = await supabase
      .from("event_orders")
      .select("total_cents, quantity, created_at")
      .eq("organizer_id", organizer.id)
      .eq("status", "paid")
      .gte("created_at", since.toISOString());

    const buckets = new Map<string, { cents: number; tickets: number }>();
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { cents: 0, tickets: 0 });
    }
    for (const row of (data ?? []) as { total_cents: number; quantity: number; created_at: string }[]) {
      const key = row.created_at.slice(0, 10);
      const b = buckets.get(key);
      if (b) { b.cents += row.total_cents; b.tickets += row.quantity; }
    }
    setDailySales(Array.from(buckets.entries()).map(([day, v]) => ({ day, ...v })));
  }, [organizer]);

  useEffect(() => {
    loadDailySales();
  }, [loadDailySales]);

  // Realtime: re-fetch on any change to this organizer's events, their tier
  // inventory, or any order tied to them. A sale lands on screen within a
  // second, no polling.
  useEffect(() => {
    if (!organizer) return;
    const refresh = () => { loadEvents(false); loadDailySales(); };
    const channel = supabase
      .channel(`studio-dashboard-${organizer.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `organizer_id=eq.${organizer.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_orders", filter: `organizer_id=eq.${organizer.id}` }, refresh)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers" },
        // event_tiers has no organizer_id: filter client-side on known event ids.
        (payload: { new: { event_id?: string } }) => {
          const evId = payload.new?.event_id;
          if (evId && events.some((e) => e.id === evId)) refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizer, loadEvents, loadDailySales, events]);

  // Stripe payment account, for the to-do list.
  useEffect(() => {
    if (!organizer) return;
    supabase
      .from("stripe_connect_accounts")
      .select("charges_enabled, payouts_enabled")
      .eq("organizer_id", organizer.id)
      .maybeSingle()
      .then(({ data }) => setPayments({ exists: !!data, active: !!data?.charges_enabled && !!data?.payouts_enabled }));
  }, [organizer]);

  // ── Derived: the event the page is about ──
  const now = new Date();
  const next = useMemo(() => {
    const today = startOfDay(now).getTime();
    const upcoming = events
      .filter((e) => startOfDay(new Date(e.date)).getTime() >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming[0] ?? events[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
  const phase: Phase | null = next ? phaseOf(next.date, now) : null;

  // Door count for the hero, only when it matters (the event's day, or just after).
  useEffect(() => {
    if (!next || phase === "upcoming") { setCheckedIn(null); return; }
    supabase
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", next.id)
      .not("scanned_at", "is", null)
      .then(({ count }) => setCheckedIn(count ?? 0));
  }, [next, phase, lastUpdated]);

  // Sales pace for the hero event: the last 7 days and the last sale ever.
  useEffect(() => {
    if (!next) { setPace(null); return; }
    (async () => {
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
      const [{ data: recent }, { data: last }] = await Promise.all([
        supabase.from("event_orders").select("quantity").eq("event_id", next.id).eq("status", "paid").gte("created_at", since),
        supabase.from("event_orders").select("created_at").eq("event_id", next.id).eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setPace({
        sold7: ((recent ?? []) as { quantity: number }[]).reduce((n, r) => n + r.quantity, 0),
        lastSale: (last as { created_at: string } | null)?.created_at ?? null,
      });
    })();
  }, [next, lastUpdated]);

  // Which events already have a door-staff link (for the to-do list).
  useEffect(() => {
    if (!organizer) return;
    staffLinks()
      .select("event_id")
      .eq("organizer_id", organizer.id)
      .is("revoked_at", null)
      .then(({ data }) => setLinkedEvents(new Set(((data as { event_id: string }[] | null) ?? []).map((r) => r.event_id))));
  }, [organizer, lastUpdated]);

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
            <Link to="/contact" className="text-sm font-semibold text-primary hover:underline">
              Contact support
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Approved organizer dashboard ────────────────────────────────────────
  const week = (() => {
    if (!dailySales) return null;
    const last7 = dailySales.slice(7);
    const prev7 = dailySales.slice(0, 7);
    const sum = (rows: DaySales[], k: "cents" | "tickets") => rows.reduce((n, d) => n + d[k], 0);
    return {
      tickets: sum(last7, "tickets"),
      prevTickets: sum(prev7, "tickets"),
      cents: sum(last7, "cents"),
      prevCents: sum(prev7, "cents"),
    };
  })();

  const todos: { key: string; icon: typeof Ticket; text: string; to: string; tone?: "warn" | "money" }[] = [];
  for (const e of events) {
    if (e.total_capacity === 0) todos.push({ key: `tiers-${e.id}`, icon: Ticket, text: `Add ticket types to "${e.title}"`, to: `/studio/events/${e.id}`, tone: "warn" });
    else if (e.status === "draft") todos.push({ key: `draft-${e.id}`, icon: Pencil, text: `"${e.title}" is still a draft`, to: `/studio/events/${e.id}` });
  }
  for (const e of events) {
    const days = Math.round((startOfDay(new Date(e.date)).getTime() - startOfDay(now).getTime()) / DAY_MS);
    if (days >= 0 && days <= 3 && e.sold_count > 0 && !linkedEvents.has(e.id)) {
      todos.push({ key: `door-${e.id}`, icon: QrCode, text: `"${e.title}" is ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} and has no door-staff link yet`, to: "/studio/team" });
    }
  }
  if (payments && !payments.active) {
    todos.push({ key: "payments", icon: CreditCard, text: payments.exists ? "Finish setting up payments to get paid" : "Set up payments so your sales reach your bank", to: "/studio/payments", tone: "warn" });
  }
  if (earnings && earnings.available_cents > 0) {
    todos.push({ key: "payout", icon: Banknote, text: `${eur(earnings.available_cents, 2)} from earlier events is ready to withdraw`, to: "/studio/payouts", tone: "money" });
  }

  const liveCount = events.filter((e) => e.status === "published" && phaseOf(e.date, now) !== "past").length;

  return (
    <StudioLayout active="dashboard" organizer={{ name: organizer.name, logo_url: organizer.logo_url }}>
      <SEOHead title={`${organizer.name} · Studio`} description="Ticket Safe Studio dashboard" />

      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              {liveCount > 0 ? `${plural(liveCount, "event")} on sale` : events.length > 0 ? "Nothing on sale right now" : "No events yet"}
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live
                </span>
              )}
            </p>
          </div>
          <Link
            to="/studio/events/new"
            className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            New event
          </Link>
        </div>

        {loadingEvents ? (
          <div className="h-64 bg-muted animate-pulse mb-4" />
        ) : !next ? (
          <EmptyEvents />
        ) : (
          <NextUp event={next} phase={phase ?? "upcoming"} pace={pace} checkedIn={checkedIn} />
        )}

        {events.length > 0 && (
          <div className="grid gap-4 md:grid-cols-5 mb-6">
            {/* This week */}
            <section className="bg-card border border-border p-4 md:p-5 md:col-span-3" aria-labelledby="week-heading">
              <div className="flex items-baseline justify-between mb-3">
                <h2 id="week-heading" className="text-sm font-bold">This week</h2>
                <span className="text-[11px] text-muted-foreground">vs the 7 days before</span>
              </div>
              {week ? (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Figure label="Tickets sold" value={week.tickets} prev={week.prevTickets} />
                  <Figure label="Revenue" value={week.cents} prev={week.prevCents} money />
                </div>
              ) : (
                <div className="h-14 bg-muted animate-pulse mb-4" />
              )}
              <Bars days={dailySales} />
            </section>

            {/* To do */}
            <section className="bg-card border border-border p-4 md:p-5 md:col-span-2" aria-labelledby="todo-heading">
              <h2 id="todo-heading" className="text-sm font-bold mb-3">Needs you</h2>
              {todos.length === 0 ? (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p>Nothing. Tickets are on sale and payments are set up.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border -mx-1">
                  {todos.slice(0, 5).map((t, i) => {
                    const Icon = t.icon;
                    return (
                      <li key={t.key} className="motion-safe:animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                        <Link to={t.to} className="group flex items-center gap-3 px-1 py-2.5 min-h-[44px] text-sm hover:bg-muted/60 transition-colors">
                          <Icon className={`w-4 h-4 shrink-0 ${t.tone === "warn" ? "text-amber-600" : t.tone === "money" ? "text-emerald-600" : "text-muted-foreground"}`} />
                          <span className="flex-1 min-w-0 truncate">{t.text}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* All events, compact ledger */}
        {events.length > 0 && (
          <section aria-labelledby="events-heading">
            <div className="flex items-baseline justify-between mb-3">
              <h2 id="events-heading" className="text-sm font-bold">All events <span className="text-muted-foreground font-medium">{events.length}</span></h2>
              <Link to="/studio/events" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <ul className="bg-card border border-border divide-y divide-border">
              {events.slice(0, 6).map((e) => <EventLine key={e.id} event={e} current={next?.id === e.id} />)}
            </ul>
          </section>
        )}
      </div>
    </StudioLayout>
  );
};

/* ───────────────────────── Hero: the next event ───────────────────────── */

const NextUp = ({ event, phase, pace, checkedIn }: { event: StudioEvent; phase: Phase; pace: Pace | null; checkedIn: number | null }) => {
  const sold = useCountUp(event.sold_count);
  const pct = event.total_capacity > 0 ? Math.min(100, Math.round((event.sold_count / event.total_capacity) * 100)) : 0;
  const soldOut = event.total_capacity > 0 && event.sold_count >= event.total_capacity;
  const accent = event.primary_color && /^#[0-9a-fA-F]{6}$/.test(event.primary_color) ? event.primary_color : null;
  const [barOn, setBarOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBarOn(true), 50); return () => clearTimeout(t); }, [event.id]);

  // A sale while the page is open: the number ticks up and glows for a moment.
  const prevSold = useRef(event.sold_count);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (event.sold_count > prevSold.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      prevSold.current = event.sold_count;
      return () => clearTimeout(t);
    }
    prevSold.current = event.sold_count;
  }, [event.sold_count]);

  const eyebrow = phase === "today" ? "Today" : phase === "upcoming" ? "Next up" : "Last event";
  const dateLine = `${whenLabel(event.date)} · ${fmtDay(event.date)}`;

  // Where the sales are heading, in one sentence an organizer can act on.
  const paceLine = (() => {
    if (!pace || phase === "past") return null;
    const left = event.total_capacity - event.sold_count;
    if (event.total_capacity > 0 && left <= 0) return "Sold out.";
    if (pace.sold7 === 0) return event.sold_count > 0 ? "No sales in the last 7 days." : "No sales yet. Share the page to get the first ones.";
    const perDay = pace.sold7 / 7;
    const days = Math.max(0, Math.round((startOfDay(new Date(event.date)).getTime() - startOfDay(new Date()).getTime()) / DAY_MS));
    if (event.total_capacity === 0) return `${plural(pace.sold7, "ticket")} in the last 7 days.`;
    const toSellOut = Math.ceil(left / perDay);
    if (days === 0) return `${plural(pace.sold7, "ticket")} this week. ${left} left for tonight.`;
    if (toSellOut <= days) return `${plural(pace.sold7, "ticket")} this week. At this pace you sell out in about ${plural(toSellOut, "day")}, before the event.`;
    const projected = Math.min(event.total_capacity, event.sold_count + Math.round(perDay * days));
    return `${plural(pace.sold7, "ticket")} this week. At this pace, about ${projected} of ${event.total_capacity} by the day.`;
  })();

  const share = async () => {
    const url = `${window.location.origin}/e/${event.slug}`;
    try {
      if (navigator.share) { await navigator.share({ title: event.title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch { /* user cancelled the share sheet */ }
  };

  const btnPrimary = "inline-flex items-center justify-center gap-2 px-4 min-h-[44px] font-bold text-sm bg-white text-foreground hover:bg-white/90 transition-colors";
  const btnGhost = "inline-flex items-center justify-center gap-2 px-4 min-h-[44px] font-bold text-sm text-white border border-white/40 hover:bg-white/10 transition-colors";

  return (
    <section
      className="relative overflow-hidden text-white mb-4 motion-safe:animate-fade-in"
      style={{ background: accent ?? "hsl(var(--primary))" }}
      aria-labelledby="next-heading"
    >
      {event.banner_url && (
        <img src={event.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/20" />
      <div className="relative p-5 md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-white/75">
              {eyebrow} · {dateLine}
            </p>
            <h2 id="next-heading" className="font-display text-3xl md:text-[40px] leading-[1.05] font-bold mt-1.5 text-balance">
              {event.title}
            </h2>
            {event.location && <p className="text-sm text-white/80 mt-1.5 truncate">{event.location}</p>}
          </div>
          <EventStatusBadge status={event.status} date={event.date} soldOut={soldOut} size="sm" className="shrink-0" />
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`font-display text-5xl md:text-6xl font-bold tabular-nums leading-none transition-[text-shadow] duration-700 ${flash ? "[text-shadow:0_0_24px_rgba(255,255,255,0.9)]" : ""}`}>
                {sold.toLocaleString("en-GB")}
              </span>
              <span className="text-sm text-white/80">
                {event.total_capacity > 0 ? `of ${event.total_capacity.toLocaleString("en-GB")} tickets sold` : "tickets sold"}
              </span>
            </div>
            {event.total_capacity > 0 ? (
              <div className="mt-3 h-2 w-full bg-white/25 overflow-hidden" aria-hidden>
                <div
                  className="h-full bg-white origin-left motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out"
                  style={{ transform: `scaleX(${barOn ? pct / 100 : 0})` }}
                />
              </div>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-white/15 px-2.5 py-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> No ticket types yet, so nothing is on sale.
              </p>
            )}
            <p className="mt-2 text-xs text-white/80 tabular-nums">
              {event.total_capacity > 0 ? `${pct}% full · ` : ""}
              {eur(event.revenue_cents)} in ticket sales
              {pace?.lastSale ? ` · last sale ${relativeTime(pace.lastSale)}` : ""}
              {checkedIn != null && phase !== "upcoming" ? ` · ${checkedIn.toLocaleString("en-GB")} checked in` : ""}
            </p>
            {paceLine && <p className="mt-1.5 text-sm text-white/95 font-medium">{paceLine}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            {phase === "today" ? (
              <>
                <Link to={`/organizer/scan?event_id=${event.id}`} className={btnPrimary}><QrCode className="w-4 h-4" /> Open scanner</Link>
                <Link to={`/studio/events/${event.id}/attendees`} className={btnGhost}><Users className="w-4 h-4" /> Guest list</Link>
              </>
            ) : phase === "upcoming" ? (
              <>
                {event.slug && event.status === "published" ? (
                  <button type="button" onClick={share} className={btnPrimary}><Share2 className="w-4 h-4" /> Share the page</button>
                ) : (
                  <Link to={`/studio/events/${event.id}`} className={btnPrimary}><Pencil className="w-4 h-4" /> Finish the event</Link>
                )}
                <Link to={`/studio/events/${event.id}`} className={btnGhost}><Ticket className="w-4 h-4" /> Tickets</Link>
                <Link to={`/studio/events/${event.id}/attendees`} className={btnGhost}><Users className="w-4 h-4" /> Guests</Link>
              </>
            ) : (
              <>
                <Link to={`/studio/events/${event.id}/attendees`} className={btnPrimary}><Users className="w-4 h-4" /> Attendance</Link>
                <Link to="/studio/payments" className={btnGhost}><Banknote className="w-4 h-4" /> Payout</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── This week ───────────────────────── */

const Figure = ({ label, value, prev, money = false }: { label: string; value: number; prev: number; money?: boolean }) => {
  const shown = useCountUp(value);
  const delta = value - prev;
  const deltaText = delta === 0 ? "same as last week" : `${delta > 0 ? "+" : "−"}${money ? eur(Math.abs(delta)) : Math.abs(delta).toLocaleString("en-GB")} vs last week`;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="font-display text-2xl md:text-3xl font-bold tabular-nums leading-tight mt-0.5">{money ? eur(shown) : shown.toLocaleString("en-GB")}</div>
      <div className={`text-xs mt-0.5 ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-muted-foreground" : "text-muted-foreground"}`}>{deltaText}</div>
    </div>
  );
};

const Bars = ({ days }: { days: DaySales[] | null }) => {
  if (!days) return <div className="h-20 bg-muted animate-pulse" />;
  const max = Math.max(1, ...days.map((d) => d.tickets));
  const label = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div>
      <div className="flex items-end gap-1 h-16" role="img" aria-label="Tickets sold per day over the last 14 days">
        {days.map((d, i) => (
          <div
            key={d.day}
            title={`${label(d.day)}: ${plural(d.tickets, "ticket")}, ${eur(d.cents)}`}
            className={`flex-1 origin-bottom motion-safe:transition-transform motion-safe:duration-500 ${i >= 7 ? "bg-primary" : "bg-primary/35"}`}
            style={{ height: `${Math.max(4, (d.tickets / max) * 100)}%`, transitionDelay: `${i * 25}ms` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>{label(days[0].day)}</span>
        <span>today</span>
      </div>
    </div>
  );
};

/* ───────────────────────── Ledger row ───────────────────────── */

const EventLine = ({ event, current }: { event: StudioEvent; current: boolean }) => {
  const pct = event.total_capacity > 0 ? Math.min(100, Math.round((event.sold_count / event.total_capacity) * 100)) : 0;
  const soldOut = event.total_capacity > 0 && event.sold_count >= event.total_capacity;
  const d = new Date(event.date);
  return (
    <li>
      <Link to={`/studio/events/${event.id}`} className="group grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 py-3 min-h-[56px] hover:bg-muted/60 transition-colors">
        <div className="w-10 text-center leading-tight">
          <div className="font-display text-lg font-bold tabular-nums">{d.getDate()}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.toLocaleDateString("en-GB", { month: "short" })}</div>
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold truncate ${current ? "text-primary" : "text-foreground"}`}>{event.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {event.location ?? "No venue yet"}
            {event.slug && event.status === "published" && (
              <a
                href={`/e/${event.slug}`}
                onClick={(ev) => ev.stopPropagation()}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-0.5 hover:text-primary hover:underline"
              >
                Public page <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
        <EventStatusBadge status={event.status} date={event.date} soldOut={soldOut} size="sm" className="justify-self-end" />
        <div className="hidden md:flex items-center gap-2 w-40">
          <div className="h-1.5 flex-1 bg-muted overflow-hidden" aria-hidden>
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right">
            {event.total_capacity > 0 ? `${event.sold_count}/${event.total_capacity}` : "no tiers"}
          </span>
        </div>
        <div className="hidden md:block text-sm font-bold tabular-nums text-right w-20">{eur(event.revenue_cents)}</div>
      </Link>
    </li>
  );
};

/* ───────────────────────── Empty state ───────────────────────── */

const EmptyEvents = () => (
  <div className="relative overflow-hidden text-center py-14 px-6 bg-card border border-border shadow-soft mb-6">
    <div className="absolute inset-x-0 top-0 h-28 opacity-[0.07] pointer-events-none" style={{ background: "var(--gradient-hero)" }} />
    <div className="relative">
      <div className="inline-flex w-16 h-16 items-center justify-center mb-4 text-white shadow-card" style={{ background: "var(--gradient-hero)" }}>
        <Calendar className="w-8 h-8" />
      </div>
      <h3 className="font-display text-2xl font-bold mb-1.5">Your first event starts here</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        Name it, add your ticket types, share the page. Scan at the door from your phone, and the money reaches your bank after the event.
      </p>
      <Link
        to="/studio/events/new"
        className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover shadow-soft hover:shadow-card transition-all"
      >
        <Plus className="w-4 h-4" />
        Create an event
      </Link>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Free to set up</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Live in minutes</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> You keep 100% of the ticket price</span>
      </div>
    </div>
  </div>
);

export default StudioDashboard;
