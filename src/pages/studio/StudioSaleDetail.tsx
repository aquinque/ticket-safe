/**
 * /studio/sales/:id — one past event, read from the archive: what it sold (tickets, gross,
 * service fees, net, refunds, check-ins) and every order with the buyer, the ticket type, the
 * amount, the date, the status after refunds and resales, and the door check-ins. Searchable,
 * filterable by ticket type, sortable. The exports (CSV, financial statement PDF) are in the
 * header. An event that has not ended is not shown here: it is still managed from
 * /studio/events/:id, and this page sends it there.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { StatFigure } from "@/components/studio/StatFigure";
import { FilterChips } from "@/components/studio/FilterChips";
import EventStatusBadge, { type EventStatus } from "@/components/studio/EventStatusBadge";
import { SalesExportMenu } from "@/components/studio/SalesExportMenu";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { eventPhase } from "@/lib/eventTime";
import { fmtDate, fmtDay, fmtMoney, fmtTime } from "@/lib/studioFormat";
import {
  buildOrderViews,
  emptySummary,
  filterOrders,
  percentOf,
  sortOrders,
  type ArchiveEventRow,
  type ArchiveOrderRow,
  type ArchiveTicketRow,
  type OrderSortKey,
  type OrderStatusLabel,
  type SalesSummaryRow,
  type SortDir,
} from "@/lib/salesArchive";

interface EventDetailRow extends ArchiveEventRow {
  location: string | null;
}

interface TierRow {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
}

type PageState = "loading" | "ready" | "missing" | "failed";

const TH = "px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground";

const SORT_LABELS: Record<OrderSortKey, string> = { buyer: "Buyer", amount: "Amount", date: "Date", status: "Status", checkin: "Check-in" };

/** The sort chooser of the phone layout, where there are no column headers to click. */
const PHONE_SORTS: { value: string; label: string; key: OrderSortKey; dir: SortDir }[] = [
  { value: "date:desc", label: "Newest first", key: "date", dir: "desc" },
  { value: "date:asc", label: "Oldest first", key: "date", dir: "asc" },
  { value: "buyer:asc", label: "Buyer, A to Z", key: "buyer", dir: "asc" },
  { value: "amount:desc", label: "Amount, high to low", key: "amount", dir: "desc" },
  { value: "amount:asc", label: "Amount, low to high", key: "amount", dir: "asc" },
  { value: "status:asc", label: "Status", key: "status", dir: "asc" },
  { value: "checkin:desc", label: "Checked in first", key: "checkin", dir: "desc" },
];

const STATUS_CLASSES: Record<OrderStatusLabel, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  resold: "bg-primary/10 text-primary border-primary/20",
  "partly resold": "bg-amber-50 text-amber-700 border-amber-200",
};

const OrderStatusBadge = ({ status }: { status: OrderStatusLabel }) => (
  <span className={`inline-flex px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${STATUS_CLASSES[status]}`}>{status}</span>
);

const checkInText = (checkIns: { scanned: number; total: number }) => (checkIns.scanned > 0 ? `${checkIns.scanned} / ${checkIns.total}` : "—");

