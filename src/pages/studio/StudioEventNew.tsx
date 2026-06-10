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
}

const initialTier = (): TierDraft => ({
  name: "Regular",
  description: "",
  priceEuros: "20",
  totalQty: "100",
});

const StudioEventNew = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("party");
  // Brand colour is fixed (colour customisation removed) — events always use
  // the Ticket Safe blue; the banner photo is what makes each event distinct.
  const primaryColor = "#003399";
  const [limitEnabled, setLimitEnabled] = useState(true);
  const [maxPerBuyer, setMaxPerBuyer] = useState("1");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tiers, setTiers] = useState<TierDraft[]>([initialTier()]);
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
    setTiers((t) => [
      ...t,
      { name: "", description: "", priceEuros: "30", totalQty: "50" },
    ]);
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
      }));
      const { error: tErr } = await supabase.from("event_tiers").insert(tierRows);
      if (tErr) {
        console.error("[studio-event-new] insert tiers:", tErr);
        throw new Error("Event saved but tiers failed: " + tErr.message);
      }

      toast.success("Event created. Add finishing touches and publish when ready.");
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="New event — Ticket Safe Studio" description="Create a branded event in Ticket Safe Studio." />
      <Header minimal />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-4">
            <BackButton fallbackPath="/studio" />
          </div>

          <h1 className="text-2xl md:text-4xl font-black mb-2">Create event</h1>
          <p className="text-sm md:text-base text-muted-foreground mb-8">
            Fill in the details, add at least one ticket tier, and publish when you are ready.
          </p>

          {/* Basics */}
          <Section title="Basics" icon={Sparkles}>
            <Field label="Event title" icon={Type}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="ts-input"
                placeholder="ESCP Winter Gala 2026"
                maxLength={120}
              />
            </Field>
            <Field label="Short description" icon={FileText} hint="2-3 sentences shown above the buy button.">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="ts-input min-h-[100px]"
                placeholder="A one-night-only black-tie gala at Pavillon d'Armenonville."
                maxLength={1000}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Start date & time" icon={Calendar}>
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="ts-input"
                />
              </Field>
              <Field label="End date & time (optional)" icon={Calendar}>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="ts-input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Location" icon={MapPin}>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="ts-input"
                  placeholder="Pavillon d'Armenonville, Paris"
                  maxLength={200}
                />
              </Field>
              <Field label="Category" icon={Tag}>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="ts-input">
                  <option value="party">Party</option>
                  <option value="gala">Gala</option>
                  <option value="conference">Conference</option>
                  <option value="sports">Sports</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Branding */}
          <Section title="Branding" icon={Palette}>
            <Field label="Banner image" icon={ImageIcon} hint="Cropped to 16:9. Max 5 MB. This is your event's visual.">
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
                    <button
                      type="button"
                      onClick={() => { setBannerFile(null); setBannerPreview(null); }}
                      className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold hover:bg-black/75"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center aspect-[16/9] rounded-xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:border-primary/50">
                  <ImageIcon className="w-7 h-7 text-muted-foreground mb-1" />
                  <span className="text-sm font-semibold text-muted-foreground">Click to upload banner</span>
                  <span className="text-xs text-muted-foreground mt-0.5">You'll crop it to fit</span>
                  <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
                </label>
              )}
            </Field>
            <Field label="Public URL" hint={`https://ticket-safe.eu/e/${slug || "your-slug"}`}>
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
          </Section>

          {/* Tiers */}
          <Section title="Ticket tiers" icon={Tag}>
            {tiers.map((t, i) => (
              <div key={i} className="bg-muted/40 border border-border rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                    Tier {i + 1}
                  </span>
                  {tiers.length > 1 && (
                    <button
                      onClick={() => removeTier(i)}
                      className="inline-flex items-center gap-1 text-xs text-destructive font-bold"
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
              </div>
            ))}
            <button
              onClick={addTier}
              className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg font-bold border border-dashed border-border text-foreground hover:border-primary/40 hover:text-primary"
            >
              <Plus className="w-4 h-4" />
              Add another tier
            </button>

            {/* Per-buyer ticket limit (great for high-demand events) */}
            <div className="mt-5 pt-5 border-t border-border">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={limitEnabled}
                  onChange={(e) => setLimitEnabled(e.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-bold text-sm text-foreground">
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
                    max tickets per person across all tiers of this event
                  </span>
                </div>
              )}
            </div>
          </Section>

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 mt-8">
            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save as draft
            </button>
            <button
              onClick={() => navigate("/studio")}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-xl font-bold border border-border text-foreground hover:bg-muted"
            >
              Cancel
            </button>
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

const Section = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
}) => (
  <section className="mb-8 bg-card border border-border rounded-2xl p-5 md:p-6">
    <div className="flex items-center gap-2 mb-5">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
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

export default StudioEventNew;
