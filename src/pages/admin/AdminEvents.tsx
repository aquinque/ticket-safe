import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, Download, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import Header from "@/components/Header";
import { SEOHead } from "@/components/SEOHead";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney, fmtTime, plural } from "@/lib/studioFormat";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/money";
import { isPastEvent } from "@/lib/eventTime";

/**
 * Admin overview of every event on Ticket Safe: what each sold, what the organizer gets, what
 * Ticket Safe made, who came. Admins only: the route sits behind ProtectedAdminRoute, and the
 * database itself only returns other organizers' orders and tickets to an admin (RLS).
 *
 * Money, per paid order: the buyer paid total_cents; Ticket Safe's part is the service fee
 * (fee_cents, before Stripe's costs); the organizer's part is the rest. Refunded orders are
 * left out. Amounts are kept per currency and never added across euros and pounds.
 */

export interface AdminEvent {
  id: string;
  title: string;
  date: string;
  ends_at: string | null;
  location: string | null;
  status: string | null;
  slug: string | null;
  currency: Currency;
  organizer: { name: string; email: string | null } | null;
  capacity: number;
  sold: number;
  checkedIn: number;
  orders: number;
  paidCents: number;
  feeCents: number;
  organizerCents: number;
  tiers: { name: string; price_cents: number; sold: number; total: number }[];
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

async function loadAdminEvents(): Promise<AdminEvent[]> {
  type EvRow = { id: string; title: string; date: string; ends_at: string | null; location: string | null; status: string | null; slug: string | null; organizer: { name: string; contact_email: string | null } | { name: string; contact_email: string | null }[] | null };
  type TierRow = { event_id: string; name: string; price_cents: number; sold_qty: number; total_qty: number; currency: string | null; sort_order: number };
  type OrderRow = { event_id: string; quantity: number; total_cents: number; fee_cents: number | null };
  type TicketRow = { event_id: string; scanned_at: string | null };

  const [evs, tiers, orders, scanned] = await Promise.all([
    fetchAll<EvRow>((a, b) => supabase.from("events").select("id, title, date, ends_at, location, status, slug, organizer:organizer_profiles!events_organizer_id_fkey(name, contact_email)").order("date", { ascending: false }).range(a, b)),
    fetchAll<TierRow>((a, b) => supabase.from("event_tiers").select("event_id, name, price_cents, sold_qty, total_qty, currency, sort_order").range(a, b)),
    fetchAll<OrderRow>((a, b) => supabase.from("event_orders").select("event_id, quantity, total_cents, fee_cents").eq("status", "paid").range(a, b)),
    fetchAll<TicketRow>((a, b) => supabase.from("event_tickets").select("event_id, scanned_at").not("scanned_at", "is", null).range(a, b)),
  ]);

  const tiersBy = new Map<string, TierRow[]>();
  for (const t of tiers) tiersBy.set(t.event_id, [...(tiersBy.get(t.event_id) ?? []), t]);
  const money = new Map<string, { orders: number; paid: number; fee: number }>();
  for (const o of orders) {
    const m = money.get(o.event_id) ?? { orders: 0, paid: 0, fee: 0 };
    m.orders += 1;
    m.paid += o.total_cents;
    m.fee += o.fee_cents ?? 0;
    money.set(o.event_id, m);
  }
  const inDoor = new Map<string, number>();
  for (const t of scanned) inDoor.set(t.event_id, (inDoor.get(t.event_id) ?? 0) + 1);

  return evs.map((e) => {
    const ts = (tiersBy.get(e.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const m = money.get(e.id) ?? { orders: 0, paid: 0, fee: 0 };
    const org = Array.isArray(e.organizer) ? e.organizer[0] : e.organizer;
    return {
      id: e.id, title: e.title, date: e.date, ends_at: e.ends_at, location: e.location, status: e.status, slug: e.slug,
      currency: toCurrency(ts[0]?.currency),
      organizer: org ? { name: org.name, email: org.contact_email } : null,
      capacity: ts.reduce((n, t) => n + t.total_qty, 0),
      sold: ts.reduce((n, t) => n + t.sold_qty, 0),
      checkedIn: inDoor.get(e.id) ?? 0,
      orders: m.orders,
      paidCents: m.paid,
      feeCents: m.fee,
      organizerCents: m.paid - m.fee,
      tiers: ts.map((t) => ({ name: t.name, price_cents: t.price_cents, sold: t.sold_qty, total: t.total_qty })),
    };
  });
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

type When = "all" | "upcoming" | "past";
type SortKey = "date" | "sold" | "paid" | "fee";

/** Live data for the real page. */
const AdminEvents = () => {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try {
      setEvents(await loadAdminEvents());
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
  return <AdminEventsView events={events} error={error} updated={updated} onRefresh={load} loadPeople={loadAttendees} />;
};

export function AdminEventsView({
  events, error, updated, onRefresh, loadPeople, banner,
}: {
  events: AdminEvent[] | null;
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
  const now = new Date();

  const shown = useMemo(() => {
    if (!events) return [];
    const needle = q.trim().toLowerCase();
    const list = events.filter((e) => {
      if (when === "upcoming" && isPastEvent(e, now)) return false;
      if (when === "past" && !isPastEvent(e, now)) return false;
      if (!needle) return true;
      return [e.title, e.organizer?.name, e.location].some((v) => v?.toLowerCase().includes(needle));
    });
    const val = (e: AdminEvent) => (sort.key === "date" ? new Date(e.date).getTime() : sort.key === "sold" ? e.sold : sort.key === "paid" ? e.paidCents : e.feeCents);
    return list.sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, q, when, sort]);

  // Totals of what's shown, per currency.
  const totals = useMemo(() => {
    const by = (c: Currency, f: (e: AdminEvent) => number) => shown.filter((e) => e.currency === c).reduce((n, e) => n + f(e), 0);
    const currencies = CURRENCIES.filter((c) => shown.some((e) => e.currency === c && e.paidCents > 0));
    return {
      events: shown.length,
      sold: shown.reduce((n, e) => n + e.sold, 0),
      checkedIn: shown.reduce((n, e) => n + e.checkedIn, 0),
      orders: shown.reduce((n, e) => n + e.orders, 0),
      money: (currencies.length ? currencies : (["EUR"] as Currency[])).map((c) => ({ c, paid: by(c, (e) => e.paidCents), fee: by(c, (e) => e.feeCents), org: by(c, (e) => e.organizerCents) })),
    };
  }, [shown]);

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
              {updated && <span>Updated {fmtTime(updated.toISOString())} · refreshes every minute</span>}
              <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 px-3 min-h-[36px] border border-border bg-card font-semibold text-foreground hover:bg-muted">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {banner}

          {error && <p className="mb-4 border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3">{error}</p>}

          {/* Totals of the events shown */}
          <section className="grid gap-px bg-border border border-border grid-cols-2 md:grid-cols-4 mb-5" aria-label="Totals">
            <Stat label="Events" value={events ? totals.events.toLocaleString("en-GB") : "…"} sub={events ? plural(totals.orders, "paid order") : ""} />
            <Stat label="Tickets sold" value={events ? totals.sold.toLocaleString("en-GB") : "…"} sub={events ? `${totals.checkedIn.toLocaleString("en-GB")} came (checked in)` : ""} />
            <Stat label="Paid by buyers" value={events ? totals.money.map((m) => fmtMoney(m.paid, m.c)).join(" · ") : "…"} sub={events ? `Organizers get ${totals.money.map((m) => fmtMoney(m.org, m.c)).join(" · ")}` : ""} />
            <Stat label="We made" value={events ? totals.money.map((m) => fmtMoney(m.fee, m.c, 2)).join(" · ") : "…"} sub="Service fees, before Stripe's costs" accent />
          </section>

          {/* Filters */}
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
          </div>

          {/* Events */}
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
                <tr>
                  <SortHead k="date">Date</SortHead>
                  <th className="px-3 py-2.5 font-semibold">Event</th>
                  <SortHead k="sold" className="text-right">Sold</SortHead>
                  <th className="px-3 py-2.5 font-semibold text-right">Came</th>
                  <SortHead k="paid" className="text-right">Paid by buyers</SortHead>
                  <th className="px-3 py-2.5 font-semibold text-right">Organizer gets</th>
                  <SortHead k="fee" className="text-right">We made</SortHead>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!events && !error && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                )}
                {events && shown.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No event matches. Clear the search or pick "All".</td></tr>
                )}
                {shown.map((e) => {
                  const isOpen = open === e.id;
                  const past = isPastEvent(e, now);
                  return (
                    <Fragment key={e.id}>
                      <tr onClick={() => setOpen(isOpen ? null : e.id)} className={`cursor-pointer hover:bg-muted/50 ${isOpen ? "bg-muted/40" : ""}`}>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                          <div className="font-semibold">{fmtDate(e.date)}</div>
                          <div className="text-[11px] text-muted-foreground">{past ? "Past" : "Upcoming"}{e.status && e.status !== "published" ? ` · ${e.status}` : ""}</div>
                        </td>
                        <td className="px-3 py-3 min-w-[220px]">
                          <div className="font-semibold">{e.title}</div>
                          <div className="text-[11px] text-muted-foreground">{e.organizer?.name ?? "No organizer"}{e.location ? ` · ${e.location}` : ""}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {e.sold}<span className="text-muted-foreground">/{e.capacity}</span>
                          <div className="h-1 w-20 ml-auto mt-1 bg-muted"><div className="h-full bg-primary" style={{ width: `${e.capacity ? Math.min(100, (e.sold / e.capacity) * 100) : 0}%` }} /></div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{past || e.checkedIn ? e.checkedIn : "–"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(e.paidCents, e.currency, 2)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(e.organizerCents, e.currency, 2)}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700">{fmtMoney(e.feeCents, e.currency, 2)}</td>
                        <td className="pr-3"><ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} /></td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="bg-background px-3 py-4">
                            <EventDetail event={e} loadPeople={loadPeople} />
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

const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) => (
  <div className="bg-card px-4 py-4">
    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`font-display text-2xl md:text-[28px] font-bold tabular-nums leading-tight mt-1 ${accent ? "text-emerald-700" : ""}`}>{value}</div>
    <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
  </div>
);

/** One event opened: its ticket types, then everyone holding a ticket. */
function EventDetail({ event, loadPeople }: { event: AdminEvent; loadPeople: (eventId: string) => Promise<Attendee[]> }) {
  const [people, setPeople] = useState<Attendee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    let active = true;
    loadPeople(event.id).then((p) => active && setPeople(p)).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [event.id, loadPeople]);
  const needle = q.trim().toLowerCase();
  const list = (people ?? []).filter((p) => !needle || [p.first_name, p.last_name, p.email, p.buyer_email].some((v) => v?.toLowerCase().includes(needle)));

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Ticket types</div>
          {event.tiers.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="space-y-1.5 text-sm">
              {event.tiers.map((t) => (
                <li key={t.name} className="flex justify-between gap-3">
                  <span className="truncate">{t.name} <span className="text-muted-foreground">· {fmtMoney(t.price_cents, event.currency, t.price_cents % 100 ? 2 : 0)}</span></span>
                  <span className="tabular-nums text-muted-foreground">{t.sold}/{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-sm space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Organizer</div>
          <div className="font-semibold">{event.organizer?.name ?? "–"}</div>
          {event.organizer?.email && <a href={`mailto:${event.organizer.email}`} className="text-primary hover:underline break-all">{event.organizer.email}</a>}
        </div>
        {event.slug && (
          <a href={`/e/${event.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Public page <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Attendees {people && `· ${people.length} tickets · ${people.filter((p) => p.scanned_at).length} came`}
          </div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or email" className="px-3 min-h-[34px] border border-border bg-card text-xs w-52 focus:outline-none focus:ring-2 focus:ring-primary" />
            <button type="button" disabled={!people?.length} onClick={() => people && downloadCsv(event, people)} className="inline-flex items-center gap-1.5 px-3 min-h-[34px] text-xs font-semibold border border-border bg-card hover:bg-muted disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> CSV
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
                  <th className="px-3 py-2 font-semibold">Came</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "–"}</td>
                    <td className="px-3 py-2 break-all">
                      {p.email ?? "–"}
                      {p.buyer_email && p.buyer_email !== p.email && <div className="text-muted-foreground">bought by {p.buyer_email}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.tier ?? "–"}{p.status && p.status !== "valid" && p.status !== "scanned" ? <span className="text-muted-foreground"> · {p.status}</span> : null}</td>
                    <td className="px-3 py-2 capitalize">{p.gender ?? "–"}</td>
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

export default AdminEvents;