const StudioSaleDetail = () => {
  useThemeMode("studio");
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const organizerId = organizer?.id;

  const [state, setState] = useState<PageState>("loading");
  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [summary, setSummary] = useState<SalesSummaryRow | null>(null);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [orders, setOrders] = useState<ArchiveOrderRow[]>([]);
  const [tickets, setTickets] = useState<ArchiveTicketRow[]>([]);
  const [hasStatement, setHasStatement] = useState(false);

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<OrderSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async (eventId: string, ownerId: string) => {
    setState("loading");
    try {
      // Row-level security already hides other organizers' events; the owner filter says so explicitly.
      const { data: ev, error: evError } = await supabase
        .from("events")
        .select("id, title, slug, date, ends_at, status, currency, payment_provider, location")
        .eq("id", eventId)
        .eq("organizer_id", ownerId)
        .maybeSingle();
      if (evError) throw evError;
      if (!ev) {
        setEvent(null);
        setState("missing");
        return;
      }
      setEvent(ev as EventDetailRow);
      if (eventPhase(ev) !== "past") {
        // Still upcoming or live: the render sends it back to /studio/events/:id.
        setState("ready");
        return;
      }
      const [summaryRes, tiersRes, ordersRes, ticketsRes, statementRes] = await Promise.all([
        supabase.rpc("studio_event_sales_summary", { p_organizer_id: ownerId }),
        supabase.from("event_tiers").select("id, name, price_cents, currency").eq("event_id", eventId).order("sort_order", { ascending: true }),
        supabase
          .from("event_orders")
          .select("id, buyer_id, buyer_email, attendees, quantity, unit_price_cents, total_cents, fee_cents, discount_cents, currency, tier_id, status, paid_at, created_at, refunded_at")
          .eq("event_id", eventId)
          .in("status", ["paid", "refunded"])
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("event_tickets")
          .select("id, order_id, tier_id, buyer_id, holder_first_name, holder_last_name, holder_email, status, scanned_at, created_at")
          .eq("event_id", eventId)
          .limit(5000),
        supabase.from("event_statements").select("id").eq("event_id", eventId).limit(1),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (tiersRes.error) throw tiersRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (ticketsRes.error) throw ticketsRes.error;
      if (statementRes.error) throw statementRes.error;
      setSummary(((summaryRes.data ?? []) as SalesSummaryRow[]).find((row) => row.event_id === eventId) ?? emptySummary(eventId));
      setTiers((tiersRes.data ?? []) as TierRow[]);
      setOrders((ordersRes.data ?? []) as ArchiveOrderRow[]);
      setTickets((ticketsRes.data ?? []) as ArchiveTicketRow[]);
      setHasStatement((statementRes.data ?? []).length > 0);
      setState("ready");
    } catch (err) {
      console.error("[StudioSaleDetail] load failed:", err);
      toast.error("This event could not be loaded.");
      setState("failed");
    }
  }, []);

  useEffect(() => {
    if (id && organizerId) void load(id, organizerId);
  }, [id, organizerId, load]);

  const views = useMemo(() => buildOrderViews(orders, tickets, tiers), [orders, tickets, tiers]);
  const rows = useMemo(() => sortOrders(filterOrders(views, query, tierFilter), sortKey, sortDir), [views, query, tierFilter, sortKey, sortDir]);
  const tierCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of views) if (view.tierId) counts.set(view.tierId, (counts.get(view.tierId) ?? 0) + 1);
    return counts;
  }, [views]);

  const toggleSort = (key: OrderSortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "buyer" ? "asc" : "desc");
    }
  };

  const sortableTh = (key: OrderSortKey, align: "left" | "right" = "left") => {
    const active = sortKey === key;
    return (
      <th scope="col" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className={`${TH} ${align === "right" ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 min-h-[32px] uppercase tracking-wider hover:text-foreground ${active ? "text-foreground" : ""}`}
        >
          {SORT_LABELS[key]}
          {active && (sortDir === "asc" ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)}
        </button>
      </th>
    );
  };

  const layoutOrganizer = organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null;

  if (!user || orgLoading || state === "loading") {
    return (
      <StudioLayout active="sales" organizer={layoutOrganizer}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  if (state === "missing" || !id) {
    return (
      <StudioLayout active="sales" organizer={layoutOrganizer}>
        <SEOHead title="Sales · Ticket Studio" description="Every event that has ended, with what it sold." />
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <p className="text-sm text-muted-foreground">This event is not in your archive.</p>
          <Link to="/studio/sales" className="inline-flex items-center gap-1.5 min-h-[44px] mt-2 text-sm font-bold text-primary hover:underline underline-offset-2">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Sales
          </Link>
        </div>
      </StudioLayout>
    );
  }

  if (state === "failed" || !event) {
    return (
      <StudioLayout active="sales" organizer={layoutOrganizer}>
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <p className="text-sm text-muted-foreground">
            This event could not be loaded.{" "}
            <button
              type="button"
              onClick={() => { if (organizerId) void load(id, organizerId); }}
              className="font-bold underline underline-offset-2 hover:text-primary"
            >
              Try again
            </button>
          </p>
        </div>
      </StudioLayout>
    );
  }

  // Not over yet: it is still managed from Events.
  if (eventPhase(event) !== "past") return <Navigate to={`/studio/events/${event.id}`} replace />;

  const figures = summary ?? emptySummary(event.id);
  const currency = event.currency;
  const title = event.title || "Untitled event";
  const whenWhere = [
    event.date ? `${fmtDay(event.date)} ${new Date(event.date).getFullYear()} · ${fmtTime(event.date)}` : "No date",
    event.location,
  ]
    .filter(Boolean)
    .join(" · ");
  const emptyText = views.length === 0 ? "No orders for this event." : "No orders match.";

  return (
    <StudioLayout active="sales" organizer={layoutOrganizer}>
      <SEOHead title={`${title} · Sales · Ticket Studio`} description={`What ${title} sold.`} />
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <Link to="/studio/sales" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary mb-1.5">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Sales
            </Link>
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight text-balance">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{whenWhere}</p>
            <div className="mt-2">
              <EventStatusBadge status={event.status as EventStatus} date={event.date} />
            </div>
          </div>
          <SalesExportMenu variant="buttons" event={event} hasStatement={hasStatement} onStatementGenerated={() => setHasStatement(true)} />
        </div>

        {/* What it sold */}
        <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-label="Sales summary">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatFigure label="Tickets sold" value={figures.tickets_sold} hint={figures.capacity > 0 ? `of ${figures.capacity.toLocaleString("en-GB")}` : undefined} />
            <StatFigure label="Gross sales" value={figures.gross_cents} money currency={currency} />
            <StatFigure label="Service fees" value={figures.fee_cents} money currency={currency} tone="muted" hint="paid by buyers" />
            <StatFigure label="Net to you" value={figures.net_cents} money currency={currency} tone="good" />
            <StatFigure label="Refunds" value={figures.refunded_tickets} hint={fmtMoney(figures.refunded_cents, currency)} />
            <StatFigure
              label="Check-ins"
              value={figures.checked_in}
              hint={figures.tickets_sold > 0 ? `${percentOf(figures.checked_in, figures.tickets_sold)} % of tickets sold` : undefined}
            />
          </div>
        </section>

        {/* Find an order */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search orders by name or email"
              className="w-full pl-9 pr-3 min-h-[44px] border border-border bg-card text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const choice = PHONE_SORTS.find((option) => option.value === e.target.value);
              if (choice) {
                setSortKey(choice.key);
                setSortDir(choice.dir);
              }
            }}
            aria-label="Sort orders"
            className="md:hidden min-h-[44px] px-3 border border-border bg-card text-sm font-semibold"
          >
            {PHONE_SORTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <FilterChips<string>
            label="Ticket type"
            value={tierFilter}
            onChange={setTierFilter}
            items={[
              { key: "all", label: "All", count: views.length },
              ...tiers.map((tier) => ({ key: tier.id, label: tier.name, count: tierCounts.get(tier.id) ?? 0 })),
            ]}
          />
        </div>

        {/* Orders */}
        <section className="bg-card border border-border" aria-label="Orders">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {sortableTh("buyer")}
                  <th scope="col" className={TH}>Email</th>
                  <th scope="col" className={TH}>Tickets</th>
                  {sortableTh("amount", "right")}
                  {sortableTh("date")}
                  {sortableTh("status")}
                  {sortableTh("checkin", "right")}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-semibold max-w-[220px] truncate">{row.buyerName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground break-all">{row.email || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{row.tierName} × {row.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap">{fmtMoney(row.amountCents, row.currency, 2)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                      {fmtDate(row.date)} <span className="opacity-60">{fmtTime(row.date)}</span>
                    </td>
                    <td className="px-4 py-2.5"><OrderStatusBadge status={row.status} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{checkInText(row.checkIns)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">{emptyText}</p>}
          </div>

          <ul className="md:hidden divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{row.buyerName}</div>
                    <div className="text-[11px] text-muted-foreground break-all">{row.email || "—"}</div>
                  </div>
                  <OrderStatusBadge status={row.status} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] text-muted-foreground">
                  <span>{row.tierName} × {row.quantity} · {fmtDate(row.date)} {fmtTime(row.date)}</span>
                  <span className="font-bold text-foreground tabular-nums shrink-0">{fmtMoney(row.amountCents, row.currency, 2)}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">Check-in {checkInText(row.checkIns)}</div>
              </li>
            ))}
            {rows.length === 0 && <li className="text-sm text-muted-foreground text-center py-10">{emptyText}</li>}
          </ul>

          <p className="px-4 md:px-5 py-3 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
            Figures come from your orders in Ticket Studio. The financial statement PDF is built from Stripe and can differ slightly (Stripe fees, refunds issued from Stripe).
          </p>
        </section>

        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm">
          <Link to={`/studio/events/${event.id}`} className="inline-flex items-center min-h-[44px] font-semibold text-muted-foreground hover:text-primary">
            Event settings (read-only)
          </Link>
          <Link to={`/studio/events/${event.id}/attendees`} className="inline-flex items-center min-h-[44px] font-semibold text-muted-foreground hover:text-primary">
            Guest list
          </Link>
        </div>
      </div>
    </StudioLayout>
  );
};

export default StudioSaleDetail;
