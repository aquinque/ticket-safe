import { useState, useEffect, useRef } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Footer from "@/components/Footer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, CheckCircle2, XCircle, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authRedirect } from "@/lib/siteUrl";
import {
  GENDER_CHOICES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
  authErrorMessage,
  isResendTooSoon,
  isValidEmail,
  suggestEmailFix,
  type GenderChoice,
} from "@/lib/authRules";
import { signUpWithEmail, type SignupField } from "@/lib/signupFlow";

/** Which email the person is waiting for. Drives the "check your inbox" screen. */
type PendingKind = "confirm" | "existing" | "reset";

interface PendingEmail {
  kind: PendingKind;
  email: string;
  /** False when the email could not be sent: the screen then leads with the resend button. */
  emailSent: boolean;
  notice: string | null;
}

interface FormError {
  message: string;
  /** Offer the "choose a new password" path next to the error. */
  offerReset?: boolean;
}

const RESEND_COOLDOWN_MS = 60_000;
const INVALID_EMAIL = "Cette adresse email n'est pas valide. Vérifie qu'il n'y a pas de faute de frappe.";

const FIELD_IDS: Record<SignupField, string> = {
  email: "email",
  firstName: "firstName",
  lastName: "lastName",
  password: "password",
};

const isInvalidCredentials = (error: unknown): boolean => {
  const e = (error ?? {}) as { code?: string; message?: string };
  return e.code === "invalid_credentials" || (e.message ?? "").toLowerCase().includes("invalid login credentials");
};

const isEmailNotConfirmed = (error: unknown): boolean => {
  const e = (error ?? {}) as { code?: string; message?: string };
  return e.code === "email_not_confirmed" || (e.message ?? "").toLowerCase().includes("email not confirmed");
};

