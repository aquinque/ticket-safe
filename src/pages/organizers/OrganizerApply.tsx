import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Building2,
  User,
  Palette,
  Rocket,
  Loader2,
  Check,
  Mail,
  Lock,
  Eye,
  EyeOff,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { authRedirect } from "@/lib/siteUrl";
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
  accountFirstName: string;
  accountLastName: string;
  accountEmail: string;
  accountConfirmEmail: string;
  accountPassword: string;
  orgType: OrganizerType | "";
  orgName: string;
  contactName: string;
  contactEmail: string;
  website: string;
  brandColor: string;
  about: string;
};

const initialState: FormState = {
  accountFirstName: "",
  accountLastName: "",
  accountEmail: "",
  accountConfirmEmail: "",
  accountPassword: "",
  orgType: "",
  orgName: "",
  contactName: "",
  contactEmail: "",
  website: "",
  brandColor: "#1E5EFF",
  about: "",
};

const orgTypes: { value: OrganizerType; label: string; desc: string; icon: typeof Building2 }[] = [
  { value: "association", label: "Student association", desc: "Student union, club, society, campus event", icon: User },
  { value: "company", label: "Company / Agency", desc: "Event company, agency, professional structure", icon: Building2 },
  { value: "individual", label: "Independent creator", desc: "Creator, DJ, artist, event freelancer", icon: Sparkles },
];

const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(/[A-Z]/, "Must contain uppercase letter")
  .regex(/[a-z]/, "Must contain lowercase letter")
  .regex(/[0-9]/, "Must contain number")
  .regex(/[^A-Za-z0-9]/, "Must contain special character");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reads the first validation error from a failed edge function call.
const readValidationError = async (error: unknown, data: unknown): Promise<string | null> => {
  const fromData = (data as { errors?: string[] } | null)?.errors?.[0];
  if (fromData) return fromData;
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.errors?.[0]) return body.errors[0] as string;
    } catch {
      /* body was not JSON */
    }
  }
  return null;
};

type StepKey = "account" | "profile" | "contact" | "branding" | "confirm";

const STEP_LABELS: Record<StepKey, { label: string; icon: typeof User }> = {
  account: { label: "Account", icon: Mail },
  profile: { label: "Profile", icon: User },
  contact: { label: "Contact", icon: Building2 },
  branding: { label: "Branding", icon: Palette },
  confirm: { label: "Confirm", icon: CheckCircle2 },
};

