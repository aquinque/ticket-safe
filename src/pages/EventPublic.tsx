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
  ShieldCheck,
  Building2,
  Check,
  Sparkles,
  Mail,
  Flame,
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
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-white/75">
              Powered by Ticket Safe
            </div>
          </Link>

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
                        <div className="font-bold text-base md:text-lg leading-tight flex items-center gap-2">
                          {t.name}
                          {lowStock && !locked && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <Flame className="w-2.5 h-2.5" />
                              Going fast
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <div className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                            {t.description}
                          </div>
                        )}
                        <div className={`text-[11px] font-semibold mt-2 ${lowStock ? "text-amber-700" : "text-muted-foreground"}`}>
                          {soldOut
                            ? "Sold out"
                            : lowStock
                            ? `Only ${t.available_qty} left!`
                            : `${t.available_qty} left`}
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

          {/* ===== Checkout panel — appears when a tier is selected ===== */}
          {selected && (
            <section className="bg-card border-2 rounded-2xl p-5 md:p-7 mb-5 shadow-md animate-in fade-in slide-in-from-bottom-3 duration-300"
              style={{ borderColor: `${primary}33` }}
            >
              <div className="flex items-center gap-2 mb-5">
                <h2 className="text-lg md:text-xl font-bold">Your order</h2>
              </div>

              {/* Quantity row */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold">Quantity</div>
                  {maxPerBuyer != null && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Max {maxPerBuyer} per person
                    </div>
                  )}
                </div>
                <div className="inline-flex items-center gap-3">
                  <button
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    className="w-10 h-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted hover:border-primary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={qty <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-black tabular-nums">{qty}</span>
                  <button
                    onClick={() =>
                      setQty((n) => {
                        const hardCap = Math.min(10, selected.available_qty);
                        const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                        return Math.min(finalCap, n + 1);
                      })
                    }
                    className="w-10 h-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted hover:border-primary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={
                      qty >= Math.min(10, selected.available_qty) ||
                      (maxPerBuyer != null && qty >= maxPerBuyer)
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Attendees */}
              <div className="space-y-2.5 mb-5 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {qty > 1 ? `Attendee details · ${qty}` : "Your details"}
                  </div>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    QR sent here
                  </span>
                </div>
                {attendees.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white"
                        style={{ background: primary }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/70">
                        Ticket {i + 1}
                      </span>
                      {i === 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
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

              {/* Price breakdown — total is the visual hero */}
              <div className="rounded-xl bg-muted/40 p-4 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">
                    {selected.name} × {qty}
                  </span>
                  <span className="tabular-nums">€{(totalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm mb-3 pb-3 border-b border-border">
                  <span className="text-muted-foreground">Platform fee (5%)</span>
                  <span className="tabular-nums">€{(feeCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Total</span>
                  <span className="text-3xl md:text-4xl font-black tabular-nums" style={{ color: primary }}>
                    €{(grandCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Trust signals row */}
              <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                <div className="flex flex-col items-center gap-1 p-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-semibold leading-tight text-muted-foreground">Secure<br />by Stripe</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-semibold leading-tight text-muted-foreground">Instant<br />QR delivery</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-2">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-semibold leading-tight text-muted-foreground">Refund if<br />cancelled</span>
                </div>
              </div>

              {/* Big CTA */}
              <button
                onClick={handleBuy}
                disabled={buying}
                className="group w-full inline-flex items-center justify-center gap-2 min-h-[56px] px-6 rounded-xl font-bold text-white text-base md:text-lg disabled:opacity-60 transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: `linear-gradient(135deg, ${primary}, hsl(210 100% 45%))`,
                  boxShadow: `0 8px 24px ${primary}40`,
                }}
              >
                {buying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Opening secure checkout…
                  </>
                ) : (
                  <>
                    Get my ticket{qty > 1 ? "s" : ""} — €{(grandCents / 100).toFixed(2)}
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
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

      {/* ===== Sticky mobile checkout bar — always visible when tier selected ===== */}
      {selected && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-4 py-3 animate-in slide-in-from-bottom-2 duration-300">
          <div className="container mx-auto max-w-4xl flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {qty} × {selected.name}
              </div>
              <div className="text-xl font-black tabular-nums leading-tight" style={{ color: primary }}>
                €{(grandCents / 100).toFixed(2)}
              </div>
            </div>
            <button
              onClick={handleBuy}
              disabled={buying}
              className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-5 rounded-xl font-bold text-white disabled:opacity-60 transition-all"
              style={{
                background: `linear-gradient(135deg, ${primary}, hsl(210 100% 45%))`,
                boxShadow: `0 4px 12px ${primary}40`,
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
