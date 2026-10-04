import { useState, useEffect } from "react";
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
import { Loader2, Mail, Lock, User, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { authRedirect } from "@/lib/siteUrl";

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[a-z]/, 'Must contain lowercase letter')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

const GENDER_OPTIONS: { value: "female" | "male"; label: string }[] = [
  { value: "female", label: "Fille" },
  { value: "male", label: "Garçon" },
];

// Reads the first validation error from a failed edge function call. A non-2xx
// response hides its body in `data`, so it is read from `error.context`.
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

const Auth = () => {
  useThemeMode("night");
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"" | "female" | "male">("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);
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

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    let strength = 0;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength, label: 'Weak', color: 'bg-red-500' };
    if (strength === 3) return { strength, label: 'Medium', color: 'bg-yellow-500' };
    if (strength === 4) return { strength, label: 'Strong', color: 'bg-green-500' };
    return { strength, label: 'Very Strong', color: 'bg-green-600' };
  };

  const passwordStrength = getPasswordStrength(password);

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

  const handleResendConfirmation = async () => {
    if (!pendingConfirmEmail) return;
    if (resendSecondsLeft > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: pendingConfirmEmail,
        options: { emailRedirectTo: authRedirect("/profile") },
      });
      if (error) throw error;
      setResendCooldownUntil(Date.now() + 60_000);
      toast.success("Confirmation email resent. Check your inbox.");
    } catch (err) {
      console.error("[Auth] resend confirmation failed:", err);
      toast.error("Could not resend confirmation email. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!validateEmail(email)) {
        toast.error("Please enter a valid email address");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect("/reset-password"),
      });

      if (error) throw error;

      toast.success("Password reset email sent! Check your inbox.");
      setShowForgotPassword(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send password reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // Client-side validation for login
        if (!validateEmail(email)) {
          toast.error("Please enter a valid email address");
          setLoading(false);
          return;
        }

        if (!password) {
          toast.error("Please enter your password");
          setLoading(false);
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
          toast.error("Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (
            error.message?.toLowerCase().includes('email not confirmed') ||
            (error as { code?: string }).code === 'email_not_confirmed'
          ) {
            // Sign-in is refused until the link in the email is clicked. The
            // confirmation screen offers to resend it.
            setPendingConfirmEmail(email.trim());
            setLoading(false);
            return;
          }
          // Increment failed login attempts (server-side guard).
          try {
            await supabase.functions.invoke("login-guard", {
              body: { action: "fail", email: email.trim() },
            });
          } catch { /* ignore */ }
          toast.error("Invalid email or password.");
          setLoading(false);
          return;
        }

        if (data.user && data.session) {
          // DEFENSE: block sign-in if email isn't confirmed yet. This catches
          // cases where Supabase's "Confirm email" toggle was off when the
          // account was created, or any edge case where a session exists
          // for an unverified account.
          if (!data.user.email_confirmed_at) {
            await supabase.auth.signOut();
            toast.error("Please confirm your email first — check your inbox for the verification link.");
            setPendingConfirmEmail(email.trim());
            setLoading(false);
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
      } else {
        // Client-side validation for signup
        if (!validateEmail(email)) {
          toast.error("Please enter a valid email address");
          setLoading(false);
          return;
        }

        if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
          toast.error("The email addresses don't match");
          setLoading(false);
          return;
        }

        if (!firstName.trim() || !lastName.trim()) {
          toast.error("Please enter your first and last name");
          setLoading(false);
          return;
        }

        if (gender !== "female" && gender !== "male") {
          toast.error("Please select a gender");
          setLoading(false);
          return;
        }

        const passwordValidation = passwordSchema.safeParse(password);
        if (!passwordValidation.success) {
          const errors = passwordValidation.error.errors.map(e => e.message);
          toast.error(errors[0]);
          setLoading(false);
          return;
        }

        // Server-side validation, including the email confirmation match.
        const { data: validationData, error: validationError } = await supabase.functions.invoke(
          'validate-signup',
          {
            body: {
              accountType: 'ticketsafe',
              email: email.trim(),
              emailConfirm: confirmEmail.trim(),
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              gender,
            },
          }
        );

        if (validationError || !validationData?.valid) {
          const message = await readValidationError(validationError, validationData);
          toast.error(message ?? "Please check your details and try again.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirect("/profile"),
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: `${firstName.trim()} ${lastName.trim()}`,
              gender,
            },
          },
        });

        if (error) {
          const errMsg = error instanceof Error ? error.message : String(error ?? 'An error occurred');
          if (errMsg.includes("already registered") || errMsg.includes("User already registered")) {
            toast.error("An account already exists with this email. Sign in instead.");
            setIsLogin(true);
          } else {
            toast.error("Unable to create account. Please verify your information.");
          }
          setLoading(false);
          return;
        }

        // Supabase returns a user with no identities when the email already has an
        // account. Show the same path as "already registered" instead of "check your inbox".
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          toast.error("An account already exists with this email. Sign in instead.");
          setIsLogin(true);
          setLoading(false);
          return;
        }

        // Email confirmation is always required before the user can sign in.
        if (data.user && !data.user.email_confirmed_at) {
          if (data.session) {
            // Defense in depth: the session should not exist before confirmation.
            await supabase.auth.signOut();
          }
          setPendingConfirmEmail(email.trim());
          toast.success("Account created — check your email to confirm.");
        } else if (data.user && data.session) {
          // Confirmation is off on the project: force sign out and ask for confirmation.
          await supabase.auth.signOut();
          setPendingConfirmEmail(email.trim());
          toast.success("Account created — please confirm your email before signing in.");
        }
      }
    } catch (error) {
      // Generic error message to prevent information disclosure
      toast.error("An error occurred during authentication. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <div className="absolute top-4 left-4">
        <BackButton />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin
              ? "Sign in to access your ticket marketplace"
              : "Join the TicketSafe marketplace"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingConfirmEmail ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold">Vérifie ta boîte mail</p>
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to <strong>{pendingConfirmEmail}</strong>.
                  Click it to activate your account, then come back to sign in.
                </p>
                <p className="text-xs text-muted-foreground">
                  Don't see it? Check your spam folder, or resend below.
                </p>
              </div>
              <Button onClick={handleResendConfirmation} variant="outline" className="w-full" disabled={loading || resendSecondsLeft > 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resendSecondsLeft > 0 ? `Renvoyer dans ${resendSecondsLeft}s` : "Renvoyer l'email"}
              </Button>
              <button
                type="button"
                onClick={() => { setPendingConfirmEmail(null); setIsLogin(true); }}
                className="text-sm text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="text-sm text-primary hover:underline"
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
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
                {isLogin ? "Email" : "Adresse email"}
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmEmail">Confirmer l'adresse email</Label>
                <Input
                  id="confirmEmail"
                  type="email"
                  autoComplete="off"
                  placeholder="you@example.com"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  required
                />
                {confirmEmail && confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase() && (
                  <p className="text-xs text-red-500">Les adresses email ne correspondent pas.</p>
                )}
              </div>
            )}
            {!isLogin && (
              <div className="space-y-2">
                <Label>Genre</Label>
                <div className="grid grid-cols-2 gap-3">
                  {GENDER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={gender === option.value}
                      onClick={() => setGender(option.value)}
                      className={`h-10 rounded-md border text-sm font-semibold transition-colors ${
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
                  minLength={isLogin ? undefined : 12}
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
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span className={`font-medium ${
                      passwordStrength.strength <= 2 ? 'text-red-500' :
                      passwordStrength.strength === 3 ? 'text-yellow-500' :
                      passwordStrength.strength === 4 ? 'text-green-500' :
                      'text-green-600'
                    }`}>
                      {password ? passwordStrength.label : ""}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className={`flex items-center gap-1.5 ${password.length >= 12 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {password.length >= 12 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 12 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[A-Z]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Uppercase letter (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[a-z]/.test(password) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[a-z]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Lowercase letter (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[0-9]/.test(password) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[0-9]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Number (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[^A-Za-z0-9]/.test(password) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[^A-Za-z0-9]/.test(password) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Special character (!@#$...)</span>
                    </div>
                  </div>
                 </div>
               )}
             </div>
             <Button type="submit" className="w-full" disabled={loading}>
               {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
               {isLogin ? "Sign In" : "Create Account"}
             </Button>
           </form>
          )}

           {!showForgotPassword && !pendingConfirmEmail && (
             <>
               {isLogin && (
                 <div className="mt-3 text-center">
                   <button
                     type="button"
                     onClick={() => setShowForgotPassword(true)}
                     className="text-sm text-primary hover:underline"
                   >
                     Forgot your password?
                   </button>
                 </div>
               )}
               <div className="mt-4 text-center text-sm">
                 <button
                   type="button"
                   onClick={() => {
                     setIsLogin(!isLogin);
                     setShowForgotPassword(false);
                     setPendingConfirmEmail(null);
                   }}
                   className="text-primary hover:underline"
                 >
                   {isLogin
                     ? "Don't have an account? Sign up"
                     : "Already have an account? Sign in"}
                 </button>
               </div>
               {!isLogin && (
                 <p className="mt-4 text-xs text-center text-muted-foreground">
                   By creating an account, you agree to our{' '}
                   <a href="/terms" className="text-primary hover:underline">Terms & Conditions</a>
                   {' '}and{' '}
                   <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
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
