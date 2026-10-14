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
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTierServiceFee } from "@/hooks/useServiceFee";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import HeaderNight from "@/components/HeaderNight";
import { descriptionFontFamily } from "@/lib/descriptionFonts";
import { ProtectionBadge } from "@/components/common/ProtectionBadge";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

/** "In 26 days", "In 3 h 12 min", "Happening now", "Ended". Short, for a chip. */
function countdown(startIso: string, endIso: string | null, now: number): { label: string; live: boolean; over: boolean } {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : start + 6 * 3_600_000;
  if (now >= end) return { label: "Ended", live: false, over: true };
  if (now >= start) return { label: "Happening now", live: true, over: false };
  const diff = start - now;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d >= 2) return { label: `In ${d} days`, live: false, over: false };
  if (d === 1) return { label: "Tomorrow", live: false, over: false };
  if (h >= 1) return { label: `In ${h} h ${m.toString().padStart(2, "0")}`, live: false, over: false };
  return { label: `In ${Math.max(1, m)} min`, live: false, over: false };
}

/** Calendar file for Apple, Google, Outlook: one download, every app opens it. */
function downloadIcs(ev: { title: string; date: string; ends_at: string | null; location: string | null; slug: string; description: string | null }) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const end = ev.ends_at ?? new Date(new Date(ev.date).getTime() + 4 * 3_600_000).toISOString();
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
}

