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
import { pendingPromoterInvite } from "@/lib/promoterLinks";
import { rememberResetReturn } from "@/lib/resetReturn";
import { authRedirect } from "@/lib/siteUrl";
import { emailConfirmLanding, returnPathOr, safeReturnPath } from "@/lib/returnTo";
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
const INVALID_EMAIL = "This email address isn't valid. Check it for typos.";

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
  const [showForgotPassword, setShowForgotPassword] = useState(mode === 'reset');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<PendingEmail | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Where to go once signed in: the page the person came from (`?next=`, internal paths only, see
  // lib/returnTo), else a pending promoter invitation, else the home. Never the account page.
  const destination = (): string => {
    const next = safeReturnPath(searchParams.get("next"));
    if (next) return next;
    const pendingInvite = pendingPromoterInvite();
    return returnPathOr(pendingInvite ? `/p/${pendingInvite}` : null);
  };

  // Signed in (just now, or already when the page opened): leave the sign-in page. `replace` so the
  // browser's Back button does not bring the person back to it.
  useEffect(() => {
    if (!authLoading && user) navigate(destination(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (pending.kind !== "confirm") rememberResetReturn(destination());
      const { error } = pending.kind === "confirm"
        ? await supabase.auth.resend({
            type: 'signup',
            email: pending.email,
            options: { emailRedirectTo: authRedirect(emailConfirmLanding(destination())) },
          })
        : await supabase.auth.resetPasswordForEmail(pending.email, {
            redirectTo: authRedirect("/reset-password"),
          });
      if (error) throw error;
      startCooldown();
      setPending({ ...pending, emailSent: true, notice: null });
      toast.success("Email sent again. Check your inbox.");
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
      // The reset email always opens /reset-password: remember where to come back to afterwards.
      rememberResetReturn(destination());
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirect("/reset-password"),
      });
      if (error && !isResendTooSoon(error)) throw error;

      startCooldown();
      setPending({
        kind: "reset",
        email: email.trim(),
        emailSent: true,
        notice: error ? "We sent you an email less than a minute ago." : null,
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
      fail("Enter your password.", { field: "password" });
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
      fail("Account locked for 15 minutes after several failed attempts. Try again later, or choose a new password.", { offerReset: true });
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
        setPending({ kind: "confirm", email: email.trim(), emailSent: true, notice: "Your account isn't activated yet." });
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
      fail("Incorrect email or password.", { offerReset: true });
      return;
    }

    if (data.user && data.session) {
      // DEFENSE: block sign-in if email isn't confirmed yet. This catches
      // cases where Supabase's "Confirm email" toggle was off when the
      // account was created, or any edge case where a session exists
      // for an unverified account.
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setPending({ kind: "confirm", email: email.trim(), emailSent: true, notice: "Your account isn't activated yet." });
        return;
      }

      // Reset failed login attempts on success (server-side guard).
      try {
        await supabase.functions.invoke("login-guard", {
          body: { action: "success", email: email.trim() },
        });
      } catch { /* ignore */ }

      toast.success("Welcome back!");
      // Navigation handled by the useEffect watching user state
    }
  };

  const handleSignup = async () => {
    const outcome = await signUpWithEmail(
      supabase.auth,
      { email, password, firstName, lastName, gender },
      { afterConfirm: authRedirect(emailConfirmLanding(destination())), setPassword: authRedirect("/reset-password") },
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
        toast.success("Account created!");
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
          Bought a ticket without creating an account? Your account already exists.{" "}
          <button
            type="button"
            onClick={() => { setFormError(null); setShowForgotPassword(true); }}
            className="text-primary font-semibold hover:underline"
          >
            Choose a new password
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
            {isLogin ? "Sign in" : "Create an account"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Sign in to find your tickets"
              : "Your tickets and purchases, all in one place"}
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
                  {pending.kind === "existing" ? "You already have an account" : "Check your inbox"}
                </p>
                {pending.kind === "confirm" && (
                  <p className="text-sm text-muted-foreground">
                    We've sent an email to <strong className="break-all">{pending.email}</strong>.
                    Click the link to activate your account.
                  </p>
                )}
                {pending.kind === "existing" && (
                  <p className="text-sm text-muted-foreground">
                    The address <strong className="break-all">{pending.email}</strong> already has an account.
                    If you bought a ticket without creating an account, one was created for you automatically at that point.{" "}
                    {pending.emailSent
                      ? "We've just sent you an email: click the link to choose your password and find your tickets."
                      : "Request an email below to choose your password."}
                  </p>
                )}
                {pending.kind === "reset" && (
                  <p className="text-sm text-muted-foreground">
                    If an account exists for <strong className="break-all">{pending.email}</strong>, we've just
                    sent an email. Click the link to choose a new password.
                  </p>
                )}
                {pending.notice && (
                  <p role="alert" className="text-sm font-medium text-foreground">{pending.notice}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Can't see it? Check your spam folder. The email comes from noreply@ticket-safe.eu.
                </p>
              </div>
              <Button onClick={handleResend} variant="outline" className="w-full" disabled={loading || resendSecondsLeft > 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resendSecondsLeft > 0
                  ? `Resend in ${resendSecondsLeft}s`
                  : pending.emailSent ? "Resend the email" : "Send the email"}
              </Button>
              <div className="flex flex-col gap-2">
                {pending.kind !== "reset" && (
                  <button
                    type="button"
                    onClick={() => { setPending(null); setIsLogin(false); }}
                    className="text-sm text-primary hover:underline"
                  >
                    Wrong address? Change it
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchMode(true)}
                  className="text-sm text-primary hover:underline"
                >
                  {pending.kind === "existing" ? "I already have my password: sign in" : "Back to sign in"}
                </button>
              </div>
            </div>
          ) : showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to choose a new password.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email address
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {errorBox}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send me the link
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setFormError(null); }}
                  className="text-sm text-primary hover:underline"
                >
                  Back to sign in
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
                      First name
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
                    <Label htmlFor="lastName">Last name</Label>
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
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="you@example.com"
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
                  Did you mean {emailSuggestion}?
                </button>
              )}
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  Already bought a ticket? Use the same address to find it.
                </p>
              )}
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label>
                  Gender <span className="font-normal text-muted-foreground">(optional)</span>
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
                Password
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
              {isLogin ? "Sign in" : "Create my account"}
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
                    Forgot your password?
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
                    ? "No account yet? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
              {!isLogin && (
                <p className="mt-4 text-xs text-center text-muted-foreground">
                  By creating an account, you agree to our{' '}
                  <a href="/terms" className="text-primary hover:underline">Terms of Use</a>
                  {' '}and our{' '}
                  <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
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
