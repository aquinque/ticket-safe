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
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="relative container mx-auto px-4 py-10 md:py-16 max-w-4xl">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
              Powered by Ticket Safe
            </div>
          </Link>

          {event.organizer && (
            <div className="flex items-center gap-3 mb-5">
              {event.organizer.logo_url ? (
                <img
                  src={event.organizer.logo_url}
                  alt={event.organizer.name}
                  className="w-10 h-10 rounded-lg bg-white/10 object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center font-black">
                  {event.organizer.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="text-sm">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/70">Organized by</div>
                <div className="font-bold">{event.organizer.name}</div>
              </div>
            </div>
          )}

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-4">
            {event.title}
          </h1>

          <div className="flex items-center gap-4 flex-wrap text-sm md:text-base text-white/90 mb-2">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(event.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {event.location}
              </span>
            )}
            {event.ends_at && (
              <span className="inline-flex items-center gap-1.5 opacity-80">
                <Clock className="w-3.5 h-3.5" />
                Ends {new Date(event.ends_at).toLocaleString("en-GB", { timeStyle: "short" })}
              </span>
            )}
          </div>
        </div>
      </section>

      <main className="flex-1 -mt-6 md:-mt-10 relative z-10">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Description */}
          {event.description && (
            <section className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-5">
              <p className="text-sm md:text-base text-foreground/90 leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </section>
          )}

          {/* Tier selector */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <Ticket className="w-5 h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-bold">Choose your ticket</h2>
            </div>

            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tickets will be on sale soon. Come back shortly.
              </p>
            ) : (
              <div className="space-y-3">
                {tiers.map((t) => {
                  const isSelected = selectedTier === t.tier_id;
                  const soldOut = t.available_qty <= 0;
                  const locked = soldOut;
                  return (
                    <button
                      key={t.tier_id}
                      onClick={() => {
                        if (locked) return;
                        setSelectedTier(t.tier_id);
                        setQty(1);
                      }}
                      disabled={locked}
                      className={`w-full text-left p-4 md:p-5 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                        locked
                          ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                          : isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                      style={
                        isSelected
                          ? ({ borderColor: primary, background: `${primary}10` } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-base md:text-lg leading-tight">{t.name}</div>
                        {t.description && (
                          <div className="text-xs md:text-sm text-muted-foreground mt-1">
                            {t.description}
                          </div>
                        )}
                        <div className="text-[11px] font-semibold text-muted-foreground mt-2">
                          {soldOut ? "Sold out" : `${t.available_qty} left`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl md:text-2xl font-black" style={{ color: primary }}>
                          €{(t.price_cents / 100).toFixed(2)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selected && (
              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold">Quantity</span>
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={() => setQty((n) => Math.max(1, n - 1))}
                      className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center font-bold">{qty}</span>
                    <button
                      onClick={() =>
                        setQty((n) => {
                          const hardCap = Math.min(10, selected.available_qty);
                          const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                          return Math.min(finalCap, n + 1);
                        })
                      }
                      className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40"
                      disabled={maxPerBuyer != null && qty >= maxPerBuyer}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Per-buyer limit notice */}
                {maxPerBuyer != null && (
                  <div className="text-[11px] text-muted-foreground mb-3 -mt-1">
                    Limit of {maxPerBuyer} ticket{maxPerBuyer > 1 ? "s" : ""} per person.
                  </div>
                )}

                {/* Nominative attendees — one block per ticket */}
                <div className="space-y-3 mb-4 pt-2">
                  <div className="text-xs font-bold text-foreground/80">
                    {qty > 1 ? `Attendee details · ${qty} tickets` : "Attendee details"}
                  </div>
                  {attendees.map((a, i) => (
                    <div key={i} className="rounded-xl border border-border p-3 bg-muted/30">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground mb-2">
                        Ticket {i + 1}{i === 0 ? " · you" : ""}
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
                        placeholder="Email (where the QR will be sent)"
                        className="ts-attendee w-full"
                        maxLength={254}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {selected.name} × {qty}
                    </span>
                    <span>€{(totalCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform fee (5%)</span>
                    <span>€{(feeCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t border-border">
                    <span>Total</span>
                    <span>€{(grandCents / 100).toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleBuy}
                  disabled={buying}
                  className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-xl font-bold text-white disabled:opacity-60"
                  style={{ background: primary }}
                >
                  {buying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Buy {qty} ticket{qty > 1 ? "s" : ""}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-muted-foreground mt-3 text-center inline-flex items-center justify-center gap-1.5 w-full">
                  <ShieldCheck className="w-3 h-3" />
                  Secure payment by Stripe · QR ticket emailed instantly
                </p>
              </div>
            )}
          </section>

          {/* Organizer card */}
          {event.organizer && (
            <section className="bg-card border border-border rounded-2xl p-5 md:p-7 mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">About the organizer</h2>
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
