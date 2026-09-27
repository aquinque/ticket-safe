import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Loader2, Download, ArrowRight, Receipt, History as HistoryIcon, Eye } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { supabase } from "@/integrations/supabase/client";
import { generatePayoutReceiptPDF } from "@/lib/payoutReceiptPdf";

interface PastEvent {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: "draft" | "published" | "cancelled" | "sold_out" | null;
  sold_count: number;
  total_capacity: number;
  revenue_cents: number;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  gross_cents: number | null;
  fee_cents: number | null;
  status: "requested" | "processing" | "sent" | "failed" | "cancelled";
  iban_used: string;
  iban_holder_used: string;
  requested_at: string;
  sent_at: string | null;
}

const PAYOUT_STATUS_STYLE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

const StudioHistory = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [events, setEvents] = useState<PastEvent[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio/history");
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoading(true);

    const { data: evRows } = await supabase
      .from("events")
      .select("id, title, date, location, status, banner_url")
      .eq("organizer_id", organizer.id)
      .neq("status", "cancelled")
      .lt("date", new Date().toISOString())
      .order("date", { ascending: false });

    const ids = (evRows ?? []).map((e: { id: string }) => e.id);
    type Agg = { sold: number; total: number; revenue: number };
    let tierAgg: Record<string, Agg> = {};
    if (ids.length) {
      const { data: tiers } = await supabase
        .from("event_tiers")
        .select("event_id, sold_qty, total_qty, price_cents")
        .in("event_id", ids);
      tierAgg = (tiers ?? []).reduce(
        (acc, t: { event_id: string; sold_qty: number; total_qty: number; price_cents: number }) => {
          const cur = acc[t.event_id] ?? { sold: 0, total: 0, revenue: 0 };
          cur.sold += t.sold_qty;
          cur.total += t.total_qty;
          cur.revenue += t.sold_qty * t.price_cents;
          acc[t.event_id] = cur;
          return acc;
        },
        {} as Record<string, Agg>,
      );
    }

    setEvents(
      (evRows ?? []).map((e) => ({
        ...(e as Omit<PastEvent, "sold_count" | "total_capacity" | "revenue_cents">),
        sold_count: tierAgg[e.id]?.sold ?? 0,
        total_capacity: tierAgg[e.id]?.total ?? 0,
        revenue_cents: tierAgg[e.id]?.revenue ?? 0,
      })),
    );

    const { data: payoutRows } = await supabase
      .from("organizer_payouts")
      .select("id, amount_cents, gross_cents, fee_cents, status, iban_used, iban_holder_used, requested_at, sent_at")
      .eq("organizer_id", organizer.id)
      .order("requested_at", { ascending: false });
    setPayouts((payoutRows as PayoutRow[]) ?? []);

    setLoading(false);
  }, [organizer]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadReceipt = async (p: PayoutRow) => {
    if (!organizer) return;
    setDownloadingId(p.id);
    try {
      const grossCents = p.gross_cents ?? p.amount_cents;
      const feeCents = p.fee_cents ?? Math.max(grossCents - p.amount_cents, 0);
      await generatePayoutReceiptPDF({
        kind: "studio",
        payoutId: p.id,
        organizationName: organizer.name,
        beneficiaryName: p.iban_holder_used,
        iban: p.iban_used,
        grossCents,
        feeCents,
        // Historical payouts genuinely had an 8% fee deducted; current ones
        // (fee_cents = 0) take no fee from organizers — derive the label
        // from the actual amounts rather than assuming a fixed percentage.
        feePercent: grossCents > 0 ? Math.round((feeCents / grossCents) * 100) : 0,
        netCents: p.amount_cents,
        sentAt: p.sent_at,
        requestedAt: p.requested_at,
        status: p.status,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!organizer || organizer.status !== "approved") {
    navigate("/studio");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title={`${organizer.name} · History`} description="Past events, stats and payment receipts." />
      <Header minimal />

      <main className="flex-1">
        <section
          className="text-white"
          style={{ background: `linear-gradient(135deg, ${organizer.primary_color}, hsl(210 100% 45%))` }}
        >
          <div className="container mx-auto px-4 py-8 md:py-10 max-w-5xl">
            <div className="mb-5">
              <BackButton fallbackPath="/studio" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <HistoryIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] font-bold text-white/80">Studio</div>
                <h1 className="text-2xl md:text-3xl font-black leading-tight">Event &amp; payout history</h1>
              </div>
            </div>
            <p className="text-sm text-white/85 mt-3 max-w-lg">
              Every past event you've run, with its final stats, and every payout Ticket Safe has sent
              you — with a downloadable payment receipt for each one.
            </p>
          </div>
        </section>

        {/* ===== Past events ===== */}
        <section className="container mx-auto px-4 pt-8 max-w-5xl">
          <h2 className="text-lg font-bold mb-4">Past events</h2>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 bg-card border border-dashed border-border rounded-2xl">
              <p className="text-sm text-muted-foreground">No past events yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {events.map((e) => (
                <Link
                  key={e.id}
                  to={`/studio/events/${e.id}/attendees`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-foreground truncate">{e.title}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                      {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {e.location ? <span className="truncate"> · {e.location}</span> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-foreground">€{(e.revenue_cents / 100).toFixed(0)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {e.sold_count}/{e.total_capacity || "—"} sold
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-3.5 h-3.5" />
                    Stats
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ===== Payout receipts ===== */}
        <section className="container mx-auto px-4 py-8 max-w-5xl">
          <h2 className="text-lg font-bold mb-4">Payout receipts</h2>
          <p className="text-xs text-muted-foreground mb-4 -mt-2">
            Payouts are withdrawn from your overall balance, not tied to a single event — each one
            covers whatever events had sales at the time.
          </p>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-10 bg-card border border-dashed border-border rounded-2xl">
              <p className="text-sm text-muted-foreground">No payouts requested yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-foreground">€{(p.amount_cents / 100).toFixed(2)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {p.iban_used.slice(0, 4)} ···· {p.iban_used.slice(-4)} ·{" "}
                      {new Date(p.requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${PAYOUT_STATUS_STYLE[p.status] ?? "bg-muted text-muted-foreground"}`}>
                    {p.status}
                  </span>
                  {p.status === "sent" && (
                    <button
                      type="button"
                      onClick={() => downloadReceipt(p)}
                      disabled={downloadingId === p.id}
                      title="Download payment receipt (PDF)"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 shrink-0"
                    >
                      {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Receipt
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default StudioHistory;
