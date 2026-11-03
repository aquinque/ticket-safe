import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import Header from "@/components/Header";
import { SEOHead } from "@/components/SEOHead";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney, fmtTime, plural } from "@/lib/studioFormat";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/money";
import { isPastEvent } from "@/lib/eventTime";

/**
 * Admin overview of Ticket Safe, in four tabs:
 *  - Overview: what we and the organizers made over a chosen period, against the period before.
 *  - Events: every event with sales (all time), each opening in a side panel with its attendees.
 *  - Organizers: what each organizer sold and made over the period.
 *  - People: one search across every ticket holder, by name or email.
 * Admins only: the route sits behind ProtectedAdminRoute, and the database itself only returns
 * other organizers' orders and tickets to an admin (RLS).
 *
 * Money, per paid order: the buyer paid total_cents; Ticket Safe made the service fee (fee_cents,
 * before Stripe's costs); the organizer made the rest. Refunded orders are left out. Amounts are
 * kept per currency and never added across euros and pounds.
 */

export interface AdminOrder { event_id: string; created_at: string; quantity: number; paidCents: number; feeCents: number; tier_id: string | null }

export interface AdminEvent {
  id: string;
  title: string;
  date: string;
  ends_at: string | null;
  location: string | null;
  status: string | null;
  slug: string | null;
  currency: Currency;
  organizer: { id: string; name: string; email: string | null } | null;
  capacity: number;
  sold: number;
  checkedIn: number;
  orders: number;
  paidCents: number;
  feeCents: number;
  organizerCents: number;
  tiers: { id: string; name: string; price_cents: number; sold: number; total: number }[];
}

export interface Attendee {
  id: string;
  event_id?: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  buyer_email: string | null;
  gender: string | null;
  tier: string | null;
  status: string | null;
  scanned_at: string | null;
  bought_at: string;
}

/** Everything the page shows; scans are check-in times per event. */
export interface AdminData { events: AdminEvent[]; orders: AdminOrder[]; scans: { event_id: string; at: string }[] }

