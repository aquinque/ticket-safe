import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Loader2,
  Ticket,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Mail,
  QrCode,
  CreditCard,
  BadgeCheck,
  Check,
  Flame,
  Share2,
  CalendarPlus,
  Users,
  Navigation,
  ChevronDown,
  Clock,
  X,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { EventSectionTabs, type SectionTab } from "@/components/event/EventSectionTabs";
import { PromoVideo } from "@/components/PromoVideo";
import { TeaserVideo, useVideoShape } from "@/components/event/TeaserVideo";
import { useServiceFeeForPrice, useTierServiceFee } from "@/hooks/useServiceFee";
import { studioFeeRule } from "@/lib/studioFee";
import { currencySymbol, formatMoney, toCurrency } from "@/lib/money";
import { allowNextHistoryBack } from "@/lib/backToHome";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import HeaderNight from "@/components/HeaderNight";
import { descriptionFontFamily } from "@/lib/descriptionFonts";
import { eventThemeVars, isHex } from "@/lib/eventTheme";
import { ProtectionBadge } from "@/components/common/ProtectionBadge";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import { readPromoterRef, trackPromoterVisit } from "@/lib/promoterLinks";
import { CheckoutLegalNote } from "@/components/checkout/CheckoutLegalNote";
import { eventEnd, isPastEvent } from "@/lib/eventTime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { authPathHere } from "@/lib/returnTo";
import { countdown } from "@/lib/eventCountdown";
import { eventShareUrl } from "@/lib/shareUrl";
import { EventResaleListings } from "@/components/resale/EventResaleListings";
import { useResaleListings } from "@/hooks/useResaleListings";
import { dropLabel, isUpcomingDrop, tierReleaseState } from "@/lib/tierDrops";

interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  description_font: string | null;
  date: string;
  ends_at: string | null;
  location: string | null;
  category: string | null;
  slug: string;
  status: string;
  primary_color: string;
  banner_url: string | null;
  /** How the Studio asked the poster to sit in its 16:9 frame: "cover" (default) or "contain". */
  banner_fit: string | null;
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

/** Re-renders on a timer so the countdown and "happening now" stay true. */
function useNow(tickMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

/** "In 26 days", "In 3 h 12 min", "Happening now", "Ended". Short, for a chip. Over and live follow the product's one end-of-event rule. */
/** Calendar file for Apple, Google, Outlook: one download, every app opens it. */
function downloadIcs(ev: { title: string; date: string; ends_at: string | null; location: string | null; slug: string; description: string | null }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  // The end the rest of the product uses: ends_at, or 8 h after the start.
  const end = eventEnd(ev)?.toISOString() ?? ev.date;
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ticket Safe//EN", "BEGIN:VEVENT",
    `UID:${ev.slug}@ticket-safe.eu`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(ev.date)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(ev.title)}`, ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    `DESCRIPTION:${esc((ev.description ?? "").slice(0, 400))}${ev.description ? "\\n\\n" : ""}Tickets: https://ticket-safe.eu/e/${ev.slug}`,
    `URL:https://ticket-safe.eu/e/${ev.slug}`, "END:VEVENT", "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.slug}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  // Drops (20261122120000_ticket_drops.sql); absent on an older database, which reads as "open".
  sales_start_at?: string | null;
  sales_end_at?: string | null;
  opens_after_tier_id?: string | null;
  released_at?: string | null;
}

