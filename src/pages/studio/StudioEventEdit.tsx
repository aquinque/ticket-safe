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
  ExternalLink,
  Save,
  Image as ImageIcon,
  Palette,
  Tag,
  Type,
  FileText,
  Pencil,
  QrCode,
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
  max_tickets_per_buyer: number | null;
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
    // Check organizer has Stripe Connect ready. If not, allow publishing
    // anyway with explicit confirmation — the event will be visible to
    // visitors but the public Buy button stays disabled until Stripe
    // flips charges_enabled to true via the account.updated webhook.
    const { data: stripe } = await supabase
      .from("stripe_accounts")
      .select("charges_enabled, payouts_enabled, onboarding_status")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (!stripe?.charges_enabled) {
      const confirmed = window.confirm(
        "Your Stripe account is not yet fully approved (status: " +
          (stripe?.onboarding_status ?? "not started") +
          ").\n\nYou can publish the event for preview, but buyers will see a " +
          "'payments unavailable' notice until Stripe activates your account.\n\nPublish anyway?",
      );
      if (!confirmed) return;
    }
    await updateEventField({ status: "published", published_at: new Date().toISOString() });
    // Notify the organizer by email that their event is live (best-effort).
    if (organizer) {
      supabase.functions
        .invoke("organizer-notify", {
          body: { kind: "event_published", organizer_id: organizer.id, event_id: event.id },
        })
        .catch((err) => console.warn("[studio-event-edit] publish notify failed:", err));
    }
  };

  const unpublish = () => updateEventField({ status: "draft" });

  const cancelEvent = async () => {
    if (!event) return;
    const paidCount = orders.filter((o) => o.status === "paid").length;
    const warning = paidCount > 0
      ? `This event has ${paidCount} paid order${paidCount > 1 ? "s" : ""}. Cancelling will issue full refunds (including the 5% platform fee) to every buyer. This cannot be undone.`
      : "Cancel this event? Buyers will not see it anymore.";
    if (!window.confirm(warning)) return;
    const reason = window.prompt("Reason for cancellation (shown to buyers in the refund email):") || "";

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-event", {
        body: { event_id: event.id, reason },
      });
      if (error || !data?.ok) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not cancel.");
        return;
      }
      const c = (data as { refunded_count?: number; refunded_total_cents?: number; failures?: unknown[] }).refunded_count ?? 0;
      const failedCount = ((data as { failures?: unknown[] }).failures ?? []).length;
      toast.success(
        failedCount > 0
          ? `Event cancelled. ${c} refund${c !== 1 ? "s" : ""} issued, ${failedCount} need manual review.`
          : `Event cancelled. ${c} buyer${c !== 1 ? "s" : ""} refunded.`,
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

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
                {event.status === "published" && (
                  <Link
                    to={`/organizer/scan?event_id=${event.id}`}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-white/15 backdrop-blur border border-white/30 text-white hover:bg-white/25"
                    title="Open the door scanner with this event pre-selected"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Scan tickets
                  </Link>
                )}
                {event.status !== "cancelled" && (
                  <button
                    onClick={cancelEvent}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-red-500/20 backdrop-blur border border-red-200/40 text-white hover:bg-red-500/30"
                    title="Cancel event and refund all buyers"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Cancel event
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Editable event details (draft only) */}
          <EventDetailsEditor
            event={event}
            onSaved={(patch) => setEvent({ ...event, ...patch })}
            disabled={event.status !== "draft"}
            userId={user?.id ?? ""}
          />

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

          {/* Per-buyer limit — editable at any status (only affects new purchases) */}
          <PerBuyerLimitControl event={event} onSaved={(patch) => setEvent({ ...event, ...patch })} />

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

const PerBuyerLimitControl = ({
  event,
  onSaved,
}: {
  event: EventRow;
  onSaved: (patch: Partial<EventRow>) => void;
}) => {
  const [enabled, setEnabled] = useState<boolean>(event.max_tickets_per_buyer != null);
  const [value, setValue] = useState<string>(String(event.max_tickets_per_buyer ?? 2));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(event.max_tickets_per_buyer != null);
    setValue(String(event.max_tickets_per_buyer ?? 2));
  }, [event.max_tickets_per_buyer]);

  const dirty =
    enabled !== (event.max_tickets_per_buyer != null) ||
    (enabled && parseInt(value, 10) !== event.max_tickets_per_buyer);

  const handleSave = async () => {
    setSaving(true);
    const n = parseInt(value, 10);
    const next = enabled && Number.isFinite(n) && n >= 1 && n <= 50 ? n : null;
    const { error } = await supabase
      .from("events")
      .update({ max_tickets_per_buyer: next })
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved({ max_tickets_per_buyer: next });
    toast.success(next ? `Limit set to ${next} per buyer` : "Limit removed");
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
      <div className="flex items-start gap-3 mb-3">
        <Users className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h2 className="text-lg font-bold leading-tight">Tickets per buyer</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cap how many tickets a single buyer can purchase across all tiers of this event. Useful for galas / sold-out events.
            Changes only affect future purchases.
          </p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enforce a maximum
      </label>
      {enabled && (
        <div className="flex items-center gap-3 mb-3">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            min="1"
            max="50"
          />
          <span className="text-sm text-muted-foreground">max tickets per person</span>
        </div>
      )}
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 min-h-[36px] rounded-lg text-sm font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      )}
    </section>
  );
};

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Convert an ISO timestamp to a value compatible with <input type="datetime-local">. */
const toDatetimeLocal = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  // Pad each part to 2 digits in the user's local timezone (which is what
  // datetime-local expects).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const EventDetailsEditor = ({
  event,
  onSaved,
  disabled,
  userId,
}: {
  event: EventRow;
  onSaved: (patch: Partial<EventRow>) => void;
  disabled: boolean;
  userId: string;
}) => {
  const [open, setOpen] = useState(!disabled);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [date, setDate] = useState(toDatetimeLocal(event.date));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(event.ends_at));
  const [location, setLocation] = useState(event.location ?? "");
  const [category, setCategory] = useState(event.category ?? "party");
  const [primaryColor, setPrimaryColor] = useState(event.primary_color ?? "#003399");
  const [slug, setSlug] = useState(event.slug ?? "");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(event.banner_url ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep form synced if the parent re-renders with new event data
  useEffect(() => {
    setTitle(event.title);
    setDescription(event.description ?? "");
    setDate(toDatetimeLocal(event.date));
    setEndsAt(toDatetimeLocal(event.ends_at));
    setLocation(event.location ?? "");
    setCategory(event.category ?? "party");
    setPrimaryColor(event.primary_color ?? "#003399");
    setSlug(event.slug ?? "");
    setBannerPreview(event.banner_url ?? null);
    setBannerFile(null);
  }, [event]);

  const onBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Banner image must be under 5 MB.");
      return;
    }
    setBannerFile(f);
    setBannerPreview(URL.createObjectURL(f));
  };

  const validate = (): string | null => {
    if (title.trim().length < 3) return "Title must be at least 3 characters.";
    if (!date) return "Pick a start date and time.";
    if (endsAt && new Date(endsAt) <= new Date(date)) return "End date must be after the start.";
    if (slug.length < 3 || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug))
      return "Slug must be 3+ chars, lowercase letters, numbers, dashes.";
    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) return "Primary color must be a hex like #003399.";
    return null;
  };

  const handleSave = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      // Upload a new banner if the user picked one
      let bannerUrl = event.banner_url;
      if (bannerFile && userId) {
        const ext = bannerFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${userId}/banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("organizer-assets")
          .upload(path, bannerFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw new Error(`Banner upload failed: ${upErr.message}`);
        const { data: pub } = supabase.storage.from("organizer-assets").getPublicUrl(path);
        bannerUrl = pub.publicUrl;
      }

      // Check slug uniqueness if it changed
      let finalSlug = slug;
      if (finalSlug !== event.slug) {
        const { data: clash } = await supabase
          .from("events")
          .select("id")
          .eq("slug", finalSlug)
          .neq("id", event.id)
          .maybeSingle();
        if (clash) {
          setError("This public URL is already taken. Try another.");
          return;
        }
      }

      const patch: Partial<EventRow> = {
        title: title.trim(),
        description: description.trim() || null,
        date: new Date(date).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        location: location.trim() || null,
        category,
        primary_color: primaryColor.toUpperCase(),
        slug: finalSlug,
        banner_url: bannerUrl,
      };

      const { error: updErr } = await supabase
        .from("events")
        .update(patch)
        .eq("id", event.id);
      if (updErr) throw updErr;

      onSaved(patch);
      setBannerFile(null);
      toast.success("Event details saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // If the event is published, don't surface the editor at all — most fields
  // shouldn't move once tickets are on sale. Organizers can still edit tiers below.
  if (disabled) return null;

  return (
    <section className="bg-card border border-border rounded-2xl mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 md:px-6 py-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Pencil className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Edit event details</h2>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
            Draft
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="px-5 md:px-6 pb-6 space-y-4 border-t border-border pt-5">
          <Field label="Event title" icon={Type}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="ts-edit"
              maxLength={120}
            />
          </Field>

          <Field label="Short description" icon={FileText} hint="2-3 sentences shown above the buy button.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="ts-edit min-h-[100px]"
              maxLength={1000}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Start date & time" icon={Calendar}>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ts-edit"
              />
            </Field>
            <Field label="End date & time (optional)" icon={Calendar}>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="ts-edit"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Location" icon={MapPin}>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="ts-edit"
                placeholder="Pavillon d'Armenonville, Paris"
                maxLength={200}
              />
            </Field>
            <Field label="Category" icon={Tag}>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="ts-edit">
                <option value="party">Party</option>
                <option value="gala">Gala</option>
                <option value="conference">Conference</option>
                <option value="sports">Sports</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>

          <Field label="Primary color" icon={Palette}>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-12 rounded-lg border border-border cursor-pointer"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                className="ts-edit flex-1 font-mono uppercase"
                maxLength={7}
              />
            </div>
          </Field>

          <Field label="Banner image" icon={ImageIcon} hint="16:9 recommended. Max 5 MB.">
            {bannerPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={bannerPreview} alt="Banner preview" className="w-full aspect-[16/9] object-cover" />
                <label className="absolute top-2 right-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold cursor-pointer">
                  <Pencil className="w-3 h-3" />
                  Replace
                  <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center aspect-[16/9] rounded-xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:border-primary/50">
                <ImageIcon className="w-7 h-7 text-muted-foreground mb-1" />
                <span className="text-sm font-semibold text-muted-foreground">Click to upload banner</span>
                <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
              </label>
            )}
          </Field>

          <Field
            label="Public URL slug"
            icon={Tag}
            hint={`https://ticket-safe.eu/e/${slug || "your-slug"}`}
          >
            <input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="ts-edit font-mono"
              maxLength={60}
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>

          <style>{`
            .ts-edit { width: 100%; padding: 12px 14px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--background)); font-size: 16px; line-height: 1.4; color: hsl(var(--foreground)); transition: border-color .15s, box-shadow .15s; }
            .ts-edit:focus { outline: none; border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }
          `}</style>
        </div>
      )}
    </section>
  );
};

const Field = ({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon?: typeof Calendar;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5">
      {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
      {label}
    </label>
    {children}
    {hint ? <p className="text-xs text-muted-foreground mt-1.5">{hint}</p> : null}
  </div>
);

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