const Auth = () => {
  useThemeMode("night");
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<GenderChoice>("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<PendingEmail | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already logged in. Honour a `next` query param so users who
  // hit "Sign in" from a specific page bounce back there (open-redirect
  // safe: must be a local path starting with `/` and not `//`).
  useEffect(() => {
    if (!authLoading && user) {
      const raw = searchParams.get("next");
      const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/profile";
      navigate(next, { replace: true });
    }
  }, [user, authLoading, navigate, searchParams]);

  // An error must be seen: on a phone the keyboard can hide it, so bring it into view.
  useEffect(() => {
    if (formError) errorRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [formError]);

  // Re-render once a second while the resend cooldown is counting down, so the
  // button label ticks instead of freezing.
  useEffect(() => {
    if (resendCooldownUntil === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldownUntil]);

  const resendSecondsLeft = resendCooldownUntil !== null
    ? Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000))
    : 0;

  const startCooldown = () => setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);

  const fail = (message: string, options: { offerReset?: boolean; field?: SignupField } = {}) => {
    setFormError({ message, offerReset: options.offerReset });
    if (options.field) document.getElementById(FIELD_IDS[options.field])?.focus();
  };

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setShowForgotPassword(false);
    setPending(null);
    setFormError(null);
  };

  const handleResend = async () => {
    if (!pending || resendSecondsLeft > 0) return;
    setLoading(true);
    try {
      const { error } = pending.kind === "confirm"
        ? await supabase.auth.resend({
            type: 'signup',
            email: pending.email,
            options: { emailRedirectTo: authRedirect("/profile") },
          })
        : await supabase.auth.resetPasswordForEmail(pending.email, {
            redirectTo: authRedirect("/reset-password"),
          });
      if (error) throw error;
      startCooldown();
      setPending({ ...pending, emailSent: true, notice: null });
      toast.success("Email renvoyé. Regarde ta boîte mail.");
    } catch (err) {
      console.error("[Auth] resend failed:", err);
      // Supabase allows one email per minute per person: keep the button on hold.
      if (isResendTooSoon(err)) startCooldown();
      setPending({ ...pending, notice: authErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isValidEmail(email)) {
      fail(INVALID_EMAIL);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirect("/reset-password"),
      });
      if (error && !isResendTooSoon(error)) throw error;

      startCooldown();
      setPending({
        kind: "reset",
        email: email.trim(),
        emailSent: true,
        notice: error ? "Un email t'a déjà été envoyé il y a moins d'une minute." : null,
      });
      setShowForgotPassword(false);
    } catch (error) {
      console.error("[Auth] password reset request failed:", error);
      fail(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!isValidEmail(email)) {
      fail(INVALID_EMAIL, { field: "email" });
      return;
    }

    if (!password) {
      fail("Saisis ton mot de passe.", { field: "password" });
      return;
    }

    // Check if account is locked (server-side guard; fail open so a guard
    // outage never blocks a legitimate login).
    let isLocked = false;
    try {
      const { data: lg } = await supabase.functions.invoke("login-guard", {
        body: { action: "check", email: email.trim() },
      });
      isLocked = !!(lg as { locked?: boolean } | null)?.locked;
    } catch { /* guard unavailable — proceed */ }

    if (isLocked) {
      fail("Compte bloqué 15 minutes après plusieurs essais ratés. Réessaie plus tard, ou choisis un nouveau mot de passe.", { offerReset: true });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      if (isEmailNotConfirmed(error)) {
        // Sign-in is refused until the link in the email is clicked. The
        // confirmation screen offers to resend it.
        setPending({ kind: "confirm", email: email.trim(), emailSent: true, notice: "Ton compte n'est pas encore activé." });
        return;
      }
      if (!isInvalidCredentials(error)) {
        // Network or server trouble: say so, and do not count it as a failed attempt.
        console.error("[Auth] sign-in failed:", error);
        fail(authErrorMessage(error));
        return;
      }
      // Increment failed login attempts (server-side guard).
      try {
        await supabase.functions.invoke("login-guard", {
          body: { action: "fail", email: email.trim() },
        });
      } catch { /* ignore */ }
      fail("Email ou mot de passe incorrect.", { offerReset: true });
      return;
    }

    if (data.user && data.session) {
      // DEFENSE: block sign-in if email isn't confirmed yet. This catches
      // cases where Supabase's "Confirm email" toggle was off when the
      // account was created, or any edge case where a session exists
      // for an unverified account.
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setPending({ kind: "confirm", email: email.trim(), emailSent: true, notice: "Ton compte n'est pas encore activé." });
        return;
      }

      // Reset failed login attempts on success (server-side guard).
      try {
        await supabase.functions.invoke("login-guard", {
          body: { action: "success", email: email.trim() },
        });
      } catch { /* ignore */ }

      toast.success("Content de te revoir !");
      // Navigation handled by the useEffect watching user state
    }
  };

  const handleSignup = async () => {
    const outcome = await signUpWithEmail(
      supabase.auth,
      { email, password, firstName, lastName, gender },
      { afterConfirm: authRedirect("/profile"), setPassword: authRedirect("/reset-password") },
    );

    switch (outcome.kind) {
      case "invalid":
        fail(outcome.message, { field: outcome.field });
        return;
      case "error":
        fail(outcome.message);
        return;
      case "confirm":
        startCooldown();
        setPending({ kind: "confirm", email: outcome.email, emailSent: true, notice: null });
        return;
      case "existing":
        if (outcome.emailSent) startCooldown();
        setPending({ kind: "existing", email: outcome.email, emailSent: outcome.emailSent, notice: outcome.notice });
        return;
      case "signed_in":
        toast.success("Compte créé !");
        // Navigation handled by the useEffect watching user state
        return;
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    try {
      if (isLogin) await handleLogin();
      else await handleSignup();
    } catch (error) {
      console.error("[Auth] unexpected:", error);
      fail(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const emailSuggestion = !isLogin ? suggestEmailFix(email) : null;
  const passwordLongEnough = password.length >= PASSWORD_MIN_LENGTH;

  const errorBox = formError && (
    <div
      ref={errorRef}
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive space-y-1.5"
    >
      <p className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{formError.message}</span>
      </p>
      {formError.offerReset && (
        <p className="text-xs text-foreground/80 pl-6">
          Tu as acheté un billet sans créer de compte ? Ton compte existe déjà.{" "}
          <button
            type="button"
            onClick={() => { setFormError(null); setShowForgotPassword(true); }}
            className="text-primary font-semibold hover:underline"
          >
            Choisir un nouveau mot de passe
          </button>
        </p>
      )}
    </div>
  );

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 left-4">
        <BackButton />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? "Connexion" : "Créer un compte"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Connecte-toi pour retrouver tes billets"
              : "Retrouve tes billets et tes achats au même endroit"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold">
                  {pending.kind === "existing" ? "Tu as déjà un compte" : "Vérifie ta boîte mail"}
                </p>
                {pending.kind === "confirm" && (
                  <p className="text-sm text-muted-foreground">
                    On t'a envoyé un email à <strong className="break-all">{pending.email}</strong>.
                    Clique sur le lien pour activer ton compte.
                  </p>
                )}
                {pending.kind === "existing" && (
                  <p className="text-sm text-muted-foreground">
                    L'adresse <strong className="break-all">{pending.email}</strong> a déjà un compte.
                    Si tu as acheté un billet sans créer de compte, il a été créé automatiquement à ce moment-là.{" "}
                    {pending.emailSent
                      ? "On vient de t'envoyer un email : clique sur le lien pour choisir ton mot de passe et retrouver tes billets."
                      : "Demande un email ci-dessous pour choisir ton mot de passe."}
                  </p>
                )}
                {pending.kind === "reset" && (
                  <p className="text-sm text-muted-foreground">
                    Si un compte existe pour <strong className="break-all">{pending.email}</strong>, on vient
                    d'envoyer un email. Clique sur le lien pour choisir un nouveau mot de passe.
                  </p>
                )}
                {pending.notice && (
                  <p role="alert" className="text-sm font-medium text-foreground">{pending.notice}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Tu ne le vois pas ? Regarde dans tes spams. L'email vient de noreply@ticket-safe.eu.
                </p>
              </div>
              <Button onClick={handleResend} variant="outline" className="w-full" disabled={loading || resendSecondsLeft > 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resendSecondsLeft > 0
                  ? `Renvoyer dans ${resendSecondsLeft}s`
                  : pending.emailSent ? "Renvoyer l'email" : "Envoyer l'email"}
              </Button>
              <div className="flex flex-col gap-2">
                {pending.kind !== "reset" && (
                  <button
                    type="button"
                    onClick={() => { setPending(null); setIsLogin(false); }}
                    className="text-sm text-primary hover:underline"
                  >
                    Mauvaise adresse ? Modifier
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchMode(true)}
                  className="text-sm text-primary hover:underline"
                >
                  {pending.kind === "existing" ? "J'ai déjà mon mot de passe : me connecter" : "Retour à la connexion"}
                </button>
              </div>
            </div>
          ) : showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                Indique ton adresse email : on t'envoie un lien pour choisir un nouveau mot de passe.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Adresse email
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="toi@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {errorBox}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Recevoir le lien
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setFormError(null); }}
                  className="text-sm text-primary hover:underline"
                >
                  Retour à la connexion
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4" noValidate>
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">
                      <User className="w-4 h-4 inline mr-2" />
                      Prénom
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      maxLength={60}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nom</Label>
                    <Input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      maxLength={60}
                      required
                    />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">
                <Mail className="w-4 h-4 inline mr-2" />
                Adresse email
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="toi@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {emailSuggestion && (
                <button
                  type="button"
                  onClick={() => setEmail(emailSuggestion)}
                  className="text-xs text-primary hover:underline text-left"
                >
                  Tu voulais dire {emailSuggestion} ?
                </button>
              )}
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  Déjà acheté un billet ? Utilise la même adresse pour le retrouver.
                </p>
              )}
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label>
                  Genre <span className="font-normal text-muted-foreground">(facultatif)</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDER_CHOICES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={gender === option.value}
                      onClick={() => setGender(gender === option.value ? "" : option.value)}
                      className={`min-h-10 px-2 py-2 rounded-md border text-xs sm:text-sm font-semibold leading-tight transition-colors ${
                        gender === option.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">
                <Lock className="w-4 h-4 inline mr-2" />
                Mot de passe
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={isLogin ? undefined : PASSWORD_MAX_LENGTH}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {!isLogin && (
                <p className={`flex items-center gap-1.5 text-xs ${passwordLongEnough ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {passwordLongEnough ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{PASSWORD_RULE_TEXT}</span>
                </p>
              )}
            </div>
            {errorBox}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "Se connecter" : "Créer mon compte"}
            </Button>
          </form>
          )}

          {!showForgotPassword && !pending && (
            <>
              {isLogin && (
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => { setFormError(null); setShowForgotPassword(true); }}
                    className="text-sm text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
              )}
              <div className="mt-4 text-center text-sm">
                <button
                  type="button"
                  onClick={() => switchMode(!isLogin)}
                  className="text-primary hover:underline"
                >
                  {isLogin
                    ? "Pas encore de compte ? Créer un compte"
                    : "Déjà un compte ? Se connecter"}
                </button>
              </div>
              {!isLogin && (
                <p className="mt-4 text-xs text-center text-muted-foreground">
                  En créant un compte, tu acceptes nos{' '}
                  <a href="/terms" className="text-primary hover:underline">conditions d'utilisation</a>
                  {' '}et notre{' '}
                  <a href="/privacy" className="text-primary hover:underline">politique de confidentialité</a>.
                </p>
              )}
            </>
          )}
        </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Auth;
