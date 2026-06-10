import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Loader2,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Tag,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface OrderCard {
  id: string;
  status: string;
  quantity: number;
  total_cents: number;
  paid_at: string | null;
  created_at: string;
  event_id: string;
  event_title: string;
  event_date: string | null;
  event_location: string | null;
  event_slug: string | null;
  event_banner_url: string | null;
  event_primary_color: string | null;
  tier_name: string | null;
  ticket_count: number;
  scanned_count: number;
  refunded_count: number;
  attendees: string[];
  sellableTicketId: string | null;
  isResale: boolean;
}

const MyTicketsHub = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/my-tickets");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Pull both Studio orders AND resale tickets the user bought in parallel.
      // Resale tickets live in the `tickets` table (status='sold', buyer_id=me)
      // and ship with the seller's original PDF/QR rather than a Ticket Safe
      // generated QR, so the card renders slightly differently.
      // 3 sources, queried in parallel:
      //   1. event_orders   — Studio primary buyers (their own order)
      //   2. tickets        — resale buyers (external + Studio)
      //   3. event_tickets  — buyers of a Studio RESALE: their new ticket
      //                       sits under the SELLER's order_id, so query (1)
      //                       misses it. We surface it as its own card here.
      const [
        { data: studioData, error: studioErr },
        { data: resaleData, error: resaleErr },
        { data: transferredData, error: transferredErr },
      ] = await Promise.all([
        supabase
          .from("event_orders")
          .select(
            `id, status, quantity, total_cents, paid_at, created_at, event_id,
             event:events(title, date, location, slug, banner_url, primary_color),
             tier:event_tiers(name),
             tickets:event_tickets(id, status, scanned_at, holder_first_name, holder_last_name)`,
          )
          .eq("buyer_id", user.id)
          // Fetch paid + refunded so studioOrderIds below covers the user's own
          // orders (and excludes their tickets from the "transferred" list).
          // We only BUILD cards from paid orders — refunded ones are not tickets
          // the user holds, so they never appear in My Tickets.
          .in("status", ["paid", "refunded"])
          .order("created_at", { ascending: false }),
        supabase
          .from("tickets")
          .select(
            `id, status, quantity, selling_price, file_url, notes, created_at, event_id, studio_ticket_id,
             event:events(title, date, location, slug, banner_url, primary_color)`,
          )
          .eq("buyer_id", user.id)
          .eq("status", "sold")
          .order("created_at", { ascending: false }),
        supabase
          .from("event_tickets")
          .select(
            `id, order_id, event_id, tier_id, status, scanned_at,
             holder_first_name, holder_last_name, created_at,
             event:events(title, date, location, slug, banner_url, primary_color),
             tier:event_tiers(name)`,
          )
          .eq("buyer_id", user.id)
          .in("status", ["valid", "scanned"])
          .order("created_at", { ascending: false }),
      ]);
      const data = studioData;
      const error = studioErr ?? resaleErr ?? transferredErr;

      if (error) {
        console.error("[my-tickets] fetch error:", error);
      }
      if (cancelled) return;

      // Resale cards — show EXTERNAL resales only. Studio resales are
      // surfaced via the event_tickets query below so the buyer gets the
      // real QR view instead of a dead-end card.
      const resaleCards: OrderCard[] = (resaleData ?? [])
        .filter((row: { studio_ticket_id?: string | null }) => !row.studio_ticket_id)
        .map(
        (row: {
          id: string;
          status: string;
          quantity: number;
          selling_price: number | null;
          file_url: string | null;
          notes: string | null;
          created_at: string;
          event_id: string;
          studio_ticket_id?: string | null;
          event: { title?: string; date?: string; location?: string; slug?: string; banner_url?: string; primary_color?: string } | { title?: string; date?: string; location?: string; slug?: string; banner_url?: string; primary_color?: string }[] | null;
        }) => {
          const ev = Array.isArray(row.event) ? row.event[0] : row.event;
          return {
            id: `resale-${row.id}`,
            status: "paid",
            quantity: row.quantity ?? 1,
            total_cents: Math.round((row.selling_price ?? 0) * 100 * (row.quantity ?? 1)),
            paid_at: row.created_at,
            created_at: row.created_at,
            event_id: row.event_id,
            event_title: ev?.title ?? "Resale ticket",
            event_date: ev?.date ?? null,
            event_location: ev?.location ?? null,
            event_slug: ev?.slug ?? null,
            event_banner_url: ev?.banner_url ?? null,
            event_primary_color: ev?.primary_color ?? null,
            tier_name: "Resale",
            ticket_count: row.quantity ?? 1,
            scanned_count: 0,
            refunded_count: 0,
            attendees: [],
            sellableTicketId: null,
            isResale: true,
          };
        },
      );

      // Transferred cards — event_tickets the user owns that DON'T belong
      // to one of their own Studio orders. These are Studio resales that
      // the webhook re-issued in their name.
      const studioOrderIds = new Set((data ?? []).map((r: { id: string }) => r.id));
      const transferredRows = (transferredData ?? []).filter(
        (t: { order_id: string }) => !studioOrderIds.has(t.order_id),
      );
      type TransferredRow = {
        id: string;
        order_id: string;
        event_id: string;
        status: string;
        scanned_at: string | null;
        holder_first_name: string | null;
        holder_last_name: string | null;
        created_at: string;
        event: { title?: string; date?: string; location?: string; slug?: string; banner_url?: string; primary_color?: string } | { title?: string; date?: string; location?: string; slug?: string; banner_url?: string; primary_color?: string }[] | null;
        tier: { name?: string } | { name?: string }[] | null;
      };
      const byOrder = new Map<string, TransferredRow[]>();
      for (const t of transferredRows as TransferredRow[]) {
        const arr = byOrder.get(t.order_id) ?? [];
        arr.push(t);
        byOrder.set(t.order_id, arr);
      }
      const transferredCards: OrderCard[] = Array.from(byOrder.entries()).map(([orderId, rows]) => {
        const first = rows[0];
        const ev = Array.isArray(first.event) ? first.event[0] : first.event;
        const tier = Array.isArray(first.tier) ? first.tier[0] : first.tier;
        const attendees = rows
          .map((t) => [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim())
          .filter(Boolean);
        const sellable = rows.find((t) => t.status === "valid" && t.scanned_at == null);
        return {
          id: orderId,
          status: "paid",
          quantity: rows.length,
          total_cents: 0,
          paid_at: first.created_at,
          created_at: first.created_at,
          event_id: first.event_id,
          event_title: ev?.title ?? "Event",
          event_date: ev?.date ?? null,
          event_location: ev?.location ?? null,
          event_slug: ev?.slug ?? null,
          event_banner_url: ev?.banner_url ?? null,
          event_primary_color: ev?.primary_color ?? null,
          tier_name: tier?.name ?? "Resale (transferred)",
          ticket_count: rows.length,
          scanned_count: rows.filter((t) => t.scanned_at != null).length,
          refunded_count: 0,
          attendees,
          sellableTicketId: sellable?.id ?? null,
          isResale: false,
        };
      });

      const cards: OrderCard[] = (data ?? []).filter((r: { status?: string }) => r.status === "paid").map(
        (
          row: {
            id: string;
            status: string;
            quantity: number;
            total_cents: number;
            paid_at: string | null;
            created_at: string;
            event_id: string;
            event:
              | {
                  title?: string;
                  date?: string;
                  location?: string;
                  slug?: string;
                  banner_url?: string;
                  primary_color?: string;
                }
              | { title?: string; date?: string; location?: string; slug?: string; banner_url?: string; primary_color?: string }[]
              | null;
            tier: { name?: string } | { name?: string }[] | null;
            tickets:
              | {
                  id: string;
                  status: string;
                  scanned_at: string | null;
                  holder_first_name: string | null;
                  holder_last_name: string | null;
                }[]
              | null;
          },
        ) => {
          const ev = Array.isArray(row.event) ? row.event[0] : row.event;
          const tier = Array.isArray(row.tier) ? row.tier[0] : row.tier;
          const tix = row.tickets ?? [];
          const attendees = tix
            .map((t) => [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim())
            .filter(Boolean);
          const sellable = tix.find((t) => t.status === "valid" && t.scanned_at == null) ?? null;
          return {
            id: row.id,
            status: row.status,
            quantity: row.quantity,
            total_cents: row.total_cents,
            paid_at: row.paid_at,
            created_at: row.created_at,
            event_id: row.event_id,
            event_title: ev?.title ?? "Event",
            event_date: ev?.date ?? null,
            event_location: ev?.location ?? null,
            event_slug: ev?.slug ?? null,
            event_banner_url: ev?.banner_url ?? null,
            event_primary_color: ev?.primary_color ?? null,
            tier_name: tier?.name ?? null,
            ticket_count: tix.length,
            scanned_count: tix.filter((t) => t.scanned_at != null).length,
            refunded_count: tix.filter((t) => t.status === "refunded" || t.status === "cancelled").length,
            attendees,
            sellableTicketId: sellable?.id ?? null,
            isResale: false,
          };
        },
      );

      const allCards = [...cards, ...transferredCards, ...resaleCards].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setOrders(allCards);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // "Available" = event still in the future AND at least one ticket can
  // still be scanned (not all used / refunded). Anything else falls into
  // "Past or used": the event already happened, or every ticket has been
  // burnt at the door, or every ticket was refunded.
  const now = Date.now();
  const isAvailable = (o: OrderCard) => {
    const future = o.event_date && new Date(o.event_date).getTime() >= now;
    if (!future) return false;
    if (o.ticket_count === 0) return true; // resale card with no event_tickets — treat as available
    const allUsed = o.scanned_count >= o.ticket_count;
    const allRefunded = o.refunded_count >= o.ticket_count;
    return !allUsed && !allRefunded;
  };
  const available = orders.filter(isAvailable);
  const pastOrUsed = orders.filter((o) => !isAvailable(o));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="My tickets — Ticket Safe" description="All your tickets in one place." />
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-4xl">
          <PageHeader
            icon={TicketIcon}
            title="My tickets"
            description="Every event ticket attached to your Ticket Safe account."
          />

          {orders.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center mb-4">
                <TicketIcon className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold mb-1">No tickets yet</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Find an upcoming campus event or browse the resale marketplace for someone else's spare ticket.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Link
                  to="/tickets"
                  className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover"
                >
                  Browse events
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/marketplace/buy"
                  className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-muted hover:bg-muted/80 border border-border"
                >
                  Resale marketplace
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <>
              {available.length > 0 && (
                <Section title="Available" count={available.length}>
                  {available.map((o) => (
                    <TicketCard key={o.id} order={o} navigate={navigate} />
                  ))}
                </Section>
              )}
              {pastOrUsed.length > 0 && (
                <Section title="Past or used" count={pastOrUsed.length}>
                  {pastOrUsed.map((o) => (
                    <TicketCard key={o.id} order={o} navigate={navigate} />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

const Section = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) => (
  <section className="mb-8">
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-base md:text-lg font-bold">{title}</h2>
      <span className="text-xs font-bold text-muted-foreground">{count}</span>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const TicketCard = ({
  order,
  navigate,
}: {
  order: OrderCard;
  navigate: ReturnType<typeof useNavigate>;
}) => {
  const primary = order.event_primary_color ?? "#3a5fe6";
  const dateObj = order.event_date ? new Date(order.event_date) : null;
  const allRefunded = order.refunded_count > 0 && order.refunded_count === order.ticket_count;
  const allScanned = order.scanned_count === order.ticket_count && order.ticket_count > 0;
  const eventInFuture = dateObj ? dateObj.getTime() > Date.now() : false;
  const canResell =
    !order.isResale && eventInFuture && !allScanned && !allRefunded && order.sellableTicketId != null;

  const openOrder = () => {
    if (order.id.startsWith("resale-")) navigate(`/settings/purchases`);
    else navigate(`/my-tickets/${order.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openOrder}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openOrder();
        }
      }}
      className="w-full text-left bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-soft transition-all flex flex-col md:flex-row cursor-pointer"
    >
      <div
        className="md:w-44 h-28 md:h-auto relative shrink-0"
        style={{ background: `linear-gradient(135deg, ${primary}, hsl(210 100% 45%))` }}
      >
        {order.event_banner_url && (
          <img src={order.event_banner_url} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-2 left-3 text-white">
          {dateObj ? (
            <>
              <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">
                {dateObj.toLocaleString("en-GB", { month: "short" })}
              </div>
              <div className="text-2xl font-black leading-none">
                {dateObj.toLocaleString("en-GB", { day: "numeric" })}
              </div>
            </>
          ) : (
            <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">No date</div>
          )}
        </div>
      </div>
      <div className="p-4 md:p-5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base md:text-lg font-black leading-tight line-clamp-2">
            {order.event_title}
          </h3>
          <StatusBadge
            status={allRefunded ? "refunded" : allScanned ? "used" : order.status === "paid" ? "ready" : order.status}
          />
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
          {dateObj && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dateObj.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          )}
          {order.event_location && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3" />
              {order.event_location}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {order.ticket_count} ticket{order.ticket_count > 1 ? "s" : ""}
          {order.tier_name ? ` · ${order.tier_name}` : ""}
          {order.attendees.length > 0 && (
            <span className="truncate"> · {order.attendees.slice(0, 3).join(", ")}{order.attendees.length > 3 ? `, +${order.attendees.length - 3}` : ""}</span>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border gap-2">
          <span className="text-xs inline-flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-green-600" />
            QR ready · single-use
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {canResell && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/sell?studio_ticket=${order.sellableTicketId}`);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
              >
                <Tag className="w-3 h-3" />
                Resell
              </button>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
              Show QR
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; Icon: typeof CheckCircle2; cls: string }> = {
    ready: { label: "Ready", Icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
    used: { label: "Used", Icon: CheckCircle2, cls: "bg-blue-100 text-blue-700" },
    refunded: { label: "Refunded", Icon: XCircle, cls: "bg-red-100 text-red-700" },
    paid: { label: "Paid", Icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
    pending: { label: "Pending", Icon: Clock, cls: "bg-amber-100 text-amber-700" },
  };
  const cfg = map[status] ?? { label: status, Icon: Clock, cls: "bg-muted text-muted-foreground" };
  const { Icon } = cfg;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 shrink-0 ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

export default MyTicketsHub;
