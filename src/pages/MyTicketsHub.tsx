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
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
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
      const [{ data: studioData, error: studioErr }, { data: resaleData, error: resaleErr }] = await Promise.all([
        supabase
          .from("event_orders")
          .select(
            `id, status, quantity, total_cents, paid_at, created_at, event_id,
             event:events(title, date, location, slug, banner_url, primary_color),
             tier:event_tiers(name),
             tickets:event_tickets(id, status, scanned_at, holder_first_name, holder_last_name)`,
          )
          .eq("buyer_id", user.id)
          .in("status", ["paid", "refunded"])
          .order("created_at", { ascending: false }),
        supabase
          .from("tickets")
          .select(
            `id, status, quantity, selling_price, file_url, notes, created_at, event_id,
             event:events(title, date, location, slug, banner_url, primary_color)`,
          )
          .eq("buyer_id", user.id)
          .eq("status", "sold")
          .order("created_at", { ascending: false }),
      ]);
      const data = studioData;
      const error = studioErr ?? resaleErr;

      if (error) {
        console.error("[my-tickets] fetch error:", error);
      }
      if (cancelled) return;

      // Build resale cards first so they appear in the same OrderCard shape.
      const resaleCards: OrderCard[] = (resaleData ?? []).map(
        (row: {
          id: string;
          status: string;
          quantity: number;
          selling_price: number | null;
          file_url: string | null;
          notes: string | null;
          created_at: string;
          event_id: string;
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
          };
        },
      );

      const cards: OrderCard[] = (data ?? []).map(
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
          };
        },
      );

      const allCards = [...cards, ...resaleCards].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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

  const upcoming = orders.filter((o) => o.event_date && new Date(o.event_date) >= new Date());
  const past = orders.filter((o) => !o.event_date || new Date(o.event_date) < new Date());

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="My tickets — Ticket Safe" description="All your tickets in one place." />
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <TicketIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black leading-tight">My tickets</h1>
              <p className="text-sm text-muted-foreground">Every event ticket attached to your Ticket Safe account.</p>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <TicketIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-lg font-bold mb-1">No tickets yet</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Browse upcoming campus events and grab your first ticket.
              </p>
              <Link
                to="/tickets"
                className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover"
              >
                Browse events
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <Section title="Upcoming" count={upcoming.length}>
                  {upcoming.map((o) => (
                    <TicketCard key={o.id} order={o} navigate={navigate} />
                  ))}
                </Section>
              )}
              {past.length > 0 && (
                <Section title="Past" count={past.length}>
                  {past.map((o) => (
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

  return (
    <button
      onClick={() => {
        // Resale tickets land on PurchaseHistory (their PDF/QR comes from
        // the seller, no Ticket Safe-generated QR to render).
        if (order.id.startsWith("resale-")) navigate(`/settings/purchases`);
        else navigate(`/my-tickets/${order.id}`);
      }}
      className="w-full text-left bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-soft transition-all flex flex-col md:flex-row"
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
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs inline-flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-green-600" />
            QR ready · single-use
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
            Show QR
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </button>
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