const OrganizerApply = () => {
  const { user } = useAuth();
  // Signed-out visitors create their account in the same flow, so they start on the account step.
  const activeSteps: StepKey[] = user
    ? ["profile", "contact", "branding", "confirm"]
    : ["account", "profile", "contact", "branding", "confirm"];
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    ...initialState,
    contactEmail: user?.email ?? "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Set after a signed-out signup: the account exists and the email must be confirmed.
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  // Set when the email already has a TicketSafe account: sign in, then apply.
  const [existingEmail, setExistingEmail] = useState<string | null>(null);

  const currentKey = activeSteps[step - 1];
  const totalSteps = activeSteps.length;

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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canContinue = (): boolean => {
    switch (currentKey) {
      case "account":
        return !!form.accountFirstName.trim() && !!form.accountLastName.trim() && EMAIL_RE.test(form.accountEmail.trim()) &&
          form.accountConfirmEmail.trim().toLowerCase() === form.accountEmail.trim().toLowerCase() &&
          passwordSchema.safeParse(form.accountPassword).success;
      case "profile": return !!form.orgType;
      case "contact": return !!form.orgName.trim() && form.contactName.trim().length >= 2 && EMAIL_RE.test(form.contactEmail.trim());
      default: return true;
    }
  };

  const handleNext = () => {
    if (!canContinue()) {
      if (currentKey === "account") {
        if (form.accountConfirmEmail.trim().toLowerCase() !== form.accountEmail.trim().toLowerCase()) {
          toast.error("The email addresses don't match.");
          return;
        }
        const pw = passwordSchema.safeParse(form.accountPassword);
        if (!pw.success) {
          toast.error(pw.error.errors[0].message);
          return;
        }
      }
      toast.error("Please fill in the required fields to continue.");
      return;
    }
    // Pre-fill the contact step from the account step, once.
    if (currentKey === "account") {
      setForm((f) => ({
        ...f,
        contactName: f.contactName || `${f.accountFirstName.trim()} ${f.accountLastName.trim()}`.trim(),
        contactEmail: f.contactEmail || f.accountEmail.trim(),
      }));
    }
    setStep((s) => Math.min(totalSteps, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  // Signed-out path: one call creates the auth user, the profile and the pending organizer row.
  const handleSignupSubmit = async () => {
    const email = form.accountEmail.trim();
    const { data: validation, error: validationError } = await supabase.functions.invoke("validate-signup", {
      body: {
        accountType: "studio",
        email,
        emailConfirm: form.accountConfirmEmail.trim(),
        firstName: form.accountFirstName.trim(),
        lastName: form.accountLastName.trim(),
        studio: {
          name: form.orgName.trim(),
          org_type: orgTypeForDb(form.orgType),
          contact_name: form.contactName.trim(),
          contact_email: form.contactEmail.trim().toLowerCase(),
        },
      },
    });
    if (validationError || !validation?.valid) {
      const message = await readValidationError(validationError, validation);
      toast.error(message ?? "Please check your details and try again.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.accountPassword,
      options: {
        emailRedirectTo: authRedirect("/studio"),
        data: {
          account_type: "studio",
          first_name: form.accountFirstName.trim(),
          last_name: form.accountLastName.trim(),
          full_name: `${form.accountFirstName.trim()} ${form.accountLastName.trim()}`,
          studio: {
            name: form.orgName.trim(),
            org_type: orgTypeForDb(form.orgType),
            contact_name: form.contactName.trim(),
            contact_email: form.contactEmail.trim().toLowerCase(),
            website: form.website.trim() || null,
            about: form.about.trim() || null,
            primary_color: form.brandColor || "#1E5EFF",
          },
        },
      },
    });

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already registered")) {
        setExistingEmail(email);
        return;
      }
      toast.error("Unable to create your account. Please check your details and try again.");
      return;
    }

    // Supabase returns no identities when the email already has an account.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setExistingEmail(email);
      return;
    }

    if (data.session) {
      // Defense in depth: the session should not exist before confirmation.
      await supabase.auth.signOut();
    }
    setPendingConfirmEmail(email);
  };

  // Signed-in path: the account already exists, so only the organizer row is created.
  const handleApplySubmit = async () => {
    if (!user) return;
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

    // Upload the logo (if provided) to organizer-assets bucket.
    let logoUrl: string | null = null;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${user.id}/logo/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("organizer-assets")
        .upload(path, logoFile, { cacheControl: "3600", upsert: false });
      if (upErr) {
        console.error("[organizer-apply] logo upload failed:", upErr);
        toast.error("Could not upload the logo. Your application will be submitted without it.");
      } else {
        const { data: pub } = supabase.storage.from("organizer-assets").getPublicUrl(path);
        logoUrl = pub.publicUrl;
      }
    }

    const { data: inserted, error } = await supabase
      .from("organizer_profiles")
      .insert({
        user_id: user.id,
        name: form.orgName.trim(),
        slug: candidateSlug,
        org_type: orgTypeForDb(form.orgType),
        contact_name: form.contactName.trim(),
        contact_email: form.contactEmail.trim().toLowerCase(),
        website: form.website.trim() || null,
        about: form.about.trim() || null,
        primary_color: form.brandColor || "#1E5EFF",
        logo_url: logoUrl,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        toast.error("You already have an organizer application on file.");
      } else {
        console.error("[organizer-apply] insert failed:", error);
        toast.error(error.message || "Could not submit your application. Please try again.");
      }
      return;
    }

    // Notify admin team (best-effort; do not block UX on email)
    if (inserted?.id) {
      supabase.functions
        .invoke("organizer-notify", {
          body: { kind: "new_application", organizer_id: inserted.id },
        })
        .catch((err) => console.warn("[organizer-apply] notify failed:", err));
    }

    setSubmitted(true);
    toast.success("Application sent!");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (user) {
        await handleApplySubmit();
      } else {
        await handleSignupSubmit();
      }
    } catch (e) {
      console.error("[organizer-apply] unexpected:", e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resendConfirmation = async () => {
    if (!pendingConfirmEmail) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmEmail,
      options: { emailRedirectTo: authRedirect("/studio") },
    });
    setSubmitting(false);
    if (error) toast.error("Could not resend the email. Try again later.");
    else toast.success("Confirmation email resent. Check your inbox.");
  };

  // Account already exists: send them to sign in, then back here to apply.
  if (existingEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SEOHead title="Account exists — TicketSafe Studio" description="Sign in to activate Studio on your account." />
        <Header minimal />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-card border border-border rounded-3xl p-10 max-w-lg text-center shadow-card">
            <h1 className="text-2xl md:text-3xl font-black text-foreground mb-4">You already have an account</h1>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              <span className="text-foreground">{existingEmail}</span> already has a TicketSafe account. Sign in with it and we'll activate Studio on that same account.
            </p>
            <Link
              to="/auth?next=/organizers/apply"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white w-full"
              style={{ background: "var(--gradient-hero)" }}
            >
              Sign in <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Signed-out signup done: the user must confirm the email first.
  if (pendingConfirmEmail) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SEOHead title="Check your inbox — TicketSafe Studio" description="Confirm your email to continue." />
        <Header minimal />
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="bg-card border border-border rounded-3xl p-10 max-w-lg text-center shadow-card">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 bg-primary/10">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground mb-4">Vérifie ta boîte mail</h1>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              We sent a confirmation link to <span className="text-foreground font-semibold">{pendingConfirmEmail}</span>. Click it to activate your account. Your Studio application is then reviewed by our team.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-foreground border border-border hover:bg-muted disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Renvoyer l'email
              </button>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white"
                style={{ background: "var(--gradient-hero)" }}
              >
                Go to sign in <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

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

  const pw = form.accountPassword;
  const pwChecks = [
    { ok: pw.length >= 12, label: "At least 12 characters" },
    { ok: /[A-Z]/.test(pw), label: "Uppercase letter (A-Z)" },
    { ok: /[a-z]/.test(pw), label: "Lowercase letter (a-z)" },
    { ok: /[0-9]/.test(pw), label: "Number (0-9)" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Special character (!@#$...)" },
  ];

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
          <div className="mb-4">
            <BackButton fallbackPath="/organizers" />
          </div>
          <div className="text-center mb-7 md:mb-10">
            <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold text-primary mb-2 md:mb-3">
              Studio beta
            </div>
            <h1 className="text-[26px] sm:text-3xl md:text-4xl font-black text-foreground mb-2 md:mb-3 leading-tight">
              Join TicketSafe Studio
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              A few minutes. We get back to you within 24h.
            </p>
            {/* Compact step counter for mobile */}
            <p className="md:hidden text-xs font-semibold text-primary mt-3">
              Step {step} of {totalSteps} · {STEP_LABELS[currentKey].label}
            </p>
          </div>

          {/* Step indicator */}
          <div className="mb-7 md:mb-10">
            <div className="flex items-center justify-between mb-4">
              {activeSteps.map((key, i) => {
                const Icon = STEP_LABELS[key].icon;
                const id = i + 1;
                const active = id === step;
                const done = id < step;
                return (
                  <div key={key} className="flex flex-col items-center flex-1 relative">
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
                      {STEP_LABELS[key].label}
                    </span>
                    {i < totalSteps - 1 && (
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
            {currentKey === "account" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Create your account</h2>
                  <p className="text-sm text-muted-foreground">You'll use it to sign in and manage your events.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="First name" required>
                    <input type="text" value={form.accountFirstName} onChange={(e) => update("accountFirstName", e.target.value)} className="ts-input" maxLength={60} autoComplete="given-name" />
                  </Field>
                  <Field label="Last name" required>
                    <input type="text" value={form.accountLastName} onChange={(e) => update("accountLastName", e.target.value)} className="ts-input" maxLength={60} autoComplete="family-name" />
                  </Field>
                </div>
                <Field label="Adresse email" required>
                  <input type="email" value={form.accountEmail} onChange={(e) => update("accountEmail", e.target.value)} placeholder="you@organization.com" className="ts-input" autoComplete="email" />
                </Field>
                <Field label="Confirmer l'adresse email" required>
                  <input type="email" value={form.accountConfirmEmail} onChange={(e) => update("accountConfirmEmail", e.target.value)} className="ts-input" autoComplete="off" />
                  {form.accountConfirmEmail && form.accountConfirmEmail.trim().toLowerCase() !== form.accountEmail.trim().toLowerCase() && (
                    <span className="block text-xs text-red-500 mt-1.5">Les adresses email ne correspondent pas.</span>
                  )}
                </Field>
                <Field label="Mot de passe" required>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.accountPassword}
                      onChange={(e) => update("accountPassword", e.target.value)}
                      className="ts-input pr-12"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs">
                    {pwChecks.map((c) => (
                      <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-green-600" : "text-muted-foreground"}`}>
                        {c.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </Field>
              </div>
            )}

            {currentKey === "profile" && (
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

            {currentKey === "contact" && (
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
                <Field label="About your organization (optional)">
                  <textarea
                    rows={4}
                    value={form.about}
                    onChange={(e) => update("about", e.target.value)}
                    placeholder="What your organization does, what kind of events you run…"
                    className="ts-input"
                  />
                </Field>
              </div>
            )}

            {currentKey === "branding" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">Your visual identity</h2>
                  <p className="text-sm text-muted-foreground">You can fine-tune this in the dashboard. Just a quick preview here.</p>
                </div>
                <Field label="Logo (optional, square works best)">
                  {user ? (
                    logoPreview ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="w-20 h-20 rounded-2xl object-cover border border-border bg-card"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-foreground/80 mb-2 font-semibold">Looking good.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreview(null);
                            }}
                            className="text-xs font-bold text-destructive hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center gap-4 cursor-pointer">
                        <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
                          <span className="text-xs font-semibold">Upload</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-foreground/80 mb-1 font-semibold">Click to choose an image</p>
                          <p className="text-xs text-muted-foreground">PNG / JPG / SVG · Max 2 MB</p>
                        </div>
                        <input type="file" accept="image/*" onChange={onLogoChange} className="hidden" />
                      </label>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">You can add your logo from Studio · Profile once your account is confirmed.</p>
                  )}
                </Field>
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
                    <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-2xl opacity-50 bg-white" />
                    <div className="relative text-white">
                      <div className="text-xs uppercase tracking-widest mb-1 opacity-80">
                        {form.orgName || "Your organization"}
                      </div>
                      <div className="text-2xl font-black mb-3">
                        {form.orgName || "Your events"}
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

            {currentKey === "confirm" && (
              <div className="space-y-6">
                <div className="text-center">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Rocket className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-1.5">All set</h2>
                  <p className="text-sm text-muted-foreground">
                    {user ? "Quick review, then send." : "Quick review, then create your account. You'll confirm your email next."}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <Summary label="Type" value={orgTypes.find((o) => o.value === form.orgType)?.label ?? "—"} />
                  <Summary label="Organization" value={form.orgName} />
                  <Summary label="Contact" value={form.contactName} />
                  <Summary label="Email" value={form.contactEmail} />
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

              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[48px] rounded-xl font-bold text-white transition-transform text-sm md:text-base"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 min-h-[48px] rounded-xl font-bold text-white transition-transform disabled:opacity-60 disabled:cursor-wait text-sm md:text-base"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  {submitting ? "Sending…" : user ? "Send" : "Create my account"}
                </button>
              )}
            </div>
          </div>

          {!user && (
            <p className="text-center text-xs text-muted-foreground mt-6">
              Already have a TicketSafe account?{" "}
              <Link to="/auth?next=/organizers/apply" className="underline text-foreground">Sign in</Link>.
            </p>
          )}
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
