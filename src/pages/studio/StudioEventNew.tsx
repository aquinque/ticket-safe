import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Type,
  FileText,
  Image as ImageIcon,
  Palette,
  Tag,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Users,
  Ticket,
  CheckCircle2,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectCampus } from "@/lib/campus";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import EventPreviewCard from "@/components/studio/EventPreviewCard";

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

interface TierDraft {
  name: string;
  description: string;
  priceEuros: string;
  totalQty: string;
  /** YYYY-MM-DDTHH:mm — empty string when no scheduled drop. */
  salesStartAt: string;
  salesEndAt: string;
  /** Per-order cap; empty string falls back to the event-wide limit. */
  maxPerOrder: string;
}

const makeTier = (over: Partial<TierDraft> = {}): TierDraft => ({
  name: "Regular",
  description: "",
  priceEuros: "20",
  totalQty: "100",
  salesStartAt: "",
  salesEndAt: "",
  maxPerOrder: "",
  ...over,
});

const STEPS = [
  { id: "details", label: "Details", icon: Sparkles },
  { id: "schedule", label: "Date & place", icon: Calendar },
  { id: "tickets", label: "Tickets", icon: Tag },
  { id: "cover", label: "Cover & link", icon: ImageIcon },
  { id: "review", label: "Review", icon: Eye },
] as const;

