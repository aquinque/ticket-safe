import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, Search, TrendingUp, Ticket, Tag } from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
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
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Every order across all your events, in one place.</p>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-bold bg-card border border-border hover:bg-muted disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Revenue (filtered)</span>
            </div>
            <div className="text-2xl font-black tabular-nums">€{(totalRevenueCents / 100).toFixed(0)}</div>
          </div>
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Ticket className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Tickets sold</span>
            </div>
            <div className="text-2xl font-black tabular-nums">{totalTickets}</div>
          </div>
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Tag className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Orders</span>
            </div>
            <div className="text-2xl font-black tabular-nums">{filtered.length}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search buyer email or event…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
          >
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm max-w-[220px]"
          >
            <option value="all">All events</option>
            {eventOptions.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No sales match your filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Event</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Tier</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Buyer</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Qty</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Total</th>
                    <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-4 py-2.5 font-medium truncate max-w-[200px]">
                        <Link to={`/studio/events/${r.event_id}`} className="hover:text-primary">
                          {r.event_title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.tier_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[180px]">{r.buyer_email}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">€{(r.total_cents / 100).toFixed(2)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                            r.status === "paid"
                              ? "bg-success/15 text-success"
                              : r.status === "pending"
                              ? "bg-warning/15 text-warning"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StudioLayout>
  );
};

export default StudioSales;
