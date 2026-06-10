import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
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
import { AnimatedNumber } from "@/components/AnimatedNumber";
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
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [tiers, setTiers] = useState<TierAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [maxPerBuyer, setMaxPerBuyer] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<{ first_name: string; last_name: string; email: string }[]>([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

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

  // Whether the signed-in user already follows this event's organizer.
  useEffect(() => {
    const orgId = event?.organizer?.id;
    if (!user || !orgId) {
      setFollowing(false);
      return;
    }
    let active = true;
    // organizer_follows isn't in the generated Supabase types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("organizer_follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("organizer_id", orgId)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (active) setFollowing(!!data);
      });
    return () => {
      active = false;
    };
  }, [user, event?.organizer?.id]);

  const handleToggleFollow = async () => {
    const orgId = event?.organizer?.id;
    if (!user) {
      navigate(`/auth?next=/e/${slug}`);
      return;
    }
    if (!orgId) return;
    setFollowBusy(true);
    if (following) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("organizer_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("organizer_id", orgId);
      setFollowing(false);
      toast.success("Unfollowed.");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("organizer_follows")
        .insert({ user_id: user.id, organizer_id: orgId });
      if (!error || error.code === "23505") {
        setFollowing(true);
        toast.success("Following — we'll email you when they publish a new event.");
      } else {
        toast.error("Could not follow. Please try again.");
      }
    }
    setFollowBusy(false);
  };

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

  // Brand identity is non-negotiable: every event uses Ticket Safe blue,
  // regardless of what colour the organizer set on their event/profile.
  // Organizers can still bring their own banner + logo (photos), but colour
  // discipline keeps the buyer experience consistent across the whole
  // platform — and means a default "green" left over from testing never
  // leaks into a buy flow.
  const primary = "#003399";
  const TS_GRADIENT = "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))";
  const selected = tiers.find((t) => t.tier_id === selectedTier) ?? null;
  const totalCents = selected ? selected.price_cents * qty : 0;
  const feeCents = Math.round(totalCents * 0.05);
  const grandCents = totalCents + feeCents;
  // Lowest available price, for the "From €X" hero badge.
  const availablePrices = tiers.filter((t) => t.available_qty > 0).map((t) => t.price_cents);
  const minPriceCents = availablePrices.length ? Math.min(...availablePrices) : null;
  const categoryLabel = event.category
    ? event.category.charAt(0).toUpperCase() + event.category.slice(1)
    : null;

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
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Event",
          name: event.title,
          description: event.description ?? `Tickets for ${event.title}`,
          startDate: event.date,
          ...(event.ends_at ? { endDate: event.ends_at } : {}),
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: event.location
            ? { "@type": "Place", name: event.location, address: event.location }
            : undefined,
          image: event.banner_url ?? event.organizer?.logo_url ?? undefined,
          organizer: event.organizer?.name
            ? {
                "@type": "Organization",
                name: event.organizer.name,
                url: event.organizer.website ?? undefined,
              }
            : undefined,
          offers: tiers
            .filter((t) => t.is_active && (t.total_qty ?? 0) - (t.sold_qty ?? 0) > 0)
            .map((t) => ({
              "@type": "Offer",
              name: t.name,
              price: (t.price_cents / 100).toFixed(2),
              priceCurrency: "EUR",
              availability: "https://schema.org/InStock",
              url: `https://ticket-safe.eu/e/${event.slug}`,
            })),
        }}
      />

      {/* ===== Clean banner + title (Eventbrite/Dice style) =====
          The banner shows in its true 16:9 frame — the exact photo the organizer
          cropped, no extra zoom. The title sits cleanly below, on the page. ===== */}
      <section className="relative">
        <div className="bg-gradient-to-br from-[#02122d] via-[#0a2f73] to-[#0a3a8a]">
          <div className="container mx-auto max-w-4xl sm:px-4 sm:pt-4">
            <div className="relative w-full aspect-[16/9] sm:rounded-2xl overflow-hidden bg-black/20 sm:ring-1 sm:ring-white/10">
              {event.banner_url ? (
                <img
                  src={event.banner_url}
                  alt={event.title}
                  className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: TS_GRADIENT }}>
                  {event.organizer?.logo_url ? (
                    <img src={event.organizer.logo_url} alt={event.organizer.name} className="max-h-[52%] max-w-[58%] object-contain" />
                  ) : (
                    <Ticket className="w-16 h-16 text-white/70" strokeWidth={1.5} />
                  )}
                </div>
              )}

              {/* Top row over the image: back + powered-by */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (location.key && location.key !== "default") navigate(-1);
                    else navigate("/tickets");
                  }}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur ring-1 ring-white/20 hover:bg-black/60 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4 text-white transition-transform group-hover:-translate-x-0.5" />
                  <span className="text-xs font-bold text-white">Back</span>
                </button>
                <Link to="/" className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-black/40 backdrop-blur ring-1 ring-white/15">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">Powered by Ticket Safe</span>
                </Link>
              </div>

              {/* Category + From price, bottom-left over the image */}
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                {categoryLabel && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-black/55 backdrop-blur text-white text-[11px] font-bold uppercase tracking-[0.14em]">
                    {categoryLabel}
                  </span>
                )}
                {minPriceCents != null && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-white text-[#02122d] text-xs font-black shadow-sm">
                    From €{(minPriceCents / 100).toFixed(minPriceCents % 100 === 0 ? 0 : 2)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Title block — clean, on the page background */}
        <div className="container mx-auto max-w-4xl px-4 pt-5 md:pt-6">
          {event.organizer && (
            <div className="inline-flex items-center gap-2.5 mb-3 px-3 py-1.5 rounded-full bg-muted ring-1 ring-border">
              {event.organizer.logo_url ? (
                <img src={event.organizer.logo_url} alt={event.organizer.name} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-black">
                  {event.organizer.name[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs font-bold text-foreground leading-none">{event.organizer.name}</span>
            </div>
          )}

          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.06] mb-3.5 text-foreground">
            {event.title}
          </h1>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground font-medium">
              <Calendar className="w-4 h-4 text-primary" />
              {new Date(event.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground font-medium">
                <MapPin className="w-4 h-4 text-primary" />
                {event.location}
              </span>
            )}
            {event.ends_at && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                Ends {new Date(event.ends_at).toLocaleString("en-GB", { timeStyle: "short" })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* pb-32 leaves room for the mobile sticky checkout bar so nothing is hidden behind it */}
      <main className="flex-1 mt-6 md:mt-8 relative z-10 pb-32 lg:pb-0">
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
                  const soldPct = t.total_qty > 0 ? t.sold_qty / t.total_qty : 0;
                  const sellingFast = !soldOut && !lowStock && soldPct >= 0.7;
                  const urgent = lowStock || sellingFast;
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
                        <div className="mt-2.5">
                          <div className={`text-[11px] font-semibold inline-flex items-center gap-1.5 mb-1.5 ${urgent ? "text-amber-700" : "text-muted-foreground"}`}>
                            {urgent && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            )}
                            {soldOut
                              ? "Sold out"
                              : lowStock
                              ? `Only ${t.available_qty} left`
                              : sellingFast
                              ? "Selling fast"
                              : `${t.available_qty} ${t.available_qty === 1 ? "ticket" : "tickets"} available`}
                          </div>
                          {!soldOut && t.total_qty > 0 && (
                            <div className="h-1.5 w-full max-w-[190px] rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, Math.max(6, soldPct * 100))}%`,
                                  background: urgent ? "#f59e0b" : primary,
                                }}
                              />
                            </div>
                          )}
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

          {/* ===== Checkout — radical redesign =====
              Drops the "form below a static preview" pattern. Instead the
              buyer fills out the **actual ticket cards** — inputs sit
              directly on the gradient ticket, one card per seat. The
              experience reads as "write your name on your ticket" rather
              than "complete this form". No generic boxes, no platform-fee
              line shouting at the buyer. Total + Continue live in their
              own confident strip at the bottom. */}
          {selected && (
            <section className="mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Section heading — small, deliberate */}
              <div className="flex items-baseline justify-between mb-4 px-1">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {qty === 1 ? "Your ticket" : `Your ${qty} tickets`}
                </h2>
                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={qty <= 1}
                    aria-label="Remove a ticket"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button
                    onClick={() =>
                      setQty((n) => {
                        const hardCap = Math.min(10, selected.available_qty);
                        const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                        return Math.min(finalCap, n + 1);
                      })
                    }
                    className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={
                      qty >= Math.min(10, selected.available_qty) ||
                      (maxPerBuyer != null && qty >= maxPerBuyer)
                    }
                    aria-label="Add a ticket"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* One interactive ticket card per seat — the buyer writes on the ticket itself */}
              <div className="space-y-3">
                {attendees.map((a, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-2xl text-white shadow-lg ring-1 ring-white/10"
                    style={{ background: TS_GRADIENT }}
                  >
                    {/* Perforation notches */}
                    <div className="absolute top-1/2 -translate-y-1/2 -left-2.5 w-5 h-5 rounded-full bg-card z-10" />
                    <div className="absolute top-1/2 -translate-y-1/2 -right-2.5 w-5 h-5 rounded-full bg-card z-10" />
                    {/* Subtle radial highlight for depth */}
                    <div
                      className="absolute inset-0 opacity-30 pointer-events-none"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 15% 15%, rgba(255,255,255,.30), transparent 45%), radial-gradient(circle at 85% 85%, rgba(255,255,255,.12), transparent 50%)",
                      }}
                    />

                    {/* Top — event header */}
                    <div className="relative px-5 md:px-6 pt-5 pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">
                          Ticket Safe
                        </div>
                        {qty > 1 && (
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                            #{i + 1} of {qty}
                          </div>
                        )}
                      </div>
                      <div className="text-lg md:text-xl font-bold leading-tight mb-1 line-clamp-2">
                        {event.title}
                      </div>
                      <div className="text-xs text-white/80">
                        {new Date(event.date).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {event.location && (
                          <>
                            <span className="mx-1.5 text-white/40">·</span>
                            {event.location}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Perforation line */}
                    <div className="relative h-2.5 mx-3 border-b border-dashed border-white/30" />

                    {/* Bottom — inline editable holder fields */}
                    <div className="relative px-5 md:px-6 pt-4 pb-5 space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/55 mb-1.5">
                          Holder name
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={a.first_name}
                            onChange={(e) => updateAttendee(i, { first_name: e.target.value })}
                            placeholder="First"
                            className="ts-ticket-input"
                            maxLength={100}
                            autoComplete="given-name"
                            aria-label={qty > 1 ? `Ticket ${i + 1} first name` : "First name"}
                          />
                          <input
                            value={a.last_name}
                            onChange={(e) => updateAttendee(i, { last_name: e.target.value })}
                            placeholder="Last"
                            className="ts-ticket-input"
                            maxLength={100}
                            autoComplete="family-name"
                            aria-label={qty > 1 ? `Ticket ${i + 1} last name` : "Last name"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/55 mb-1.5">
                          Email (QR delivery)
                        </label>
                        <input
                          type="email"
                          value={a.email}
                          onChange={(e) => updateAttendee(i, { email: e.target.value })}
                          placeholder="name@example.com"
                          className="ts-ticket-input w-full"
                          maxLength={254}
                          autoComplete="email"
                          aria-label={qty > 1 ? `Ticket ${i + 1} email` : "Email"}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/15">
                        <div className="text-[11px] font-semibold tracking-wide text-white/85">
                          {selected.name}
                        </div>
                        <div className="text-[11px] font-semibold tabular-nums text-white/85">
                          €{(selected.price_cents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-buyer limit hint, kept understated */}
              {maxPerBuyer != null && qty >= maxPerBuyer && (
                <div className="text-[11px] text-muted-foreground text-center mt-3">
                  Limit reached — {maxPerBuyer} ticket{maxPerBuyer > 1 ? "s" : ""} per person.
                </div>
              )}

              {/* ===== Totals card — Xceed-style transparent breakdown =====
                  The buyer should never feel like they got an unexpected
                  charge at the end. Each line is itemised, the service fee
                  is shown in EUR (not just "5%"), the total is the visual
                  hero, and a tiny "Why a fee?" line explains where the
                  money goes — built for trust, not for hiding numbers. */}
              <div className="mt-6 rounded-2xl bg-card border border-border p-5 md:p-6 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-4">
                  Order summary
                </div>

                {/* Itemised breakdown — base price line + service fee line */}
                <div className="space-y-2.5 mb-4 pb-4 border-b border-border">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-foreground">
                      <span className="font-medium">{selected.name}</span>
                      <span className="text-muted-foreground"> × {qty}</span>
                    </span>
                    <span className="tabular-nums font-medium text-foreground">
                      €{(totalCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">
                      Service fee <span className="text-muted-foreground/70">(5%)</span>
                    </span>
                    <span className="tabular-nums font-medium text-foreground">
                      €{(feeCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Total — kept as the visual hero */}
                <div className="flex items-baseline justify-between mb-5">
                  <span className="text-base md:text-lg font-semibold tracking-tight text-foreground">
                    Total
                  </span>
                  <span style={{ color: primary }} className="text-3xl md:text-4xl font-semibold tracking-tight leading-none">
                    <AnimatedNumber value={grandCents / 100} prefix="€" />
                  </span>
                </div>

                {/* CTA — flat brand, no gradient */}
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

                {/* Trust + fee explainer */}
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] text-muted-foreground text-center inline-flex items-center justify-center gap-1.5 w-full">
                    <ShieldCheck className="w-3 h-3" />
                    Secured by Stripe. Refundable if the event is cancelled.
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed px-2">
                    The service fee covers secure payment processing, QR delivery, and platform operations.
                  </p>
                </div>
              </div>
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
                    style={{ background: primary }}
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
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                    following
                      ? "bg-muted text-foreground hover:bg-muted/70"
                      : "text-white hover:shadow-md"
                  }`}
                  style={following ? undefined : { background: primary }}
                  aria-pressed={following}
                >
                  {following ? (
                    <>
                      <Check className="w-4 h-4" />
                      Following
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Follow
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Follow to get an email whenever {event.organizer.name} publishes a new event.
              </p>
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
        /* Ticket inline inputs — sit ON the gradient ticket card itself.
           Transparent fill, soft white hairline, white text, brand-tinted
           focus ring. The buyer writes "on the ticket", not in a form. */
        .ts-ticket-input {
          padding: 10px 13px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          font-size: 14px;
          line-height: 1.4;
          color: #fff;
          font-weight: 500;
          width: 100%;
          transition: background .15s, border-color .15s, box-shadow .15s;
          -webkit-backdrop-filter: blur(6px);
          backdrop-filter: blur(6px);
        }
        .ts-ticket-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
          font-weight: 400;
        }
        .ts-ticket-input:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.32);
        }
        .ts-ticket-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
        }
        /* Kill the yellow Chrome autofill overlay on these dark inputs */
        .ts-ticket-input:-webkit-autofill,
        .ts-ticket-input:-webkit-autofill:hover,
        .ts-ticket-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff;
          -webkit-box-shadow: 0 0 0 1000px rgba(0, 51, 153, 0.85) inset;
          caret-color: #fff;
        }
      `}</style>
    </div>
  );
};

export default EventPublic;