const StudioEventNew = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [step, setStep] = useState(0);
  const [stepMsg, setStepMsg] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("party");
  // Brand color — defaults to the TicketSafe navy. Organizers can override
  // per-event to match their gala/society visual identity. Saved to
  // events.primary_color (already a column) and used on the public event page.
  const [primaryColor, setPrimaryColor] = useState<string>(
    organizer?.primary_color ?? "#003399",
  );

  useEffect(() => {
    // Pre-fill with the organizer's brand color once it loads.
    if (organizer?.primary_color) setPrimaryColor(organizer.primary_color);
  }, [organizer?.primary_color]);
  const [limitEnabled, setLimitEnabled] = useState(true);
  const [maxPerBuyer, setMaxPerBuyer] = useState("1");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tiers, setTiers] = useState<TierDraft[]>([makeTier()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio/events/new");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && !orgLoading && !organizer) {
      navigate("/organizers/apply");
    } else if (organizer && organizer.status !== "approved") {
      navigate("/studio");
    }
  }, [organizer, orgLoading, authLoading, navigate]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  const onBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Banner image must be under 5 MB.");
      return;
    }
    // Open the cropper so the organizer can frame the photo to 16:9.
    setCropSrc(URL.createObjectURL(f));
    setCropOpen(true);
    e.target.value = ""; // allow re-selecting the same file later
  };

  const onCropped = (file: File) => {
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  const addTier = () => {
    setTiers((t) => [...t, makeTier({ name: "", priceEuros: "30", totalQty: "50" })]);
  };
  const removeTier = (i: number) => setTiers((t) => t.filter((_, idx) => idx !== i));
  const updateTier = (i: number, patch: Partial<TierDraft>) =>
    setTiers((t) => t.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const validate = (): string | null => {
    if (!organizer) return "Organizer not loaded.";
    if (title.trim().length < 3) return "Event title must be at least 3 characters.";
    if (!date) return "Pick a start date and time.";
    if (new Date(date).getTime() < Date.now() - 60_000) return "Start date is in the past.";
    if (endsAt && new Date(endsAt) <= new Date(date)) return "End date must be after the start.";
    if (slug.length < 3 || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug))
      return "Slug must be 3+ chars, lowercase letters, numbers, dashes.";
    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) return "Primary color must be a hex like #003399.";
    if (tiers.length === 0) return "Add at least one ticket tier.";
    for (const t of tiers) {
      if (!t.name.trim()) return "Every tier needs a name.";
      const p = Number(t.priceEuros);
      const q = Number(t.totalQty);
      if (!Number.isFinite(p) || p < 0 || p > 5000) return `Tier "${t.name}" price must be 0-5000.`;
      if (!Number.isInteger(q) || q < 1 || q > 20000) return `Tier "${t.name}" quantity must be 1-20000.`;
    }
    return null;
  };

  // Lightweight per-step gating — guides the organizer without blocking the
  // canonical validate() that still runs at submit. Never throws.
  const stepError = (i: number): string | null => {
    if (i === 0) {
      if (title.trim().length < 3) return "Give your event a title (at least 3 characters).";
    }
    if (i === 1) {
      if (!date) return "Pick a start date and time.";
      if (new Date(date).getTime() < Date.now() - 60_000) return "Start date can't be in the past.";
      if (endsAt && new Date(endsAt) <= new Date(date)) return "The end time must be after the start.";
    }
    if (i === 2) {
      if (tiers.length === 0) return "Add at least one ticket type.";
      for (const t of tiers) {
        if (!t.name.trim()) return "Every ticket type needs a name.";
        const p = Number(t.priceEuros);
        const q = Number(t.totalQty);
        if (!Number.isFinite(p) || p < 0 || p > 5000) return `"${t.name || "Tier"}" price must be between €0 and €5000.`;
        if (!Number.isInteger(q) || q < 1 || q > 20000) return `"${t.name || "Tier"}" quantity must be between 1 and 20000.`;
      }
    }
    if (i === 3) {
      if (slug.length < 3 || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug))
        return "Choose a valid public link (lowercase letters, numbers, dashes).";
      if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) return "Pick a valid brand color, e.g. #003399.";
    }
    return null;
  };

  const goNext = () => {
    const e = stepError(step);
    if (e) {
      setStepMsg(e);
      return;
    }
    setStepMsg(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => {
    setStepMsg(null);
    setStep((s) => Math.max(0, s - 1));
  };
  const goToStep = (i: number) => {
    setStepMsg(null);
    setStep(i);
  };

  const handleSubmit = async () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!organizer || !user) return;

    setSubmitting(true);
    try {
      // 1) Upload banner (if any) to organizer-assets/{userId}/banners/...
      let bannerUrl: string | null = null;
      if (bannerFile) {
        const ext = bannerFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("organizer-assets")
          .upload(path, bannerFile, { cacheControl: "3600", upsert: false });
        if (upErr) {
          console.error("[studio-event-new] banner upload:", upErr);
          throw new Error("Could not upload the banner image.");
        }
        const { data: pub } = supabase.storage.from("organizer-assets").getPublicUrl(path);
        bannerUrl = pub.publicUrl;
      }

      // 2) Ensure slug is unique (append random suffix if not).
      let finalSlug = slug;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: clash } = await supabase
          .from("events")
          .select("id")
          .eq("slug", finalSlug)
          .maybeSingle();
        if (!clash) break;
        finalSlug = `${slug}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 60);
      }

      // 3) Insert event (status = draft until tiers exist + organizer publishes).
      // Auto-classify into a campus rubric based on the organizer's identity
      // (slug + name + contact email) and the event location. e.g.
      // "ebs-madrid" / "ESCP Madrid Events" → campus = "madrid".
      const autoCampus = detectCampus({
        slug: organizer.slug,
        name: organizer.name,
        contact_email: organizer.contact_email,
        about: organizer.about,
        location: location || null,
      });

      const limitN = parseInt(maxPerBuyer, 10);
      const limitValue =
        limitEnabled && Number.isFinite(limitN) && limitN >= 1 && limitN <= 50 ? limitN : null;

      const { data: ev, error: evErr } = await supabase
        .from("events")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          date: new Date(date).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          location: location.trim() || null,
          category: category || "other",
          campus: autoCampus,
          university: "ESCP Business School",
          base_price: Number(tiers[0]?.priceEuros) || 0,
          organizer_id: organizer.id,
          slug: finalSlug,
          primary_color: primaryColor,
          banner_url: bannerUrl,
          logo_url: organizer.logo_url,
          status: "draft",
          sold_via_studio: true,
          is_active: true,
          max_tickets_per_buyer: limitValue,
        })
        .select("id, slug")
        .single();

      if (evErr || !ev) {
        console.error("[studio-event-new] insert event:", evErr);
        throw new Error(evErr?.message ?? "Could not create the event.");
      }

      // 4) Insert tiers
      const tierRows = tiers.map((t, i) => ({
        event_id: ev.id,
        name: t.name.trim(),
        description: t.description.trim() || null,
        price_cents: Math.round(Number(t.priceEuros) * 100),
        currency: "EUR",
        total_qty: Number(t.totalQty),
        sort_order: i,
        is_active: true,
        sales_start_at: t.salesStartAt ? new Date(t.salesStartAt).toISOString() : null,
        sales_end_at:   t.salesEndAt   ? new Date(t.salesEndAt).toISOString()   : null,
        // max_per_order is NOT NULL in the DB (default 10). When the organizer
        // leaves the per-order cap blank, fall back to 10 — sending null would
        // violate the not-null constraint and the whole tier insert fails.
        max_per_order:  t.maxPerOrder.trim() ? Math.max(1, Number(t.maxPerOrder)) : 10,
      }));
      const { error: tErr } = await supabase.from("event_tiers").insert(tierRows);
      if (tErr) {
        console.error("[studio-event-new] insert tiers:", tErr);
        throw new Error("Event saved but tiers failed: " + tErr.message);
      }

      // Publish now that the tiers exist. We deliberately insert the event as a
      // draft first and only flip it to published once its tiers are in place,
      // so a tier failure can never leave a live event with nothing to buy.
      const { error: pubErr } = await supabase
        .from("events")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", ev.id);
      if (pubErr) {
        console.warn("[studio-event-new] publish:", pubErr);
        toast.success("Event created. Open it to publish to the marketplace.");
        navigate(`/studio/events/${ev.id}`, { replace: true });
        return;
      }

      // Best-effort: email the organizer that their event is live.
      supabase.functions
        .invoke("organizer-notify", {
          body: { kind: "event_published", organizer_id: organizer.id, event_id: ev.id },
        })
        .catch((err) => console.warn("[studio-event-new] publish notify failed:", err));

      toast.success("Event published — it's now live on the marketplace! 🎉");
      navigate(`/studio/events/${ev.id}`, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const priceFrom = (() => {
    const nums = tiers.map((t) => Number(t.priceEuros)).filter((n) => Number.isFinite(n) && n >= 0);
    return nums.length ? Math.min(...nums) : null;
  })();
  const isLast = step === STEPS.length - 1;

  const previewNode = (
    <EventPreviewCard
      title={title}
      organizerName={organizer?.name}
      organizerLogoUrl={organizer?.logo_url}
      dateISO={date ? new Date(date).toISOString() : null}
      location={location}
      category={category}
      bannerUrl={bannerPreview}
      primaryColor={primaryColor}
      priceFromEuros={priceFrom}
    />
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="New event — Ticket Safe Studio" description="Create a branded event in Ticket Safe Studio." />
      <Header minimal />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-4">
            <BackButton fallbackPath="/studio" />
          </div>

          {/* ===== Page header ===== */}
          <div className="flex items-start gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight">Create a new event</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-2xl">
                Set the details, add your ticket types, and preview your listing — then publish it
                straight to the marketplace.
              </p>
            </div>
          </div>

          {/* ===== Stepper ===== */}
          <Stepper current={step} stepError={stepError} onStep={goToStep} />

          {/* ===== Body: form + live preview ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
            <div className="lg:col-span-3 space-y-6">
              {step === 0 && (
                <StepCard
                  icon={Sparkles}
                  title="Event details"
                  desc="Start with the name and a short pitch. This is the first thing students see."
                >
                  <Field label="Event title" icon={Type}>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="ts-input"
                      placeholder="ESCP Winter Gala 2026"
                      maxLength={120}
                    />
                  </Field>
                  <Field
                    label="Short description"
                    icon={FileText}
                    hint="2-3 sentences shown above the buy button. Keep it punchy and exciting."
                  >
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="ts-input min-h-[120px]"
                      placeholder="A one-night-only black-tie gala at Pavillon d'Armenonville — live band, champagne, and the year's biggest reunion."
                      maxLength={1000}
                    />
                  </Field>
                  <Field label="Category" icon={Tag} hint="Helps students find your event in the right place.">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="ts-input">
                      <option value="party">Party</option>
                      <option value="gala">Gala</option>
                      <option value="conference">Conference</option>
                      <option value="sports">Sports</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                </StepCard>
              )}

              {step === 1 && (
                <StepCard
                  icon={Calendar}
                  title="Date, time & location"
                  desc="Tell guests when and where to show up."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Start date & time" icon={Calendar}>
                      <input
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="ts-input"
                      />
                    </Field>
                    <Field label="End date & time" icon={Calendar} hint="Optional — leave blank for open-ended events.">
                      <input
                        type="datetime-local"
                        value={endsAt}
                        onChange={(e) => setEndsAt(e.target.value)}
                        className="ts-input"
                      />
                    </Field>
                  </div>
                  <Field label="Location" icon={MapPin} hint="Venue name and city. Buyers see this on the listing.">
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="ts-input"
                      placeholder="Pavillon d'Armenonville, Paris"
                      maxLength={200}
                    />
                  </Field>
                </StepCard>
              )}

              {step === 2 && (
                <StepCard
                  icon={Tag}
                  title="Ticket types & pricing"
                  desc="Add one or more tiers. We show you exactly what buyers pay and what you keep."
                >
                  {tiers.map((t, i) => (
                    <div key={i} className="bg-muted/40 border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-muted-foreground">
                          <Ticket className="w-3.5 h-3.5" />
                          Ticket type {i + 1}
                        </span>
                        {tiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTier(i)}
                            className="inline-flex items-center gap-1 text-xs text-destructive font-bold hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-muted-foreground mb-1 block">Name</label>
                          <input
                            value={t.name}
                            onChange={(e) => updateTier(i, { name: e.target.value })}
                            className="ts-input"
                            placeholder="Regular / VIP / Early Bird"
                            maxLength={80}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground mb-1 block">Price (€)</label>
                          <input
                            type="number"
                            value={t.priceEuros}
                            onChange={(e) => updateTier(i, { priceEuros: e.target.value })}
                            className="ts-input"
                            min="0"
                            max="5000"
                            step="0.5"
                          />
                          {(() => {
                            const p = Number(t.priceEuros);
                            if (!Number.isFinite(p) || p <= 0) return null;
                            const buyerPays = p * 1.05;
                            const net = p * 0.92;
                            return (
                              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                                Buyer pays <strong className="text-foreground">€{buyerPays.toFixed(2)}</strong> (incl. 5% service fee)
                                {" "}· you receive{" "}
                                <strong className="text-primary">€{net.toFixed(2)}</strong> per ticket (after 8% Ticket Safe fee).
                              </p>
                            );
                          })()}
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground mb-1 block">Quantity</label>
                          <input
                            type="number"
                            value={t.totalQty}
                            onChange={(e) => updateTier(i, { totalQty: e.target.value })}
                            className="ts-input"
                            min="1"
                            max="20000"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground mb-1 block">Description (optional)</label>
                          <input
                            value={t.description}
                            onChange={(e) => updateTier(i, { description: e.target.value })}
                            className="ts-input"
                            placeholder="Champagne welcome + table"
                            maxLength={200}
                          />
                        </div>
                      </div>

                      {/* Advanced — schedulable sales window + per-tier purchase cap. */}
                      <details className="mt-3 pt-3 border-t border-border group">
                        <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors select-none">
                          <span className="inline-block transition-transform group-open:rotate-90">›</span>
                          Advanced — schedule sales window & per-order cap
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                          <div>
                            <label className="text-xs font-bold text-muted-foreground mb-1 block">Sales start (optional)</label>
                            <input
                              type="datetime-local"
                              value={t.salesStartAt}
                              onChange={(e) => updateTier(i, { salesStartAt: e.target.value })}
                              className="ts-input"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Tier hidden before this date.</p>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-muted-foreground mb-1 block">Sales end (optional)</label>
                            <input
                              type="datetime-local"
                              value={t.salesEndAt}
                              onChange={(e) => updateTier(i, { salesEndAt: e.target.value })}
                              className="ts-input"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">No purchases after this date.</p>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-muted-foreground mb-1 block">Max per order</label>
                            <input
                              type="number"
                              value={t.maxPerOrder}
                              onChange={(e) => updateTier(i, { maxPerOrder: e.target.value })}
                              className="ts-input"
                              placeholder="No limit"
                              min="1"
                              max="50"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">e.g. "2" for VIP, leave blank otherwise.</p>
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addTier}
                    className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl font-bold border border-dashed border-border text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add another ticket type
                  </button>

                  {/* Per-buyer ticket limit (great for high-demand events) */}
                  <div className="mt-2 pt-5 border-t border-border">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={limitEnabled}
                        onChange={(e) => setLimitEnabled(e.target.checked)}
                        className="mt-0.5 w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-sm text-foreground inline-flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-primary" />
                          One ticket per buyer (recommended)
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Each buyer is limited to a single ticket for this event. Uncheck to allow multiple tickets per person.
                        </div>
                      </div>
                    </label>
                    {limitEnabled && (
                      <div className="mt-3 flex items-center gap-3">
                        <input
                          type="number"
                          value={maxPerBuyer}
                          onChange={(e) => setMaxPerBuyer(e.target.value)}
                          className="ts-input w-24"
                          min="1"
                          max="50"
                        />
                        <span className="text-sm text-muted-foreground">
                          max tickets per person across all tiers
                        </span>
                      </div>
                    )}
                  </div>
                </StepCard>
              )}

              {step === 3 && (
                <StepCard
                  icon={ImageIcon}
                  title="Cover image & link"
                  desc="A strong cover is the single biggest driver of clicks. Add yours and pick a clean link."
                >
                  <Field label="Cover image" icon={ImageIcon} hint="Cropped to 16:9. Max 5 MB. This is your event's headline visual.">
                    {bannerPreview ? (
                      <div className="relative rounded-xl overflow-hidden group">
                        <img src={bannerPreview} alt="Banner preview" className="w-full aspect-[16/9] object-cover" />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => { if (bannerPreview) { setCropSrc(bannerPreview); setCropOpen(true); } }}
                            className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-black/75"
                          >
                            Reframe
                          </button>
                          <label className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-black/75 cursor-pointer">
                            Replace
                            <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                            className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-black/75"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center aspect-[16/9] rounded-xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                        <ImageIcon className="w-8 h-8 text-muted-foreground mb-1.5" />
                        <span className="text-sm font-semibold text-foreground">Click to upload your cover</span>
                        <span className="text-xs text-muted-foreground mt-0.5">You'll crop it to fit · JPG / PNG · max 5 MB</span>
                        <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
                      </label>
                    )}
                  </Field>
                  <Field label="Public link" icon={Tag} hint={`ticket-safe.eu/e/${slug || "your-event"}`}>
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlug(slugify(e.target.value));
                        setSlugTouched(true);
                      }}
                      className="ts-input font-mono"
                      placeholder="winter-gala-2026"
                      maxLength={60}
                    />
                  </Field>
                  <Field label="Brand color" icon={Palette} hint="Tints your public event page header & CTA. Defaults to your organizer color.">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : "#003399"}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-14 h-11 rounded-lg border border-border bg-background cursor-pointer"
                        aria-label="Pick brand color"
                      />
                      <input
                        value={primaryColor}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") setPrimaryColor(v);
                        }}
                        className="ts-input font-mono w-32"
                        placeholder="#003399"
                        maxLength={7}
                      />
                      <button
                        type="button"
                        onClick={() => setPrimaryColor(organizer?.primary_color ?? "#003399")}
                        className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </Field>
                </StepCard>
              )}

              {step === 4 && (
                <StepCard
                  icon={Eye}
                  title="Review your listing"
                  desc="Here's how your event will appear in the marketplace. Happy with it? Publish it and it goes live instantly."
                >
                  {/* Mobile preview (the sticky desktop one is hidden on small screens) */}
                  <div className="lg:hidden">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Marketplace preview</div>
                    <div className="max-w-sm">{previewNode}</div>
                  </div>

                  <SummaryRow label="Event" value={title.trim() || "—"} />
                  <SummaryRow
                    label="When"
                    value={
                      date
                        ? new Date(date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                        : "—"
                    }
                  />
                  <SummaryRow label="Where" value={location.trim() || "—"} />
                  <SummaryRow
                    label="Tickets"
                    value={`${tiers.length} type${tiers.length === 1 ? "" : "s"}${
                      priceFrom != null ? ` · from ${priceFrom <= 0 ? "Free" : `€${priceFrom}`}` : ""
                    }`}
                  />
                  <SummaryRow label="Public link" value={`ticket-safe.eu/e/${slug || "—"}`} mono />

                  <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-sm text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                    <span>
                      When you hit <strong>Publish</strong>, your event goes live on the marketplace
                      right away. You can edit or unpublish it anytime from your dashboard.
                    </span>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </StepCard>
              )}

              {/* Per-step gentle validation message */}
              {stepMsg && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{stepMsg}</span>
                </div>
              )}

              {/* ===== Navigation ===== */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-5 rounded-xl font-bold border border-border text-foreground hover:bg-muted transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate("/studio")}
                    className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl font-bold border border-border text-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                )}

                {!isLast ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmit}
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 shadow-soft hover:shadow-card transition-all"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Publishing…
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Publish event
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ===== Sticky live preview (desktop) ===== */}
            <aside className="hidden lg:block lg:col-span-2">
              <div className="sticky top-6 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Eye className="w-3.5 h-3.5" />
                  Live preview
                </div>
                {previewNode}
                <p className="text-xs text-muted-foreground px-1">
                  This is how your event card looks in the marketplace. It updates as you type.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <style>{`
        .ts-input { width: 100%; padding: 12px 14px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--background)); font-size: 16px; line-height: 1.4; color: hsl(var(--foreground)); transition: border-color .15s, box-shadow .15s; }
        .ts-input:focus { outline: none; border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }
      `}</style>

      <ImageCropDialog src={cropSrc} open={cropOpen} onOpenChange={setCropOpen} onCropped={onCropped} />

      <Footer />
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────

const Stepper = ({
  current,
  stepError,
  onStep,
}: {
  current: number;
  stepError: (i: number) => string | null;
  onStep: (i: number) => void;
}) => {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 md:p-4 shadow-soft">
      {/* Desktop: full step rail */}
      <div className="hidden md:flex items-center">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isCurrent = i === current;
          const isDone = i < current && stepError(i) === null;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => onStep(i)}
                className="group flex items-center gap-2.5 min-w-0"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border bg-background text-muted-foreground group-hover:border-primary/40"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="flex flex-col items-start leading-tight min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    Step {i + 1}
                  </span>
                  <span
                    className={`text-sm font-bold truncate ${
                      isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-3 rounded-full ${isDone ? "bg-emerald-400" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: progress bar + label */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-foreground">
            {STEPS[current].label}
          </span>
          <span className="text-xs font-bold text-muted-foreground">
            Step {current + 1} of {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const StepCard = ({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  children: React.ReactNode;
}) => (
  <section className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-soft animate-fade-in">
    <div className="flex items-start gap-3 mb-5">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg md:text-xl font-bold leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const Field = ({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon?: typeof Sparkles;
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

const SummaryRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border last:border-0">
    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
    <span className={`text-sm font-semibold text-foreground text-right truncate ${mono ? "font-mono" : ""}`}>
      {value}
    </span>
  </div>
);

export default StudioEventNew;
