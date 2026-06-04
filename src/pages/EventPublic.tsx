import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Clock,
  Loader2,
  Ticket,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Check,
  Sparkles,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  ends_at: string | null;
  location: string | null;
  category: string | null;
  slug: string;
  status: string;
  primary_color: string;
  banner_url: string | null;
  logo_url: string | null;
  organizer_user_id?: string | null;
  organizer: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    website: string | null;
  } | null;
}

interface TierAvailability {
  tier_id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  total_qty: number;
  sold_qty: number;
  available_qty: number;
  sort_order: number;
  description?: string | null;
  is_active: boolean;
}

const EventPublic = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [tiers, setTiers] = useState<TierAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [maxPerBuyer, setMaxPerBuyer] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<{ first_name: string; last_name: string; email: string }[]>([]);

  // Keep the attendees array sized to the current quantity. When quantity grows,
  // we add empty slots; when it shrinks, we trim. The first slot auto-fills from
  // the signed-in user once on first render.
  useEffect(() => {
    setAttendees((prev) => {
      const next = prev.slice(0, qty);
      while (next.length < qty) next.push({ first_name: "", last_name: "", email: "" });
      if (user && next[0] && !next[0].email) {
        const meta = (user.user_metadata as { full_name?: string } | undefined) ?? {};
        const fullName = (meta.full_name ?? "").trim();
        const parts = fullName.split(/\s+/);
        next[0] = {
          first_name: parts[0] ?? "",
          last_name: parts.slice(1).join(" "),
          email: user.email ?? "",
        };
      }
      return next;
    });
  }, [qty, user]);

  const updateAttendee = (i: number, patch: Partial<{ first_name: string; last_name: string; email: string }>) => {
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);

    const { data: ev } = await supabase
      .from("events")
      .select(
        `id, title, description, date, ends_at, location, category, slug, status, primary_color, banner_url, logo_url, organizer_id, max_tickets_per_buyer,
         organizer:organizer_profiles!events_organizer_id_fkey(id, user_id, name, slug, logo_url, primary_color, website)`,
      )
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (!ev) {
      setEvent(null);
      setLoading(false);
      return;
    }

    const orgRaw = (ev as { organizer: unknown }).organizer;
    const organizer = Array.isArray(orgRaw)
      ? (orgRaw[0] as PublicEvent["organizer"] & { user_id?: string })
      : (orgRaw as (PublicEvent["organizer"] & { user_id?: string }) | null);

    setEvent({
      ...(ev as Omit<PublicEvent, "organizer">),
      organizer,
    } as PublicEvent);

    const evCast = ev as { max_tickets_per_buyer?: number | null };
    setMaxPerBuyer(evCast.max_tickets_per_buyer ?? null);

    // Payments always go through the platform Stripe account now — no need
    // to check the organizer's Connect readiness up-front. Payouts are
    // settled separately after the event ends.

    // tier_inventory is a VIEW (no FK), so we can't ask PostgREST to embed
    // event_tiers.description here — the embed returns zero rows and the page
    // falls into the empty "Tickets will be on sale soon" state even when the
    // event has active tiers. Read the view flat, then enrich descriptions
    // with a second tiny query against event_tiers.
    const { data: tr, error: trErr } = await supabase
      .from("tier_inventory")
      .select("*")
      .eq("event_id", (ev as { id: string }).id);
    if (trErr) console.warn("[event-public] tier_inventory query:", trErr);

    const { data: tdesc } = await supabase
      .from("event_tiers")
      .select("id, description")
      .eq("event_id", (ev as { id: string }).id);

    const descMap = new Map(
      (tdesc ?? []).map((d: { id: string; description: string | null }) => [d.id, d.description]),
    );

    setTiers(
      ((tr as TierAvailability[]) ?? [])
        .filter((t) => t.is_active)
        .map((t) => ({ ...t, description: descMap.get(t.tier_id) ?? null }))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime tier availability
  useEffect(() => {
    if (!event?.id) return;
    const ch = supabase
      .channel(`event-public-${event.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers", filter: `event_id=eq.${event.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [event?.id, load]);

  const handleBuy = async () => {
    if (!selectedTier) return;
    if (!user) {
      navigate(`/auth?mode=signup&next=/e/${slug}`);
      return;
    }
    // Validate the nominative form before opening Stripe — the server will
    // re-validate (defense in depth) but a clear inline error is friendlier.
    for (let i = 0; i < attendees.length; i++) {
      const a = attendees[i];
      if (!a.first_name.trim() || !a.last_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) {
        toast.error(`Fill in the holder's first name, last name and email for ticket ${i + 1}.`);
        return;
      }
    }
    setBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke("studio-create-checkout", {
        body: { tier_id: selectedTier, quantity: qty, attendees },
      });
      if (error || !data?.url) {
        console.error("[event-public] checkout error:", error, data);
        toast.error(
          (data as { error?: string })?.error ??
            error?.message ??
            "Could not start the checkout. Please try again.",
        );
        return;
      }
      window.location.href = data.url as string;
    } catch (e) {
      console.error("[event-public] checkout exception:", e);
      toast.error("Could not start the checkout. Please try again.");
    } finally {
      setBuying(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-black mb-2">Event not found</h1>
          <p className="text-sm text-muted-foreground mb-5">
            This event may have been unpublished or the link is incorrect.
          </p>
          <Link to="/tickets" className="inline-flex items-center gap-1.5 text-primary font-bold">
            Browse all events
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const primary = event.primary_color || event.organizer?.primary_color || "#003399";
  const selected = tiers.find((t) => t.tier_id === selectedTier) ?? null;
  const totalCents = selected ? selected.price_cents * qty : 0;
  const feeCents = Math.round(totalCents * 0.05);
  const grandCents = totalCents + feeCents;

  return (
    <div
      className="min-h-screen flex flex-col bg-background"
      style={{ ["--studio-primary" as string]: primary }}
    >
      <SEOHead
        title={`${event.title} — ${event.organizer?.name ?? "Ticket Safe"}`}
        description={event.description ?? `Tickets for ${event.title}`}
        image={event.banner_url ?? event.organizer?.logo_url ?? null}
        type="event"
        url={`https://ticket-safe.eu/e/${event.slug}`}
      />

      {/* ===== Branded hero ===== */}
      <section
        className="relative text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primary}, hsl(210 100% 45%))` }}
      >
        {event.banner_url && (
          <img
            src={event.banner_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-25"
          />
        )}
        {/* Subtle radial glow for depth */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 20%, rgba(255,255,255,.20), transparent 40%), radial-gradient(circle at 80% 75%, rgba(255,255,255,.10), transparent 45%)",
          }}
        />
        <div className="relative container mx-auto px-4 pt-10 pb-12 md:pt-14 md:pb-16 max-w-4xl">
          {/* Top row: back arrow (left) + Powered-by chip (right). Lets buyers
              who land here from a story / link feel they can step out instead
              of being trapped in the page. Uses history.back when available,
              falls back to /tickets so direct visitors still get somewhere
              useful. */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate("/tickets");
              }}
              className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/25 hover:bg-white/25 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4 text-white transition-transform group-hover:-translate-x-0.5" />
              <span className="text-xs font-bold text-white">Back</span>
            </button>
            <Link to="/" className="hidden sm:block">
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-white/70 hover:text-white/90 transition-colors">
                Powered by Ticket Safe
              </span>
            </Link>
          </div>

          {event.organizer && (
            <div className="inline-flex items-center gap-2.5 mb-5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/25">
              {event.organizer.logo_url ? (
                <img
                  src={event.organizer.logo_url}
                  alt={event.organizer.name}
                  className="w-6 h-6 rounded-full bg-white/10 object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-black">
                  {event.organizer.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="text-xs font-semibold leading-none">
                {event.organizer.name}
              </div>
            </div>
          )}

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-5">
            {event.title}
          </h1>

          <div className="flex items-center gap-2 flex-wrap text-sm md:text-base text-white/95">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/15">
              <Calendar className="w-4 h-4" />
              {new Date(event.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/15">
                <MapPin className="w-4 h-4" />
                {event.location}
              </span>
            )}
            {event.ends_at && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/15 opacity-90">
                <Clock className="w-3.5 h-3.5" />
                Ends {new Date(event.ends_at).toLocaleString("en-GB", { timeStyle: "short" })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* pb-32 leaves room for the mobile sticky checkout bar so nothing is hidden behind it */}
      <main className="flex-1 -mt-6 md:-mt-10 relative z-10 pb-32 lg:pb-0">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* ===== Ticket picker — the hero of this page ===== */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${primary}15` }}>
                  <Ticket className="w-5 h-5" style={{ color: primary }} />
                </div>
                <h2 className="text-lg md:text-xl font-bold">Pick your ticket</h2>
              </div>
              {tiers.length > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {tiers.length} option{tiers.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {tiers.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Sparkles className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                Tickets will be on sale soon. Come back shortly.
              </div>
            ) : (
              <div className="space-y-3">
                {tiers.map((t) => {
                  const isSelected = selectedTier === t.tier_id;
                  const soldOut = t.available_qty <= 0;
                  const locked = soldOut;
                  const lowStock = !soldOut && t.available_qty <= 5;
                  return (
                    <button
                      key={t.tier_id}
                      onClick={() => {
                        if (locked) return;
                        setSelectedTier(t.tier_id);
                        setQty(1);
                      }}
                      disabled={locked}
                      className={`group relative w-full text-left p-4 md:p-5 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                        locked
                          ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                          : isSelected
                          ? "shadow-md scale-[1.01]"
                          : "border-border hover:border-primary/50 hover:shadow-sm"
                      }`}
                      style={
                        isSelected && !locked
                          ? ({
                              borderColor: primary,
                              background: `${primary}0d`,
                              boxShadow: `0 0 0 4px ${primary}1a`,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {/* Selected check chip */}
                      {isSelected && !locked && (
                        <div
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md"
                          style={{ background: primary }}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-base md:text-lg leading-tight">
                          {t.name}
                        </div>
                        {t.description && (
                          <div className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                            {t.description}
                          </div>
                        )}
                        <div className={`text-[11px] font-medium mt-2 inline-flex items-center gap-1.5 ${lowStock ? "text-amber-700" : "text-muted-foreground"}`}>
                          {lowStock && !soldOut && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                          )}
                          {soldOut
                            ? "Sold out"
                            : `${t.available_qty} ${t.available_qty === 1 ? "ticket" : "tickets"} available`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl md:text-3xl font-black tracking-tight" style={{ color: locked ? "currentColor" : primary }}>
                          €{(t.price_cents / 100).toFixed(2)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ===== Checkout panel — appears when a tier is selected =====
              Designed to feel like Stripe Checkout / Apple Pay — sober,
              typography-driven, confident. No gradient swirls, no playful
              chips, no emoji. Adult-grade. */}
          {selected && (
            <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-baseline justify-between mb-6 pb-5 border-b border-border">
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Checkout</h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {selected.name}
                </span>
              </div>

              {/* Quantity row */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm font-semibold text-foreground">Quantity</div>
                  {maxPerBuyer != null && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {maxPerBuyer} per person max.
                    </div>
                  )}
                </div>
                <div className="inline-flex items-center gap-3">
                  <button
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center text-base font-semibold tabular-nums">{qty}</span>
                  <button
                    onClick={() =>
                      setQty((n) => {
                        const hardCap = Math.min(10, selected.available_qty);
                        const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                        return Math.min(finalCap, n + 1);
                      })
                    }
                    className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={
                      qty >= Math.min(10, selected.available_qty) ||
                      (maxPerBuyer != null && qty >= maxPerBuyer)
                    }
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Attendees — sober form, no playful chips */}
              <div className="space-y-4 mb-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    {qty > 1 ? "Ticket holders" : "Your details"}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {qty > 1 ? "One per ticket" : "Where the QR is sent"}
                  </span>
                </div>
                {attendees.map((a, i) => (
                  <div key={i} className="space-y-2">
                    {qty > 1 && (
                      <div className="text-xs font-medium text-muted-foreground">
                        Ticket {i + 1} of {qty}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={a.first_name}
                        onChange={(e) => updateAttendee(i, { first_name: e.target.value })}
                        placeholder="First name"
                        className="ts-attendee"
                        maxLength={100}
                      />
                      <input
                        value={a.last_name}
                        onChange={(e) => updateAttendee(i, { last_name: e.target.value })}
                        placeholder="Last name"
                        className="ts-attendee"
                        maxLength={100}
                      />
                    </div>
                    <input
                      type="email"
                      value={a.email}
                      onChange={(e) => updateAttendee(i, { email: e.target.value })}
                      placeholder="Email"
                      className="ts-attendee w-full"
                      maxLength={254}
                    />
                  </div>
                ))}
              </div>

              {/* Price breakdown — clean ledger style */}
              <div className="pt-5 mb-6 border-t border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selected.name} × {qty}
                  </span>
                  <span className="tabular-nums text-foreground">€{(totalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span className="tabular-nums text-foreground">€{(feeCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-3 mt-3 border-t border-border">
                  <span className="text-base font-semibold">Total due</span>
                  <span className="text-2xl md:text-3xl font-semibold tabular-nums tracking-tight" style={{ color: primary }}>
                    €{(grandCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* CTA — flat, mature, no gradient swirls */}
              <button
                onClick={handleBuy}
                disabled={buying}
                className="group w-full inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-lg font-semibold text-white text-base disabled:opacity-60 transition-all hover:shadow-md active:scale-[0.99]"
                style={{
                  background: primary,
                  boxShadow: buying ? "none" : `0 4px 14px ${primary}30`,
                }}
              >
                {buying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening secure checkout
                  </>
                ) : (
                  <>
                    Continue to payment
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              {/* Trust signal — single line, understated */}
              <p className="text-[11px] text-muted-foreground mt-4 text-center inline-flex items-center justify-center gap-1.5 w-full">
                <ShieldCheck className="w-3 h-3" />
                Secured by Stripe. Refundable if the event is cancelled.
              </p>
            </section>
          )}

          {/* Description */}
          {event.description && (
            <section className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-5 shadow-sm">
              <h2 className="text-base md:text-lg font-bold mb-3">About this event</h2>
              <p className="text-sm md:text-base text-foreground/85 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </section>
          )}

          {/* Organizer card */}
          {event.organizer && (
            <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-8 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Organized by</h2>
              </div>
              <div className="flex items-center gap-3">
                {event.organizer.logo_url ? (
                  <img
                    src={event.organizer.logo_url}
                    alt={event.organizer.name}
                    className="w-12 h-12 rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white"
                    style={{ background: event.organizer.primary_color || primary }}
                  >
                    {event.organizer.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{event.organizer.name}</div>
                  {event.organizer.website && (
                    <a
                      href={event.organizer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {event.organizer.website}
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground py-6">
            Powered by{" "}
            <Link to="/" className="font-bold text-primary hover:underline">
              Ticket Safe
            </Link>
            {" · "}
            <Link to="/terms" className="hover:underline">
              Terms
            </Link>
            {" · "}
            <Link to="/privacy" className="hover:underline">
              Privacy
            </Link>
          </div>
        </div>
      </main>

      {/* ===== Sticky mobile checkout bar — sober, matching the main panel ===== */}
      {selected && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-4 py-3 animate-in slide-in-from-bottom-2 duration-300">
          <div className="container mx-auto max-w-4xl flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-muted-foreground truncate">
                {qty} × {selected.name}
              </div>
              <div className="text-lg font-semibold tabular-nums leading-tight tracking-tight" style={{ color: primary }}>
                €{(grandCents / 100).toFixed(2)}
              </div>
            </div>
            <button
              onClick={handleBuy}
              disabled={buying}
              className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 rounded-lg font-semibold text-white text-sm disabled:opacity-60 transition-all hover:shadow-md"
              style={{
                background: primary,
                boxShadow: buying ? "none" : `0 4px 12px ${primary}30`,
              }}
            >
              {buying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ts-attendee {
          padding: 9px 12px;
          border: 1px solid hsl(var(--border));
          border-radius: 10px;
          background: hsl(var(--background));
          font-size: 14px;
          line-height: 1.4;
          color: hsl(var(--foreground));
          transition: border-color .15s, box-shadow .15s;
        }
        .ts-attendee:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
        }
      `}</style>
    </div>
  );
};

export default EventPublic;
