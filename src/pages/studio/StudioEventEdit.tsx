import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Save,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date: string;
  ends_at: string | null;
  location: string | null;
  category: string | null;
  status: "draft" | "published" | "cancelled" | "sold_out" | null;
  slug: string | null;
  primary_color: string | null;
  banner_url: string | null;
  organizer_id: string;
  published_at: string | null;
}

interface TierRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  total_qty: number;
  sold_qty: number;
  reserved_qty: number;
  sort_order: number;
  is_active: boolean;
}

interface OrderRow {
  id: string;
  buyer_email: string;
  quantity: number;
  total_cents: number;
  status: string;
  created_at: string;
  tier_id: string;
}

const StudioEventEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: ev }, { data: tr }, { data: ord }] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).maybeSingle(),
      supabase.from("event_tiers").select("*").eq("event_id", id).order("sort_order"),
      supabase
        .from("event_orders")
        .select("id, buyer_email, quantity, total_cents, status, created_at, tier_id")
        .eq("event_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setEvent((ev as EventRow) ?? null);
    setTiers((tr as TierRow[]) ?? []);
    setOrders((ord as OrderRow[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && !orgLoading) {
      if (!organizer || organizer.status !== "approved") {
        navigate("/studio");
      } else {
        load();
      }
    }
  }, [organizer, orgLoading, authLoading, navigate, load]);

  // Realtime: refresh when orders or tier inventory change
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`studio-event-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_orders", filter: `event_id=eq.${id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers", filter: `event_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, load]);

  const updateEventField = async (patch: Partial<EventRow>) => {
    if (!event) return;
    setSaving(true);
    const { error } = await supabase.from("events").update(patch).eq("id", event.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setEvent({ ...event, ...patch });
      toast.success("Saved");
    }
  };

  const publish = async () => {
    if (!event) return;
    if (tiers.length === 0) {
      toast.error("Add at least one ticket tier before publishing.");
      return;
    }
    // Check organizer has Stripe Connect ready
    const { data: stripe } = await supabase
      .from("stripe_accounts")
      .select("charges_enabled, payouts_enabled")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (!stripe?.charges_enabled) {
      toast.error("You need to complete Stripe onboarding before publishing. Visit Settings.");
      return;
    }
    await updateEventField({ status: "published", published_at: new Date().toISOString() });
  };

  const unpublish = () => updateEventField({ status: "draft" });

  const addTier = async () => {
    if (!event) return;
    const { error } = await supabase.from("event_tiers").insert({
      event_id: event.id,
      name: "New tier",
      price_cents: 2000,
      total_qty: 50,
      sort_order: tiers.length,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else load();
  };

  const updateTier = async (tierId: string, patch: Partial<TierRow>) => {
    const { error } = await supabase.from("event_tiers").update(patch).eq("id", tierId);
    if (error) toast.error(error.message);
    else load();
  };

  const removeTier = async (tierId: string) => {
    const t = tiers.find((x) => x.id === tierId);
    if (t && t.sold_qty > 0) {
      toast.error("Cannot delete a tier with sales. Mark inactive instead.");
      return;
    }
    if (!confirm("Delete this tier? This cannot be undone.")) return;
    const { error } = await supabase.from("event_tiers").delete().eq("id", tierId);
    if (error) toast.error(error.message);
    else load();
  };

  if (authLoading || orgLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header minimal />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">Event not found.</p>
            <Link to="/studio" className="text-primary font-bold">
              Back to dashboard
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const totalSold = tiers.reduce((a, t) => a + t.sold_qty, 0);
  const totalCapacity = tiers.reduce((a, t) => a + t.total_qty, 0);
  const totalRevenueCents = tiers.reduce((a, t) => a + t.sold_qty * t.price_cents, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title={`${event.title} · Studio`} description={`Manage ${event.title}.`} />
      <Header minimal />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <button
            onClick={() => navigate("/studio")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>

          {/* Header strip */}
          <div
            className="rounded-2xl p-6 md:p-8 text-white mb-6"
            style={{
              background: `linear-gradient(135deg, ${event.primary_color ?? "#003399"}, hsl(210 100% 45%))`,
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] font-bold opacity-80 mb-1">
                  {event.status === "published" ? "Live event" : "Draft"}
                </div>
                <h1 className="text-2xl md:text-3xl font-black truncate">{event.title}</h1>
                <div className="text-sm opacity-90 mt-2 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(event.date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  {event.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {event.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {event.status === "published" ? (
                  <button
                    onClick={unpublish}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg font-bold bg-white/15 backdrop-blur border border-white/20 hover:bg-white/25"
                  >
                    <EyeOff className="w-4 h-4" />
                    Unpublish
                  </button>
                ) : (
                  <button
                    onClick={publish}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg font-bold bg-white text-primary hover:bg-white/95"
                  >
                    <Eye className="w-4 h-4" />
                    Publish
                  </button>
                )}
                {event.status === "published" && event.slug && (
                  <a
                    href={`/e/${event.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-4 min-h-[40px] rounded-lg font-bold bg-white text-primary hover:bg-white/95"
                  >
                    Public page
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Sales summary */}
          <div className="grid grid-cols-3 gap-3 md:gap-5 mb-8">
            <Stat icon={Users} label="Tickets sold" value={`${totalSold}/${totalCapacity}`} />
            <Stat
              icon={TrendingUp}
              label="Revenue"
              value={`€${(totalRevenueCents / 100).toFixed(0)}`}
            />
            <Stat icon={Calendar} label="Tiers" value={String(tiers.length)} />
          </div>

          {/* Tiers manager */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Ticket tiers</h2>
              <button
                onClick={addTier}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
              >
                <Plus className="w-4 h-4" />
                Add tier
              </button>
            </div>

            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tiers yet. Add at least one before publishing.</p>
            ) : (
              <div className="space-y-3">
                {tiers.map((t) => (
                  <TierEditor
                    key={t.id}
                    tier={t}
                    onChange={(patch) => updateTier(t.id, patch)}
                    onRemove={() => removeTier(t.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Recent orders */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <h2 className="text-lg font-bold mb-4">Recent orders</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet. They will appear here in real time.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-2 py-2">Buyer</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Total</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-2 py-3">{o.buyer_email}</td>
                        <td className="px-2 py-3">{o.quantity}</td>
                        <td className="px-2 py-3 font-semibold">€{(o.total_cents / 100).toFixed(2)}</td>
                        <td className="px-2 py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-2 py-3 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("en-GB")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) => (
  <div className="bg-card border border-border rounded-xl px-4 py-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
    <div className="text-2xl font-black">{value}</div>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    refunded: "bg-muted text-muted-foreground",
    expired: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
};

const TierEditor = ({
  tier,
  onChange,
  onRemove,
}: {
  tier: TierRow;
  onChange: (patch: Partial<TierRow>) => void;
  onRemove: () => void;
}) => {
  const [draft, setDraft] = useState({
    name: tier.name,
    description: tier.description ?? "",
    price_cents: tier.price_cents,
    total_qty: tier.total_qty,
    is_active: tier.is_active,
  });
  const dirty =
    draft.name !== tier.name ||
    draft.description !== (tier.description ?? "") ||
    draft.price_cents !== tier.price_cents ||
    draft.total_qty !== tier.total_qty ||
    draft.is_active !== tier.is_active;

  const available = tier.total_qty - tier.sold_qty - tier.reserved_qty;

  return (
    <div className="bg-muted/40 border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
          {tier.sold_qty} sold · {available} available
        </span>
        <button
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-xs text-destructive font-bold"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <div className="md:col-span-2">
          <label className="text-xs font-bold text-muted-foreground mb-1 block">Name</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            maxLength={80}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-1 block">Price (€)</label>
          <input
            type="number"
            value={draft.price_cents / 100}
            onChange={(e) =>
              setDraft((d) => ({ ...d, price_cents: Math.round(Number(e.target.value) * 100) }))
            }
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            min="0"
            max="5000"
            step="0.5"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-1 block">Quantity</label>
          <input
            type="number"
            value={draft.total_qty}
            onChange={(e) => setDraft((d) => ({ ...d, total_qty: Number(e.target.value) }))}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            min={tier.sold_qty}
            max="20000"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
          />
          Active (visible & buyable)
        </label>
        {dirty && (
          <button
            onClick={() => onChange(draft)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-sm font-bold bg-primary text-primary-foreground"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        )}
      </div>
    </div>
  );
};

export default StudioEventEdit;
