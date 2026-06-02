import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Loader2,
  ArrowLeft,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  ShieldCheck,
  Download,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface OrderRow {
  id: string;
  event_id: string;
  buyer_id: string;
  quantity: number;
  total_cents: number;
  status: string;
  created_at: string;
  event: {
    title: string;
    date: string;
    location: string | null;
    slug: string | null;
    primary_color: string | null;
    banner_url: string | null;
  } | null;
  tier: { name: string } | null;
}

interface TicketRow {
  id: string;
  qr_token: string;
  scanned_at: string | null;
}

const MyTickets = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!orderId || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ord } = await supabase
        .from("event_orders")
        .select(
          `id, event_id, buyer_id, quantity, total_cents, status, created_at,
           event:events(title, date, location, slug, primary_color, banner_url),
           tier:event_tiers(name)`,
        )
        .eq("id", orderId)
        .maybeSingle();
      if (!ord || ord.buyer_id !== user.id) {
        if (!cancelled) {
          setOrder(null);
          setLoading(false);
        }
        return;
      }

      const ev = Array.isArray((ord as { event: unknown }).event)
        ? (ord as { event: OrderRow["event"][] }).event[0]
        : (ord as { event: OrderRow["event"] }).event;
      const tier = Array.isArray((ord as { tier: unknown }).tier)
        ? (ord as { tier: OrderRow["tier"][] }).tier[0]
        : (ord as { tier: OrderRow["tier"] }).tier;

      const { data: tix } = await supabase
        .from("event_tickets")
        .select("id, qr_token, scanned_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      setOrder({ ...(ord as OrderRow), event: ev ?? null, tier: tier ?? null });
      setTickets((tix as TicketRow[]) ?? []);

      // Fetch each ticket's QR SVG via the auth-gated edge function. The
      // resulting blob:// URL is the only thing we render.
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
      if (!token || !supabaseUrl) {
        setLoading(false);
        return;
      }
      const urls: Record<string, string> = {};
      for (const t of tix ?? []) {
        try {
          const res = await fetch(
            `${supabaseUrl}/functions/v1/event-ticket-qr?ticket_id=${t.id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const svg = await res.text();
            const blob = new Blob([svg], { type: "image/svg+xml" });
            urls[t.id] = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn("[my-tickets] qr fetch failed for", t.id, e);
        }
      }
      if (!cancelled) {
        setQrUrls(urls);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Revoke blob URLs to free memory
      for (const k of Object.keys(qrUrls)) URL.revokeObjectURL(qrUrls[k]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-black mb-2">Order not found</h1>
            <p className="text-sm text-muted-foreground mb-5">
              This order does not exist or isn't yours.
            </p>
            <Link to="/settings/purchases" className="text-primary font-bold">
              Back to purchases
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const primary = order.event?.primary_color ?? "#003399";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title={`Your tickets — ${order.event?.title ?? "Order"}`}
        description="Show this at the door. Each QR is single-use."
      />
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <button
            onClick={() => navigate("/settings/purchases")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to purchases
          </button>

          {/* Branded header strip */}
          <div
            className="rounded-2xl p-6 md:p-7 text-white mb-6"
            style={{ background: `linear-gradient(135deg, ${primary}, hsl(210 100% 45%))` }}
          >
            <div className="text-xs uppercase tracking-[0.18em] font-bold opacity-80 mb-2">
              Your {order.quantity > 1 ? `${order.quantity} tickets` : "ticket"}
            </div>
            <h1 className="text-2xl md:text-3xl font-black leading-tight mb-3">
              {order.event?.title}
            </h1>
            <div className="text-sm opacity-90 flex items-center gap-3 flex-wrap">
              {order.event?.date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(order.event.date).toLocaleString("en-GB", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </span>
              )}
              {order.event?.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {order.event.location}
                </span>
              )}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <TicketIcon className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Your tickets will appear here once your payment is confirmed.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((t, i) => (
                <div
                  key={t.id}
                  className="bg-card border border-border rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center gap-5"
                >
                  <div className="bg-white p-3 rounded-xl shadow-soft border border-border shrink-0">
                    {qrUrls[t.id] ? (
                      <img
                        src={qrUrls[t.id]}
                        alt={`Ticket QR ${i + 1}`}
                        className="w-48 h-48 md:w-52 md:h-52"
                      />
                    ) : (
                      <div className="w-48 h-48 md:w-52 md:h-52 flex items-center justify-center text-muted-foreground text-xs">
                        QR unavailable
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center md:text-left">
                    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1">
                      Ticket {i + 1} of {tickets.length}
                      {order.tier ? ` · ${order.tier.name}` : ""}
                    </div>
                    <div className="text-base md:text-lg font-bold mb-2">
                      Show this at the door
                    </div>
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mb-3 justify-center md:justify-start">
                      <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                      Single-use · validated on scan
                    </div>
                    {t.scanned_at && (
                      <div className="text-xs font-bold text-amber-700 bg-amber-100 inline-flex items-center gap-1 px-2 py-1 rounded-full">
                        Used on {new Date(t.scanned_at).toLocaleString("en-GB")}
                      </div>
                    )}
                    {qrUrls[t.id] && (
                      <a
                        href={qrUrls[t.id]}
                        download={`ticket-${i + 1}.svg`}
                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-primary hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        Save QR image
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default MyTickets;
