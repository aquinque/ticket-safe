import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Save,
  Building2,
  Mail,
  Globe,
  Palette,
  FileText,
  Image as ImageIcon,
  Pencil,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const StudioProfile = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading, refresh } = useOrganizer();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#003399");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && !orgLoading) {
      if (!organizer || organizer.status !== "approved") {
        navigate("/studio");
        return;
      }
      setName(organizer.name);
      setContactName(organizer.contact_name ?? "");
      setContactEmail(organizer.contact_email ?? "");
      setWebsite(organizer.website ?? "");
      setAbout(organizer.about ?? "");
      setPrimaryColor(organizer.primary_color ?? "#003399");
      setLogoPreview(organizer.logo_url ?? null);
    }
  }, [organizer, orgLoading, authLoading, navigate]);

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB.");
      return;
    }
    if (!/^image\//.test(f.type)) {
      toast.error("Please pick an image file.");
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Organization name is too short.";
    if (contactName.trim().length < 2) return "Contact name is too short.";
    if (!/\S+@\S+\.\S+/.test(contactEmail)) return "Contact email is not valid.";
    if (website && !/^https?:\/\//.test(website)) return "Website must start with http:// or https://";
    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) return "Primary color must be hex like #003399.";
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
        })
        .eq("id", organizer.id);
      if (updErr) throw updErr;

      setLogoFile(null);
      await refresh?.();
      toast.success("Profile saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
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
      <SEOHead title="Organizer profile — Studio" description="Edit your organizer profile in Ticket Safe Studio." />
      <Header minimal />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-3xl">
          <button
            onClick={() => navigate("/studio")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </button>

          <h1 className="text-2xl md:text-4xl font-black mb-2">Organizer profile</h1>
          <p className="text-sm md:text-base text-muted-foreground mb-8">
            Edit how your organization appears across Ticket Safe.
          </p>

          <section className="bg-card border border-border rounded-2xl p-5 md:p-7 space-y-5">
            <Field label="Organization name" icon={Building2}>
              <input value={name} onChange={(e) => setName(e.target.value)} className="ts-prof" maxLength={120} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Contact name" icon={Pencil}>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className="ts-prof" maxLength={120} />
              </Field>
              <Field label="Contact email" icon={Mail}>
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="ts-prof" maxLength={200} />
              </Field>
            </div>

            <Field label="Website (optional)" icon={Globe}>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} className="ts-prof" placeholder="https://your-society.com" maxLength={200} />
            </Field>

            <Field label="About / pitch" icon={FileText}>
              <textarea value={about} onChange={(e) => setAbout(e.target.value)} className="ts-prof min-h-[100px]" maxLength={2000} />
            </Field>

            <Field label="Primary color" icon={Palette}>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-12 rounded-lg border border-border cursor-pointer"
                />
                <input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                  className="ts-prof flex-1 font-mono uppercase"
                  maxLength={7}
                />
              </div>
            </Field>

            <Field label="Logo" icon={ImageIcon}>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="w-20 h-20 rounded-2xl object-cover border border-border bg-card"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    No logo
                  </div>
                )}
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm border border-border bg-background hover:bg-muted">
                  <Pencil className="w-3.5 h-3.5" />
                  {logoPreview ? "Replace" : "Upload"}
                  <input type="file" accept="image/*" onChange={onLogoChange} className="hidden" />
                </label>
              </div>
            </Field>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save changes
              </button>
            </div>
          </section>

          <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            Public URL: <code className="font-mono">ticket-safe.eu/e/&lt;event-slug&gt;</code>
          </div>
        </div>
      </main>

      <style>{`
        .ts-prof { width: 100%; padding: 12px 14px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--background)); font-size: 16px; line-height: 1.4; color: hsl(var(--foreground)); transition: border-color .15s, box-shadow .15s; }
        .ts-prof:focus { outline: none; border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }
      `}</style>

      <Footer />
    </div>
  );
};

const Field = ({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Building2;
  children: React.ReactNode;
}) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5">
      {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
      {label}
    </label>
    {children}
  </div>
);

export default StudioProfile;
