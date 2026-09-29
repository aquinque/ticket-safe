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
  Users,
  CheckCircle2,
  Banknote,
  Ticket,
  ArrowUpDown,
  ArrowLeft,
} from "lucide-react";
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

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
          <div>
            <Link to={`/studio/events/${event.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary mb-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to event
            </Link>
            <h1 className="text-2xl md:text-3xl font-black">{event.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date(event.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportCsv(event.title, filteredSorted)}
            disabled={filteredSorted.length === 0}
            className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 shrink-0"
          >
            <FileText className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              <Ticket className="w-3.5 h-3.5" /> Tickets sold
            </div>
            <div className="text-2xl font-black">{stats.totalTickets}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Checked in
            </div>
            <div className="text-2xl font-black">{stats.checkedIn} <span className="text-sm font-semibold text-muted-foreground">({stats.checkedInPct}%)</span></div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              <Banknote className="w-3.5 h-3.5" /> Gross revenue
            </div>
            <div className="text-2xl font-black tabular-nums">{eur(stats.grossCents)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">
              <Users className="w-3.5 h-3.5" /> Net payout
            </div>
            <div className="text-2xl font-black tabular-nums">{eur(stats.netCents)}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 h-11 rounded-xl border border-border bg-card text-sm"
            />
          </div>
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border border-border bg-card text-sm font-semibold"
          >
            <option value="all">All tiers</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-11 px-3 rounded-xl border border-border bg-card text-sm font-semibold"
          >
            <option value="all">All statuses</option>
            <option value="checked_in">Checked in</option>
            <option value="not_checked_in">Not checked in</option>
          </select>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/60 backdrop-blur-sm text-left">
                {([
                  ["name", "Name"],
                  ["date", "Order date"],
                  ["amount", "Amount"],
                  ["status", "Status"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {label}
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Tier</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.orderDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{eur(r.amountCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${r.checkedIn ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-muted text-muted-foreground border border-border"}`}>
                      {r.checkedIn ? <CheckCircle2 className="w-3 h-3" /> : null}
                      {r.checkedIn ? "Checked in" : "Not yet"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground break-all">{r.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.tierName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No attendees match your filters.</p>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2.5">
          {filteredSorted.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-bold text-sm">{r.name}</div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.checkedIn ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-muted text-muted-foreground border border-border"}`}>
                  {r.checkedIn ? <CheckCircle2 className="w-3 h-3" /> : null}
                  {r.checkedIn ? "Checked in" : "Not yet"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground break-all mb-1.5">{r.email}</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.tierName} · {new Date(r.orderDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <span className="font-bold text-foreground tabular-nums">{eur(r.amountCents)}</span>
              </div>
            </div>
          ))}
          {filteredSorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No attendees match your filters.</p>
          )}
        </div>
      </div>
    </StudioLayout>
  );
};

export default StudioEventAttendees;