const EventPublic = () => {
  useThemeMode("night");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  // The promoter link this page was opened from (?ref=<code>), read from the address only: nothing is stored in
  // the browser, so a visitor who leaves and comes back by the main link is no longer attributed to it.
  const promoterRef = useMemo(() => readPromoterRef(location.search), [location.search]);
  const countedVisit = useRef<string | null>(null);

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [tiers, setTiers] = useState<TierAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const tierFeeCents = useTierServiceFee(selectedTier);
  // The fee the standard rule gives for that price. The summary only names the rule
  // ("4% + €0.60 per ticket") when this ticket's fee is that one, not a negotiated amount.
  // Every tier of an event shares its currency (the database keeps them equal): pounds in London.
  const currency = toCurrency(tiers[0]?.currency);
  const standardFeeCents = useServiceFeeForPrice(tiers.find((t) => t.tier_id === selectedTier)?.price_cents ?? null, currency);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [maxPerBuyer, setMaxPerBuyer] = useState<number | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "revolut">("stripe");
  const [attendees, setAttendees] = useState<AttendeeForm[]>([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  // In development, ?preview_video=<url> tries a promo video on the page before it is uploaded.
  const previewVideo = import.meta.env.DEV ? new URLSearchParams(location.search).get("preview_video") : null;
  const promoVideo = previewVideo ?? event?.video_url ?? null;
  const videoShape = useVideoShape(promoVideo);
  const [interested, setInterested] = useState(0);
  const nowTs = useNow(30_000);
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

  // Tier availability only: the part a sale changes. Used by the first load
  // and by every realtime update, without touching the rest of the page.
  const refreshTiers = useCallback(async (eventId: string) => {
    // tier_inventory is a VIEW (no FK), so we can't ask PostgREST to embed
    // event_tiers.description here — the embed returns zero rows and the page
    // falls into the empty "Tickets will be on sale soon" state even when the
    // event has active tiers. Read the view flat, then enrich descriptions
    // with a second tiny query against event_tiers.
    const [{ data: tr, error: trErr }, { data: tdesc }] = await Promise.all([
      supabase.from("tier_inventory").select("*").eq("event_id", eventId),
      supabase.from("event_tiers").select("id, description").eq("event_id", eventId),
    ]);
    if (trErr) console.warn("[event-public] tier_inventory query:", trErr);

    const descMap = new Map(
      (tdesc ?? []).map((d: { id: string; description: string | null }) => [d.id, d.description]),
    );

    setTiers(
      ((tr as TierAvailability[]) ?? [])
        .filter((t) => t.is_active)
        .map((t) => ({ ...t, description: descMap.get(t.tier_id) ?? null }))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);

    const { data: ev } = await supabase
      .from("events")
      .select(
        `id, title, description, description_font, date, ends_at, location, category, slug, status, primary_color, banner_url, banner_fit, video_url, logo_url, og_image_url, seo_description, organizer_id, max_tickets_per_buyer, payment_provider,
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
    // Stripe is the checkout; only legacy events explicitly marked revolut still use it.
    setPaymentProvider((ev as { payment_provider?: string }).payment_provider === "revolut" ? "revolut" : "stripe");

    // Payments always go through the platform account now — no need to check
    // the organizer's readiness up-front. Payouts are settled separately after
    // the event ends.

    await refreshTiers((ev as { id: string }).id);
    setLoading(false);
  }, [slug, refreshTiers]);

  useEffect(() => {
    load();
  }, [load]);

  // One visit for the promoter link per page load, once the event is known to be published. The server ignores
  // an unknown or archived code, and the organizer's own visits.
  useEffect(() => {
    if (!event?.slug || !promoterRef) return;
    const key = `${event.slug}:${promoterRef}`;
    if (countedVisit.current === key) return;
    countedVisit.current = key;
    trackPromoterVisit(event.slug, promoterRef);
  }, [event?.slug, promoterRef]);

  // "N interested": everyone who opened the event. This visit counts once per browser session; the
  // flag says only that this event was counted, nothing about who the visitor is.
  useEffect(() => {
    if (!event?.slug) return;
    const key = `ts.interest.${event.slug}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch { /* storage blocked: count this load */ }
    let active = true;
    supabase.rpc("event_interest", { p_slug: event.slug, p_count: !seen }).then(({ data }) => {
      if (active && typeof data === "number") setInterested(data);
    });
    return () => { active = false; };
  }, [event?.slug]);

  // Realtime tier availability. A crowd watching the same event means every
  // sale pings every viewer at the same moment. Before, each ping reloaded the
  // whole page (loading state and all); now the pings are coalesced and the
  // tier refetch is spread over a few seconds, so the database sees one light
  // query per viewer instead of a full reload per sale.
  useEffect(() => {
    if (!event?.id) return;
    const eventId = event.id;
    let timer: number | undefined;
    const ch = supabase
      .channel(`event-public-${eventId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_tiers", filter: `event_id=eq.${eventId}` },
        () => {
          if (timer !== undefined) return;
          timer = window.setTimeout(() => {
            timer = undefined;
            void refreshTiers(eventId);
          }, 800 + Math.random() * 2500);
        },
      )
      .subscribe();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [event?.id, refreshTiers]);

  // A drop still waiting (for an earlier tier to sell out, or for its start time): re-read the tiers every ~15 s so it
  // shows up on its own the moment it opens, without counting on realtime.
  const dropWaiting = tiers.some(
    (t) => t.is_active && ((t.opens_after_tier_id && !t.released_at) || (t.sales_start_at && Date.parse(t.sales_start_at) > nowTs)),
  );
  useEffect(() => {
    if (!event?.id || !dropWaiting) return;
    const eventId = event.id;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshTiers(eventId);
    }, 12_000 + Math.random() * 6_000);
    return () => window.clearInterval(id);
  }, [event?.id, dropWaiting, refreshTiers]);

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
      navigate(authPathHere());
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
    // The server refuses an order for an ended event; say so here rather than open a checkout that fails.
    if (event && isPastEvent(event)) {
      toast.error("This event has ended.");
      return;
    }
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
      // Each event is sold through one provider (events.payment_provider):
      // Stripe once the organizer's Stripe account is active, Revolut for every
      // other event. studio-create-checkout stays deployed as a dormant
      // fallback but is no longer called. confirm_email is a client-side-only typo check — strip it
      // before sending; the server only cares about email + gender.
      const attendeesPayload = attendees.map(({ first_name, last_name, email, gender }) => ({
        first_name,
        last_name,
        email,
        gender,
      }));
      const first = attendees[0];
      const { data, error } = await supabase.functions.invoke(paymentProvider === "stripe" ? "stripe-connect-create-checkout" : "revolut-create-checkout", {
        body: {
          tier_id: selectedTier,
          quantity: qty,
          attendees: attendeesPayload,
          ...(promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
          ...(promoterRef ? { promoter_code: promoterRef } : {}),
          ...(user ? {} : { guest: { name: `${first.first_name} ${first.last_name}`.trim(), email: first.email } }),
        },
      });
      // Free ticket: already issued server-side (no payment step), so go to the
      // confirmation page instead of a checkout URL.
      if (!error && data?.free) {
        navigate(`/checkout/success?order_id=${data.order_id}&provider=free${data.order_token ? `&t=${data.order_token}` : ""}`);
        return;
      }
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

  // Resale listings for this event (the same query the "Tickets on resale" section reads, so one fetch).
  // Only for an event that hasn't ended: the section is hidden then, and listings of ended events aren't on sale.
  const resaleOpen = !!event?.id && !isPastEvent(event, new Date(nowTs));
  const { data: resaleListings = [] } = useResaleListings({ eventId: event?.id, enabled: resaleOpen });
  const resaleCount = resaleListings.reduce((n, l) => n + l.quantity, 0);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="theme-night min-h-screen bg-background">
        <HeaderNight />
        <div className="mx-auto w-full max-w-3xl pt-16 md:pt-20 lg:max-w-[1200px] lg:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:items-start">
          <div className="sm:px-4 sm:pt-4 lg:p-0 lg:pt-10">
            <div className="w-full aspect-[16/9] bg-white/5 animate-pulse" />
          </div>
          <div className="px-4 pt-6 space-y-5 lg:px-0 lg:pt-10">
            <div className="h-4 w-32 bg-muted animate-pulse" />
            <div className="h-12 w-3/4 bg-muted animate-pulse" />
            <div className="h-5 w-1/2 bg-muted animate-pulse" />
            <div className="space-y-3 pt-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Event not found ───────────────────────────────────────────────────────
  if (!event) {
    return (
      <div className="theme-night min-h-screen flex flex-col bg-background">
        <HeaderNight />
        <div className="flex-1 flex items-center justify-center p-6 pt-20 md:pt-24">
          <div className="text-center max-w-md border border-border p-8">
            <div className="w-12 h-12 bg-muted flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-semibold mb-2 text-foreground">Event not found</h1>
            <p className="text-sm text-muted-foreground mb-6">
              This event may have been unpublished, or the link is incorrect.
            </p>
            <Link
              to="/tickets"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
            >
              Browse all events
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
  // theme (including .theme-night below), so plain `text-primary` /
  // `bg-primary` utilities give the same guarantee without hardcoding a hex.
  const selected = tiers.find((t) => t.tier_id === selectedTier) ?? null;
  // The promo video: a horizontal one plays in the poster frame, a vertical one under the tickets
  // (the poster stays on top). Until its shape is known, the poster shows.
  const heroVideo = videoShape === "landscape" ? promoVideo : null;
  const teaserVideo = videoShape === "portrait" ? promoVideo : null;
  const totalCents = selected ? selected.price_cents * qty : 0;
  // Per-ticket service fee as the server computes it (database formula, or the
  // event's negotiated fee). The checkout charges the same amount. Free (€0)
  // tickets carry no fee. Ticket Safe takes no cut from the organizer.
  const feeUnitCents = selected && selected.price_cents > 0 ? (tierFeeCents ?? 0) : 0;
  const feeIsStandard = feeUnitCents > 0 && feeUnitCents === standardFeeCents;
  const feeCents = feeUnitCents * qty;
  const grandCents = totalCents + feeCents;
  // Where each tier stands for a buyer right now: on sale, sold out, or a drop that has not opened yet
  // (src/lib/tierDrops.ts; the checkout enforces the same rule in reserve_tier()).
  const dropNames = tiers.map((t) => ({ id: t.tier_id, name: t.name }));
  const releaseOf = (t: TierAvailability) =>
    tierReleaseState(
      {
        id: t.tier_id,
        name: t.name,
        is_active: t.is_active,
        total_qty: t.total_qty,
        sold_qty: t.sold_qty,
        reserved_qty: Math.max(0, t.total_qty - t.sold_qty - t.available_qty),
        sales_start_at: t.sales_start_at ?? null,
        sales_end_at: t.sales_end_at ?? null,
        opens_after_tier_id: t.opens_after_tier_id ?? null,
        released_at: t.released_at ?? null,
      },
      dropNames,
      nowTs,
    );
  const onSale = (t: TierAvailability) => releaseOf(t).kind === "open";
  const nextDropComing = tiers.some((t) => isUpcomingDrop(releaseOf(t)));
  // Lowest available price, for the summary placeholder.
  const availablePrices = tiers.filter(onSale).map((t) => t.price_cents);
  const minPriceCents = availablePrices.length ? Math.min(...availablePrices) : null;
  const categoryLabel = event.category
    ? event.category.charAt(0).toUpperCase() + event.category.slice(1)
    : null;

  // ── Derived buyer-facing status ───────────────────────────────────────────
  const anyAvailable = tiers.some(onSale);
  // Not sold out while a drop is still to come: the tier list stays, with the drop shown as "Opens …".
  const eventSoldOut = tiers.length > 0 && !anyAvailable && !nextDropComing;
  // Over once the event has ended (ends_at, or 8 h after the start): the same rule as the Studio and the
  // checkout, which refuses an order for an ended event. Re-read on every tick of the clock.
  const isPast = isPastEvent(event, new Date(nowTs));
  const sellingFast =
    !eventSoldOut &&
    tiers.some((t) => onSale(t) && t.total_qty > 0 && t.available_qty / t.total_qty < 0.3);
  // Text-only status mark (no pill background) — colour carries the meaning.
  const statusText: { label: string; colorClass: string; pulse?: boolean } = isPast
    ? { label: "Ended", colorClass: "text-muted-foreground" }
    : eventSoldOut
    ? { label: "Sold out", colorClass: "text-rose-400" }
    : !anyAvailable && nextDropComing
    ? { label: "Next drop soon", colorClass: "text-primary", pulse: true }
    : sellingFast
    ? { label: "Selling fast", colorClass: "text-primary", pulse: true }
    : { label: "On sale", colorClass: "text-emerald-400" };

  const fmtPrice = (cents: number) => `${currencySymbol(currency)}${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

  // The tier people choose most, when there is a real choice to make.
  const mostPopularId = (() => {
    if (tiers.length < 2) return null;
    const ranked = tiers.map((t) => ({ id: t.tier_id, sold: Math.max(0, t.total_qty - t.available_qty) })).sort((a, b) => b.sold - a.sold);
    return ranked[0].sold > 0 && ranked[0].sold > (ranked[1]?.sold ?? 0) ? ranked[0].id : null;
  })();
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const attendeeReady = (a: AttendeeForm) =>
    a.first_name.trim().length > 0 && a.last_name.trim().length > 0 && isEmail(a.email) && a.confirm_email.trim().toLowerCase() === a.email.trim().toLowerCase() && a.gender !== "";
  const readyCount = attendees.filter(attendeeReady).length;

  // Time, attendance, atmosphere.
  const clock = countdown(event, nowTs);
  const interestedLabel = interested >= 5
    ? `${interested >= 1000 ? `${(interested / 1000).toFixed(interested >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : interested}+ interested`
    : null;
  const startDate = new Date(event.date);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // The organizer's design as CSS variables (see src/lib/eventTheme.ts): the page's `bg-primary`,
  // `text-foreground`, `border-border`… follow it from here on.
  const themeVars = eventThemeVars({ primary: event.primary_color });
  const accent = themeVars["--event-primary"];
  const organizerAccent = isHex(event.organizer?.primary_color) ? event.organizer.primary_color : accent;
  const shareEvent = async () => {
    const url = eventShareUrl(event.slug);
    try {
      if (navigator.share) { await navigator.share({ title: event.title, text: `${event.title} · ${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch { /* share sheet dismissed */ }
  };
  const scrollToTickets = () => document.getElementById("tickets")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  // Some blocks are mounted twice (wide screen and phone): scroll to the copy that is on screen.
  const scrollToShown = (ids: string[]) =>
    ids.map((id) => document.getElementById(id)).find((el) => el && el.getClientRects().length > 0)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  // The section links under the title: only the sections this event has.
  const sectionTabs: SectionTab[] = [
    { key: "tickets", label: "Tickets", targets: ["tickets"] },
    ...(resaleOpen && resaleListings.length > 0 ? [{ key: "resale", label: "Resale", targets: ["resale-heading-desktop", "resale-heading-mobile"] }] : []),
    ...(event.description ? [{ key: "about", label: "About", targets: ["about"] }] : []),
    { key: "venue", label: "Venue", targets: ["venue"] },
    ...(event.organizer ? [{ key: "organiser", label: "Organiser", targets: ["organiser"] }] : []),
  ];
  const longAbout = (event.description ?? "").length > 280;

  // Order summary, rendered both in the desktop sticky rail (with CTA) and as a
  // mobile inline breakdown (without CTA — the sticky bottom bar carries that).
  const renderSummary = (showCta: boolean) => {
    if (eventSoldOut) {
      return (
        <div className="border border-border p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400 mb-4">Sold out</p>
          <h3 className="text-base font-medium text-foreground mb-2">This event is sold out</h3>
          {resaleCount > 0 && (
            <p className="text-sm text-foreground mb-2">Some tickets are on resale below.</p>
          )}
          <p className="text-sm text-muted-foreground mb-5">
            Follow the organizer to hear about new tickets or upcoming events.
          </p>
          {event.organizer && (
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              className="w-full py-3 text-sm font-medium border border-border hover:bg-muted transition-colors disabled:opacity-60"
            >
              {following ? "Following" : "Follow organizer"}
            </button>
          )}
        </div>
      );
    }

    if (!selected) {
      return (
        <div className="border border-border p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">
            Order summary
          </p>
          {minPriceCents != null && (
            <p className="mb-2">
              <span className="text-sm text-muted-foreground">From </span>
              <span className="text-2xl font-semibold tabular-nums text-foreground">{fmtPrice(minPriceCents)}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-5">
            {!anyAvailable && nextDropComing
              ? "The next drop is not open yet. This page updates by itself when it opens."
              : "Pick a ticket to see the total and continue."}
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
          Order summary
        </p>

        <div className="space-y-2.5 mb-4 pb-4 border-b border-border">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground min-w-0 pr-2">
              {selected.name}
              <span className="text-muted-foreground"> × {qty}</span>
            </span>
            <span className="tabular-nums text-foreground">{fmtPrice(totalCents)}</span>
          </div>
          {feeCents > 0 && (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">
                  Service fee <span className="text-muted-foreground/70">({formatMoney(feeUnitCents, currency)} × {qty})</span>
                </span>
                <span className="tabular-nums text-foreground">{fmtPrice(feeCents)}</span>
              </div>
              {feeIsStandard && <p className="mt-0.5 text-xs text-muted-foreground/70">{studioFeeRule(currency)}</p>}
            </div>
          )}
        </div>

        <div className="mb-5">
          {showPromoInput ? (
            <div className="flex gap-2">
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Promo code"
                className="flex-1 min-w-0 px-3 py-2 border border-border bg-input text-sm uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
              />
              {promoCode && (
                <button
                  type="button"
                  onClick={() => { setPromoCode(""); setShowPromoInput(false); }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPromoInput(true)}
              className="text-xs font-semibold text-cta hover:underline"
            >
              Have a promo code?
            </button>
          )}
          {promoCode && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Applied at payment — the discount shows on the final {paymentProvider === "stripe" ? "Stripe" : "Revolut"} screen.
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between mb-5">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-3xl font-semibold tabular-nums leading-none text-foreground">
            <AnimatedNumber value={grandCents / 100} prefix={currencySymbol(currency)} durationMs={150} />
          </span>
        </div>

        {showCta && (
          <>
            <button
              onClick={handleBuy}
              disabled={buying}
              className="group w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 transition-colors hover:bg-primary-hover"
            >
              {buying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening secure checkout
                </>
              ) : (
                <>
                  {grandCents === 0 ? "Get my free ticket" : "Continue to payment"}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
            <div className="mt-2.5"><CheckoutLegalNote free={grandCents === 0} /></div>
            {readyCount < qty && !buying && (
              <p className="text-[11px] leading-normal text-muted-foreground text-center mt-2.5">
                {qty === 1 ? "Fill in the name and email first." : `${qty - readyCount} ticket${qty - readyCount > 1 ? "s" : ""} still need a name and email.`}
              </p>
            )}
            {!user && (
              <p className="text-[11px] leading-normal text-muted-foreground text-center mt-2.5">
                No account needed — the ticket goes straight to the email above.
              </p>
            )}
            <div className="mt-4">
              <ProtectionBadge />
            </div>
          </>
        )}

      </div>
    );
  };

  // ── Pieces shared by the desktop rail and the phone sheet ──
  const renderTiers = () => (
    <div className="space-y-2.5" role="radiogroup" aria-label="Ticket type">
      {tiers.map((t, i) => {
        const isSelected = selectedTier === t.tier_id;
        const release = releaseOf(t);
        // A drop that has not opened yet, or a tier whose sales have ended: shown, not selectable.
        const upcoming = isUpcomingDrop(release);
        const closed = release.kind === "closed";
        const notYet = upcoming || closed;
        const soldOut = t.available_qty <= 0 || notYet;
        // Buyers never see exact stock counts (Studio-only): only a proportion, once under 30%.
        const remaining = t.total_qty > 0 ? t.available_qty / t.total_qty : 1;
        const fewLeft = !soldOut && t.total_qty > 0 && remaining < 0.3;
        const popular = mostPopularId === t.tier_id && !soldOut;
        const choose = () => {
          if (soldOut || isPast) return;
          if (!isSelected) { setSelectedTier(t.tier_id); setQty(1); }
        };
        return (
          <div
            key={t.tier_id}
            role="radio"
            aria-checked={isSelected}
            aria-disabled={soldOut}
            tabIndex={soldOut ? -1 : 0}
            onClick={choose}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } }}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            className={`relative motion-safe:animate-fade-in border transition-all duration-200 ${
              upcoming
                ? "cursor-not-allowed border-dashed border-cta/30 bg-card/60"
                : soldOut
                ? "cursor-not-allowed border-border bg-card/70 opacity-60"
                : isSelected
                ? "cursor-pointer border-primary bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                : "cursor-pointer border-border bg-card hover:border-foreground/40 motion-safe:active:scale-[0.99]"
            }`}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 p-4 sm:py-[18px] sm:pl-5 sm:pr-[18px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-base font-semibold ${soldOut ? "text-muted-foreground" : "text-foreground"}`}>{t.name}</span>
                  {upcoming ? (
                    <span className="inline-flex items-center gap-1 h-[22px] text-[11px] font-bold tracking-[0.02em] text-cta bg-cta/15 rounded-full px-2">
                      <Clock className="w-3 h-3" strokeWidth={2.5} /> Next drop
                    </span>
                  ) : closed ? (
                    <span className="inline-flex items-center h-[22px] text-[11px] font-bold tracking-[0.02em] text-muted-foreground bg-white/[0.1] rounded-full px-2">
                      Sales closed
                    </span>
                  ) : soldOut && (
                    <span className="inline-flex items-center h-[22px] text-[11px] font-bold tracking-[0.02em] text-foreground/80 bg-white/[0.1] rounded-full px-2">
                      Sold out
                    </span>
                  )}
                  {popular && (
                    <span className="inline-flex items-center gap-1 h-[22px] text-[11px] font-bold tracking-[0.02em] text-cta bg-cta/15 rounded-full px-2">
                      <Flame className="w-3 h-3" strokeWidth={2} /> Most popular
                    </span>
                  )}
                </div>
                {t.description && <span className="block text-[13.5px] mt-0.5 line-clamp-2 text-muted-foreground">{t.description}</span>}
                <span className={`ev-display block mt-2 text-lg font-bold tabular-nums ${soldOut ? "text-muted-foreground" : t.price_cents === 0 ? "text-emerald-400" : "text-foreground"}`}>
                  {t.price_cents === 0 ? "Free" : fmtPrice(t.price_cents)}
                  {isSelected && !soldOut && feeUnitCents > 0 && (
                    <small className="ml-1.5 font-sans text-[12.5px] font-medium tracking-normal text-muted-foreground">+ {formatMoney(feeUnitCents, currency)} fee</small>
                  )}
                </span>
                {isSelected && !soldOut && qty > 1 && (
                  <span className="block text-xs text-muted-foreground tabular-nums mt-0.5 motion-safe:animate-fade-in">× {qty} = {fmtPrice(t.price_cents * qty)}</span>
                )}
                {notYet ? (
                  <span className={`block text-xs mt-2 ${upcoming ? "font-medium text-cta" : "text-muted-foreground"}`}>{dropLabel(release)}</span>
                ) : soldOut ? (
                  <span className="block text-xs text-muted-foreground mt-2">
                    No more tickets in this category.{resaleCount > 0 ? " Some are on resale below." : ""}
                  </span>
                ) : fewLeft ? (
                  <div className="mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cta">
                      <span className="w-1.5 h-1.5 rounded-full bg-cta animate-pulse" />
                      Almost gone
                    </span>
                    <div className="h-1 w-32 bg-border rounded-full mt-1.5 overflow-hidden" aria-hidden>
                      <div className="h-full bg-cta rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${Math.max(6, Math.round(remaining * 100))}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
              {/* On the right: the quantity once picked, a "+" to pick, or the way to resale when it is sold out. */}
              {soldOut ? (
                !notYet && resaleCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); scrollToShown(["resale-heading-desktop", "resale-heading-mobile"]); }}
                    className="shrink-0 cursor-pointer text-[13px] font-semibold text-cta whitespace-nowrap hover:underline"
                  >
                    See resale
                  </button>
                ) : (
                  <span aria-hidden />
                )
              ) : isSelected ? (
                <div
                  className="col-span-2 flex items-center justify-between gap-3 border-t border-primary/30 pt-3 motion-safe:animate-fade-in sm:col-span-1 sm:shrink-0 sm:border-0 sm:pt-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-sm text-muted-foreground sm:hidden">How many?</span>
                  <QtyStepper
                    qty={qty}
                    onDecrease={() => setQty((n) => Math.max(1, n - 1))}
                    onIncrease={() =>
                      setQty((n) => {
                        const hardCap = Math.min(10, t.available_qty);
                        const finalCap = maxPerBuyer ? Math.min(hardCap, maxPerBuyer) : hardCap;
                        return Math.min(finalCap, n + 1);
                      })
                    }
                    disableDecrease={qty <= 1}
                    disableIncrease={qty >= Math.min(10, t.available_qty) || (maxPerBuyer != null && qty >= maxPerBuyer)}
                  />
                </div>
              ) : (
                <span aria-hidden className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="w-[18px] h-[18px]" strokeWidth={2.25} />
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderAttendees = () => {
    if (!selected) return null;
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {qty === 1 ? "Who's coming" : `Who's coming · ${qty} tickets`}
          </h2>
          <span className={`text-xs tabular-nums ${readyCount === qty ? "text-emerald-400" : "text-muted-foreground"}`}>
            {readyCount === qty ? (qty === 1 ? "Ready" : "All ready") : `${readyCount} of ${qty} ready`}
          </span>
        </div>
        <div className="space-y-4">
          {attendees.map((a, i) => {
            const emailMismatch = a.confirm_email.length > 0 && a.confirm_email.trim().toLowerCase() !== a.email.trim().toLowerCase();
            const ready = attendeeReady(a);
            return (
              <div key={i} className={`border rounded-2xl p-4 transition-colors motion-safe:animate-fade-in ${ready ? "border-emerald-400/50" : "border-border"}`} style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-dashed border-border">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold transition-colors ${ready ? "bg-emerald-400 text-background" : "border border-border text-muted-foreground"}`} aria-hidden>
                      {ready ? <Check className="w-3 h-3 motion-safe:animate-scale-in" strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{selected.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{qty > 1 ? `Ticket ${i + 1} of ${qty}` : "This name goes on the ticket"}{ready ? " · ready" : ""}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-foreground shrink-0">{fmtPrice(selected.price_cents)}</div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name">
                      <input value={a.first_name} onChange={(e) => updateAttendee(i, { first_name: e.target.value })} placeholder="First name" className="ts-field-input" maxLength={100} autoComplete="given-name" aria-label={qty > 1 ? `Ticket ${i + 1} first name` : "First name"} />
                    </Field>
                    <Field label="Last name">
                      <input value={a.last_name} onChange={(e) => updateAttendee(i, { last_name: e.target.value })} placeholder="Last name" className="ts-field-input" maxLength={100} autoComplete="family-name" aria-label={qty > 1 ? `Ticket ${i + 1} last name` : "Last name"} />
                    </Field>
                  </div>
                  <Field label="Email (ticket delivery)">
                    <input type="email" value={a.email} onChange={(e) => updateAttendee(i, { email: e.target.value })} placeholder="name@example.com" className="ts-field-input" maxLength={254} autoComplete="email" inputMode="email" aria-label={qty > 1 ? `Ticket ${i + 1} email` : "Email"} />
                  </Field>
                  <Field label="Confirm email">
                    <input type="email" value={a.confirm_email} onChange={(e) => updateAttendee(i, { confirm_email: e.target.value })} placeholder="name@example.com" className={`ts-field-input ${emailMismatch ? "border-rose-400" : ""}`} maxLength={254} autoComplete="email" inputMode="email" aria-label={qty > 1 ? `Ticket ${i + 1} confirm email` : "Confirm email"} />
                    {emailMismatch && <p className="text-[11px] text-rose-400 mt-1">Emails don't match</p>}
                  </Field>
                  <Field label="Gender">
                    <select value={a.gender} onChange={(e) => updateAttendee(i, { gender: e.target.value as AttendeeForm["gender"] })} className="ts-field-input" aria-label={qty > 1 ? `Ticket ${i + 1} gender` : "Gender"}>
                      <option value="" disabled>Select…</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
        {maxPerBuyer != null && qty >= maxPerBuyer && (
          <p className="text-[11px] text-muted-foreground text-center mt-4">Limit reached — {maxPerBuyer} ticket{maxPerBuyer > 1 ? "s" : ""} per person.</p>
        )}
      </div>
    );
  };

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background" style={themeVars as React.CSSProperties}>
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
          location: event.location ? { "@type": "Place", name: event.location, address: event.location } : undefined,
          image: event.og_image_url ?? event.banner_url ?? event.organizer?.logo_url ?? undefined,
          organizer: event.organizer?.name ? { "@type": "Organization", name: event.organizer.name, url: event.organizer.website ?? undefined } : undefined,
          offers: tiers
            .filter((t) => t.is_active && (t.total_qty ?? 0) - (t.sold_qty ?? 0) > 0)
            .map((t) => ({ "@type": "Offer", name: t.name, price: (t.price_cents / 100).toFixed(2), priceCurrency: currency, availability: "https://schema.org/InStock", url: `https://ticket-safe.eu/e/${event.slug}` })),
        }}
      />

      {/* ===== The page: the poster on the left (it stays in view on a wide screen), everything else on the
          right: who runs it, the title, the facts, then tickets and the story under a row of section links.
          On a phone the poster comes first, full width, and the rest follows in one column. ===== */}
      <main className="ev-page flex-1 pt-16 md:pt-20 pb-32">
        <div className="mx-auto w-full max-w-3xl lg:max-w-[1200px] lg:px-6 lg:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:items-start">
          {/* ===== Poster: the organizer's photo, sharp and whole, in the 16:9 frame the Studio cropped it to.
              Nothing is written on it. On a wide screen it is the top of a taller card: the date and the place
              sit under it, over the same photo blurred and darkened, so the block fills its column. ===== */}
          <div className="lg:sticky lg:top-28">
            <div className="sm:px-4 sm:pt-4 lg:p-0">
              <div className="relative lg:overflow-hidden lg:bg-card lg:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8),0_0_0_1px_rgba(174,198,255,0.12)]">
              {event.banner_url && (
                <>
                  <img src={event.banner_url} alt="" aria-hidden className="hidden lg:block absolute inset-0 w-full h-full object-cover scale-150 blur-3xl saturate-[1.15]" decoding="async" />
                  <div aria-hidden className="hidden lg:block absolute inset-0 bg-background/60" />
                </>
              )}
              <div className="relative w-full aspect-[16/9] overflow-hidden" style={{ background: accent }}>
                {heroVideo ? (
                  <PromoVideo src={heroVideo} poster={event.banner_url} className="absolute inset-0 w-full h-full object-cover" />
                ) : event.banner_url ? (
                  <img
                    src={event.banner_url}
                    alt={`${event.title} poster`}
                    className={`absolute inset-0 w-full h-full ${event.banner_fit === "contain" ? "object-contain" : "object-cover"}`}
                    fetchPriority="high"
                    decoding="async"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(120% 80% at 30% 20%, ${accent} 0%, var(--event-bg) 85%)` }}>
                    {(event.logo_url ?? event.organizer?.logo_url) && (
                      <img src={event.logo_url ?? event.organizer?.logo_url ?? ""} alt="" className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover shadow-lg" />
                    )}
                  </div>
                )}

                {/* Back / Share: two small round controls in the corners, the only thing over the photo */}
                <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { if (location.key && location.key !== "default") { allowNextHistoryBack(); navigate(-1); } else navigate("/tickets"); }}
                    aria-label="Back"
                    className="w-10 h-10 rounded-full bg-black/45 text-white backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={shareEvent}
                    aria-label="Share"
                    className="lg:hidden w-10 h-10 rounded-full bg-black/45 text-white backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
                  >
                    <Share2 className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              {/* Wide screen: when and where, then share and calendar, in the lower half of the card */}
              <div className="hidden lg:block relative px-6 pt-6 pb-6">
                <div className="flex items-start gap-4">
                  <div className="w-[62px] shrink-0 text-center border border-white/15 bg-black/25 py-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{startDate.toLocaleDateString("en-GB", { month: "short" })}</div>
                    <div className="ev-display text-[28px] font-bold leading-none text-white">{startDate.getDate()}</div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{startDate.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  </div>
                  <div className="min-w-0 flex-1 grid gap-1.5 text-[15px] text-white/80">
                    <div className="ev-display text-lg font-bold text-white">{startDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-white/55 shrink-0" strokeWidth={1.75} />
                      <span>
                        {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {event.ends_at && <> – {new Date(event.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
                        {!clock.over && <span className="text-white/55"> · {clock.label}</span>}
                      </span>
                    </div>
                    {event.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 hover:text-white transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-white/55 shrink-0" strokeWidth={1.75} />
                        <span className="min-w-0 truncate">{event.location}</span>
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={shareEvent} className="ev-act">
                    <Share2 className="w-4 h-4" strokeWidth={1.75} /> Share
                  </button>
                  {!clock.over && (
                    <button type="button" onClick={() => downloadIcs(event)} className="ev-act">
                      <CalendarPlus className="w-4 h-4" strokeWidth={1.75} /> Add to calendar
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 px-4 pt-5 lg:px-0 lg:pt-0">
            {/* ===== Who runs it, the title, the facts ===== */}
            {event.organizer && (
              <div className="flex items-center gap-2.5 text-sm text-foreground/80 motion-safe:animate-fade-in">
                {event.organizer.logo_url ? (
                  <img src={event.organizer.logo_url} alt="" className="w-[30px] h-[30px] rounded-full object-cover border border-border shrink-0" />
                ) : (
                  <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground bg-primary shrink-0">{event.organizer.name[0]?.toUpperCase()}</span>
                )}
                <span className="min-w-0 truncate">By <b className="font-semibold text-foreground">{event.organizer.name}</b></span>
                <BadgeCheck className="w-4 h-4 text-cta shrink-0" strokeWidth={1.75} aria-label="Verified organiser" />
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  aria-pressed={following}
                  className={`ml-auto shrink-0 h-8 px-3.5 rounded-full border border-border text-[13px] font-semibold text-foreground transition-colors disabled:opacity-60 ${following ? "bg-white/[0.1]" : "hover:bg-white/[0.1]"}`}
                >
                  {following ? "Following" : "Follow"}
                </button>
              </div>
            )}
            <h1 className="mt-4 text-[clamp(2.4rem,11vw,3.5rem)] lg:text-[clamp(2.75rem,4.6vw,4.5rem)] leading-[0.95] font-bold text-foreground text-balance motion-safe:animate-slide-up">
              {event.title}
            </h1>
            <div className="lg:hidden mt-5 grid gap-2 text-[15px] text-foreground/80 motion-safe:animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
              <div className="flex items-center gap-2.5">
                <Calendar className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
                {startDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <div className="flex items-center gap-2.5">
                <Clock className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span>
                  {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {event.ends_at && <> – {new Date(event.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
                  {!clock.over && <span className="text-muted-foreground"> · {clock.label}</span>}
                </span>
              </div>
              {event.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 hover:text-foreground transition-colors"
                >
                  <MapPin className="w-[18px] h-[18px] text-muted-foreground shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 truncate">{event.location}</span>
                </a>
              )}
            </div>

            {/* Chips: where sales stand, the kind of event, who is interested */}
            <div className="flex flex-wrap gap-2 mt-5 motion-safe:animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
              <span className={`inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full text-[12.5px] font-semibold ${statusText.pulse ? "bg-cta/15 text-cta" : `bg-white/[0.06] ${statusText.colorClass}`}`}>
                {statusText.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {statusText.label}
              </span>
              {categoryLabel && <span className="inline-flex items-center h-[30px] px-3 rounded-full bg-white/[0.06] text-[12.5px] font-semibold text-foreground/80">{categoryLabel}</span>}
              {interestedLabel && !clock.over && (
                <span className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-white/[0.06] text-[12.5px] font-semibold text-foreground/80">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} /> {interestedLabel}
                </span>
              )}
            </div>

            {/* Wide screen: the price to start from and the way to the tickets (a phone has the bar at the bottom) */}
            {minPriceCents != null && !eventSoldOut && !isPast && (
              <div className="hidden lg:flex mt-7 items-center justify-between gap-4 border border-border bg-card py-3.5 pl-[22px] pr-3.5">
                <div>
                  <small className="block text-xs text-muted-foreground">Tickets from</small>
                  <b className="ev-display text-2xl font-bold tabular-nums">{minPriceCents === 0 ? "Free" : fmtPrice(minPriceCents)}</b>
                </div>
                <button
                  type="button"
                  onClick={scrollToTickets}
                  className="group inline-flex items-center gap-2 h-[50px] px-[26px] bg-primary text-primary-foreground text-[15px] font-bold whitespace-nowrap transition-colors hover:bg-primary-hover motion-safe:active:scale-[0.98]"
                >
                  Get tickets <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            )}

            <EventSectionTabs tabs={sectionTabs} reduceMotion={reduceMotion} />

            {/* ===== Tickets. Mounted twice, a wide-screen copy and a phone copy sharing the same state: pick,
                then who's coming, then the checkout, then resale and the teaser. ===== */}
            <div id="tickets" className="scroll-mt-36 pt-8">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="ev-h2">Tickets</h2>
                {tiers.length > 1 && <span className="text-xs text-muted-foreground">{tiers.length} options</span>}
              </div>
              {!isPast && tiers.length > 0 && !eventSoldOut && (
                <p className="mt-1.5 text-sm text-muted-foreground">The total, service fee included, is shown before you pay.</p>
              )}

              <aside className="hidden lg:block space-y-4 mt-5">
                {isPast ? (
                  <p className="text-sm text-muted-foreground py-4">This event has ended.</p>
                ) : tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Tickets will be on sale soon. Check back shortly.</p>
                ) : eventSoldOut ? (
                  renderSummary(true)
                ) : (
                  renderTiers()
                )}
                {selected && !eventSoldOut && !isPast && (
                  <section id="details-desktop" className="scroll-mt-40 border border-border bg-card p-5">
                    {renderAttendees()}
                  </section>
                )}
                {/* In its own box, so it stays in the flow under the form instead of sticking under the section links. */}
                {selected && !eventSoldOut && !isPast && <div className="bg-card"><div className="lg:sticky lg:top-24">{renderSummary(true)}</div></div>}
                {!isPast && <EventResaleListings eventId={event.id} headingId="resale-heading-desktop" logErrors />}
                {teaserVideo && <TeaserVideo src={teaserVideo} poster={event.banner_url} title={event.title} />}
              </aside>

              <div className="lg:hidden space-y-4 mt-4">
                {isPast ? (
                  <p className="text-sm text-muted-foreground py-4">This event has ended.</p>
                ) : tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Tickets will be on sale soon. Check back shortly.</p>
                ) : eventSoldOut ? (
                  renderSummary(true)
                ) : (
                  renderTiers()
                )}
                {selected && !eventSoldOut && !isPast && (
                  <section id="details-mobile" className="scroll-mt-32 border border-border bg-card p-4 motion-safe:animate-fade-in">
                    {renderAttendees()}
                  </section>
                )}
                {selected && !eventSoldOut && !isPast && <div id="checkout" className="scroll-mt-32 bg-card">{renderSummary(true)}</div>}
                {!isPast && <EventResaleListings eventId={event.id} headingId="resale-heading-mobile" className="lg:hidden" />}
                {teaserVideo && <div className="lg:hidden"><TeaserVideo src={teaserVideo} poster={event.banner_url} title={event.title} /></div>}
              </div>
            </div>

            {/* ===== The story ===== */}
            {event.description && (
              <section id="about" className="scroll-mt-36 pt-10">
                <h2 className="ev-h2">About the event</h2>
                <p
                  className={`mt-3.5 max-w-[62ch] text-[15px] text-foreground/85 leading-relaxed whitespace-pre-line ${!aboutOpen && longAbout ? "line-clamp-5" : ""}`}
                  style={{ fontFamily: descriptionFontFamily(event.description_font) }}
                >
                  {event.description}
                </p>
                {longAbout && (
                  <button type="button" onClick={() => setAboutOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cta hover:underline">
                    {aboutOpen ? "Show less" : "Read more"}
                    <ChevronDown className={`w-4 h-4 transition-transform ${aboutOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </section>
            )}

            {/* When & where */}
            <section id="venue" className="scroll-mt-36 pt-10">
              <h2 className="ev-h2">When & where</h2>
              <div className="mt-4 flex items-start gap-4 border border-border bg-card p-5">
                <div className="w-14 shrink-0 text-center border border-border bg-background/60 py-1.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{startDate.toLocaleDateString("en-GB", { month: "short" })}</div>
                  <div className="ev-display text-2xl font-bold leading-none text-foreground">{startDate.getDate()}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{startDate.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground">
                    {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    {event.ends_at && <> – {new Date(event.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
                    <span className="text-muted-foreground"> · {clock.label}</span>
                  </div>
                  {event.location && <div className="text-base font-semibold text-foreground mt-1">{event.location}</div>}
                  <div className="flex flex-wrap gap-2 mt-3.5">
                    {!clock.over && (
                      <button type="button" onClick={() => downloadIcs(event)} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 bg-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.13] transition-colors">
                        <CalendarPlus className="w-4 h-4" strokeWidth={1.75} /> Add to calendar
                      </button>
                    )}
                    {event.location && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 bg-white/[0.08] text-sm font-semibold text-foreground hover:bg-white/[0.13] transition-colors">
                        <Navigation className="w-4 h-4" strokeWidth={1.75} /> Open in Maps
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Organiser */}
            {event.organizer && (
              <section id="organiser" className="scroll-mt-36 pt-10">
                <h2 className="ev-h2">Organiser</h2>
                <div className="mt-4 flex flex-wrap items-center gap-4 border border-border bg-card p-5" style={{ borderLeft: `3px solid ${organizerAccent}` }}>
                  {event.organizer.logo_url ? (
                    <img src={event.organizer.logo_url} alt={event.organizer.name} className="w-14 h-14 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-primary-foreground bg-primary shrink-0">{event.organizer.name[0]?.toUpperCase()}</div>
                  )}
                  <div className="flex-1 min-w-0 basis-[160px]">
                    <div className="ev-display text-lg font-bold text-foreground inline-flex items-center gap-1.5">
                      {event.organizer.name}
                      <BadgeCheck className="w-4 h-4 text-cta" strokeWidth={1.75} aria-label="Verified organiser" />
                    </div>
                    <div className="text-[13.5px] text-muted-foreground">Verified organiser{interestedLabel ? ` · ${interestedLabel} in this event` : ""}</div>
                    {event.organizer.website && (
                      <a href={event.organizer.website} target="_blank" rel="noopener noreferrer" className="text-xs text-cta hover:underline">{event.organizer.website.replace(/^https?:\/\//, "")}</a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={followBusy}
                    aria-pressed={following}
                    className={`w-full sm:w-auto shrink-0 h-11 sm:h-10 px-4 rounded-full text-sm font-semibold border transition-colors disabled:opacity-60 ${following ? "border-border text-foreground hover:bg-muted" : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"}`}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                </div>
              </section>
            )}

            {/* How it works */}
            <section className="pt-10">
              <h2 className="ev-h2">How it works</h2>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {[
                  { icon: CreditCard, text: <>Pay by card, Apple Pay or Google Pay through {paymentProvider === "stripe" ? "Stripe" : "Revolut"}. Your card never touches Ticket Safe.</> },
                  { icon: Mail, text: <>Your QR ticket lands in your inbox within a minute, as an image and a PDF.</> },
                  { icon: QrCode, text: <>Show the QR at the door. It's also in <Link to="/my-tickets" className="font-medium text-cta hover:underline">My Tickets</Link>.</> },
                  { icon: ShieldCheck, text: <>Automatic refund if the organiser cancels.</> },
                ].map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <li key={i} className="flex items-start gap-3 border border-border bg-card p-4 text-[13.5px] leading-relaxed text-foreground/85">
                      <Icon className="w-[18px] h-[18px] mt-0.5 text-cta shrink-0" strokeWidth={1.75} />
                      <span>{s.text}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4"><ProtectionBadge /></div>
            </section>

            <div className="pt-10 pb-2 text-center text-xs text-muted-foreground lg:text-left">
              Powered by <Link to="/" className="font-medium text-foreground hover:underline">Ticket Safe</Link>
              {" · "}<Link to="/terms" className="hover:underline">Terms</Link>
              {" · "}<Link to="/privacy" className="hover:underline">Privacy</Link>
            </div>
          </div>
        </div>
      </main>

      {/* ===== The bar at the bottom. Once a ticket is picked: the total and the way to pay, on every screen.
          Before that, on a phone: the price to start from and the way to the tickets. ===== */}
      {selected && !eventSoldOut && !isPast && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] motion-safe:animate-slide-up lg:px-0">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 lg:max-w-[1200px] lg:px-6">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground truncate lg:text-xs">{qty} × {selected.name}{readyCount < qty ? ` · ${qty - readyCount} to fill in` : ""}</div>
              <div className="ev-display text-lg font-bold tabular-nums leading-tight text-foreground lg:text-[22px]"><AnimatedNumber value={grandCents / 100} prefix={currencySymbol(currency)} durationMs={150} /></div>
            </div>
            <button
              type="button"
              onClick={() => (readyCount < qty ? scrollToShown(["details-desktop", "details-mobile"]) : handleBuy())}
              disabled={buying}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-6 bg-primary text-primary-foreground font-bold text-sm disabled:opacity-60 transition-colors hover:bg-primary-hover motion-safe:active:scale-[0.98] lg:px-7 lg:text-[15px]"
            >
              {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{readyCount < qty ? "Fill in details" : grandCents === 0 ? "Get my ticket" : "Pay"} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}
      {!selected && minPriceCents != null && !eventSoldOut && !isPast && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">Tickets from</div>
              <div className="ev-display text-lg font-bold tabular-nums leading-tight text-foreground">{minPriceCents === 0 ? "Free" : fmtPrice(minPriceCents)}</div>
            </div>
            <button
              type="button"
              onClick={scrollToTickets}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-6 bg-primary text-primary-foreground font-bold text-sm transition-colors hover:bg-primary-hover motion-safe:active:scale-[0.98]"
            >
              Get tickets <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .theme-night .ev-page h1, .theme-night .ev-page h2.ev-h2, .theme-night .ev-display {
          font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
        }
        .theme-night .ev-page h1 { letter-spacing: -0.045em; }
        .theme-night .ev-page h2.ev-h2 { font-size: 26px; line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; color: hsl(var(--foreground)); }
        .theme-night .ev-display { letter-spacing: -0.02em; }
        .ev-tabs { scrollbar-width: none; }
        .ev-tabs::-webkit-scrollbar { display: none; }
        .ev-page [id^="resale-heading"] { scroll-margin-top: 10.5rem; }
        .ev-act {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px;
          background: rgba(255, 255, 255, 0.1); color: hsl(var(--foreground) / 0.9); font-size: 13.5px; font-weight: 600;
          transition: background 200ms, color 200ms;
        }
        .ev-act:hover { background: rgba(255, 255, 255, 0.17); color: hsl(var(--foreground)); }
        .ts-field-input {
          width: 100%;
          padding: 11px 12px;
          border: 1px solid hsl(var(--border));
          border-radius: 0;
          background: hsl(var(--input));
          color: hsl(var(--foreground));
          font-size: 16px;
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

/** Labelled field wrapper for the attendee form inputs. */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
      {label}
    </span>
    {children}
  </label>
);

/** Round −/+ quantity control. */
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
  <div className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] p-1">
    <button
      type="button"
      onClick={onDecrease}
      disabled={disableDecrease}
      className="w-9 h-9 rounded-full flex items-center justify-center text-foreground hover:bg-white/[0.1] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Remove a ticket"
    >
      <Minus className="w-4 h-4" strokeWidth={1.75} />
    </button>
    <span key={qty} className="ev-display w-7 text-center text-base font-semibold tabular-nums text-foreground motion-safe:animate-scale-in" aria-live="polite">{qty}</span>
    <button
      type="button"
      onClick={onIncrease}
      disabled={disableIncrease}
      className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Add a ticket"
    >
      <Plus className="w-4 h-4" strokeWidth={1.75} />
    </button>
  </div>
);

export default EventPublic;
