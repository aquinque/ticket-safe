/**
 * StudioEventAttendees — the full, professional attendee/ticket tracking
 * view for a single event: every ticket holder's name, email, tier, amount
 * paid, purchase date, and check-in status, with search, filters, sortable
 * columns and a CSV export. This is the organizer's guest list — the
 * "Buyers" summary on the event edit page links here for the full picture.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Loader2,
  Search,
  FileText,
  CheckCircle2,
  ArrowUpDown,
  ArrowLeft,
  QrCode,
} from "lucide-react";
import { StatFigure } from "@/components/studio/StatFigure";
import { FilterChips } from "@/components/studio/FilterChips";
import { eur as eurFmt, fmtDate, fmtTime, phaseOf, whenLabel, relativeTime } from "@/lib/studioFormat";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";

interface EventRow {
  id: string;
  title: string;
  date: string;
  location: string | null;
  organizer_id: string;
}

interface TierRow {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  buyer_email: string;
  total_cents: number;
  fee_cents: number;
  quantity: number;
  status: string;
  created_at: string;
}

interface TicketRow {
  id: string;
  order_id: string;
  tier_id: string;
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  status: "valid" | "scanned" | "cancelled" | "refunded" | "transferred";
  scanned_at: string | null;
  created_at: string;
}

type SortKey = "name" | "date" | "amount" | "status";
type StatusFilter = "all" | "checked_in" | "not_checked_in" | "cancelled";

const eur = (cents: number) => eurFmt(cents, 2);

function exportCsv(eventTitle: string, rows: ReturnType<typeof buildRows>) {
  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ["Name", "Email", "Tier", "Amount paid", "Order date", "Status", "Checked in at"].join(","),
    ...rows.map((r) =>
      [
        esc(r.name),
        esc(r.email),
        esc(r.tierName),
        esc((r.amountCents / 100).toFixed(2)),
        esc(new Date(r.orderDate).toISOString()),
        esc(r.checkedIn ? "Checked in" : r.status),
        esc(r.scannedAt ? new Date(r.scannedAt).toISOString() : ""),
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = eventTitle.replace(/[^a-z0-9-]/gi, "-").slice(0, 40).toLowerCase();
  a.href = url;
  a.download = `attendees_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildRows(
  tickets: TicketRow[],
  ordersById: Map<string, OrderRow>,
  tiersById: Map<string, TierRow>,
) {
  return tickets
    .filter((t) => t.status !== "cancelled" && t.status !== "refunded")
    .map((t) => {
      const order = ordersById.get(t.order_id);
      const name = [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim();
      const perTicketCents = order && order.quantity > 0 ? Math.round(order.total_cents / order.quantity) : 0;
      return {
        id: t.id,
        name: name || "(unnamed)",
        email: t.holder_email || order?.buyer_email || "—",
        buyerEmail: order?.buyer_email ?? "—",
        tierName: tiersById.get(t.tier_id)?.name ?? "—",
        amountCents: perTicketCents,
        orderDate: order?.created_at ?? t.created_at,
        status: t.status,
        checkedIn: t.scanned_at != null,
        scannedAt: t.scanned_at,
      };
    });
}

const StudioEventAttendees = () => {
  useThemeMode("studio");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: ev }, { data: tr }, { data: ord }, { data: tix }] = await Promise.all([
      supabase.from("events").select("id, title, date, location, organizer_id").eq("id", id).maybeSingle(),
      supabase.from("event_tiers").select("id, name").eq("event_id", id),
      supabase
        .from("event_orders")
        .select("id, buyer_email, total_cents, fee_cents, quantity, status, created_at")
        .eq("event_id", id)
        .limit(2000),
      supabase
        .from("event_tickets")
        .select("id, order_id, tier_id, holder_first_name, holder_last_name, holder_email, status, scanned_at, created_at")
        .eq("event_id", id)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    setEvent((ev as EventRow) ?? null);
    setTiers((tr as TierRow[]) ?? []);
    setOrders((ord as OrderRow[]) ?? []);
    setTickets((tix as TicketRow[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && !orgLoading) {
      if (!organizer || organizer.status !== "approved") navigate("/studio");
      else load();
    }
  }, [organizer, orgLoading, authLoading, navigate, load]);

  // Realtime — new sales and door scans should show up without a refresh.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`attendees-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_tickets", filter: `event_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_orders", filter: `event_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const tiersById = useMemo(() => new Map(tiers.map((t) => [t.id, t])), [tiers]);

  const rows = useMemo(() => buildRows(tickets, ordersById, tiersById), [tickets, ordersById, tiersById]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.email.toLowerCase().includes(q) && !r.buyerEmail.toLowerCase().includes(q)) return false;
      if (tierFilter !== "all" && r.tierName !== tierFilter) return false;
      if (statusFilter === "checked_in" && !r.checkedIn) return false;
      if (statusFilter === "not_checked_in" && r.checkedIn) return false;
      if (statusFilter === "cancelled") return false; // already excluded from rows
      return true;
    });
    out = out.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "date") cmp = new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
      else if (sortKey === "amount") cmp = a.amountCents - b.amountCents;
      else if (sortKey === "status") cmp = Number(a.checkedIn) - Number(b.checkedIn);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, query, tierFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const stats = useMemo(() => {
    const paidOrders = orders.filter((o) => o.status === "paid");
    const grossCents = paidOrders.reduce((a, o) => a + o.total_cents, 0);
    const feeCents = paidOrders.reduce((a, o) => a + (o.fee_cents ?? 0), 0);
    const checkedIn = rows.filter((r) => r.checkedIn).length;
    return {
      totalTickets: rows.length,
      checkedIn,
      checkedInPct: rows.length > 0 ? Math.round((checkedIn / rows.length) * 100) : 0,
      grossCents,
      netCents: grossCents - feeCents,
    };
  }, [rows, orders]);

  const byTier = useMemo(() => {
    const m = new Map<string, { sold: number; inCount: number }>();
    for (const r of rows) {
      const cur = m.get(r.tierName) ?? { sold: 0, inCount: 0 };
      cur.sold += 1;
      if (r.checkedIn) cur.inCount += 1;
      m.set(r.tierName, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sold - a.sold);
  }, [rows]);

  // The last few people through the door, newest first, and the last sale.
  const arrivals = useMemo(
    () => rows.filter((r) => r.checkedIn && r.scannedAt).sort((a, b) => (b.scannedAt as string).localeCompare(a.scannedAt as string)).slice(0, 5),
    [rows],
  );
  const lastSale = useMemo(() => rows.reduce<string | null>((m, r) => (!m || r.orderDate > m ? r.orderDate : m), null), [rows]);

  const statusCounts = useMemo(() => ({
    all: rows.length,
    checked_in: rows.filter((r) => r.checkedIn).length,
    not_checked_in: rows.filter((r) => !r.checkedIn).length,
  }), [rows]);

  if (authLoading || orgLoading || loading || !event) {
    return (
      <div className="theme-studio min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <StudioLayout active="events" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title={`Attendees · ${event.title} · Studio`} description={`Attendee list for ${event.title}.`} />

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {(() => { const phase = phaseOf(event.date); const doorDay = phase !== "upcoming"; return (
        <>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
          <div className="min-w-0">
            <Link to={`/studio/events/${event.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary mb-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to event
            </Link>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight text-balance">{event.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {whenLabel(event.date)} · {fmtDate(event.date)}{event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              to={`/organizer/scan?event_id=${event.id}`}
              className={`inline-flex items-center justify-center gap-2 px-4 min-h-[44px] font-bold text-sm transition-colors ${doorDay ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "bg-card border border-border hover:bg-muted"}`}
            >
              <QrCode className="w-4 h-4" />
              Open scanner
            </Link>
            <button
              type="button"
              onClick={() => exportCsv(event.title, filteredSorted)}
              disabled={filteredSorted.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] font-bold text-sm bg-card border border-border hover:bg-muted disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* The numbers that matter for this event, and how they split by tier */}
        <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-label="Attendance summary">
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl md:text-5xl font-bold tabular-nums leading-none">{stats.checkedIn}</span>
                <span className="text-sm text-muted-foreground">of {stats.totalTickets} {doorDay ? "checked in" : "ticket holders"}</span>
                <span className="ml-auto text-sm font-bold tabular-nums">{stats.checkedInPct}%</span>
              </div>
              <div className="mt-3 h-2 w-full bg-muted overflow-hidden" aria-hidden>
                <div className="h-full bg-emerald-500 motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${stats.checkedInPct}%` }} />
              </div>
              {byTier.length > 0 && (
                <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {byTier.map((t) => (
                    <li key={t.name} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold truncate">{t.name}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{doorDay ? `${t.inCount} / ${t.sold} in` : `${t.sold} sold`}</span>
                      </div>
                      <div className="h-1 bg-muted mt-1 overflow-hidden" aria-hidden>
                        <div className="h-full bg-primary/70" style={{ width: `${rows.length ? (t.sold / rows.length) * 100 : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="md:min-w-[220px] md:max-w-[260px] md:border-l md:border-border md:pl-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatFigure label="Gross" value={stats.grossCents} money />
                <StatFigure label="To you" value={stats.netCents} money hint="after the buyer fee" />
              </div>
              {doorDay ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
                    {phase === "today" ? "Latest at the door" : "Last through the door"}
                  </div>
                  {arrivals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nobody yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {arrivals.map((a, i) => (
                        <li key={a.id} className="flex items-baseline justify-between gap-2 text-xs motion-safe:animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                          <span className="font-semibold truncate">{a.name}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">{relativeTime(a.scannedAt as string)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {phase === "past" && stats.totalTickets > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {stats.totalTickets - stats.checkedIn === 0 ? "Everyone came." : `${stats.totalTickets - stats.checkedIn} didn't come.`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {lastSale ? `Last ticket sold ${relativeTime(lastSale)}.` : "No tickets sold yet."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or email"
              aria-label="Find a guest"
              className="w-full pl-9 pr-3 h-11 border border-border bg-card text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {tiers.length > 1 && (
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              aria-label="Tier"
              className="h-11 px-3 border border-border bg-card text-sm font-semibold"
            >
              <option value="all">All tiers</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          )}
          <FilterChips<StatusFilter>
            label="Check-in status"
            value={statusFilter}
            onChange={setStatusFilter}
            items={[
              { key: "all", label: "All", count: statusCounts.all },
              { key: "checked_in", label: "In", count: statusCounts.checked_in },
              { key: "not_checked_in", label: "Not yet", count: statusCounts.not_checked_in },
            ]}
          />
        </div>

        {/* Desktop table */}
        <div className="hidden md:block border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-card text-left">
                {([
                  ["name", "Name"],
                  ["date", "Ordered"],
                  ["amount", "Paid"],
                  ["status", "Door"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === key ? "text-foreground" : ""}`}>
                      {label}
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tier</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{fmtDate(r.orderDate)}</td>
                  <td className="px-4 py-2.5 font-semibold tabular-nums">{eur(r.amountCents)}</td>
                  <td className="px-4 py-2.5"><DoorPill checkedIn={r.checkedIn} at={r.scannedAt} /></td>
                  <td className="px-4 py-2.5 text-muted-foreground break-all">{r.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.tierName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">{rows.length === 0 ? "No tickets sold yet." : "No one matches this selection."}</p>
          )}
        </div>

        {/* Phone cards */}
        <ul className="md:hidden bg-card border border-border divide-y divide-border">
          {filteredSorted.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground break-all">{r.email}</div>
                </div>
                <DoorPill checkedIn={r.checkedIn} at={r.scannedAt} />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                <span>{r.tierName} · {fmtDate(r.orderDate)}</span>
                <span className="font-bold text-foreground tabular-nums">{eur(r.amountCents)}</span>
              </div>
            </li>
          ))}
          {filteredSorted.length === 0 && (
            <li className="text-sm text-muted-foreground text-center py-10">{rows.length === 0 ? "No tickets sold yet." : "No one matches this selection."}</li>
          )}
        </ul>
        </>
        ); })()}
      </div>
    </StudioLayout>
  );
};

const DoorPill = ({ checkedIn, at }: { checkedIn: boolean; at: string | null }) => (
  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tabular-nums ${checkedIn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>
    {checkedIn ? <CheckCircle2 className="w-3 h-3" /> : null}
    {checkedIn ? (at ? `In at ${fmtTime(at)}` : "In") : "Not yet"}
  </span>
);

export default StudioEventAttendees;
