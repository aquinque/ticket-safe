import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ChevronDown, Download, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import Header from "@/components/Header";
import { SEOHead } from "@/components/SEOHead";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney, fmtTime, plural } from "@/lib/studioFormat";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/money";
import { isPastEvent } from "@/lib/eventTime";

/**
 * Admin overview of every event on Ticket Safe: what each sold, what the organizer made, what
 * Ticket Safe made, who came. Admins only: the route sits behind ProtectedAdminRoute, and the
 * database itself only returns other organizers' orders and tickets to an admin (RLS).
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

export interface AdminData { events: AdminEvent[]; orders: AdminOrder[] }

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

async function loadAdminData(): Promise<AdminData> {
  type Org = { id: string; name: string; contact_email: string | null };
  type EvRow = { id: string; title: string; date: string; ends_at: string | null; location: string | null; status: string | null; slug: string | null; organizer: Org | Org[] | null };
  type TierRow = { id: string; event_id: string; name: string; price_cents: number; sold_qty: number; total_qty: number; currency: string | null; sort_order: number };
  type OrderRow = { event_id: string; created_at: string; quantity: number; total_cents: number; fee_cents: number | null; tier_id: string | null };
  type TicketRow = { event_id: string };

  const [evs, tiers, orderRows, scanned] = await Promise.all([
    fetchAll<EvRow>((a, b) => supabase.from("events").select("id, title, date, ends_at, location, status, slug, organizer:organizer_profiles!events_organizer_id_fkey(id, name, contact_email)").order("date", { ascending: false }).range(a, b)),
    fetchAll<TierRow>((a, b) => supabase.from("event_tiers").select("id, event_id, name, price_cents, sold_qty, total_qty, currency, sort_order").range(a, b)),
    fetchAll<OrderRow>((a, b) => supabase.from("event_orders").select("event_id, created_at, quantity, total_cents, fee_cents, tier_id").eq("status", "paid").range(a, b)),
    fetchAll<TicketRow>((a, b) => supabase.from("event_tickets").select("event_id").not("scanned_at", "is", null).range(a, b)),
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
  for (const t of scanned) inDoor.set(t.event_id, (inDoor.get(t.event_id) ?? 0) + 1);

  const events = evs.map((e) => {
    const ts = (tiersBy.get(e.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const m = money.get(e.id) ?? { orders: 0, paid: 0, fee: 0 };
    const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer;
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
  return { events, orders };
}

async function loadAttendees(eventId: string): Promise<Attendee[]> {
  type Row = { id: string; holder_first_name: string | null; holder_last_name: string | null; holder_email: string | null; holder_gender: string | null; status: string | null; scanned_at: string | null; created_at: string; tier: { name: string } | { name: string }[] | null; order: { buyer_email: string | null } | { buyer_email: string | null }[] | null };
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from("event_tickets")
      .select("id, holder_first_name, holder_last_name, holder_email, holder_gender, status, scanned_at, created_at, tier:event_tiers(name), order:event_orders(buyer_email)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .range(a, b),
  );
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  return rows.map((r) => ({
    id: r.id, first_name: r.holder_first_name, last_name: r.holder_last_name, email: r.holder_email,
    buyer_email: one(r.order)?.buyer_email ?? null, gender: r.holder_gender, tier: one(r.tier)?.name ?? null,
    status: r.status, scanned_at: r.scanned_at, bought_at: r.created_at,
  }));
}

/** The attendee list as a spreadsheet file. */
function downloadCsv(event: AdminEvent, people: Attendee[]) {
  const cell = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const head = ["First name", "Last name", "Email", "Buyer email", "Gender", "Ticket type", "Status", "Checked in at", "Bought at"];
  const lines = people.map((p) => [p.first_name, p.last_name, p.email, p.buyer_email, p.gender, p.tier, p.status, p.scanned_at, p.bought_at].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${event.slug ?? event.id}-attendees.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const ORG = "hsl(var(--primary))";
const US = "#10b981";

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
      setError("Could not load the events. Check that you're signed in as an admin, then refresh.");
    }
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);
  return <AdminEventsView data={data} error={error} updated={updated} onRefresh={load} loadPeople={loadAttendees} />;
};

type When = "all" | "upcoming" | "past";
type SortKey = "date" | "sold" | "org" | "fee";