const EventPublic = () => {
  useThemeMode("night");
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [tiers, setTiers] = useState<TierAvailability[]>([]);
  const [resaleCount, setResaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const tierFeeCents = useTierServiceFee(selectedTier);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [maxPerBuyer, setMaxPerBuyer] = useState<number | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "revolut">("revolut");
  const [attendees, setAttendees] = useState<AttendeeForm[]>([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const nowTs = useNow(30_000);
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollY(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);


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
        `id, title, description, description_font, date, ends_at, location, category, slug, status, primary_color, banner_url, video_url, logo_url, og_image_url, seo_description, organizer_id, max_tickets_per_buyer, payment_provider,
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
    setPaymentProvider((ev as { payment_provider?: string }).payment_provider === "stripe" ? "stripe" : "revolut");

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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="theme-night min-h-screen bg-background">
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
  const totalCents = selected ? selected.price_cents * qty : 0;
  // Per-ticket service fee as the server computes it (database formula, or the
  // event's negotiated fee). The checkout charges the same amount. Free (€0)
  // tickets carry no fee. Ticket Safe takes no cut from the organizer.
  const feeUnitCents = selected && selected.price_cents > 0 ? (tierFeeCents ?? 0) : 0;
  const feeCents = feeUnitCents * qty;
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
    ? { label: "Ended", colorClass: "text-muted-foreground" }
    : eventSoldOut
    ? { label: "Sold out", colorClass: "text-rose-400" }
    : sellingFast
    ? { label: "Selling fast", colorClass: "text-primary", pulse: true }
    : { label: "On sale", colorClass: "text-emerald-400" };

  const fmtPrice = (cents: number) => `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

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
  const clock = countdown(event.date, event.ends_at, nowTs);
  const soldTotal = tiers.reduce((n, t) => n + Math.max(0, t.total_qty - t.available_qty), 0);
  const goingLabel = soldTotal >= 10 ? `${Math.floor(soldTotal / 10) * 10}+ going` : null;
  const startDate = new Date(event.date);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const parallax = reduceMotion ? 0 : Math.min(scrollY * 0.3, 140);
  const accent = /^#[0-9a-fA-F]{6}$/.test(event.primary_color ?? "") ? event.primary_color : "#3A5FE6";
  const shareEvent = async () => {
    const url = `https://ticket-safe.eu/e/${event.slug}`;
    try {
      if (navigator.share) { await navigator.share({ title: event.title, text: `${event.title} · ${startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch { /* share sheet dismissed */ }
  };
  const scrollToTickets = () => document.getElementById("tickets")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  const longAbout = (event.description ?? "").length > 280;

  // Order summary, rendered both in the desktop sticky rail (with CTA) and as a
  // mobile inline breakdown (without CTA — the sticky bottom bar carries that).
  const renderSummary = (showCta: boolean) => {
    if (eventSoldOut) {
      return (
        <div className="border border-border p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400 mb-4">Sold out</p>
          <h3 className="text-base font-medium text-foreground mb-2">This event is sold out</h3>
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
            Pick a ticket to see the total and continue.
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
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                Service fee <span className="text-muted-foreground/70">(€{(feeUnitCents / 100).toFixed(2)} × {qty})</span>
              </span>
              <span className="tabular-nums text-foreground">{fmtPrice(feeCents)}</span>
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
              className="text-xs font-medium text-primary hover:underline"
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
            <AnimatedNumber value={grandCents / 100} prefix="€" durationMs={150} />
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
            {readyCount < qty && !buying && (
              <p className="text-[11px] text-muted-foreground text-center mt-2.5">
                {qty === 1 ? "Fill in the name and email first." : `${qty - readyCount} ticket${qty - readyCount > 1 ? "s" : ""} still need a name and email.`}
              </p>
            )}
            {!user && (
              <p className="text-[11px] text-muted-foreground text-center mt-2.5">
                No account needed — the ticket goes straight to the email above.
              </p>
            )}
            <div className="mt-4">
              <ProtectionBadge />
            </div>
          </>
        )}

        {maxPerBuyer != null && qty >= maxPerBuyer && (
          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Limit reached — {maxPerBuyer} ticket{maxPerBuyer > 1 ? "s" : ""} per person.
          </p>
        )}
      </div>
    );
  };

  // ── Pieces shared by the desktop rail and the phone sheet ──
  const renderTiers = () => (
    <div className="space-y-2.5" role="radiogroup" aria-label="Ticket type">
      {tiers.map((t, i) => {
        const isSelected = selectedTier === t.tier_id;
        const soldOut = t.available_qty <= 0;
        // Buyers never see exact stock counts (Studio-only): only a proportion, once under 30%.
        const remaining = t.total_qty > 0 ? t.available_qty / t.total_qty : 1;
        const fewLeft = !soldOut && t.total_qty > 0 && remaining < 0.3;
        const popular = mostPopularId === t.tier_id && !soldOut;
        const choose = () => {
          if (soldOut) return;
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
            className={`relative motion-safe:animate-fade-in border rounded-2xl transition-all duration-200 ${
              soldOut
                ? "opacity-40 cursor-not-allowed border-border bg-card/40"
                : isSelected
                ? "cursor-pointer border-primary bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                : "cursor-pointer border-border bg-card/60 hover:border-foreground/40 hover:bg-card motion-safe:active:scale-[0.99]"
            }`}
          >
            <div className="flex items-start gap-3.5 p-4">
              <span
                aria-hidden
                className={`mt-0.5 w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition-colors ${
                  isSelected && !soldOut ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/50"
                }`}
              >
                {isSelected && !soldOut && <Check className="w-3 h-3 motion-safe:animate-scale-in" strokeWidth={3} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{t.name}</span>
                  {popular && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary bg-primary/15 rounded-full px-2 py-0.5">
                      <Flame className="w-3 h-3" strokeWidth={2} /> Most popular
                    </span>
                  )}
                  {t.price_cents === 0 && !soldOut && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400 bg-emerald-400/15 rounded-full px-2 py-0.5">Free</span>
                  )}
                </div>
                {t.description && <span className="block text-sm text-muted-foreground mt-0.5 line-clamp-2">{t.description}</span>}
                {soldOut ? (
                  <span className="block text-xs text-muted-foreground mt-2">Sold out</span>
                ) : fewLeft ? (
                  <div className="mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Almost gone
                    </span>
                    <div className="h-1 w-32 bg-border rounded-full mt-1.5 overflow-hidden" aria-hidden>
                      <div className="h-full bg-primary rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${Math.max(6, Math.round(remaining * 100))}%` }} />
                    </div>
                  </div>
                ) : null}
                {isSelected && !soldOut && (
                  <div className="mt-3.5 pt-3.5 border-t border-primary/30 flex items-center justify-between gap-3 motion-safe:animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm text-muted-foreground">How many?</span>
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
                )}
              </div>
              <div className="text-right shrink-0">
                <div className={`font-semibold tabular-nums text-foreground transition-all ${isSelected ? "text-xl" : "text-base"}`}>{fmtPrice(t.price_cents)}</div>
                {isSelected && !soldOut && qty > 1 && (
                  <div className="text-xs text-muted-foreground tabular-nums mt-0.5 motion-safe:animate-fade-in">× {qty} = {fmtPrice(t.price_cents * qty)}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {resaleCount > 0 && (
        <Link
          to={`/event/${event.id}/tickets`}
          className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border border-dashed border-border text-sm text-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <span>Resale: {resaleCount} ticket{resaleCount > 1 ? "s" : ""} from other students</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
      )}
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

  const InfoChip = ({ icon: Icon, children, onClick, href, tone = "default" }: { icon: typeof Calendar; children: React.ReactNode; onClick?: () => void; href?: string; tone?: "default" | "live" | "accent" }) => {
    const cls = `snap-start shrink-0 inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full border text-sm whitespace-nowrap transition-colors ${
      tone === "live" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : tone === "accent" ? "border-primary/50 bg-primary/15 text-foreground" : "border-border bg-card/70 text-foreground"
    } ${onClick || href ? "hover:border-foreground/50" : ""}`;
    const inner = <><Icon className={`w-4 h-4 ${tone === "live" ? "text-emerald-400" : "text-primary"}`} strokeWidth={1.75} />{children}</>;
    if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>;
    if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
    return <span className={cls}>{inner}</span>;
  };


  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
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
            .map((t) => ({ "@type": "Offer", name: t.name, price: (t.price_cents / 100).toFixed(2), priceCurrency: "EUR", availability: "https://schema.org/InStock", url: `https://ticket-safe.eu/e/${event.slug}` })),
        }}
      />

      {/* ===== Poster: the image runs under the transparent header and
          fades into the page; the title sits on it. ===== */}
      <section className="relative">
        <div className="relative w-full h-[56vh] min-h-[380px] max-h-[560px] sm:h-auto sm:min-h-0 sm:max-h-none sm:aspect-[16/9] lg:aspect-[21/9] overflow-hidden" style={{ background: accent }}>
          <div className="absolute inset-0 will-change-transform" style={{ transform: `translate3d(0, ${parallax}px, 0) scale(${1 + parallax / 1400})` }}>
            {event.video_url ? (
              <video src={event.video_url} className="absolute inset-0 w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : event.banner_url ? (
              <img src={event.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover" fetchPriority="high" decoding="async" />
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 30% 20%, ${accent} 0%, hsl(var(--background)) 75%)` }} />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-transparent" />

          {/* Floating controls, under the header's own row */}
          <div className="absolute top-[4.5rem] md:top-24 inset-x-0 px-4">
            <div className="container mx-auto max-w-5xl flex items-center justify-between">
              <button
                type="button"
                onClick={() => { if (location.key && location.key !== "default") navigate(-1); else navigate("/tickets"); }}
                aria-label="Back"
                className="w-10 h-10 rounded-full bg-background/60 backdrop-blur border border-border/60 flex items-center justify-center text-foreground hover:bg-background/80"
              >
                <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={shareEvent}
                aria-label="Share"
                className="w-10 h-10 rounded-full bg-background/60 backdrop-blur border border-border/60 flex items-center justify-center text-foreground hover:bg-background/80"
              >
                <Share2 className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Caption on the image */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-5 md:pb-8">
            <div className="container mx-auto max-w-5xl">
              <div className="flex items-center gap-2.5 flex-wrap text-[11px] font-bold uppercase tracking-[0.12em] mb-3 motion-safe:animate-fade-in">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-background/60 backdrop-blur border border-border/60 ${statusText.colorClass}`}>
                  {statusText.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                  {statusText.label}
                </span>
                {categoryLabel && <span className="text-foreground/80">{categoryLabel}</span>}
              </div>
              <h1 className="text-[2.6rem] leading-[0.98] sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-foreground text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] motion-safe:animate-slide-up">
                {event.title}
              </h1>
              {event.organizer && (
                <div className="mt-3.5 inline-flex items-center gap-2 text-sm text-foreground/90 motion-safe:animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
                  {event.organizer.logo_url ? (
                    <img src={event.organizer.logo_url} alt="" className="w-7 h-7 rounded-full object-cover border border-border/60" />
                  ) : (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground bg-primary">{event.organizer.name[0]?.toUpperCase()}</span>
                  )}
                  <span className="font-medium">{event.organizer.name}</span>
                  <BadgeCheck className="w-4 h-4 text-primary" strokeWidth={1.75} aria-label="Verified organiser" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chips: the facts, swipeable on a phone */}
        <div className="container mx-auto max-w-5xl px-4">
          <div className="ts-chips flex gap-2 overflow-x-auto snap-x py-3 -mx-4 px-4 sm:mx-0 sm:px-0 motion-safe:animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
            <InfoChip icon={Calendar}>{startDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</InfoChip>
            {event.location && (
              <InfoChip icon={MapPin} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}>
                <span className="max-w-[180px] truncate">{event.location}</span>
              </InfoChip>
            )}
            <InfoChip icon={Clock} tone={clock.live ? "live" : "default"}>{clock.label}</InfoChip>
            {goingLabel && !clock.over && <InfoChip icon={Users}>{goingLabel}</InfoChip>}
            {minPriceCents != null && !eventSoldOut && !isPast && (
              <InfoChip icon={Ticket} tone="accent" onClick={scrollToTickets}>{minPriceCents === 0 ? "Free" : `From ${fmtPrice(minPriceCents)}`}</InfoChip>
            )}
          </div>
        </div>
      </section>

      <main className="flex-1 pb-32 lg:pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr] gap-8 lg:gap-12 lg:items-start mt-2 md:mt-4">
            {/* ===== LEFT (desktop): tickets, then who's coming, then the checkout ===== */}
            <aside className="hidden lg:block space-y-4">
              <section className="rounded-2xl border border-border bg-card/50 p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tickets</h2>
                  {tiers.length > 1 && <span className="text-[11px] text-muted-foreground">{tiers.length} options</span>}
                </div>
                {tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Tickets will be on sale soon. Check back shortly.</p>
                ) : eventSoldOut ? (
                  renderSummary(true)
                ) : (
                  renderTiers()
                )}
              </section>
              {selected && !eventSoldOut && (
                <section className="rounded-2xl border border-border bg-card/50 p-5">
                  {renderAttendees()}
                </section>
              )}
              {selected && !eventSoldOut && <div className="lg:sticky lg:top-24">{renderSummary(true)}</div>}
            </aside>

            {/* ===== RIGHT: the story (on a phone: tickets first, then the story) ===== */}
            <div className="min-w-0 space-y-4">
              <section id="tickets" className="lg:hidden rounded-2xl border border-border bg-card/50 p-4 scroll-mt-20">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tickets</h2>
                  {tiers.length > 1 && <span className="text-[11px] text-muted-foreground">{tiers.length} options</span>}
                </div>
                {tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Tickets will be on sale soon. Check back shortly.</p>
                ) : eventSoldOut ? (
                  renderSummary(true)
                ) : (
                  renderTiers()
                )}
              </section>
              {selected && !eventSoldOut && (
                <section className="lg:hidden rounded-2xl border border-border bg-card/50 p-4 motion-safe:animate-fade-in">
                  {renderAttendees()}
                </section>
              )}
              {selected && !eventSoldOut && <div id="checkout" className="lg:hidden scroll-mt-20">{renderSummary(true)}</div>}
              {event.description && (
                <section className="rounded-2xl border border-border bg-card/50 p-5">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">About</h2>
                  <p
                    className={`text-[15px] text-foreground/90 leading-relaxed whitespace-pre-line ${!aboutOpen && longAbout ? "line-clamp-5" : ""}`}
                    style={{ fontFamily: descriptionFontFamily(event.description_font) }}
                  >
                    {event.description}
                  </p>
                  {longAbout && (
                    <button type="button" onClick={() => setAboutOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                      {aboutOpen ? "Show less" : "Read more"}
                      <ChevronDown className={`w-4 h-4 transition-transform ${aboutOpen ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </section>
              )}

              {/* When & where */}
              <section className="rounded-2xl border border-border bg-card/50 p-5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">When & where</h2>
                <div className="flex items-start gap-4">
                  <div className="w-14 shrink-0 text-center rounded-xl border border-border bg-background/60 py-1.5">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{startDate.toLocaleDateString("en-GB", { month: "short" })}</div>
                    <div className="text-2xl font-semibold leading-none text-foreground">{startDate.getDate()}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{startDate.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">
                      {startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {event.ends_at && <> – {new Date(event.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</>}
                      <span className="text-muted-foreground"> · {clock.label}</span>
                    </div>
                    {event.location && <div className="text-sm text-foreground mt-1">{event.location}</div>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {!clock.over && (
                        <button type="button" onClick={() => downloadIcs(event)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-sm text-foreground hover:bg-muted transition-colors">
                          <CalendarPlus className="w-4 h-4" strokeWidth={1.75} /> Add to calendar
                        </button>
                      )}
                      {event.location && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-sm text-foreground hover:bg-muted transition-colors">
                          <Navigation className="w-4 h-4" strokeWidth={1.75} /> Open in Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Organiser */}
              {event.organizer && (
                <section className="rounded-2xl border border-border bg-card/50 p-5" style={{ borderLeft: `3px solid ${/^#[0-9a-fA-F]{6}$/.test(event.organizer.primary_color ?? "") ? event.organizer.primary_color : accent}` }}>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">Organised by</h2>
                  <div className="flex items-center gap-4">
                    {event.organizer.logo_url ? (
                      <img src={event.organizer.logo_url} alt={event.organizer.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-primary-foreground bg-primary shrink-0">{event.organizer.name[0]?.toUpperCase()}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground inline-flex items-center gap-1.5">
                        {event.organizer.name}
                        <BadgeCheck className="w-4 h-4 text-primary" strokeWidth={1.75} aria-label="Verified organiser" />
                      </div>
                      <div className="text-xs text-muted-foreground">Verified organiser{goingLabel ? ` · ${goingLabel} to this event` : ""}</div>
                      {event.organizer.website && (
                        <a href={event.organizer.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">{event.organizer.website.replace(/^https?:\/\//, "")}</a>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleFollow}
                      disabled={followBusy}
                      aria-pressed={following}
                      className={`shrink-0 h-10 px-4 rounded-full text-sm font-medium border transition-colors disabled:opacity-60 ${following ? "border-border text-foreground hover:bg-muted" : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"}`}
                    >
                      {following ? "Following" : "Follow"}
                    </button>
                  </div>
                </section>
              )}

              {/* How it works */}
              <section className="rounded-2xl border border-border bg-card/50 p-5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-4">How it works</h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: CreditCard, text: <>Pay by card, Apple Pay or Google Pay through {paymentProvider === "stripe" ? "Stripe" : "Revolut"}. Your card never touches Ticket Safe.</> },
                    { icon: Mail, text: <>Your QR ticket lands in your inbox within a minute, as an image and a PDF.</> },
                    { icon: QrCode, text: <>Show the QR at the door. It's also in <Link to="/my-tickets" className="font-medium text-primary hover:underline">My Tickets</Link>.</> },
                    { icon: ShieldCheck, text: <>Automatic refund if the organiser cancels.</> },
                  ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <li key={i} className="flex items-start gap-3 text-sm text-foreground/85">
                        <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><Icon className="w-4 h-4" strokeWidth={1.75} /></span>
                        <span className="pt-1.5">{s.text}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 pt-4 border-t border-border"><ProtectionBadge /></div>
              </section>

              <div className="pt-4 pb-2 text-center text-xs text-muted-foreground">
                Powered by <Link to="/" className="font-medium text-foreground hover:underline">Ticket Safe</Link>
                {" · "}<Link to="/terms" className="hover:underline">Terms</Link>
                {" · "}<Link to="/privacy" className="hover:underline">Privacy</Link>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ===== Phone: a bar only once a ticket is picked, taking you to the checkout ===== */}
      {selected && !eventSoldOut && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/90 backdrop-blur px-4 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] motion-safe:animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground truncate">{qty} × {selected.name}{readyCount < qty ? ` · ${qty - readyCount} to fill in` : ""}</div>
              <div className="text-lg font-semibold tabular-nums leading-tight text-foreground"><AnimatedNumber value={grandCents / 100} prefix="€" durationMs={150} /></div>
            </div>
            <button
              type="button"
              onClick={() => (readyCount < qty ? document.getElementById("checkout")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }) : handleBuy())}
              disabled={buying}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-6 rounded-full bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60 transition-colors hover:bg-primary-hover motion-safe:active:scale-[0.98]"
            >
              {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{readyCount < qty ? "Fill in details" : grandCents === 0 ? "Get my ticket" : "Pay"} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ts-chips { scrollbar-width: none; }
        .ts-chips::-webkit-scrollbar { display: none; }
        .ts-field-input {
          width: 100%;
          padding: 11px 12px;
          border: 1px solid hsl(var(--border));
          border-radius: 10px;
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
  <div className="inline-flex items-center gap-2">
    <button
      type="button"
      onClick={onDecrease}
      disabled={disableDecrease}
      className="w-10 h-10 border border-border flex items-center justify-center hover:bg-muted active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Remove a ticket"
    >
      <Minus className="w-4 h-4" strokeWidth={1.75} />
    </button>
    <span key={qty} className="w-8 text-center text-base font-semibold tabular-nums text-foreground motion-safe:animate-scale-in" aria-live="polite">{qty}</span>
    <button
      type="button"
      onClick={onIncrease}
      disabled={disableIncrease}
      className="w-10 h-10 border border-border flex items-center justify-center hover:bg-muted active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      aria-label="Add a ticket"
    >
      <Plus className="w-4 h-4" strokeWidth={1.75} />
    </button>
  </div>
);

export default EventPublic;
