import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, Search } from "lucide-react";
import { StatFigure } from "@/components/studio/StatFigure";
import { FilterChips } from "@/components/studio/FilterChips";
import { eur, plural, fmtDate, fmtTime, startOfDay, relativeTime } from "@/lib/studioFormat";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { StudioDocuments } from "@/components/studio/StudioDocuments";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";

interface SaleRow {
  id: string;
  created_at: string;
  buyer_email: string;
  quantity: number;
  total_cents: number;
  fee_cents: number | null;
  discount_cents: number | null;
  status: string;
  event_id: string;
  event_title: string;
  tier_name: string;
}

type StatusFilter = "all" | "paid" | "pending" | "refunded" | "cancelled";

function exportCsv(rows: SaleRow[]) {
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [["Date", "Event", "Tier", "Buyer email", "Quantity", "Total (€)", "Discount (€)", "Status"].join(",")];
  for (const r of rows) {
    lines.push([
      esc(new Date(r.created_at).toLocaleString("en-GB")),
      esc(r.event_title),
      esc(r.tier_name),
      esc(r.buyer_email),
      r.quantity,
      (r.total_cents / 100).toFixed(2),
      ((r.discount_cents ?? 0) / 100).toFixed(2),
      esc(r.status),
    ].join(","));
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ticketsafe-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const StudioSales = () => {
  useThemeMode("studio");
  const { user } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    if (!organizer) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("event_orders")
        .select(
          `id, created_at, buyer_email, quantity, total_cents, fee_cents, discount_cents, status, event_id,
           event:events(title), tier:event_tiers(name)`,
        )
        .eq("organizer_id", organizer.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        console.error("[StudioSales] load failed:", error);
        setLoading(false);
        return;
      }
      type Raw = {
        id: string; created_at: string; buyer_email: string; quantity: number;
        total_cents: number; fee_cents: number | null; discount_cents: number | null; status: string;
        event_id: string;
        event: { title: string } | { title: string }[] | null;
        tier: { name: string } | { name: string }[] | null;
      };
      const mapped = ((data as Raw[]) ?? []).map((r) => {
        const ev = Array.isArray(r.event) ? r.event[0] : r.event;
        const tier = Array.isArray(r.tier) ? r.tier[0] : r.tier;
        return {
          id: r.id,
          created_at: r.created_at,
          buyer_email: r.buyer_email,
          quantity: r.quantity,
          total_cents: r.total_cents,
          fee_cents: r.fee_cents,
          discount_cents: r.discount_cents,
          status: r.status,
          event_id: r.event_id,
          event_title: ev?.title ?? "Unknown event",
          tier_name: tier?.name ?? "—",
        };
      });
      setRows(mapped);
      setLoading(false);
    })();
  }, [organizer]);

  const eventOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.event_title))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (eventFilter !== "all" && r.event_title !== eventFilter) return false;
      if (q && !r.buyer_email.toLowerCase().includes(q) && !r.event_title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, eventFilter]);

  const paidFiltered = filtered.filter((r) => r.status === "paid");
  const totalRevenueCents = paidFiltered.reduce((a, r) => a + r.total_cents - (r.fee_cents ?? 0), 0);
  const totalTickets = paidFiltered.reduce((a, r) => a + r.quantity, 0);
  const avgOrderCents = paidFiltered.length > 0 ? Math.round(totalRevenueCents / paidFiltered.length) : 0;

  const statusCounts = useMemo(() => {
    const base = rows.filter((r) => eventFilter === "all" || r.event_title === eventFilter);
    const count = (st: string) => base.filter((r) => r.status === st).length;
    return { all: base.length, paid: count("paid"), pending: count("pending"), refunded: count("refunded"), cancelled: count("cancelled") };
  }, [rows, eventFilter]);

  const allTime = useMemo(() => {
    const paid = rows.filter((r) => r.status === "paid");
    return {
      cents: paid.reduce((a, r) => a + r.total_cents - (r.fee_cents ?? 0), 0),
      tickets: paid.reduce((a, r) => a + r.quantity, 0),
    };
  }, [rows]);

  // Ticket revenue per day over the last 30 days, from the orders already
  // loaded (same event filter as the table, so the strip follows the chooser).
  const strip = useMemo(() => {
    const since = startOfDay(new Date());
    since.setDate(since.getDate() - 29);
    const days: { day: string; cents: number; tickets: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      days.push({ day: d.toISOString().slice(0, 10), cents: 0, tickets: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.day, i]));
    for (const r of rows) {
      if (r.status !== "paid") continue;
      if (eventFilter !== "all" && r.event_title !== eventFilter) continue;
      const i = idx.get(r.created_at.slice(0, 10));
      if (i == null) continue;
      days[i].cents += r.total_cents - (r.fee_cents ?? 0);
      days[i].tickets += r.quantity;
    }
    const total = days.reduce((a, d) => a + d.cents, 0);
    const max = Math.max(1, ...days.map((d) => d.cents));
    return { days, total, max, tickets: days.reduce((a, d) => a + d.tickets, 0) };
  }, [rows, eventFilter]);

  // Four facts an organizer actually acts on, for the chosen event(s):
  // what sells, when it sells, how often it comes back, and whether the
  // promo codes are doing anything.
  const highlights = useMemo(() => {
    const base = rows.filter((r) => eventFilter === "all" || r.event_title === eventFilter);
    const paid = base.filter((r) => r.status === "paid");
    if (paid.length === 0) return null;
    const byTier = new Map<string, number>();
    const byDay = new Map<string, number>();
    let qty = 0;
    for (const r of paid) {
      byTier.set(r.tier_name, (byTier.get(r.tier_name) ?? 0) + r.quantity);
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.quantity);
      qty += r.quantity;
    }
    const best = [...byTier.entries()].sort((a, b) => b[1] - a[1])[0];
    const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const refunds = base.filter((r) => r.status === "refunded").length;
    const promo = paid.filter((r) => (r.discount_cents ?? 0) > 0);
    const promoCents = promo.reduce((a, r) => a + (r.discount_cents ?? 0), 0);
    const lastOrder = paid.reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null);
    return {
      best: best ? { name: best[0], share: Math.round((best[1] / qty) * 100) } : null,
      peak: peak ? { day: peak[0], tickets: peak[1] } : null,
      refunds,
      refundRate: base.length ? Math.round((refunds / base.length) * 100) : 0,
      promoOrders: promo.length,
      promoCents,
      lastOrder,
    };
  }, [rows, eventFilter]);

  if (!user || orgLoading) {
    return (
      <StudioLayout active="sales" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout active="sales" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Sales · Studio" description="All sales across your events." />
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {rows.length === 0 ? "No orders yet" : `${eur(allTime.cents)} from ${plural(allTime.tickets, "ticket")}, all time`}
              {highlights?.lastOrder ? ` · last order ${relativeTime(highlights.lastOrder)}` : ""}
            </p>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-bold bg-card border border-border hover:bg-muted disabled:opacity-50 shrink-0"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Event chooser + search: everything below follows them */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buyer email or event"
              aria-label="Search orders"
              className="w-full pl-9 pr-3 h-11 border border-border bg-card text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {eventOptions.length > 1 && (
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="Event"
              className="h-11 px-3 border border-border bg-card text-sm font-semibold max-w-[240px]"
            >
              <option value="all">All events</option>
              {eventOptions.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          )}
        </div>

        {/* Figures for the current selection, and the last 30 days */}
        <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-label="Sales summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatFigure label="Ticket revenue" value={totalRevenueCents} money hint="paid orders, after the buyer fee" />
            <StatFigure label="Tickets" value={totalTickets} />
            <StatFigure label="Orders" value={filtered.length} hint={statusFilter === "all" ? `${paidFiltered.length} paid` : statusFilter} />
            <StatFigure label="Per order" value={avgOrderCents} money decimals={2} hint="average, paid" />
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs font-bold">Last 30 days</h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">{eur(strip.total)} · {plural(strip.tickets, "ticket")}</span>
          </div>
          {loading ? (
            <div className="h-14 bg-muted animate-pulse" />
          ) : strip.total === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No paid orders in the last 30 days.</p>
          ) : (
            <>
              <div className="flex items-end gap-[3px] h-14" role="img" aria-label="Ticket revenue per day, last 30 days">
                {strip.days.map((d, i) => (
                  <div
                    key={d.day}
                    title={`${fmtDate(d.day)}: ${eur(d.cents)}, ${plural(d.tickets, "ticket")}`}
                    className={`flex-1 ${i === strip.days.length - 1 ? "bg-primary" : d.cents > 0 ? "bg-primary/60" : "bg-muted"}`}
                    style={{ height: `${Math.max(4, (d.cents / strip.max) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                <span>{fmtDate(strip.days[0].day)}</span>
                <span>today</span>
              </div>
            </>
          )}
          {highlights && (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-5 pt-4 border-t border-border">
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Sells best</dt>
                <dd className="text-sm font-semibold truncate">{highlights.best?.name ?? "—"}</dd>
                <dd className="text-[11px] text-muted-foreground">{highlights.best ? `${highlights.best.share}% of tickets` : ""}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Busiest day</dt>
                <dd className="text-sm font-semibold">{highlights.peak ? fmtDate(highlights.peak.day) : "—"}</dd>
                <dd className="text-[11px] text-muted-foreground">{highlights.peak ? plural(highlights.peak.tickets, "ticket") : ""}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Refunds</dt>
                <dd className={`text-sm font-semibold ${highlights.refundRate >= 10 ? "text-amber-700" : ""}`}>{highlights.refunds}</dd>
                <dd className="text-[11px] text-muted-foreground">{highlights.refunds > 0 ? `${highlights.refundRate}% of orders` : "none"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Promo codes</dt>
                <dd className="text-sm font-semibold">{highlights.promoOrders > 0 ? plural(highlights.promoOrders, "order") : "Not used"}</dd>
                <dd className="text-[11px] text-muted-foreground">{highlights.promoOrders > 0 ? `${eur(highlights.promoCents)} given away` : ""}</dd>
              </div>
            </dl>
          )}
        </section>

        <div className="mb-3">
          <FilterChips<StatusFilter>
            label="Order status"
            value={statusFilter}
            onChange={setStatusFilter}
            items={[
              { key: "all", label: "All", count: statusCounts.all },
              { key: "paid", label: "Paid", count: statusCounts.paid },
              { key: "pending", label: "Pending", count: statusCounts.pending },
              { key: "refunded", label: "Refunded", count: statusCounts.refunded },
              { key: "cancelled", label: "Cancelled", count: statusCounts.cancelled },
            ]}
          />
        </div>

        {/* Orders */}
        <section className="bg-card border border-border mb-6" aria-label="Orders">
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {rows.length === 0 ? "Your first order will appear here." : "No orders match this selection."}
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {["When", "Event", "Tier", "Buyer", "Qty", "Total", "Status"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground ${i === 4 || i === 5 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                          {fmtDate(r.created_at)} <span className="opacity-60">{fmtTime(r.created_at)}</span>
                        </td>
                        <td className="px-4 py-2.5 font-medium max-w-[220px] truncate">
                          <Link to={`/studio/events/${r.event_id}`} className="hover:text-primary">{r.event_title}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.tier_name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">{r.buyer_email}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity}</td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums">{eur(r.total_cents, 2)}</td>
                        <td className="px-4 py-2.5"><StatusPill status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="md:hidden divide-y divide-border">
                {filtered.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/studio/events/${r.event_id}`} className="text-sm font-semibold truncate block">{r.event_title}</Link>
                        <div className="text-[11px] text-muted-foreground truncate">{r.tier_name} · {r.buyer_email}</div>
                      </div>
                      <div className="text-sm font-bold tabular-nums shrink-0">{eur(r.total_cents, 2)}</div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{fmtDate(r.created_at)} {fmtTime(r.created_at)} · ×{r.quantity}</span>
                      <StatusPill status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Sales statements, per event */}
        {organizer && <StudioDocuments organizer={organizer} />}
      </div>
    </StudioLayout>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const cls =
    status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${cls}`}>{status}</span>;
};

export default StudioSales;
