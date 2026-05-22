import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Building2,
  User,
  Calendar,
  Palette,
  Rocket,
  Loader2,
  Check,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Convert a name to a URL-safe slug (a-z, 0-9, dashes). */
const slugify = (input: string): string =>
  input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Map the UI orgType to the DB allowed values. */
const orgTypeForDb = (uiType: string): string => {
  switch (uiType) {
    case "association": return "student-society";
    case "company": return "other";
    case "individual": return "other";
    default: return "other";
  }
};

type OrganizerType = "association" | "company" | "individual";

type FormState = {
  orgType: OrganizerType | "";
  orgName: string;
  contactName: string;
  contactEmail: string;
  website: string;
  firstEventName: string;
  firstEventDate: string;
  expectedAttendees: string;
  brandColor: string;
  about: string;
};

const initialState: FormState = {
  orgType: "",
  orgName: "",
  contactName: "",
  contactEmail: "",
  website: "",
  firstEventName: "",
  firstEventDate: "",
  expectedAttendees: "",
  brandColor: "#1E5EFF",
  about: "",
};

const orgTypes: { value: OrganizerType; label: string; desc: string; icon: typeof Building2 }[] = [
  { value: "association", label: "Student association", desc: "Student union, club, society, campus event", icon: User },
  { value: "company", label: "Company / Agency", desc: "Event company, agency, professional structure", icon: Building2 },
  { value: "individual", label: "Independent creator", desc: "Creator, DJ, artist, event freelancer", icon: Sparkles },
];

const steps = [
  { id: 1, label: "Profile", icon: User },
  { id: 2, label: "Contact", icon: Building2 },
  { id: 3, label: "First event", icon: Calendar },
  { id: 4, label: "Branding", icon: Palette },
  { id: 5, label: "Confirm", icon: CheckCircle2 },
];

