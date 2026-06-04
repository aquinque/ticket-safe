import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  Plus,
  ArrowRight,
  Users,
  TrendingUp,
  Eye,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Banknote,
  QrCode,
  Settings,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { supabase } from "@/integrations/supabase/client";

interface StudioEvent {
  id: string;
  title: string;
  date: string;
  location: string | null;
  status: "draft" | "published" | "cancelled" | "sold_out" | null;
  slug: string | null;
  banner_url: string | null;
  primary_color: string | null;
  sold_count: number;
  total_capacity: number;
  revenue_cents: number;
}

interface StripeStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  onboarding_status: string | null;
}

const StudioDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [onboardingStripe, setOnboardingStripe] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Stripe Connect status — fetched once when organizer is loaded
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stripe_accounts")
        .select("charges_enabled, payouts_enabled, onboarding_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setStripe((data as StripeStatus) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, organizer]);

  const startStripeOnboarding = async () => {
    setOnboardingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-onboard-seller", { body: {} });
      if (error || !data?.url) {
        toast.error(error?.message ?? "Could not start Stripe onboarding.");
        return;
      }
      window.location.href = data.url as string;
    } catch (e) {
      toast.error("Could not start Stripe onboarding.");
    } finally {
      setOnboardingStripe(false);
    }
  };

  const openStripeDashboard = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-express-dashboard", { body: {} });
      if (error || !data?.url) {
        toast.error(error?.message ?? "Could not open the payouts dashboard.");
        return;
      }
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Could not open the payouts dashboard.");
    }
  };

  const loadEvents = useCallback(
    async (showSpinner = false) => {
      if (!organizer) {
        setLoadingEvents(false);
        return;
      }
      if (showSpinner) setLoadingEvents(true);

      // Hide cancelled events from the organizer's dashboard list — once an
      // event is killed it should disappear from view. They're still in the DB
      // for refunds and accounting, just not surfaced in the UI.
      const { data: evRows } = await supabase
        .from("events")
        .select("id, title, date, location, status, slug, banner_url, primary_color")
        .eq("organizer_id", organizer.id)
        .neq("status", "cancelled")
        .order("date", { ascending: false });

      const ids = (evRows ?? []).map((e: { id: string }) => e.id);
      let tierAgg: Record<string, { sold: number; total: number; revenue: number }> = {};
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
          {} as Record<string, { sold: number; total: number; revenue: number }>,
        );
      }

      setEvents(
        (evRows ?? []).map((e) => ({
          ...(e as Omit<StudioEvent, "sold_count" | "total_capacity" | "revenue_cents">),
          sold_count: tierAgg[e.id]?.sold ?? 0,
          total_capacity: tierAgg[e.id]?.total ?? 0,
          revenue_cents: tierAgg[e.id]?.revenue ?? 0,
        })),
      );
      setLoadingEvents(false);
    },
    [organizer],
  );

  // Initial load (with spinner)
  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  // Realtime: re-fetch dashboard data on any change to this organizer's
  // events, their tier inventory, or any order tied to them. Cheap because
  // we only re-aggregate on push, not on a poll.
  useEffect(() => {
    if (!organizer) return;
    const channel = supabase
      .channel(`studio-dashboard-${organizer.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `organizer_id=eq.${organizer.id}` },
        () => loadEvents(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_orders", filter: `organizer_id=eq.${organizer.id}` },
        () => loadEvents(false),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers" },
        // event_tiers does not carry organizer_id directly. Filter on the
        // client side by checking the payload's event_id against our known
        // event ids before re-fetching.
        (payload: { new: { event_id?: string } }) => {
          const evId = payload.new?.event_id;
          if (!evId) return;
          if (events.some((e) => e.id === evId)) loadEvents(false);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizer, loadEvents, events]);

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── No application yet ──────────────────────────────────────────────────
  if (!organizer) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Ticket Safe Studio for student event organizers." />
        <Header minimal />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-8 shadow-soft">
            <div
              className="w-14 h-14 rounded-xl mx-auto flex items-center justify-center mb-5"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black mb-2">Apply for Studio</h1>
            <p className="text-sm text-muted-foreground mb-6">
              You need an approved organizer profile to access the Studio dashboard.
            </p>
            <Link
              to="/organizers/apply"
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
            >
              Apply now
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Pending / rejected / suspended ──────────────────────────────────────
  if (organizer.status !== "approved") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Application status" />
        <Header minimal />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-8 shadow-soft">
            <div className="w-14 h-14 rounded-xl mx-auto flex items-center justify-center mb-5 bg-primary/10">
              {organizer.status === "pending" ? (
                <Clock className="w-7 h-7 text-primary" />
              ) : (
                <AlertCircle className="w-7 h-7 text-destructive" />
              )}
            </div>
            <h1 className="text-2xl font-black mb-2">
              {organizer.status === "pending" && "Application under review"}
              {organizer.status === "rejected" && "Application not approved"}
              {organizer.status === "suspended" && "Account suspended"}
            </h1>
            <p className="text-sm text-muted-foreground mb-2">
              {organizer.status === "pending" &&
                "We'll get back to you at " + organizer.contact_email + " within 24 hours."}
              {organizer.status === "rejected" &&
                (organizer.rejection_reason || "Please contact support for more details.")}
              {organizer.status === "suspended" &&
                "Please contact support to resolve this issue."}
            </p>
            <Link
              to="/contact"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Contact support
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Approved organizer dashboard ────────────────────────────────────────
  const stats = events.reduce(
    (acc, e) => ({
      sold: acc.sold + e.sold_count,
      revenue: acc.revenue + e.revenue_cents,
      published: acc.published + (e.status === "published" ? 1 : 0),
    }),
    { sold: 0, revenue: 0, published: 0 },
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title={`${organizer.name} · Studio`} description="Ticket Safe Studio dashboard" />
      <Header minimal />

      <main className="flex-1">
        {/* ===== Header strip ===== */}
        <section
          className="text-white"
          style={{
            background: `linear-gradient(135deg, ${organizer.primary_color}, hsl(210 100% 45%))`,
          }}
        >
          <div className="container mx-auto px-4 py-8 md:py-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="flex items-center gap-4">
                {organizer.logo_url ? (
                  <img
                    src={organizer.logo_url}
                    alt={organizer.name}
                    className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover bg-white/10"
                  />
                ) : (
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center font-black text-2xl">
                    {organizer.name[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] font-bold text-white/80">
                    Studio dashboard
                  </div>
                  <h1 className="text-2xl md:text-3xl font-black leading-tight inline-flex items-center gap-2">
                    {organizer.name}
                    <Link
                      to="/studio/profile"
                      title="Edit organizer profile"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 backdrop-blur hover:bg-white/25 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </Link>
                  </h1>
                </div>
              </div>
              <Link
                to="/studio/events/new"
                className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New event
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 md:gap-5 mt-6 md:mt-8">
              <StatCard icon={Calendar} label="Published events" value={String(stats.published)} />
              <StatCard icon={Users} label="Tickets sold" value={String(stats.sold)} />
              <StatCard icon={TrendingUp} label="Revenue" value={`€${(stats.revenue / 100).toFixed(0)}`} />
            </div>
          </div>
        </section>

        {/* ===== Payouts setup banner (informational — not a sale blocker) =====
            The organizer can publish + sell without Stripe Connect. The banner
            only nudges them to set it up so we have a destination when payout
            time comes (24h after each event ends). */}
        {stripe && !stripe.charges_enabled && stats.revenue > 0 && (
          <section className="container mx-auto px-4 pt-6 md:pt-8 max-w-5xl">
            <div className="flex flex-col md:flex-row md:items-center gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm md:text-base text-emerald-900">
                  €{(stats.revenue / 100).toFixed(2)} pending payout
                </div>
                <div className="text-xs md:text-sm text-emerald-800">
                  Connect your bank with Stripe to receive your earnings. Funds are released 24h after each event ends. Takes about 2 minutes.
                </div>
              </div>
              <button
                onClick={startStripeOnboarding}
                disabled={onboardingStripe}
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 shrink-0"
              >
                {onboardingStripe ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Get paid
              </button>
            </div>
          </section>
        )}

        {/* ===== Everything in one place panel ===== */}
        <section className="container mx-auto px-4 pt-6 md:pt-8 max-w-5xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-bold">Everything in one place</h2>
            <span className="text-xs text-muted-foreground">Quick actions</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction
              icon={Plus}
              label="New event"
              hint="Create a branded event"
              to="/studio/events/new"
              accent={organizer.primary_color}
            />
            <QuickAction
              icon={QrCode}
              label="Door scan"
              hint="Validate tickets at entry"
              to="/organizer/scan"
              accent={organizer.primary_color}
            />
            <QuickAction
              icon={Banknote}
              label="Payouts"
              hint={stripe?.charges_enabled ? "Stripe Connect — ready" : "Finish onboarding"}
              onClick={stripe?.charges_enabled ? openStripeDashboard : startStripeOnboarding}
              accent={organizer.primary_color}
              status={stripe?.charges_enabled ? "ready" : "pending"}
            />
            <QuickAction
              icon={Repeat2}
              label="Resale"
              hint="Built-in for your buyers"
              to="/resale"
              accent={organizer.primary_color}
            />
          </div>
        </section>

        {/* ===== Events list ===== */}
        <section className="container mx-auto px-4 py-8 md:py-10 max-w-5xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl md:text-2xl font-bold">Your events</h2>
          </div>

          {loadingEvents ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <EmptyEvents />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

const QuickAction = ({
  icon: Icon,
  label,
  hint,
  to,
  onClick,
  external,
  accent,
  status,
}: {
  icon: typeof Calendar;
  label: string;
  hint: string;
  to?: string;
  onClick?: () => void;
  external?: boolean;
  accent?: string;
  status?: "ready" | "pending";
}) => {
  const content = (
    <div className="flex flex-col h-full bg-card border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-soft transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
          style={{ background: accent || "var(--gradient-hero)" }}
        >
          <Icon className="w-5 h-5" />
        </div>
        {status === "ready" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Ready
          </span>
        )}
        {status === "pending" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" />
            Action
          </span>
        )}
      </div>
      <div className="font-bold text-sm text-foreground leading-tight">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      <div className="mt-auto pt-3 inline-flex items-center text-[11px] font-bold text-primary group-hover:gap-1.5 gap-1 transition-all">
        Open
        <ArrowRight className="w-3 h-3" />
      </div>
    </div>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="text-left h-full">
        {content}
      </button>
    );
  }
  if (to && external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className="h-full">
        {content}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} className="h-full">
        {content}
      </Link>
    );
  }
  return content;
};

const StatCard = ({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) => (
  <div className="bg-white/15 backdrop-blur rounded-xl px-3 py-3 md:px-4 md:py-4 border border-white/20">
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-80" />
      <span className="text-[10px] md:text-xs uppercase tracking-wider font-bold opacity-80">{label}</span>
    </div>
    <div className="text-xl md:text-3xl font-black">{value}</div>
  </div>
);

const EmptyEvents = () => (
  <div className="text-center py-12 bg-card border border-dashed border-border rounded-2xl">
    <div className="inline-flex w-12 h-12 rounded-xl bg-muted items-center justify-center mb-3">
      <Calendar className="w-6 h-6 text-muted-foreground" />
    </div>
    <h3 className="font-bold mb-1">No events yet</h3>
    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
      Create your first event and start selling tickets in minutes.
    </p>
    <Link
      to="/studio/events/new"
      className="inline-flex items-center justify-center gap-2 px-4 min-h-[40px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover"
    >
      <Plus className="w-4 h-4" />
      Create event
    </Link>
  </div>
);

const EventRow = ({ event }: { event: StudioEvent }) => {
  const soldPct = event.total_capacity > 0 ? Math.round((event.sold_count / event.total_capacity) * 100) : 0;
  const statusColor =
    event.status === "published"
      ? "bg-green-100 text-green-700"
      : event.status === "draft"
      ? "bg-amber-100 text-amber-700"
      : event.status === "cancelled"
      ? "bg-red-100 text-red-700"
      : "bg-muted text-muted-foreground";

  return (
    <Link
      to={`/studio/events/${event.id}`}
      className="block bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-soft transition-all"
    >
      <div className="h-24 relative" style={{ background: event.primary_color ?? "var(--gradient-hero)" }}>
        {event.banner_url && (
          <img src={event.banner_url} alt="" className="w-full h-full object-cover" />
        )}
        <span
          className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}`}
        >
          {event.status ?? "draft"}
        </span>
      </div>
      <div className="p-4">
        <div className="font-bold text-base text-foreground mb-1 line-clamp-1">{event.title}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
          <Calendar className="w-3 h-3" />
          {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          {event.location ? <> · {event.location}</> : null}
        </div>
        {event.total_capacity > 0 ? (
          <div className="mb-2">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, soldPct)}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>
                {event.sold_count}/{event.total_capacity} sold
              </span>
              <span>€{(event.revenue_cents / 100).toFixed(0)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mb-2">No tiers yet — add tiers to start selling.</div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Eye className="w-3 h-3" /> View
          </span>
          {event.slug && event.status === "published" && (
            <a
              href={`/e/${event.slug}`}
              onClick={(ev) => ev.stopPropagation()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
            >
              Open public page
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
};

export default StudioDashboard;
