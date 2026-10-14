import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Save, Camera, Palette, Link2, AlertCircle, CheckCircle2, CreditCard, ArrowRight, Undo2, Eye, Mail, Building2 } from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Settings. The top of the page is the organizer's public identity as
 * buyers see it on an event page, and it is edited in place: click the
 * banner to change the colour, the logo to replace it, the name and the
 * text to rewrite them. There is no separate preview because the thing
 * on screen is the preview. Below, the quieter settings run as a list:
 * contact, legal identity, payments. Save appears only when something
 * changed.
 */

const field =
  "w-full h-11 px-3 border border-border bg-background text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

/** Black or white text for a given background colour. */
function onColor(hex: string): string {
  if (!isHex(hex)) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#0B1024" : "#fff";
}

const StudioProfile = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading, refresh } = useOrganizer();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3A5FE6");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [siren, setSiren] = useState("");
  const [rnaNumber, setRnaNumber] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<{ exists: boolean; active: boolean } | null>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio/profile");
  }, [user, authLoading, navigate]);

  const resetFromOrganizer = () => {
    if (!organizer) return;
    setName(organizer.name);
    setContactName(organizer.contact_name ?? "");
    setContactEmail(organizer.contact_email ?? "");
    setWebsite(organizer.website ?? "");
    setAbout(organizer.about ?? "");
    setPrimaryColor((organizer.primary_color ?? "#3A5FE6").toUpperCase());
    setLogoPreview(organizer.logo_url ?? null);
    setLogoFile(null);
    setSiren(organizer.siren ?? "");
    setRnaNumber(organizer.rna_number ?? "");
    setBillingAddress(organizer.billing_address_line1 ?? "");
    setBillingPostalCode(organizer.billing_postal_code ?? "");
    setBillingCity(organizer.billing_city ?? "");
    setError(null);
  };

  useEffect(() => {
    if (!authLoading && !orgLoading) {
      if (!organizer || organizer.status !== "approved") {
        navigate("/studio");
        return;
      }
      resetFromOrganizer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer, orgLoading, authLoading, navigate]);

  useEffect(() => {
    if (!organizer) return;
    supabase
      .from("stripe_connect_accounts")
      .select("charges_enabled, payouts_enabled")
      .eq("organizer_id", organizer.id)
      .maybeSingle()
      .then(({ data }) => setPayments({ exists: !!data, active: !!data?.charges_enabled && !!data?.payouts_enabled }));
  }, [organizer]);

  // The about text grows with its content, like a paragraph, not a box.
  useEffect(() => {
    const el = aboutRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(56, el.scrollHeight)}px`;
  }, [about]);

  const dirty = useMemo(() => {
    if (!organizer) return false;
    const same = (a: string, b: string | null | undefined) => a.trim() === (b ?? "").trim();
    return !(
      same(name, organizer.name) &&
      same(contactName, organizer.contact_name) &&
      same(contactEmail, organizer.contact_email) &&
      same(website, organizer.website) &&
      same(about, organizer.about) &&
      primaryColor.toUpperCase() === (organizer.primary_color ?? "#3A5FE6").toUpperCase() &&
      same(siren, organizer.siren) &&
      same(rnaNumber, organizer.rna_number) &&
      same(billingAddress, organizer.billing_address_line1) &&
      same(billingPostalCode, organizer.billing_postal_code) &&
      same(billingCity, organizer.billing_city) &&
      !logoFile
    );
  }, [organizer, name, contactName, contactEmail, website, about, primaryColor, siren, rnaNumber, billingAddress, billingPostalCode, billingCity, logoFile]);

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB.");
      return;
    }
    if (!/^image\//.test(f.type)) {
      toast.error("Pick an image file.");
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return "The organisation name is too short.";
    if (contactName.trim().length < 2) return "The contact name is too short.";
    if (!/\S+@\S+\.\S+/.test(contactEmail)) return "The contact email doesn't look right.";
    if (website && !/^https?:\/\//.test(website)) return "The link must start with http:// or https://";
    if (!isHex(primaryColor)) return "The colour must be a hex code like #3A5FE6.";
    if (siren.trim() && !/^\d{9}$/.test(siren.trim())) return "A SIREN is exactly 9 digits.";
    return null;
  };

  const handleSave = async () => {
    if (!organizer || !user) return;
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    try {
      let logoUrl = organizer.logo_url ?? null;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop()?.toLowerCase() ?? "png";
        const path = `${user.id}/logo/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("organizer-assets")
          .upload(path, logoFile, { cacheControl: "3600", upsert: false });
        if (upErr) throw new Error("Logo upload failed: " + upErr.message);
        const { data: pub } = supabase.storage.from("organizer-assets").getPublicUrl(path);
        logoUrl = pub.publicUrl;
      }

      const { error: updErr } = await supabase
        .from("organizer_profiles")
        .update({
          name: name.trim(),
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim().toLowerCase(),
          website: website.trim() || null,
          about: about.trim() || null,
          primary_color: primaryColor.toUpperCase(),
          logo_url: logoUrl,
          siren: siren.trim() || null,
          rna_number: rnaNumber.trim() || null,
          billing_address_line1: billingAddress.trim() || null,
          billing_postal_code: billingPostalCode.trim() || null,
          billing_city: billingCity.trim() || null,
        })
        .eq("id", organizer.id);
      if (updErr) throw updErr;

      setLogoFile(null);
      await refresh?.();
      toast.success("Saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // What is still missing on the public side. Shown as one quiet line.
  const missing = useMemo(() => {
    const out: string[] = [];
    if (!logoPreview) out.push("a logo");
    if (about.trim().length < 40) out.push("a few lines about you");
    if (!website.trim()) out.push("a link");
    if (isHex(primaryColor) && primaryColor.toUpperCase() === "#3A5FE6") out.push("your own colour");
    return out;
  }, [logoPreview, about, website, primaryColor]);

  if (authLoading || orgLoading) {
    return (
      <div className="theme-studio min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const accent = isHex(primaryColor) ? primaryColor : "#3A5FE6";
  const ink = onColor(accent);
  const initial = name.trim()[0]?.toUpperCase() ?? "?";

  return (
    <StudioLayout active="settings" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Settings · Studio" description="How your organisation appears on Ticket Safe." />

      <div className="p-4 md:p-6 max-w-3xl mx-auto pb-28">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Four things: how you look to buyers, how we reach you, how you get paid, who you are legally.</p>
        </div>

        {/* ── 1. Your public identity, edited in place ── */}
        <section className="border border-border bg-card shadow-card" aria-labelledby="identity-heading">
          <SectionHeader icon={Eye} number={1} title="How buyers see you" text="The top of every one of your event pages. Click anything to change it." />

          {/* Banner = your colour. The swatch opens the native picker. */}
          <div className="relative h-28 md:h-36" style={{ background: accent }}>
            <label
              className="absolute right-3 top-3 inline-flex items-center gap-2 h-9 pl-2 pr-3 text-xs font-bold cursor-pointer backdrop-blur-sm border transition-colors"
              style={{ color: ink, borderColor: `${ink}55`, background: `${ink}1a` }}
              title="Change your colour"
            >
              <Palette className="w-3.5 h-3.5" />
              {accent}
              <input
                type="color"
                value={accent}
                onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                aria-label="Your colour"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>

          <div className="px-5 md:px-7 pb-6">
            {/* Logo overlaps the banner, like on the event page. Click to replace. */}
            <div className="-mt-10 md:-mt-12 mb-3 flex items-end gap-4">
              <label className="group relative w-20 h-20 md:w-24 md:h-24 shrink-0 cursor-pointer border-4 border-card bg-card" title={logoPreview ? "Replace the logo" : "Add a logo"}>
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display text-3xl font-bold" style={{ background: accent, color: ink }}>
                    {initial}
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5" />
                </span>
                <input type="file" accept="image/*" onChange={onLogoChange} className="sr-only" aria-label={logoPreview ? "Replace the logo" : "Add a logo"} />
              </label>
              <p className="text-[11px] text-muted-foreground pb-1 hidden sm:block">Square, under 2 MB. Shows on your event pages, tickets and emails.</p>
            </div>

            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Organised by</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Your organisation"
              aria-label="Organisation name"
              className="w-full bg-transparent font-display text-2xl md:text-[32px] font-bold leading-tight text-foreground placeholder:text-muted-foreground/50 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none py-1 -mx-1 px-1 transition-colors"
            />
            <textarea
              ref={aboutRef}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={2000}
              placeholder="A few lines about you: who you are, what your events are like, who they're for. Buyers who don't know you read this before paying."
              aria-label="About you"
              rows={2}
              className="w-full mt-2 bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none resize-none py-1 -mx-1 px-1 transition-colors"
            />
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={200}
                inputMode="url"
                placeholder="https://instagram.com/your-bde"
                aria-label="Website or social link"
                className="flex-1 min-w-0 bg-transparent text-foreground placeholder:text-muted-foreground/60 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none py-1 -mx-1 px-1 transition-colors"
                style={website.trim() ? { color: accent } : undefined}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center justify-center h-10 px-5 text-sm font-bold select-none" style={{ background: accent, color: ink }} aria-hidden>
                Buy a ticket
              </span>
              <p className="text-[11px] text-muted-foreground">
                {missing.length === 0 ? (
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Looks complete.</span>
                ) : (
                  <>Still missing: {missing.join(", ")}.</>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* ── 2–4. The rest, one card each ── */}
        <div className="mt-5 space-y-5">
          <Row icon={Mail} number={2} title="Contact" text="Where buyer questions and our emails go. Pre-filled when you set up payments.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Name">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} maxLength={120} autoComplete="name" />
              </Labeled>
              <Labeled label="Email">
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={field} maxLength={200} inputMode="email" autoComplete="email" />
              </Labeled>
            </div>
          </Row>

          <Row icon={CreditCard} number={3} title="Payments" text="How ticket money reaches your bank.">
            <Link to="/studio/payments" className="group flex items-center gap-3 border border-border px-4 py-3 hover:border-primary/40 transition-colors">
              <CreditCard className={`w-4 h-4 shrink-0 ${payments?.active ? "text-emerald-600" : "text-amber-600"}`} />
              <span className="text-sm flex-1 min-w-0">
                {payments == null ? "Checking…" : payments.active ? "Set up and active. Balance and payouts are on the Payments page." : payments.exists ? "Not finished. Nothing can go on sale until it is." : "Not set up yet. Takes about 3 minutes, no SIREN needed."}
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          </Row>

          <Row icon={Building2} number={4} title="Legal identity" text="Printed on your sales statements and service-fee invoices, and pre-filled on the Stripe form. Leave empty if you sell as an individual.">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="SIREN" hint="9 digits">
                  <input value={siren} onChange={(e) => setSiren(e.target.value.replace(/\D/g, ""))} className={`${field} font-mono`} placeholder="123456789" maxLength={9} inputMode="numeric" />
                </Labeled>
                <Labeled label="RNA number" hint="loi 1901 associations">
                  <input value={rnaNumber} onChange={(e) => setRnaNumber(e.target.value.toUpperCase())} className={`${field} font-mono`} placeholder="W123456789" maxLength={20} />
                </Labeled>
              </div>
              <Labeled label="Address">
                <input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} className={field} placeholder="12 rue de l'Université" maxLength={200} autoComplete="street-address" />
              </Labeled>
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <Labeled label="Postal code">
                  <input value={billingPostalCode} onChange={(e) => setBillingPostalCode(e.target.value)} className={field} placeholder="75016" maxLength={20} inputMode="numeric" autoComplete="postal-code" />
                </Labeled>
                <Labeled label="City">
                  <input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className={field} placeholder="Paris" maxLength={100} autoComplete="address-level2" />
                </Labeled>
              </div>
            </div>
          </Row>
        </div>
      </div>

      {/* Save bar: only when something changed */}
      <div
        className={`fixed bottom-0 inset-x-0 md:left-60 z-20 border-t border-border bg-card/95 backdrop-blur px-4 md:px-6 py-3 transition-transform duration-200 ${
          dirty || error ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!dirty && !error}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {error ? (
            <span className="inline-flex items-center gap-2 text-sm text-destructive min-w-0"><AlertCircle className="w-4 h-4 shrink-0" /><span className="truncate">{error}</span></span>
          ) : (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={resetFromOrganizer}
            disabled={saving || !dirty}
            className="ml-auto inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" />
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </StudioLayout>
  );
};

/** A section's title strip: number, icon, name, one line on what it is for. */
const SectionHeader = ({ icon: Icon, number, title, text }: { icon: typeof Mail; number: number; title: string; text: string }) => (
  <div className="flex items-start gap-3 px-5 py-3.5 border-b border-border bg-muted/50">
    <span className="w-7 h-7 shrink-0 flex items-center justify-center bg-primary text-primary-foreground text-xs font-black" aria-hidden>{number}</span>
    <div className="min-w-0">
      <h2 className="text-sm font-bold flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{text}</p>
    </div>
  </div>
);

/** One settings card: a visible header strip, then the controls. */
const Row = ({ icon, number, title, text, children }: { icon: typeof Mail; number: number; title: string; text: string; children: React.ReactNode }) => (
  <section className="border border-border bg-card shadow-card" aria-label={title}>
    <SectionHeader icon={icon} number={number} title={title} text={text} />
    <div className="p-5">{children}</div>
  </section>
);

const Labeled = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1">
      <label className="text-xs font-bold text-muted-foreground">{label}</label>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
    {children}
  </div>
);

export default StudioProfile;