const OrganizerApply = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    ...initialState,
    contactEmail: user?.email ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinue = (): boolean => {
    switch (step) {
      case 1: return !!form.orgType;
      case 2: return !!form.orgName.trim() && !!form.contactName.trim() && /\S+@\S+\.\S+/.test(form.contactEmail);
      case 3: return !!form.firstEventName.trim() && !!form.firstEventDate;
      case 4: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (!canContinue()) {
      toast.error("Please fill in the required fields to continue.");
      return;
    }
    setStep((s) => Math.min(steps.length, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Please sign in before submitting your application.");
      return;
    }
    setSubmitting(true);
    try {
      // Generate a unique slug derived from the org name. If a collision is
      // detected we append a short suffix.
      const baseSlug = slugify(form.orgName) || `org-${user.id.slice(0, 6)}`;
      let candidateSlug = baseSlug;
      let attempt = 0;
      while (attempt < 5) {
        const { data: clash } = await supabase
          .from("organizer_profiles")
          .select("id")
          .eq("slug", candidateSlug)
          .maybeSingle();
        if (!clash) break;
        attempt += 1;
        candidateSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 40);
      }

      const { error } = await supabase.from("organizer_profiles").insert({
        user_id: user.id,
        name: form.orgName.trim(),
        slug: candidateSlug,
        org_type: orgTypeForDb(form.orgType),
        contact_name: form.contactName.trim(),
        contact_email: form.contactEmail.trim().toLowerCase(),
        website: form.website.trim() || null,
        about: form.about.trim() || null,
        primary_color: form.brandColor || "#003399",
        status: "pending",
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("You already have an organizer application on file.");
        } else {
          console.error("[organizer-apply] insert failed:", error);
          toast.error(error.message || "Could not submit your application. Please try again.");
        }
        return;
      }

      setSubmitted(true);
      toast.success("Application sent!");
    } catch (e) {
      console.error("[organizer-apply] unexpected:", e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SEOHead title="Application sent — TicketSafe Studio" description="Your organizer application has been submitted." />
        <Header minimal />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-card border border-border rounded-3xl p-10 max-w-lg text-center shadow-card">
            <div
              className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6"
              style={{ background: "var(--gradient-hero)" }}
            >
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground mb-4">
              Application sent
            </h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Thanks <span className="text-foreground font-semibold">{form.contactName.split(" ")[0]}</span>! We'll get back to you at <span className="text-foreground">{form.contactEmail}</span> within 24 business hours.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white"
                style={{ background: "var(--gradient-hero)" }}
              >
                Back to home <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/organizers"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-foreground border border-border hover:bg-muted"
              >
                See the overview
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        title="Become an organizer — TicketSafe Studio"
        description="Apply to join TicketSafe Studio and sell your tickets directly."
      />
      <Header minimal />

      <main className="flex-1 relative">
        {/* Subtle ambient blue */}
        <div
          className="pointer-events-none absolute -top-32 -left-32 w-[36rem] h-[36rem] rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(220 100% 30%), transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(221 100% 56%), transparent 70%)" }}
        />

        <div className="container mx-auto px-4 py-8 md:py-16 max-w-3xl relative">
          <div className="text-center mb-7 md:mb-10">
            <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary mb-2 md:mb-3">
              Studio beta
            </div>
            <h1 className="text-[26px] sm:text-3xl md:text-4xl font-black text-foreground mb-2 md:mb-3 leading-tight">
              Join TicketSafe Studio
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              5 minutes. We get back to you within 24h.
            </p>
            {/* Compact step counter for mobile */}
            <p className="md:hidden text-xs font-semibold text-primary mt-3">
              Step {step} of {steps.length} · {steps.find((s) => s.id === step)?.label}
            </p>
          </div>

          {/* Step indicator */}
          <div className="mb-7 md:mb-10">
            <div className="flex items-center justify-between mb-4">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const active = s.id === step;
                const done = s.id < step;
                return (
                  <div key={s.id} className="flex flex-col items-center flex-1 relative">
                    <div
                      className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold transition-all duration-300 z-10 ${
                        done
                          ? "text-white"
                          : active
                          ? "text-white scale-110 shadow-glow"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                      style={done || active ? { background: "var(--gradient-hero)" } : {}}
                    >
                      {done ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <Icon className="w-4 h-4 md:w-5 md:h-5" />}
                    </div>
                    <span className={`text-xs mt-2 font-semibold hidden md:block ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </span>
                    {i < steps.length - 1 && (
                      <div
                        className={`absolute top-[18px] md:top-5 left-1/2 w-full h-px ${done ? "bg-primary" : "bg-border"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form card */}
          <div className="bg-card border border-border rounded-2xl md:rounded-3xl p-5 md:p-10 shadow-soft animate-fade-in" key={step}>
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Who are you?</h2>
                  <p className="text-sm text-muted-foreground">Pick the option that best describes you.</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {orgTypes.map((opt) => {
                    const Icon = opt.icon;
                    const selected = form.orgType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update("orgType", opt.value)}
                        className={`text-left p-5 rounded-2xl border-2 transition-all ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${selected ? "text-white" : "bg-muted text-muted-foreground"}`}
                            style={selected ? { background: "var(--gradient-hero)" } : {}}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="text-foreground font-bold mb-0.5">{opt.label}</div>
                            <div className="text-sm text-muted-foreground">{opt.desc}</div>
                          </div>
                          {selected && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Contact & organization</h2>
                  <p className="text-sm text-muted-foreground">How we identify and reach you.</p>
                </div>
                <Field label="Organization name" required>
                  <input
                    type="text"
                    value={form.orgName}
                    onChange={(e) => update("orgName", e.target.value)}
                    placeholder="e.g. BDE EBS Paris, Galaxy Productions…"
                    className="ts-input"
                  />
                </Field>
                <Field label="Your full name" required>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => update("contactName", e.target.value)}
                    placeholder="Jane Doe"
                    className="ts-input"
                  />
                </Field>
                <Field label="Contact email" required>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => update("contactEmail", e.target.value)}
                    placeholder="you@organization.com"
                    className="ts-input"
                  />
                </Field>
                <Field label="Website or Instagram (optional)">
                  <input
                    type="text"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    placeholder="https://… or @handle"
                    className="ts-input"
                  />
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Your first event</h2>
                  <p className="text-sm text-muted-foreground">A quick overview — you'll fill in the full details after approval.</p>
                </div>
                <Field label="Event name" required>
                  <input
                    type="text"
                    value={form.firstEventName}
                    onChange={(e) => update("firstEventName", e.target.value)}
                    placeholder="e.g. Winter Ball 2026"
                    className="ts-input"
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="Planned date" required>
                    <input
                      type="date"
                      value={form.firstEventDate}
                      onChange={(e) => update("firstEventDate", e.target.value)}
                      className="ts-input"
                    />
                  </Field>
                  <Field label="Expected attendees">
                    <select
                      value={form.expectedAttendees}
                      onChange={(e) => update("expectedAttendees", e.target.value)}
                      className="ts-input"
                    >
                      <option value="">Select…</option>
                      <option value="<100">Less than 100</option>
                      <option value="100-500">100 to 500</option>
                      <option value="500-1000">500 to 1,000</option>
                      <option value="1000+">More than 1,000</option>
                    </select>
                  </Field>
                </div>
                <Field label="Tell us about your event (optional)">
                  <textarea
                    rows={4}
                    value={form.about}
                    onChange={(e) => update("about", e.target.value)}
                    placeholder="The concept, the venue, what makes your event special…"
                    className="ts-input"
                  />
                </Field>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Your visual identity</h2>
                  <p className="text-sm text-muted-foreground">You can fine-tune this in the dashboard. Just a quick preview here.</p>
                </div>
                <Field label="Primary color">
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={form.brandColor}
                      onChange={(e) => update("brandColor", e.target.value)}
                      className="w-16 h-16 rounded-xl border border-border cursor-pointer bg-transparent"
                    />
                    <div className="flex-1">
                      <input
                        type="text"
                        value={form.brandColor}
                        onChange={(e) => update("brandColor", e.target.value)}
                        className="ts-input"
                      />
                      <p className="text-xs text-muted-foreground mt-2">Used on your branded event page.</p>
                    </div>
                  </div>
                </Field>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2.5 font-bold">Preview</div>
                  <div
                    className="rounded-2xl p-6 relative overflow-hidden border"
                    style={{
                      background: `linear-gradient(135deg, ${form.brandColor}, ${form.brandColor}dd)`,
                      borderColor: form.brandColor,
                    }}
                  >
                    <div
                      className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-2xl opacity-50 bg-white"
                    />
                    <div className="relative text-white">
                      <div className="text-xs uppercase tracking-widest mb-1 opacity-80">
                        {form.orgName || "Your organization"}
                      </div>
                      <div className="text-2xl font-black mb-3">
                        {form.firstEventName || "Your first event"}
                      </div>
                      <button
                        className="px-4 py-2 rounded-lg font-semibold text-sm bg-white"
                        style={{ color: form.brandColor }}
                      >
                        Book now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div className="text-center">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Rocket className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">All set</h2>
                  <p className="text-sm text-muted-foreground">Quick review, then send.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <Summary label="Type" value={orgTypes.find((o) => o.value === form.orgType)?.label ?? "—"} />
                  <Summary label="Organization" value={form.orgName} />
                  <Summary label="Contact" value={form.contactName} />
                  <Summary label="Email" value={form.contactEmail} />
                  <Summary label="Event" value={form.firstEventName} />
                  <Summary label="Date" value={form.firstEventDate} />
                  <Summary label="Attendees" value={form.expectedAttendees || "—"} />
                  <Summary label="Color" value={form.brandColor} swatch={form.brandColor} />
                </div>
                <p className="text-xs text-muted-foreground text-center pt-2">
                  By submitting, you agree to our{" "}
                  <Link to="/terms" className="underline text-foreground">terms</Link> and{" "}
                  <Link to="/privacy" className="underline text-foreground">privacy policy</Link>.
                </p>
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex items-center justify-between mt-8 md:mt-10 gap-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 1}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 min-h-[48px] rounded-xl font-semibold text-foreground border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed text-sm md:text-base"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              {step < steps.length ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[48px] rounded-xl font-bold text-white hover:scale-[1.02] transition-transform text-sm md:text-base"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[48px] rounded-xl font-bold text-white hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:cursor-wait text-sm md:text-base"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {submitting ? "Sending…" : "Send"}
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Already an organizer on TicketSafe?{" "}
            <Link to="/auth" className="underline text-foreground">Sign in</Link>.
          </p>
        </div>
      </main>

      <Footer />

      <style>{`
        .ts-input {
          width: 100%;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--foreground));
          padding: 0.75rem 0.95rem;
          min-height: 48px;
          border-radius: 0.65rem;
          font-size: 16px; /* >=16px prevents iOS Safari auto-zoom on focus */
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        @media (min-width: 768px) {
          .ts-input { font-size: 0.95rem; }
        }
        .ts-input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
        }
        .ts-input::placeholder { color: hsl(var(--muted-foreground)); }
        .ts-input[type="color"] { padding: 0.25rem; }
      `}</style>
    </div>
  );
};

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-foreground mb-2">
      {label} {required && <span className="text-primary">*</span>}
    </span>
    {children}
  </label>
);

const Summary = ({ label, value, swatch }: { label: string; value: string; swatch?: string }) => (
  <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-muted/30">
    <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">{label}</span>
    <span className="text-foreground font-medium text-right flex items-center gap-2 truncate max-w-[60%]">
      {swatch && <span className="w-4 h-4 rounded-full border border-border" style={{ background: swatch }} />}
      <span className="truncate">{value || "—"}</span>
    </span>
  </div>
);

export default OrganizerApply;