export function AdminEventsView({
  data, error, updated, onRefresh, loadPeople, banner,
}: {
  data: AdminData | null;
  error: string | null;
  updated: Date | null;
  onRefresh: () => void;
  loadPeople: (eventId: string) => Promise<Attendee[]>;
  banner?: React.ReactNode;
}) {
  useThemeMode("studio");
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const events = data?.events ?? null;

  const shown = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    const needle = q.trim().toLowerCase();
    const list = events.filter((e) => {
      if (when === "upcoming" && isPastEvent(e, now)) return false;
      if (when === "past" && !isPastEvent(e, now)) return false;
      if (!needle) return true;
      return [e.title, e.organizer?.name, e.location].some((v) => v?.toLowerCase().includes(needle));
    });
    const val = (e: AdminEvent) => (sort.key === "date" ? new Date(e.date).getTime() : sort.key === "sold" ? e.sold : sort.key === "org" ? e.organizerCents : e.feeCents);
    return list.sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [events, q, when, sort]);

  // Main currency for the headline figures: euros unless only pounds have sold.
  const main: Currency = useMemo(() => {
    const sold = CURRENCIES.filter((c) => shown.some((e) => e.currency === c && e.paidCents > 0));
    return sold.includes("EUR") || !sold.length ? "EUR" : sold[0];
  }, [shown]);
  const inMain = shown.filter((e) => e.currency === main);
  const other = CURRENCIES.filter((c) => c !== main && shown.some((e) => e.currency === c && e.paidCents > 0));
  const sum = (list: AdminEvent[], f: (e: AdminEvent) => number) => list.reduce((n, e) => n + f(e), 0);
  const totals = {
    paid: sum(inMain, (e) => e.paidCents),
    org: sum(inMain, (e) => e.organizerCents),
    fee: sum(inMain, (e) => e.feeCents),
    sold: sum(shown, (e) => e.sold),
    came: sum(shown, (e) => e.checkedIn),
    soldPast: sum(shown.filter((e) => isPastEvent(e)), (e) => e.sold),
    orders: sum(shown, (e) => e.orders),
  };

  // Money per month, split between organizers and us, for the events shown.
  const months = useMemo(() => {
    if (!data) return [];
    const ids = new Set(inMain.map((e) => e.id));
    const by = new Map<string, { org: number; us: number; tickets: number }>();
    for (const o of data.orders) {
      if (!ids.has(o.event_id)) continue;
      const k = monthKey(o.created_at);
      const m = by.get(k) ?? { org: 0, us: 0, tickets: 0 };
      m.org += o.paidCents - o.feeCents;
      m.us += o.feeCents;
      m.tickets += o.quantity;
      by.set(k, m);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([k, v]) => ({ key: k, label: monthLabel(k), org: v.org / 100, us: v.us / 100, tickets: v.tickets }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shown, main]);

  // Organizers ranked by what they made.
  const organizers = useMemo(() => {
    const by = new Map<string, { name: string; events: number; sold: number; org: number; fee: number }>();
    for (const e of inMain) {
      if (!e.organizer) continue;
      const o = by.get(e.organizer.id) ?? { name: e.organizer.name, events: 0, sold: 0, org: 0, fee: 0 };
      o.events += 1;
      o.sold += e.sold;
      o.org += e.organizerCents;
      o.fee += e.feeCents;
      by.set(e.organizer.id, o);
    }
    return [...by.values()].filter((o) => o.org + o.fee > 0).sort((a, b) => b.org - a.org).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, main]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }));
  const SortHead = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2.5 font-semibold ${className}`}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground">
        {children}
        {sort.key === k && (sort.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Events · Admin · Ticket Safe" description="Admin overview of every event" />
      <Header />
      <main className="flex-1 pt-20 md:pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Admin · <Link to="/admin/organizers" className="hover:text-foreground">Organizers</Link> · <Link to="/admin/payouts" className="hover:text-foreground">Payouts</Link>
              </p>
              <h1 className="font-display text-3xl font-bold mt-1">All events</h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {updated && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live · updated {fmtTime(updated.toISOString())}, refreshes every minute
                </span>
              )}
              <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3 min-h-[36px] border border-border bg-card font-semibold text-foreground hover:bg-muted">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {banner}
          {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3">{error}</p>}

          {/* Filters: they drive every figure below */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an event, organizer or venue" className="w-full pl-9 pr-3 min-h-[40px] border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <div className="inline-flex p-0.5 bg-muted text-xs font-semibold">
              {(["all", "upcoming", "past"] as When[]).map((w) => (
                <button key={w} type="button" onClick={() => setWhen(w)} className={`px-3 py-1.5 ${when === w ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {w === "all" ? "All events" : w === "upcoming" ? "Upcoming" : "Past"}
                </button>
              ))}
            </div>
            {events && <span className="text-xs text-muted-foreground">{plural(shown.length, "event")} · {plural(totals.orders, "paid order")}</span>}
          </div>

          {/* Who made what */}
          <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr] mb-4">
            <div className="bg-card border border-border p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Paid by buyers</div>
              <div className="font-display text-4xl font-bold tabular-nums mt-1"><Money cents={events ? totals.paid : 0} currency={main} /></div>
              <SplitBar org={totals.org} us={totals.fee} />
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span className="w-2.5 h-2.5" style={{ background: ORG }} />Organizers made</div>
                  <div className="font-display text-2xl font-bold tabular-nums mt-0.5"><Money cents={totals.org} currency={main} /></div>
                  <div className="text-xs text-muted-foreground">{pct(totals.org, totals.paid)}% of what buyers paid</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span className="w-2.5 h-2.5" style={{ background: US }} />We made</div>
                  <div className="font-display text-2xl font-bold tabular-nums mt-0.5 text-emerald-700"><Money cents={totals.fee} currency={main} decimals={2} /></div>
                  <div className="text-xs text-muted-foreground">Service fees, before Stripe's costs · {totals.sold ? fmtMoney(Math.round(totals.fee / Math.max(1, sum(inMain, (e) => e.sold))), main, 2) : "–"} per ticket</div>
                </div>
              </div>
              {other.length > 0 && <p className="text-xs text-muted-foreground mt-3">Also in {other.join(", ")}: {other.map((c) => `${fmtMoney(sum(shown.filter((e) => e.currency === c), (e) => e.organizerCents), c)} organizers, ${fmtMoney(sum(shown.filter((e) => e.currency === c), (e) => e.feeCents), c, 2)} us`).join(" · ")}</p>}
            </div>
            <div className="grid grid-cols-2 gap-px bg-border border border-border">
              <Kpi label="Tickets sold" value={totals.sold} sub={`${plural(shown.filter((e) => e.sold > 0).length, "event")} with sales`} />
              <Kpi label="People who came" value={totals.came} sub={totals.soldPast ? `${pct(totals.came, totals.soldPast)}% of tickets for past events` : "Checked in at the door"} />
              <Kpi label="Events" value={shown.length} sub={`${shown.filter((e) => !isPastEvent(e)).length} upcoming`} />
              <Kpi label="Average order" value={totals.orders ? Math.round(totals.paid / totals.orders) : 0} money={main} sub={`${totals.orders ? (totals.sold / totals.orders).toFixed(1) : "0"} tickets per order`} />
            </div>
          </section>

          {/* Month by month + top organizers */}
          <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr] mb-6">
            <div className="bg-card border border-border p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-bold">Month by month</h2>
                <span className="text-[11px] text-muted-foreground">by date of purchase · {main}</span>
              </div>
              {!data ? <div className="h-52 bg-muted animate-pulse" /> : months.length === 0 ? <p className="h-52 flex items-center justify-center text-sm text-muted-foreground">No sales yet.</p> : (
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
                <span className="text-[11px] text-muted-foreground">by what they made</span>
              </div>
              {!data ? <div className="h-52 bg-muted animate-pulse" /> : organizers.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet.</p> : (
                <ul className="space-y-3">
                  {organizers.map((o) => (
                    <li key={o.name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold truncate">{o.name}</span>
                        <span className="tabular-nums font-bold shrink-0">{fmtMoney(o.org, main)}</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-muted overflow-hidden">
                        <div className="h-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${pct(o.org, organizers[0].org)}%`, background: ORG }} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{plural(o.events, "event")} · {plural(o.sold, "ticket")} · we made {fmtMoney(o.fee, main, 2)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Events */}
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-bold">Events</h2>
            <span className="text-[11px] text-muted-foreground">Click an event for its details and attendees</span>
          </div>
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
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!events && !error && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {events && shown.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No event matches. Clear the search or pick "All events".</td></tr>}
                {shown.map((e) => {
                  const isOpen = open === e.id;
                  const past = isPastEvent(e);
                  return (
                    <Fragment key={e.id}>
                      <tr onClick={() => setOpen(isOpen ? null : e.id)} className={`cursor-pointer transition-colors hover:bg-muted/50 ${isOpen ? "bg-muted/40" : ""}`}>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          <div className="font-semibold">{fmtDate(e.date)}</div>
                          <div className={`text-[11px] ${past ? "text-muted-foreground" : "text-primary font-semibold"}`}>{past ? "Past" : "Upcoming"}{e.status && e.status !== "published" ? ` · ${e.status}` : ""}</div>
                        </td>
                        <td className="px-3 py-3 min-w-[220px]">
                          <div className="font-semibold">{e.title}</div>
                          <div className="text-[11px] text-muted-foreground">{e.organizer?.name ?? "No organizer"}{e.location ? ` · ${e.location}` : ""}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap"><Meter n={e.sold} of={e.capacity} /></td>
                        <td className="px-3 py-3 whitespace-nowrap">{past || e.checkedIn ? <Meter n={e.checkedIn} of={e.sold} tone="came" /> : <span className="text-muted-foreground text-xs">Not yet</span>}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtMoney(e.organizerCents, e.currency, 2)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700">{fmtMoney(e.feeCents, e.currency, 2)}</td>
                        <td className="pr-3"><ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} /></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="bg-background px-3 py-5">
                            <EventDetail event={e} orders={(data?.orders ?? []).filter((o) => o.event_id === e.id)} loadPeople={loadPeople} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

/** An amount that counts up to its value. */
const Money = ({ cents, currency, decimals = 0 }: { cents: number; currency: Currency; decimals?: number }) => {
  const shown = useCountUp(cents, 900);
  return <>{fmtMoney(shown, currency, decimals)}</>;
};

const Kpi = ({ label, value, sub, money }: { label: string; value: number; sub: string; money?: Currency }) => {
  const shown = useCountUp(value, 900);
  return (
    <div className="bg-card px-4 py-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl md:text-[28px] font-bold tabular-nums leading-tight mt-1">{money ? fmtMoney(shown, money, 2) : shown.toLocaleString("en-GB")}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
};

/** What buyers paid, split: the organizer's part and ours. */
const SplitBar = ({ org, us }: { org: number; us: number }) => {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
  const total = org + us;
  return (
    <div className="mt-3 h-3 w-full bg-muted flex overflow-hidden" aria-hidden>
      <div className="h-full motion-safe:transition-[width] motion-safe:duration-1000" style={{ width: on && total ? `${(org / total) * 100}%` : "0%", background: ORG }} />
      <div className="h-full motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:delay-300" style={{ width: on && total ? `${(us / total) * 100}%` : "0%", background: US }} />
    </div>
  );
};

/** "120 / 150" with a bar. */
const Meter = ({ n, of, tone = "sold" }: { n: number; of: number; tone?: "sold" | "came" }) => (
  <div className="w-28">
    <div className="text-sm tabular-nums"><span className="font-semibold">{n}</span><span className="text-muted-foreground"> / {of}</span>{of > 0 && <span className="text-[11px] text-muted-foreground"> · {pct(n, of)}%</span>}</div>
    <div className="h-1 mt-1 bg-muted overflow-hidden"><div className="h-full" style={{ width: `${Math.min(100, pct(n, of))}%`, background: tone === "came" ? US : ORG }} /></div>
  </div>
);

/** One event opened: its numbers, ticket types, sales over time, then everyone holding a ticket. */
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
  // Tickets bought per day, from the first sale to the last.
  const days = useMemo(() => {
    const by = new Map<string, number>();
    for (const o of orders) by.set(o.created_at.slice(0, 10), (by.get(o.created_at.slice(0, 10)) ?? 0) + o.quantity);
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ d, label: new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), n }));
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="grid gap-px bg-border border border-border grid-cols-2 md:grid-cols-5">
        <Mini label="Organizer made" value={fmtMoney(event.organizerCents, c, 2)} />
        <Mini label="We made" value={fmtMoney(event.feeCents, c, 2)} accent />
        <Mini label="Paid by buyers" value={fmtMoney(event.paidCents, c, 2)} />
        <Mini label="Orders" value={`${event.orders}`} sub={event.orders ? `${fmtMoney(Math.round(event.paidCents / event.orders), c, 2)} on average` : ""} />
        <Mini label="Came" value={`${event.checkedIn} / ${event.sold}`} sub={event.sold ? `${pct(event.checkedIn, event.sold)}% checked in` : ""} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
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
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
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
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Tickets bought per day</div>
          {days.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet.</p> : (
            <div className="h-36">
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
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Attendees {people && `· ${plural(people.length, "ticket")} · ${people.filter((p) => p.scanned_at).length} came`}
          </div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or email" className="px-3 min-h-[34px] border border-border bg-card text-xs w-52 focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="button" disabled={!people?.length} onClick={() => people && downloadCsv(event, people)} className="inline-flex items-center gap-1.5 px-3 min-h-[34px] text-xs font-semibold border border-border bg-card hover:bg-muted disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
          </div>
        </div>
        {failed ? <p className="text-sm text-destructive">Could not load the attendees.</p> : !people ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : people.length === 0 ? <p className="text-sm text-muted-foreground">No tickets yet.</p> : (
          <div className="border border-border bg-card max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Ticket</th>
                  <th className="px-3 py-2 font-semibold">Gender</th>
                  <th className="px-3 py-2 font-semibold">Bought</th>
                  <th className="px-3 py-2 font-semibold">Came</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}</td>
                    <td className="px-3 py-2 break-all">
                      {p.email ? <a href={`mailto:${p.email}`} className="hover:text-primary hover:underline">{p.email}</a> : "–"}
                      {p.buyer_email && p.buyer_email !== p.email && <div className="text-muted-foreground">bought by {p.buyer_email}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.tier ?? "–"}{p.status && p.status !== "valid" && p.status !== "scanned" ? <span className="text-muted-foreground"> · {p.status}</span> : null}</td>
                    <td className="px-3 py-2 capitalize">{p.gender ?? "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">{fmtDate(p.bought_at)}</td>
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
