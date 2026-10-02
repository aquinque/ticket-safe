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
  Mail,
  QrCode,
  Info,
  CreditCard,
  BadgeCheck,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import HeaderNight from "@/components/HeaderNight";
import { ProtectionBadge } from "@/components/common/ProtectionBadge";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
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
  video_url: string | null;
  logo_url: string | null;
  og_image_url: string | null;
  seo_description: string | null;
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

interface AttendeeForm {
  first_name: string;
  last_name: string;
  email: string;
  confirm_email: string;
  gender: "" | "female" | "male" | "other";
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
  useThemeMode("checkout");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [tiers, setTiers] = useState<TierAvailability[]>([]);
  const [resaleCount, setResaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [maxPerBuyer, setMaxPerBuyer] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<AttendeeForm[]>([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [showPromoInput, setShowPromoInput] = useState(false);

  // Keep the attendees array sized to the current quantity. When quantity grows,
  // we add empty slots; when it shrinks, we trim. The first slot auto-fills from
  // the signed-in user once on first render.
  useEffect(() => {
    setAttendees((prev) => {
      const next = prev.slice(0, qty);
      while (next.length < qty) next.push({ first_name: "", last_name: "", email: "", confirm_email: "", gender: "" });
      if (user && next[0] && !next[0].email) {
        const meta = (user.user_metadata as { full_name?: string } | undefined) ?? {};
        const fullName = (meta.full_name ?? "").trim();
        const parts = fullName.split(/\s+/);
        next[0] = {
          ...next[0],
          first_name: parts[0] ?? "",
          last_name: parts.slice(1).join(" "),
          email: user.email ?? "",
          confirm_email: user.email ?? "",
        };
      }
      return next;
    });
  }, [qty, user]);

  const updateAttendee = (i: number, patch: Partial<AttendeeForm>) => {
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);

    const { data: ev } = await supabase
      .from("events")
      .select(
        `id, title, description, date, ends_at, location, category, slug, status, primary_color, banner_url, video_url, logo_url, og_image_url, seo_description, organizer_id, max_tickets_per_buyer,
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

    // Payments always go through the platform account now — no need to check
    // the organizer's readiness up-front. Payouts are settled separately after
    // the event ends.

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

  // Resale availability — "Resale available (X tickets)" banner. Reads the
  // same `tickets` table the resale marketplace itself lists from; no new
  // table or business rule, just a count for this event's listings.
  useEffect(() => {
    if (!event?.id) {
      setResaleCount(0);
      return;
    }
    let active = true;
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "available")
      .then(({ count }) => {
        if (active) setResaleCount(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [event?.id]);

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
    // No account required to buy — the server creates a passwordless shadow
    // account from the first attendee's email (getOrCreateGuestAccount) when
    // there's no Authorization header, so guest orders still have a real
    // buyer_id for event_orders/event_tickets/RLS. Signed-in users still go
    // through the normal authenticated path.
    // Validate the nominative form before opening checkout — the server will
    // re-validate (defense in depth) but a clear inline error is friendlier.
    for (let i = 0; i < attendees.length; i++) {
      const a = attendees[i];
      if (!a.first_name.trim() || !a.last_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) {
        toast.error(`Fill in the holder's first name, last name and email for ticket ${i + 1}.`);
        return;
      }
      if (a.email.trim().toLowerCase() !== a.confirm_email.trim().toLowerCase()) {
        toast.error(`The email addresses don't match for ticket ${i + 1}.`);
        return;
      }
      if (a.gender !== "female" && a.gender !== "male" && a.gender !== "other") {
        toast.error(`Please select a gender for ticket ${i + 1}.`);
        return;
      }
    }
    setBuying(true);
    try {
      // Revolut is the payment provider. studio-create-checkout stays deployed
      // as a dormant fallback but is no longer called, so the two never run
      // together. confirm_email is a client-side-only typo check — strip it
      // before sending; the server only cares about email + gender.
      const attendeesPayload = attendees.map(({ first_name, last_name, email, gender }) => ({
        first_name,
        last_name,
        email,
        gender,
      }));
      const first = attendees[0];
      const { data, error } = await supabase.functions.invoke("revolut-create-checkout", {
        body: {
          tier_id: selectedTier,
          quantity: qty,
          attendees: attendeesPayload,
          ...(promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
          ...(user ? {} : { guest: { name: `${first.first_name} ${first.last_name}`.trim(), email: first.email } }),
        },
      });
      if (error || !data?.url) {
        console.error("[event-public] checkout error:", error, data);
        // supabase.functions.invoke hides the function's error body on a non-2xx
        // (you just get "Edge Function returned a non-2xx status code"). The real
        // reason — per-buyer limit, sold out, etc. — lives in error.context, so
        // read it and show THAT instead of the cryptic generic message.
        let msg = (data as { error?: string })?.error;
        const ctx = (error as { context?: Response } | null)?.context;
        if (!msg && ctx && typeof ctx.json === "function") {
          try {
            const bodyJson = await ctx.clone().json();
            if (bodyJson?.error) msg = bodyJson.error as string;
          } catch {
            /* body wasn't JSON — fall through to the generic message */
          }
        }
        toast.error(msg ?? error?.message ?? "Could not start the checkout. Please try again.");
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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="theme-checkout min-h-screen bg-background">
        <HeaderNight />
        <div className="bg-background pt-16 md:pt-20">
          <div className="container mx-auto max-w-5xl sm:px-4 sm:pt-6">
            <div className="w-full aspect-[16/9] bg-white/5 animate-pulse" />
          </div>
        </div>
        <div className="container mx-auto max-w-5xl px-4 pt-8 space-y-5">
          <div className="h-4 w-24 bg-muted animate-pulse" />
          <div className="h-10 w-3/4 bg-muted animate-pulse" />
          <div className="h-5 w-1/2 bg-muted animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 pt-6">
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse" />
              ))}
            </div>
            <div className="h-64 bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // ── Event not found ───────────────────────────────────────────────────────
  if (!event) {
    return (
      <div className="theme-checkout min-h-screen flex flex-col bg-background">
        <HeaderNight />
        <div className="flex-1 flex items-center justify-center p-6 pt-20 md:pt-24">
          <div className="text-center max-w-md border border-border p-8">
            <div className="w-12 h-12 bg-muted flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-semibold mb-2 text-foreground">Événement introuvable</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Cet événement a peut-être été dépublié, ou le lien est incorrect.
            </p>
            <Link
              to="/tickets"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Voir tous les événements
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Brand identity is non-negotiable: every event uses Ticket Safe blue,
  // regardless of what colour the organizer set on their event/profile. The
  // `primary` Tailwind token already resolves to that exact blue in every
  // theme (including .theme-checkout below), so plain `text-primary` /
  // `bg-primary` utilities give the same guarantee without hardcoding a hex.
  const selected = tiers.find((t) => t.tier_id === selectedTier) ?? null;
  const totalCents = selected ? selected.price_cents * qty : 0;
  // Flat €1.40 per-ticket service tax — must match revolut-create-checkout's
  // SERVICE_TAX_CENTS exactly, since that edge function computes the real
  // Revolut charge server-side. Ticket Safe takes no cut from the organizer.
  const SERVICE_TAX_CENTS = 140;
  const feeCents = SERVICE_TAX_CENTS * qty;
  const grandCents = totalCents + feeCents;
  // Lowest available price, for the summary placeholder.
  const availablePrices = tiers.filter((t) => t.available_qty > 0).map((t) => t.price_cents);
  const minPriceCents = availablePrices.length ? Math.min(...availablePrices) : null;
  const categoryLabel = event.category
    ? event.category.charAt(0).toUpperCase() + event.category.slice(1)
    : null;

  // ── Derived buyer-facing status ───────────────────────────────────────────
  const anyAvailable = tiers.some((t) => t.available_qty > 0);
  const eventSoldOut = tiers.length > 0 && !anyAvailable;
  const endRef = event.ends_at ?? event.date;
  const isPast = new Date(endRef).getTime() < Date.now();
  const sellingFast =
    !eventSoldOut &&
    tiers.some((t) => t.available_qty > 0 && t.total_qty > 0 && t.available_qty / t.total_qty < 0.3);
  // Text-only status mark (no pill background) — colour carries the meaning.
  const statusText: { label: string; colorClass: string; pulse?: boolean } = isPast
    ? { label: "Terminé", colorClass: "text-muted-foreground" }
    : eventSoldOut
    ? { label: "Épuisé", colorClass: "text-rose-400" }
    : sellingFast
    ? { label: "Dernières places", colorClass: "text-primary", pulse: true }
    : { label: "En vente", colorClass: "text-emerald-400" };

  const fmtPrice = (cents: number) => `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

  // Order summary, rendered both in the desktop sticky rail (with CTA) and as a
  // mobile inline breakdown (without CTA — the sticky bottom bar carries that).
  const renderSummary = (showCta: boolean) => {
    if (eventSoldOut) {
      return (
        <div className="border border-border p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400 mb-4">Épuisé</p>
          <h3 className="text-base font-medium text-foreground mb-2">Cet événement est complet</h3>
          <p className="text-sm text-muted-foreground mb-5">
            Suivez l'organisateur pour être informé des prochains billets ou événements.
          </p>
          {event.organizer && (
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              className="w-full py-3 text-sm font-medium border border-border hover:bg-muted transition-colors disabled:opacity-60"
            >
              {following ? "Suivi" : "Suivre l'organisateur"}
            </button>
          )}
        </div>
      );
    }

    if (!selected) {
      return (
        <div className="border border-border p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">
            Récapitulatif
          </p>
          {minPriceCents != null && (
            <p className="mb-2">
              <span className="text-sm text-muted-foreground">À partir de </span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">{fmtPrice(minPriceCents)}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-5">
            Choisissez un billet pour voir le total et continuer.
          </p>
          <div className="pt-5 border-t border-border">
            <ProtectionBadge />
          </div>
        </div>
      );
    }

    return (
      <div className="border border-border p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-5">
          Récapitulatif
        </p>

        <div className="space-y-2.5 mb-4 pb-4 border-b border-border">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground min-w-0 pr-2">
              {selected.name}
              <span className="text-muted-foreground"> × {qty}</span>
            </span>
            <span className="tabular-nums text-foreground">{fmtPrice(totalCents)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              Frais de service <span className="text-muted-foreground/70">(€1,40 × {qty})</span>
            </span>
            <span className="tabular-nums text-foreground">{fmtPrice(feeCents)}</span>
          </div>
        </div>

        <div className="mb-5">
          {showPromoInput ? (
            <div className="flex gap-2">
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Code promo"
                className="flex-1 min-w-0 px-3 py-2 border border-border bg-input text-sm uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
              />
              {promoCode && (
                <button
                  type="button"
                  onClick={() => { setPromoCode(""); setShowPromoInput(false); }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
                >
                  Effacer
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPromoInput(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Vous avez un code promo ?
            </button>
          )}
          {promoCode && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Appliqué au paiement — la remise apparaît sur l'écran Revolut final.
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between mb-5">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-3xl font-semibold tabular-nums leading-none text-foreground">
            <AnimatedNumber value={grandCents / 100} prefix="€" durationMs={150} />
          </span>
        </div>

        {showCta && (
          <>
            <button
              onClick={handleBuy}
              disabled={buying}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 transition-colors hover:bg-primary-hover"
            >
              {buying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ouverture du paiement sécurisé
                </>
              ) : (
                <>
                  Continuer vers le paiement
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            {!user && (
              <p className="text-[11px] text-muted-foreground text-center mt-2.5">
                Aucun compte requis — le billet part directement à l'adresse indiquée ci-dessus.
              </p>
            )}
            <div className="mt-4">
              <ProtectionBadge />
            </div>
          </>
        )}

        {maxPerBuyer != null && qty >= maxPerBuyer && (
          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Limite atteinte — {maxPerBuyer} billet{maxPerBuyer > 1 ? "s" : ""} par personne.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="theme-checkout min-h-screen flex flex-col bg-background">
      <HeaderNight />
      <SEOHead
        title={`${event.title} — ${event.organizer?.name ?? "Ticket Safe"}`}
        description={event.seo_description ?? event.description ?? `Tickets for ${event.title}`}
        image={event.og_image_url ?? event.banner_url ?? event.organizer?.logo_url ?? null}
        type="event"
        url={`https://ticket-safe.eu/e/${event.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Event",
          name: event.title,
          description: event.seo_description ?? event.description ?? `Tickets for ${event.title}`,
          startDate: event.date,
          ...(event.ends_at ? { endDate: event.ends_at } : {}),
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: event.location
            ? { "@type": "Place", name: event.location, address: event.location }
            : undefined,
          image: event.og_image_url ?? event.banner_url ?? event.organizer?.logo_url ?? undefined,
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

      {/* ===== Hero — image/video if there's one, no gradient placeholder
          when there isn't. The caption (status, category, organizer, title,
          date/place) sits on the page background below the image, not
          layered on top of it. ===== */}
      <section className="pt-16 md:pt-20">
        {(event.video_url || event.banner_url) && (
          <div className="container mx-auto max-w-5xl px-0 sm:px-4 sm:pt-6">
            <div className="relative w-full aspect-[16/9] overflow-hidden bg-black/20">
              {event.video_url ? (
                <video
                  src={event.video_url}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  src={event.banner_url ?? undefined}
                  alt={event.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        )}

        <div className="container mx-auto max-w-5xl px-4 pt-6">
          <button
            type="button"
            onClick={() => {
              if (location.key && location.key !== "default") navigate(-1);
              else navigate("/tickets");
            }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Retour
          </button>

          <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold uppercase tracking-[0.12em] mb-3">
            <span className={`inline-flex items-center gap-1.5 ${statusText.colorClass}`}>
              {statusText.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {statusText.label}
            </span>
            {categoryLabel && <span className="text-muted-foreground">{categoryLabel}</span>}
            {event.organizer && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {event.organizer.name}
                <BadgeCheck className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.08] mb-4 text-foreground">
            {event.title}
          </h1>

          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" strokeWidth={1.5} />
              {new Date(event.date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4" strokeWidth={1.5} />
                {event.location}
              </span>
            )}
            {event.ends_at && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" strokeWidth={1.5} />
                Jusqu'à {new Date(event.ends_at).toLocaleString("fr-FR", { timeStyle: "short" })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* pb-28 leaves room for the mobile sticky checkout bar so nothing is hidden behind it */}
      <main className="flex-1 mt-8 md:mt-10 pb-28 lg:pb-14">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 lg:gap-14 lg:items-start">
            {/* ===== LEFT: selection + event info ===== */}
            <div className="min-w-0">
              {/* Ticket picker */}
              <Section title="Choisir un billet" first>
                {eventSoldOut && (
                  <p className="flex items-start gap-2 text-sm text-rose-400 mb-5">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
                    Cet événement est complet. Suivez l'organisateur ci-dessous pour être informé des prochaines dates.
                  </p>
                )}

                {tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">
                    Les billets seront bientôt en vente. Revenez un peu plus tard.
                  </p>
                ) : (
                  <div>
                    {tiers.map((t) => {
                      const isSelected = selectedTier === t.tier_id;
                      const soldOut = t.available_qty <= 0;
                      // Buyers never see exact stock counts (Studio-only). We
                      // only surface a scarcity nudge when fewer than 30% remain.
                      const fewLeft = !soldOut && t.total_qty > 0 && t.available_qty / t.total_qty < 0.3;
                      return (
                        <button
                          key={t.tier_id}
                          onClick={() => {
                            if (soldOut) return;
                            setSelectedTier(t.tier_id);
                            setQty(1);
                          }}
                          disabled={soldOut}
                          className={`w-full flex items-stretch gap-4 text-left border-t border-border first:border-t-0 transition-colors ${
                            soldOut ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/30"
                          }`}
                        >
                          <span className={`w-[3px] shrink-0 ${isSelected && !soldOut ? "bg-primary" : "bg-transparent"}`} />
                          <span className="flex-1 flex items-center justify-between gap-4 py-4 min-w-0">
                            <span className="min-w-0">
                              <span className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{t.name}</span>
                                {isSelected && !soldOut && <Check className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2.5} />}
                              </span>
                              {t.description && (
                                <span className="block text-sm text-muted-foreground mt-0.5 line-clamp-2">{t.description}</span>
                              )}
                              {soldOut ? (
                                <span className="block text-xs text-muted-foreground mt-1.5">Épuisé</span>
                              ) : fewLeft ? (
                                <span className="block text-xs text-primary mt-1.5">Dernières places</span>
                              ) : null}
                            </span>
                            <span className="text-base font-semibold tabular-nums text-foreground shrink-0">
                              {fmtPrice(t.price_cents)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {resaleCount > 0 && (
                  <Link
                    to={`/event/${event.id}/tickets`}
                    className="flex items-center justify-between gap-2 py-3 mt-1 border-t border-border text-sm text-foreground hover:text-primary transition-colors"
                  >
                    <span>Revente disponible ({resaleCount} billet{resaleCount > 1 ? "s" : ""})</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Link>
                )}
              </Section>

              {/* Attendee ticket forms — buyer writes the name "on the ticket" */}
              {selected && (
                <Section>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {qty === 1 ? "Votre billet" : `Vos ${qty} billets`}
                    </h2>
                    <QtyStepper
                      qty={qty}
                      onDecrease={() => setQty((n) => Math.max(1, n - 1))}
                      onIncrease={() =>
                        setQty((n) => {
                          const hardCap = Math.min(10, selected.available_qty);
                          const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                          return Math.min(finalCap, n + 1);
                        })
                      }
                      disableDecrease={qty <= 1}
                      disableIncrease={qty >= Math.min(10, selected.available_qty) || (maxPerBuyer != null && qty >= maxPerBuyer)}
                    />
                  </div>

                  <div className="space-y-5">
                    {attendees.map((a, i) => {
                      const emailMismatch =
                        a.confirm_email.length > 0 && a.confirm_email.trim().toLowerCase() !== a.email.trim().toLowerCase();
                      return (
                        <div key={i} className="border border-border p-5">
                          <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-dashed border-border">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{selected.name}</div>
                              {qty > 1 && (
                                <div className="text-xs text-muted-foreground mt-0.5">Billet {i + 1} / {qty}</div>
                              )}
                            </div>
                            <div className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                              {fmtPrice(selected.price_cents)}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="Prénom">
                                <input
                                  value={a.first_name}
                                  onChange={(e) => updateAttendee(i, { first_name: e.target.value })}
                                  placeholder="Prénom"
                                  className="ts-field-input"
                                  maxLength={100}
                                  autoComplete="given-name"
                                  aria-label={qty > 1 ? `Billet ${i + 1} — prénom` : "Prénom"}
                                />
                              </Field>
                              <Field label="Nom">
                                <input
                                  value={a.last_name}
                                  onChange={(e) => updateAttendee(i, { last_name: e.target.value })}
                                  placeholder="Nom"
                                  className="ts-field-input"
                                  maxLength={100}
                                  autoComplete="family-name"
                                  aria-label={qty > 1 ? `Billet ${i + 1} — nom` : "Nom"}
                                />
                              </Field>
                            </div>
                            <Field label="Email (réception du billet)">
                              <input
                                type="email"
                                value={a.email}
                                onChange={(e) => updateAttendee(i, { email: e.target.value })}
                                placeholder="nom@exemple.com"
                                className="ts-field-input"
                                maxLength={254}
                                autoComplete="email"
                                aria-label={qty > 1 ? `Billet ${i + 1} — email` : "Email"}
                              />
                            </Field>
                            <Field label="Confirmer l'email">
                              <input
                                type="email"
                                value={a.confirm_email}
                                onChange={(e) => updateAttendee(i, { confirm_email: e.target.value })}
                                placeholder="nom@exemple.com"
                                className={`ts-field-input ${emailMismatch ? "border-rose-400" : ""}`}
                                maxLength={254}
                                autoComplete="email"
                                aria-label={qty > 1 ? `Billet ${i + 1} — confirmer l'email` : "Confirmer l'email"}
                              />
                              {emailMismatch && (
                                <p className="text-[11px] text-rose-400 mt-1">Les emails ne correspondent pas</p>
                              )}
                            </Field>
                            <Field label="Genre">
                              <select
                                value={a.gender}
                                onChange={(e) => updateAttendee(i, { gender: e.target.value as AttendeeForm["gender"] })}
                                className="ts-field-input"
                                aria-label={qty > 1 ? `Billet ${i + 1} — genre` : "Genre"}
                              >
                                <option value="" disabled>Sélectionner…</option>
                                <option value="female">Femme</option>
                                <option value="male">Homme</option>
                                <option value="other">Autre</option>
                              </select>
                            </Field>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {maxPerBuyer != null && qty >= maxPerBuyer && (
                    <p className="text-[11px] text-muted-foreground text-center mt-4">
                      Limite atteinte — {maxPerBuyer} billet{maxPerBuyer > 1 ? "s" : ""} par personne.
                    </p>
                  )}

                  {/* Mobile inline summary (desktop uses the sticky rail) */}
                  <div className="lg:hidden mt-6">{renderSummary(false)}</div>
                </Section>
              )}

              {/* When & where */}
              <Section title="Quand et où">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                    <div>
                      <div className="text-sm text-foreground">
                        {new Date(event.date).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(event.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        {event.ends_at && <> – {new Date(event.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>}
                      </div>
                    </div>
                  </div>
                  {event.location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.5} />
                      <div>
                        <div className="text-sm text-foreground">{event.location}</div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Voir sur la carte
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* About */}
              {event.description && (
                <Section title="À propos">
                  <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">{event.description}</p>
                </Section>
              )}

              {/* What happens after you pay */}
              <Section title="Après le paiement">
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <CreditCard className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-foreground/85">
                      Paiement sécurisé via <span className="font-medium text-foreground">Revolut</span> — vos coordonnées bancaires ne transitent jamais par Ticket Safe.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-foreground/85">Votre billet à QR code arrive par email, en image et en PDF.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <QrCode className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-foreground/85">
                      Retrouvez-le dans <Link to="/my-tickets" className="font-medium text-primary hover:underline">Mes billets</Link> et présentez le QR à l'entrée.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-foreground/85">Remboursement automatique si l'organisateur annule l'événement.</span>
                  </li>
                </ul>
              </Section>

              {/* Organizer */}
              {event.organizer && (
                <Section title="Organisé par">
                  <div className="flex items-center gap-3">
                    {event.organizer.logo_url ? (
                      <img src={event.organizer.logo_url} alt={event.organizer.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full flex items-center justify-center font-semibold text-primary-foreground bg-primary shrink-0">
                        {event.organizer.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground inline-flex items-center gap-1.5">
                        {event.organizer.name}
                        <BadgeCheck className="w-4 h-4 text-primary" strokeWidth={1.75} aria-label="Organisateur vérifié" />
                      </div>
                      {event.organizer.website && (
                        <a href={event.organizer.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          {event.organizer.website}
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleFollow}
                      disabled={followBusy}
                      className={`flex-shrink-0 px-4 py-2 text-sm font-medium border transition-colors disabled:opacity-60 ${
                        following
                          ? "border-border text-foreground hover:bg-muted"
                          : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                      }`}
                      aria-pressed={following}
                    >
                      {following ? "Suivi" : "Suivre"}
                    </button>
                  </div>
                </Section>
              )}

              {/* Footer */}
              <div className="pt-8 pb-2 text-center text-xs text-muted-foreground">
                Propulsé par{" "}
                <Link to="/" className="font-medium text-foreground hover:underline">Ticket Safe</Link>
                {" · "}
                <Link to="/terms" className="hover:underline">CGU</Link>
                {" · "}
                <Link to="/privacy" className="hover:underline">Confidentialité</Link>
              </div>
            </div>

            {/* ===== RIGHT: sticky order summary (desktop) ===== */}
            <aside className="hidden lg:block">
              <div className="lg:sticky lg:top-24">{renderSummary(true)}</div>
            </aside>
          </div>
        </div>
      </main>

      {/* ===== Sticky mobile checkout bar ===== */}
      {selected && !eventSoldOut && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
          <div className="container mx-auto max-w-4xl flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground truncate">{qty} × {selected.name}</div>
              <div className="text-lg font-semibold tabular-nums leading-tight text-foreground">
                {fmtPrice(grandCents)}
              </div>
            </div>
            <button
              onClick={handleBuy}
              disabled={buying}
              className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-5 bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60 transition-colors hover:bg-primary-hover"
            >
              {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continuer <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ts-field-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--input));
          color: hsl(var(--foreground));
          font-size: 14px;
          line-height: 1.4;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .ts-field-input::placeholder { color: hsl(var(--muted-foreground)); }
        .ts-field-input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 1px hsl(var(--primary));
        }
      `}</style>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Presentational building blocks — reused across the sections above. Kept
// local to this page since none of them encode any business rule.
// ────────────────────────────────────────────────────────────────────────────

/** A content block separated from the next one by a single hairline, with a
 *  small-caps label — the page's whole "editorial" rhythm instead of
 *  repeated bordered/shadowed cards. */
const Section = ({
  title,
  children,
  first = false,
}: {
  title?: string;
  children: React.ReactNode;
  first?: boolean;
}) => (
  <section className={`py-8 border-t border-border ${first ? "pt-0 border-t-0" : ""}`}>
    {title && <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-5">{title}</h2>}
    {children}
  </section>
);

/** Labelled field wrapper for the attendee form inputs. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
      {label}
    </span>
    {children}
  </label>
);

/** Square −/+ quantity control. */
const QtyStepper = ({
  qty,
  onDecrease,
  onIncrease,
  disableDecrease,
  disableIncrease,
}: {
  qty: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disableDecrease: boolean;
  disableIncrease: boolean;
}) => (
  <div className="inline-flex items-center gap-3">
    <button
      onClick={onDecrease}
      disabled={disableDecrease}
      className="w-8 h-8 border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Retirer un billet"
    >
      <Minus className="w-3.5 h-3.5" strokeWidth={1.75} />
    </button>
    <span className="w-6 text-center text-sm font-medium tabular-nums text-foreground">{qty}</span>
    <button
      onClick={onIncrease}
      disabled={disableIncrease}
      className="w-8 h-8 border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Ajouter un billet"
    >
      <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
    </button>
  </div>
);

export default EventPublic;