/** Reads every row past the API's 1,000-row page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function loadAdminData(): Promise<AdminData> {
  type Org = { id: string; name: string; contact_email: string | null };
  type EvRow = { id: string; title: string; date: string; ends_at: string | null; location: string | null; status: string | null; slug: string | null; organizer: Org | Org[] | null };
  type TierRow = { id: string; event_id: string; name: string; price_cents: number; sold_qty: number; total_qty: number; currency: string | null; sort_order: number };
  type OrderRow = { event_id: string; created_at: string; quantity: number; total_cents: number; fee_cents: number | null; tier_id: string | null };
  type ScanRow = { event_id: string; scanned_at: string };

  const [evs, tiers, orderRows, scanRows] = await Promise.all([
    fetchAll<EvRow>((a, b) => supabase.from("events").select("id, title, date, ends_at, location, status, slug, organizer:organizer_profiles!events_organizer_id_fkey(id, name, contact_email)").order("date", { ascending: false }).range(a, b)),
    fetchAll<TierRow>((a, b) => supabase.from("event_tiers").select("id, event_id, name, price_cents, sold_qty, total_qty, currency, sort_order").range(a, b)),
    fetchAll<OrderRow>((a, b) => supabase.from("event_orders").select("event_id, created_at, quantity, total_cents, fee_cents, tier_id").eq("status", "paid").range(a, b)),
    fetchAll<ScanRow>((a, b) => supabase.from("event_tickets").select("event_id, scanned_at").not("scanned_at", "is", null).range(a, b)),
  ]);

  const orders: AdminOrder[] = orderRows.map((o) => ({ event_id: o.event_id, created_at: o.created_at, quantity: o.quantity, paidCents: o.total_cents, feeCents: o.fee_cents ?? 0, tier_id: o.tier_id }));
  const tiersBy = new Map<string, TierRow[]>();
  for (const t of tiers) tiersBy.set(t.event_id, [...(tiersBy.get(t.event_id) ?? []), t]);
  const money = new Map<string, { orders: number; paid: number; fee: number }>();
  for (const o of orders) {
    const m = money.get(o.event_id) ?? { orders: 0, paid: 0, fee: 0 };
    m.orders += 1;
    m.paid += o.paidCents;
    m.fee += o.feeCents;
    money.set(o.event_id, m);
  }
  const inDoor = new Map<string, number>();
  for (const t of scanRows) inDoor.set(t.event_id, (inDoor.get(t.event_id) ?? 0) + 1);

  const events = evs.map((e) => {
    const ts = (tiersBy.get(e.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const m = money.get(e.id) ?? { orders: 0, paid: 0, fee: 0 };
    const org = one(e.organizer);
    return {
      id: e.id, title: e.title, date: e.date, ends_at: e.ends_at, location: e.location, status: e.status, slug: e.slug,
      currency: toCurrency(ts[0]?.currency),
      organizer: org ? { id: org.id, name: org.name, email: org.contact_email } : null,
      capacity: ts.reduce((n, t) => n + t.total_qty, 0),
      sold: ts.reduce((n, t) => n + t.sold_qty, 0),
      checkedIn: inDoor.get(e.id) ?? 0,
      orders: m.orders,
      paidCents: m.paid,
      feeCents: m.fee,
      organizerCents: m.paid - m.fee,
      tiers: ts.map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents, sold: t.sold_qty, total: t.total_qty })),
    };
  });
  return { events, orders, scans: scanRows.map((s) => ({ event_id: s.event_id, at: s.scanned_at })) };
}

type TicketRow = { id: string; event_id: string; holder_first_name: string | null; holder_last_name: string | null; holder_email: string | null; holder_gender: string | null; status: string | null; scanned_at: string | null; created_at: string; tier: { name: string } | { name: string }[] | null; order: { buyer_email: string | null } | { buyer_email: string | null }[] | null };
const TICKET_COLUMNS = "id, event_id, holder_first_name, holder_last_name, holder_email, holder_gender, status, scanned_at, created_at, tier:event_tiers(name), order:event_orders(buyer_email)";
const toAttendee = (r: TicketRow): Attendee => ({
  id: r.id, event_id: r.event_id, first_name: r.holder_first_name, last_name: r.holder_last_name, email: r.holder_email,
  buyer_email: one(r.order)?.buyer_email ?? null, gender: r.holder_gender, tier: one(r.tier)?.name ?? null,
  status: r.status, scanned_at: r.scanned_at, bought_at: r.created_at,
});

async function loadAttendees(eventId: string): Promise<Attendee[]> {
  const rows = await fetchAll<TicketRow>((a, b) => supabase.from("event_tickets").select(TICKET_COLUMNS).eq("event_id", eventId).order("created_at", { ascending: true }).range(a, b));
  return rows.map(toAttendee);
}

/** Ticket holders across every event whose name or email contains the words typed; 50 at most. */
async function searchPeople(q: string): Promise<Attendee[]> {
  // Commas, brackets and the like would break the filter syntax; names and emails don't need them.
  const term = q.replace(/[^\p{L}\p{N}@._+ -]/gu, "").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const { data, error } = await supabase
    .from("event_tickets")
    .select(TICKET_COLUMNS)
    .or(`holder_email.ilike.${like},holder_first_name.ilike.${like},holder_last_name.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as TicketRow[]).map(toAttendee);
}

/** The attendee list as a spreadsheet file. */
function downloadCsv(name: string, people: Attendee[]) {
  const cell = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const head = ["First name", "Last name", "Email", "Buyer email", "Gender", "Ticket type", "Status", "Checked in at", "Bought at"];
  const lines = people.map((p) => [p.first_name, p.last_name, p.email, p.buyer_email, p.gender, p.tier, p.status, p.scanned_at, p.bought_at].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-attendees.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const ORG = "hsl(var(--primary))";
const US = "#10b981";
const DAY = 86_400_000;

type Period = "month" | "30d" | "year" | "all";
// All time first: the page opens on it, so the first number seen is the full total.
const PERIODS: { key: Period; label: string; vs: string }[] = [
  { key: "all", label: "All time", vs: "" },
  { key: "year", label: "This year", vs: "same days last year" },
  { key: "30d", label: "Last 30 days", vs: "the 30 days before" },
  { key: "month", label: "This month", vs: "same days last month" },
];

/** The period's window and the one it's compared with (none for all time). */
function windows(p: Period, now: Date): { from: number; to: number; prev: { from: number; to: number } | null } {
  const to = now.getTime();
  if (p === "all") return { from: 0, to, prev: null };
  if (p === "30d") return { from: to - 30 * DAY, to, prev: { from: to - 60 * DAY, to: to - 30 * DAY } };
  const start = p === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), 0, 1);
  const prevStart = p === "month" ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear() - 1, 0, 1);
  return { from: start.getTime(), to, prev: { from: prevStart.getTime(), to: prevStart.getTime() + (to - start.getTime()) } };
}

/** Live data for the real page. */
const AdminEvents = () => {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await loadAdminData());
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      console.error("[admin-events]", e);
      setError("Could not load the data. Check that you're signed in as an admin, then refresh.");
    }
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  return <AdminEventsView data={data} error={error} updated={updated} onRefresh={load} loadPeople={loadAttendees} searchPeople={searchPeople} />;
};

type Tab = "overview" | "events" | "organizers" | "people";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "events", label: "Events" },
  { key: "organizers", label: "Organizers" },
  { key: "people", label: "People" },
];

export function AdminEventsView({
  data, error, updated, onRefresh, loadPeople, searchPeople: search, banner,
}: {
  data: AdminData | null;
  error: string | null;
  updated: Date | null;
  onRefresh: () => void;
  loadPeople: (eventId: string) => Promise<Attendee[]>;
  searchPeople: (q: string) => Promise<Attendee[]>;
  banner?: React.ReactNode;
}) {
  useThemeMode("studio");
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const events = useMemo(() => data?.events ?? [], [data]);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // Headline currency: euros unless only pounds have sold.
  const main: Currency = useMemo(() => {
    const sold = CURRENCIES.filter((c) => events.some((e) => e.currency === c && e.paidCents > 0));
    return sold.includes("EUR") || !sold.length ? "EUR" : sold[0];
  }, [events]);

  const win = useMemo(() => windows(period, new Date()), [period, updated]); // eslint-disable-line react-hooks/exhaustive-deps
  const inWindow = useCallback((iso: string, w: { from: number; to: number }) => { const t = new Date(iso).getTime(); return t >= w.from && t <= w.to; }, []);

  /** Money, tickets and orders over a window, in the headline currency. */
  const figures = useCallback((w: { from: number; to: number }) => {
    const os = (data?.orders ?? []).filter((o) => byId.get(o.event_id)?.currency === main && inWindow(o.created_at, w));
    const paid = os.reduce((n, o) => n + o.paidCents, 0);
    const fee = os.reduce((n, o) => n + o.feeCents, 0);
    return {
      paid, fee, org: paid - fee,
      tickets: os.reduce((n, o) => n + o.quantity, 0),
      // Free tickets carry no fee, so the fee per ticket is over paid tickets only.
      paidTickets: os.reduce((n, o) => n + (o.paidCents > 0 ? o.quantity : 0), 0),
      orders: os.length,
      came: (data?.scans ?? []).filter((s) => inWindow(s.at, w)).length,
    };
  }, [data, byId, main, inWindow]);
  const now = figures(win);
  const before = win.prev ? figures(win.prev) : null;
  const vs = PERIODS.find((p) => p.key === period)!.vs;

  const openIndex = useMemo(() => events.findIndex((e) => e.id === openId), [events, openId]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Admin · Ticket Safe" description="Admin overview of Ticket Safe" />
      <Header />
      <main className="flex-1 pt-2 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Title, refresh, then the tabs */}
          <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Admin · <Link to="/admin/organizers" className="hover:text-foreground">Applications</Link> · <Link to="/admin/payouts" className="hover:text-foreground">Payouts</Link>
              </p>
              <h1 className="font-display text-3xl font-bold mt-1">Ticket Safe</h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {updated && (
                <span className="hidden sm:inline-flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live · updated {fmtTime(updated.toISOString())}
                </span>
              )}
              <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3 min-h-[36px] border border-border bg-card font-semibold text-foreground hover:bg-muted">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          <nav className="mt-4 mb-6 flex gap-1 border-b border-border overflow-x-auto overflow-y-hidden" role="tablist" aria-label="Admin sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {banner}
          {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3">{error}</p>}
          {!data && !error && <div className="py-24 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-muted-foreground" /></div>}

          {data && (tab === "overview" || tab === "organizers") && (
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="inline-flex p-0.5 bg-muted text-xs font-semibold">
                {PERIODS.map((p) => (
                  <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`px-3 py-1.5 ${period === p.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {before && <span className="text-xs text-muted-foreground">compared with {vs}</span>}
            </div>
          )}

          {data && tab === "overview" && <Overview data={data} main={main} now={now} before={before} onOrganizers={() => setTab("organizers")} win={win} byId={byId} />}
          {data && tab === "events" && <EventsTab events={events} onOpen={setOpenId} />}
          {data && tab === "organizers" && <OrganizersTab data={data} main={main} win={win} byId={byId} />}
          {data && tab === "people" && <PeopleTab search={search} byId={byId} onOpen={setOpenId} />}
        </div>
      </main>

      {/* One event, in a panel over the page; previous / next walk the list without closing it. */}
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {openIndex >= 0 && (
            <>
              <SheetHeader className="text-left pr-8">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{fmtDate(events[openIndex].date)} · {isPastEvent(events[openIndex]) ? "Past" : "Upcoming"}</p>
                <SheetTitle className="font-display text-2xl">{events[openIndex].title}</SheetTitle>
                <SheetDescription>{events[openIndex].organizer?.name ?? "No organizer"}{events[openIndex].location ? ` · ${events[openIndex].location}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="flex items-center gap-2 my-4">
                <button type="button" disabled={openIndex <= 0} onClick={() => setOpenId(events[openIndex - 1].id)} className="inline-flex items-center gap-1 px-2.5 min-h-[32px] text-xs font-semibold border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /> Newer</button>
                <button type="button" disabled={openIndex >= events.length - 1} onClick={() => setOpenId(events[openIndex + 1].id)} className="inline-flex items-center gap-1 px-2.5 min-h-[32px] text-xs font-semibold border border-border hover:bg-muted disabled:opacity-40">Older <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <EventDetail key={events[openIndex].id} event={events[openIndex]} orders={(data?.orders ?? []).filter((o) => o.event_id === openId)} loadPeople={loadPeople} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

type Figures = { paid: number; fee: number; org: number; tickets: number; paidTickets: number; orders: number; came: number };

function Overview({ data, main, now, before, onOrganizers, win, byId }: { data: AdminData; main: Currency; now: Figures; before: Figures | null; onOrganizers: () => void; win: { from: number; to: number }; byId: Map<string, AdminEvent> }) {
  // Money per month over the last 12 months, organizers and us.
  const months = useMemo(() => {
    const by = new Map<string, { org: number; us: number; tickets: number }>();
    for (const o of data.orders) {
      if (byId.get(o.event_id)?.currency !== main) continue;
      const k = o.created_at.slice(0, 7);
      const m = by.get(k) ?? { org: 0, us: 0, tickets: 0 };
      m.org += o.paidCents - o.feeCents;
      m.us += o.feeCents;
      m.tickets += o.quantity;
      by.set(k, m);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, v]) => ({ key: k, label: new Date(`${k}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short" }), org: v.org / 100, us: v.us / 100, tickets: v.tickets }));
  }, [data, byId, main]);
  const top = useOrganizerTotals(data, main, win, byId).slice(0, 5);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* The one number that matters most */}
        <div className="bg-card border border-border p-6">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">We made</div>
          <div className="flex flex-wrap items-baseline gap-3 mt-1">
            <span className="font-display text-5xl font-bold tabular-nums text-emerald-700"><CountMoney cents={now.fee} currency={main} decimals={2} /></span>
            {before && <Delta now={now.fee} before={before.fee} money={main} />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Service fees, before Stripe's costs{now.paidTickets ? ` · ${fmtMoney(Math.round(now.fee / now.paidTickets), main, 2)} per paid ticket` : ""}</p>
          <div className="mt-5 h-3 w-full bg-muted flex overflow-hidden" aria-hidden>
            <div className="h-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${pct(now.org, now.paid)}%`, background: ORG }} />
            <div className="h-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${now.paid ? 100 - pct(now.org, now.paid) : 0}%`, background: US }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: ORG }} />Organizers made <b className="tabular-nums">{fmtMoney(now.org, main)}</b></span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: US }} />Us <b className="tabular-nums">{fmtMoney(now.fee, main, 2)}</b></span>
            <span className="text-muted-foreground">Buyers paid <b className="tabular-nums text-foreground">{fmtMoney(now.paid, main)}</b></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border border border-border">
          <Kpi label="Tickets sold" value={now.tickets} before={before?.tickets} />
          <Kpi label="Organizers made" value={now.org} before={before?.org} money={main} />
          <Kpi label="Paid orders" value={now.orders} before={before?.orders} />
          <Kpi label="People who came" value={now.came} before={before?.came} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="bg-card border border-border p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold">Month by month</h2>
            <span className="text-[11px] text-muted-foreground">last 12 months · by date of purchase</span>
          </div>
          {months.length === 0 ? <p className="h-52 flex items-center justify-center text-sm text-muted-foreground">No sales yet.</p> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 4, right: 0, bottom: 0, left: -8 }} barCategoryGap="28%">
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtMoney(v * 100, main)} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as (typeof months)[number] | undefined;
                      if (!active || !p) return null;
                      return (
                        <div className="bg-foreground text-background px-3 py-2 text-xs shadow-lg space-y-0.5">
                          <div className="font-semibold">{new Date(`${p.key}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
                          <div>{plural(p.tickets, "ticket")}</div>
                          <div>Organizers {fmtMoney(p.org * 100, main, 2)}</div>
                          <div>Us {fmtMoney(p.us * 100, main, 2)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="org" stackId="m" fill={ORG} animationDuration={700} />
                  <Bar dataKey="us" stackId="m" fill={US} radius={[3, 3, 0, 0]} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="bg-card border border-border p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold">Top organizers</h2>
            <button type="button" onClick={onOrganizers} className="text-xs font-bold text-primary hover:underline">See all</button>
          </div>
          {top.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this period.</p> : (
            <ul className="space-y-3">
              {top.map((o) => (
                <li key={o.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold truncate">{o.name}</span>
                    <span className="tabular-nums font-bold shrink-0">{fmtMoney(o.org, main)}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-muted overflow-hidden"><div className="h-full" style={{ width: `${pct(o.org, top[0].org)}%`, background: ORG }} /></div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{plural(o.tickets, "ticket")} · we made {fmtMoney(o.fee, main, 2)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** Up or down against the previous period. */
const Delta = ({ now, before, money }: { now: number; before: number; money?: Currency }) => {
  const d = now - before;
  if (d === 0) return <span className="text-xs text-muted-foreground">same as before</span>;
  const up = d > 0;
  const size = money ? fmtMoney(Math.abs(d), money, Math.abs(d) < 10_000 ? 2 : 0) : Math.abs(d).toLocaleString("en-GB");
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-emerald-700" : "text-rose-600"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{size}
    </span>
  );
};

const CountMoney = ({ cents, currency, decimals = 0 }: { cents: number; currency: Currency; decimals?: number }) => {
  const shown = useCountUp(cents, 900);
  return <>{fmtMoney(shown, currency, decimals)}</>;
};

const Kpi = ({ label, value, before, money }: { label: string; value: number; before?: number; money?: Currency }) => {
  const shown = useCountUp(value, 900);
  return (
    <div className="bg-card px-4 py-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold tabular-nums leading-tight mt-1">{money ? fmtMoney(shown, money) : shown.toLocaleString("en-GB")}</div>
      {before != null && <div className="mt-0.5"><Delta now={value} before={before} money={money} /></div>}
    </div>
  );
};

/* ───────────────────────── Organizers ───────────────────────── */

function useOrganizerTotals(data: AdminData, main: Currency, win: { from: number; to: number }, byId: Map<string, AdminEvent>) {
  return useMemo(() => {
    const by = new Map<string, { id: string; name: string; email: string | null; events: Set<string>; tickets: number; org: number; fee: number }>();
    for (const o of data.orders) {
      const e = byId.get(o.event_id);
      if (!e?.organizer || e.currency !== main) continue;
      const t = new Date(o.created_at).getTime();
      if (t < win.from || t > win.to) continue;
      const r = by.get(e.organizer.id) ?? { id: e.organizer.id, name: e.organizer.name, email: e.organizer.email, events: new Set<string>(), tickets: 0, org: 0, fee: 0 };
      r.events.add(e.id);
      r.tickets += o.quantity;
      r.org += o.paidCents - o.feeCents;
      r.fee += o.feeCents;
      by.set(e.organizer.id, r);
    }
    return [...by.values()].sort((a, b) => b.org - a.org);
  }, [data, main, win, byId]);
}

function OrganizersTab({ data, main, win, byId }: { data: AdminData; main: Currency; win: { from: number; to: number }; byId: Map<string, AdminEvent> }) {
  const rows = useOrganizerTotals(data, main, win, byId);
  if (!rows.length) return <p className="py-16 text-center text-sm text-muted-foreground">No organizer sold anything in this period. Pick a longer one above.</p>;
  return (
    <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Organizer</th>
            <th className="px-4 py-2.5 font-semibold text-right">Events</th>
            <th className="px-4 py-2.5 font-semibold text-right">Tickets</th>
            <th className="px-4 py-2.5 font-semibold text-right">Organizer made</th>
            <th className="px-4 py-2.5 font-semibold text-right">We made</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <div className="font-semibold">{o.name}</div>
                {o.email && <a href={`mailto:${o.email}`} className="text-[11px] text-primary hover:underline">{o.email}</a>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{o.events.size}</td>
              <td className="px-4 py-3 text-right tabular-nums">{o.tickets}</td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtMoney(o.org, main, 2)}</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700">{fmtMoney(o.fee, main, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Events ───────────────────────── */

type When = "all" | "upcoming" | "past";
type SortKey = "date" | "sold" | "org" | "fee";

function EventsTab({ events, onOpen }: { events: AdminEvent[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [withoutSales, setWithoutSales] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const hidden = events.filter((e) => e.orders === 0).length;

  const shown = useMemo(() => {
    const now = new Date();
    const needle = q.trim().toLowerCase();
    const list = events.filter((e) => {
      if (!withoutSales && e.orders === 0) return false;
      if (when === "upcoming" && isPastEvent(e, now)) return false;
      if (when === "past" && !isPastEvent(e, now)) return false;
      return !needle || [e.title, e.organizer?.name, e.location].some((v) => v?.toLowerCase().includes(needle));
    });
    const val = (e: AdminEvent) => (sort.key === "date" ? new Date(e.date).getTime() : sort.key === "sold" ? e.sold : sort.key === "org" ? e.organizerCents : e.feeCents);
    return list.sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [events, q, when, withoutSales, sort]);

  const SortHead = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 font-semibold ${className}`}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : true }))} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground">
        {children}
        {sort.key === k && (sort.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an event, organizer or venue" className="w-full pl-9 pr-3 min-h-[40px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <div className="inline-flex p-0.5 bg-muted text-xs font-semibold">
          {(["all", "upcoming", "past"] as When[]).map((w) => (
            <button key={w} type="button" onClick={() => setWhen(w)} className={`px-3 py-1.5 ${when === w ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {w === "all" ? "All" : w === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={withoutSales} onChange={(e) => setWithoutSales(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          Show {plural(hidden, "event")} without sales
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">Totals for each event, all time. Click an event for its details and attendees.</p>
      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
            <tr>
              <SortHead k="date">Date</SortHead>
              <th className="px-3 py-2.5 font-semibold">Event</th>
              <SortHead k="sold">Sold</SortHead>
              <th className="px-3 py-2.5 font-semibold">Came</th>
              <SortHead k="org" className="text-right">Organizer made</SortHead>
              <SortHead k="fee" className="text-right">We made</SortHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No event matches. Clear the search or show events without sales.</td></tr>}
            {shown.map((e) => {
              const past = isPastEvent(e);
              return (
                <tr key={e.id} onClick={() => onOpen(e.id)} onKeyDown={(k) => k.key === "Enter" && onOpen(e.id)} tabIndex={0} className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/60">
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                    <div className="font-semibold">{fmtDate(e.date)}</div>
                    <div className={`text-[11px] ${past ? "text-muted-foreground" : "text-primary font-semibold"}`}>{past ? "Past" : "Upcoming"}</div>
                  </td>
                  <td className="px-3 py-3 min-w-[200px]">
                    <div className="font-semibold">{e.title}</div>
                    <div className="text-[11px] text-muted-foreground">{e.organizer?.name ?? "No organizer"}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap"><Meter n={e.sold} of={e.capacity} /></td>
                  <td className="px-3 py-3 whitespace-nowrap">{past || e.checkedIn ? <Meter n={e.checkedIn} of={e.sold} tone="came" /> : <span className="text-muted-foreground text-xs">Not yet</span>}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtMoney(e.organizerCents, e.currency, 2)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700">{fmtMoney(e.feeCents, e.currency, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "120 / 150" with a bar. */
const Meter = ({ n, of, tone = "sold" }: { n: number; of: number; tone?: "sold" | "came" }) => (
  <div className="w-28">
    <div className="text-sm tabular-nums"><span className="font-semibold">{n}</span><span className="text-muted-foreground"> / {of}</span>{of > 0 && <span className="text-[11px] text-muted-foreground"> · {pct(n, of)}%</span>}</div>
    <div className="h-1 mt-1 bg-muted overflow-hidden"><div className="h-full" style={{ width: `${Math.min(100, pct(n, of))}%`, background: tone === "came" ? US : ORG }} /></div>
  </div>
);

/* ───────────────────────── People ───────────────────────── */

function PeopleTab({ search, byId, onOpen }: { search: (q: string) => Promise<Attendee[]>; byId: Map<string, AdminEvent>; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Attendee[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    let active = true;
    setBusy(true);
    const t = setTimeout(() => {
      search(q).then((r) => { if (active) { setResults(r); setFailed(false); } }).catch(() => active && setFailed(true)).finally(() => active && setBusy(false));
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [q, search]);

  return (
    <div>
      <label className="relative block max-w-xl mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone by name or email, across every event" className="w-full pl-9 pr-9 min-h-[44px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        {busy && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      </label>
      {failed ? <p className="text-sm text-destructive">The search failed. Try again.</p>
        : results == null ? <p className="text-sm text-muted-foreground">Type at least 2 letters. Useful when someone says they never got their ticket.</p>
        : results.length === 0 ? <p className="text-sm text-muted-foreground">Nobody with that name or email.</p>
        : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Name</th>
                  <th className="px-3 py-2.5 font-semibold">Email</th>
                  <th className="px-3 py-2.5 font-semibold">Event</th>
                  <th className="px-3 py-2.5 font-semibold">Ticket</th>
                  <th className="px-3 py-2.5 font-semibold">Came</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((p) => {
                  const e = p.event_id ? byId.get(p.event_id) : undefined;
                  return (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}</td>
                      <td className="px-3 py-2.5 break-all text-xs">{p.email ?? "–"}{p.buyer_email && p.buyer_email !== p.email && <div className="text-muted-foreground">bought by {p.buyer_email}</div>}</td>
                      <td className="px-3 py-2.5">
                        {e ? <button type="button" onClick={() => onOpen(e.id)} className="text-left font-semibold text-primary hover:underline">{e.title}</button> : "–"}
                        {e && <div className="text-[11px] text-muted-foreground">{fmtDate(e.date)}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{p.tier ?? "–"}{p.status && p.status !== "valid" && p.status !== "scanned" ? <span className="text-muted-foreground"> · {p.status}</span> : null}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{p.scanned_at ? <span className="text-emerald-700 font-semibold">✓ {fmtTime(p.scanned_at)}</span> : <span className="text-muted-foreground">No</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.length === 50 && <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">Showing the 50 most recent. Type more of the name or email to narrow it down.</p>}
          </div>
        )}
    </div>
  );
}

/* ───────────────────────── One event (side panel) ───────────────────────── */

function EventDetail({ event, orders, loadPeople }: { event: AdminEvent; orders: AdminOrder[]; loadPeople: (eventId: string) => Promise<Attendee[]> }) {
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    let active = true;
    loadPeople(event.id).then((p) => active && setPeople(p)).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [event.id, loadPeople]);

  const c = event.currency;
  const needle = q.trim().toLowerCase();
  const list = (people ?? []).filter((p) => !needle || [p.first_name, p.last_name, p.email, p.buyer_email].some((v) => v?.toLowerCase().includes(needle)));
  const genders = (people ?? []).reduce((acc, p) => { const g = p.gender ?? "unknown"; acc[g] = (acc[g] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const tierMoney = (tierId: string) => orders.filter((o) => o.tier_id === tierId).reduce((m, o) => ({ org: m.org + o.paidCents - o.feeCents, us: m.us + o.feeCents }), { org: 0, us: 0 });
  const days = useMemo(() => {
    const by = new Map<string, number>();
    for (const o of orders) by.set(o.created_at.slice(0, 10), (by.get(o.created_at.slice(0, 10)) ?? 0) + o.quantity);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ label: new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), n }));
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="grid gap-px bg-border border border-border grid-cols-2 sm:grid-cols-3">
        <Mini label="Organizer made" value={fmtMoney(event.organizerCents, c, 2)} />
        <Mini label="We made" value={fmtMoney(event.feeCents, c, 2)} accent />
        <Mini label="Paid by buyers" value={fmtMoney(event.paidCents, c, 2)} />
        <Mini label="Sold" value={`${event.sold} / ${event.capacity}`} sub={`${pct(event.sold, event.capacity)}% of capacity`} />
        <Mini label="Orders" value={`${event.orders}`} sub={event.orders ? `${fmtMoney(Math.round(event.paidCents / event.orders), c, 2)} on average` : ""} />
        <Mini label="Came" value={`${event.checkedIn} / ${event.sold}`} sub={event.sold ? `${pct(event.checkedIn, event.sold)}% checked in` : ""} />
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Ticket types</div>
        {event.tiers.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <table className="w-full text-sm">
            <thead className="text-[11px] text-muted-foreground text-left"><tr><th className="font-semibold pb-1">Type</th><th className="font-semibold pb-1 text-right">Sold</th><th className="font-semibold pb-1 text-right">Organizer</th><th className="font-semibold pb-1 text-right">Us</th></tr></thead>
            <tbody>
              {event.tiers.map((t) => {
                const m = tierMoney(t.id);
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1.5">{t.name} <span className="text-muted-foreground">· {fmtMoney(t.price_cents, c, t.price_cents % 100 ? 2 : 0)}</span></td>
                    <td className="py-1.5 text-right tabular-nums">{t.sold}<span className="text-muted-foreground">/{t.total}</span></td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMoney(m.org, c, 2)}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700">{fmtMoney(m.us, c, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {days.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Tickets bought per day</div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (typeof days)[number] | undefined;
                  return active && p ? <div className="bg-foreground text-background px-2.5 py-1.5 text-xs">{p.label}: {plural(p.n, "ticket")}</div> : null;
                }} />
                <Bar dataKey="n" fill={ORG} radius={[2, 2, 0, 0]} animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Organizer</div>
          <div className="font-semibold">{event.organizer?.name ?? "–"}</div>
          {event.organizer?.email && <a href={`mailto:${event.organizer.email}`} className="text-primary hover:underline break-all">{event.organizer.email}</a>}
        </div>
        {people && people.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Attendees</div>
            <div className="tabular-nums">{Object.entries(genders).sort(([, a], [, b]) => b - a).map(([g, n]) => `${pct(n, people.length)}% ${g}`).join(" · ")}</div>
          </div>
        )}
        {event.slug && (
          <a href={`/e/${event.slug}`} target="_blank" rel="noopener noreferrer" className="self-end inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Public page <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Attendees {people && `· ${plural(people.length, "ticket")} · ${people.filter((p) => p.scanned_at).length} came`}
          </div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or email" className="px-3 min-h-[34px] border border-border bg-card text-xs w-44 focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="button" disabled={!people?.length} onClick={() => people && downloadCsv(event.slug ?? event.id, people)} className="inline-flex items-center gap-1.5 px-3 min-h-[34px] text-xs font-semibold border border-border bg-card hover:bg-muted disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
        {failed ? <p className="text-sm text-destructive">Could not load the attendees.</p> : !people ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : people.length === 0 ? <p className="text-sm text-muted-foreground">No tickets yet.</p> : (
          <div className="border border-border bg-card max-h-[460px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Ticket</th>
                  <th className="px-3 py-2 font-semibold">Came</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}<div className="text-[11px] text-muted-foreground capitalize font-normal">{p.gender ?? ""}</div></td>
                    <td className="px-3 py-2 break-all">
                      {p.email ? <a href={`mailto:${p.email}`} className="hover:text-primary hover:underline">{p.email}</a> : "–"}
                      {p.buyer_email && p.buyer_email !== p.email && <div className="text-muted-foreground">bought by {p.buyer_email}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.tier ?? "–"}{p.status && p.status !== "valid" && p.status !== "scanned" ? <span className="text-muted-foreground"> · {p.status}</span> : null}<div className="text-[11px] text-muted-foreground">{fmtDate(p.bought_at)}</div></td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{p.scanned_at ? <span className="text-emerald-700 font-semibold">✓ {fmtTime(p.scanned_at)}</span> : <span className="text-muted-foreground">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const Mini = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
  <div className="bg-card px-3 py-3">
    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`font-display text-lg font-bold tabular-nums mt-0.5 ${accent ? "text-emerald-700" : ""}`}>{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

export default AdminEvents;
