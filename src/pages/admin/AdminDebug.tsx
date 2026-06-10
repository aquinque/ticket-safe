/**
 * Admin debug — a single page that surfaces enough live state to triage
 * "is the platform alive?" in one glance:
 *   - System health (stuck orders / payouts / pending reviews)
 *   - Recent Stripe webhook deliveries (with idempotency hits)
 *   - Recent door-scan audit trail
 *   - Quick links to the other admin pages
 *
 * Admin-gated via user_roles. RLS on audit_log allows admins to SELECT.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, RefreshCw, Activity, ScanLine,
  AlertTriangle, CheckCircle2, Database, Webhook,
} from "lucide-react";
import Header from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import Footer from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Health {
  stuck_orders: number;
  reserved_listings: number;
  pending_reviews: number;
  pending_payouts: number;
  available_payouts: number;
  pending_transactions: number;
}

interface WebhookEvent {
  event_id: string;
  event_type: string;
  processed_at: string;
}

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_email: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
}

const AdminDebug = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [scans, setScans] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/admin/debug");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: role } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!role);
    })();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [
      { count: stuckOrders },
      { count: reservedListings },
      { count: pendingReviews },
      { count: pendingPayouts },
      { count: pendingTransactions },
      { data: webhookData },
      { data: scanData },
    ] = await Promise.all([
      supabase.from("event_orders").select("id", { count: "exact", head: true })
        .eq("status", "pending").lt("created_at", new Date(Date.now() - 90 * 60 * 1000).toISOString()),
      supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("status", "reserved").lt("updated_at", new Date(Date.now() - 90 * 60 * 1000).toISOString()),
      supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("verification_status", "pending").eq("status", "available"),
      supabase.from("organizer_payouts").select("id", { count: "exact", head: true })
        .eq("status", "requested"),
      supabase.from("transactions").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("stripe_webhook_events").select("event_id, event_type, processed_at")
        .order("processed_at", { ascending: false }).limit(40),
      supabase.from("audit_log").select("id, occurred_at, actor_email, action, target_kind, target_id, meta")
        .like("action", "scan.%").order("occurred_at", { ascending: false }).limit(40),
    ]);

    const { count: sellerPendingPayouts } = await supabase
      .from("seller_payouts").select("id", { count: "exact", head: true }).eq("status", "requested");

    setHealth({
      stuck_orders: stuckOrders ?? 0,
      reserved_listings: reservedListings ?? 0,
      pending_reviews: pendingReviews ?? 0,
      pending_payouts: (pendingPayouts ?? 0) + (sellerPendingPayouts ?? 0),
      available_payouts: 0,
      pending_transactions: pendingTransactions ?? 0,
    });
    setWebhooks((webhookData as WebhookEvent[]) ?? []);
    setScans((scanData as AuditRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header minimal />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-black mb-2">Admin only</h1>
            <p className="text-sm text-muted-foreground">This debug surface is restricted.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header minimal />
      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-4">
            <BackButton />
          </div>

          <PageHeader
            icon={Database}
            title="System health"
            description="Live snapshot of stuck states, webhook traffic, and recent scans."
            action={
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            }
          />

          {/* Health cards */}
          {health && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              <HealthCard label="Stuck orders (>90 min)" value={health.stuck_orders} bad={health.stuck_orders > 0} hint="Should auto-clear via pg_cron every 15 min" />
              <HealthCard label="Reserved listings (>90 min)" value={health.reserved_listings} bad={health.reserved_listings > 0} hint="Same cron releases these" />
              <HealthCard label="Pending tx (live)" value={health.pending_transactions} bad={health.pending_transactions > 5} />
              <HealthCard label="Listings awaiting review" value={health.pending_reviews} bad={false} cta={{ label: "Open queue", href: "/admin/review" }} />
              <HealthCard label="SEPA payouts requested" value={health.pending_payouts} bad={false} cta={{ label: "Open payouts", href: "/admin/payouts" }} />
              <HealthCard label="Total webhook deliveries" value={webhooks.length} bad={false} hint="Showing last 40" />
            </div>
          )}

          {/* Webhook events */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black inline-flex items-center gap-2"><Webhook className="w-4 h-4" />Stripe webhook deliveries</h2>
              <span className="text-xs text-muted-foreground">{webhooks.length} shown</span>
            </div>
            {webhooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No webhook events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-2 py-2">Event type</th>
                      <th className="px-2 py-2">Event ID</th>
                      <th className="px-2 py-2">Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhooks.map((w) => (
                      <tr key={w.event_id} className="border-b border-border/60">
                        <td className="px-2 py-2 font-mono text-xs">{w.event_type}</td>
                        <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{w.event_id.slice(0, 28)}...</td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">{new Date(w.processed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Scan audit */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black inline-flex items-center gap-2"><ScanLine className="w-4 h-4" />Recent door scans</h2>
              <span className="text-xs text-muted-foreground">{scans.length} shown</span>
            </div>
            {scans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scans yet.</p>
            ) : (
              <div className="space-y-2">
                {scans.map((s) => {
                  const isBad = s.action === "scan.transferred" || s.action === "scan.already_used" || s.action === "scan.forged_or_unknown" || s.action === "scan.race_lost" || s.action === "scan.wrong_event";
                  const isGood = s.action === "scan.valid";
                  const Icon = isGood ? CheckCircle2 : isBad ? AlertTriangle : Activity;
                  const color = isGood ? "text-emerald-600" : isBad ? "text-amber-600" : "text-muted-foreground";
                  return (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {s.action.replace("scan.", "")}
                          {s.actor_email ? <span className="text-muted-foreground font-normal"> · by {s.actor_email}</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {s.target_id ? `target ${s.target_id.slice(0, 8)} · ` : ""}
                          {new Date(s.occurred_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const HealthCard = ({
  label, value, bad, hint, cta,
}: {
  label: string;
  value: number;
  bad: boolean;
  hint?: string;
  cta?: { label: string; href: string };
}) => {
  const navigate = useNavigate();
  return (
    <div className={`bg-card border rounded-xl p-4 ${bad ? "border-amber-300 bg-amber-50/40" : "border-border"}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-black ${bad ? "text-amber-700" : ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      {cta && (
        <button
          onClick={() => navigate(cta.href)}
          className="mt-2 text-xs font-bold text-primary hover:underline"
        >
          {cta.label} →
        </button>
      )}
    </div>
  );
};

export default AdminDebug;
