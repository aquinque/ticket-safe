import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, CheckCircle2, XCircle, Eye, EyeOff, Building2, MapPin } from "lucide-react";
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

// Schools open on Ticket Safe. ESCP is the pilot; more are coming.
const SCHOOLS = [
  { value: "ESCP Business School", label: "ESCP Business School", available: true },
];
const CAMPUSES = ["Paris", "London", "Madrid", "Berlin", "Turin"];

const Auth = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("ESCP Business School");
  const [campus, setCampus] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
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

  // Allow-list for non-ESCP accounts that still need signup access
  // (Ticket Safe ops / shared admin inboxes). Mirrors validate-signup edge fn.
  const SIGNUP_EMAIL_ALLOWLIST = new Set<string>([
    'ticketsafe.friendly@gmail.com',
  ]);

  const isEscpEmail = (email: string) => {
    const normalized = email.toLowerCase().trim();
    return normalized.endsWith('@edu.escp.eu') || SIGNUP_EMAIL_ALLOWLIST.has(normalized);
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

  const handleResendConfirmation = async () => {
    if (!pendingConfirmEmail) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: pendingConfirmEmail,
        options: { emailRedirectTo: authRedirect("/profile") },
      });
      if (error) throw error;
      toast.success("Confirmation email resent. Check your inbox.");
    } catch {
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

        if (!isEscpEmail(email)) {
          toast.error("Only ESCP student email addresses (@edu.escp.eu) are accepted");
          setLoading(false);
          return;
        }

        if (!fullName.trim() || fullName.length > 100) {
          toast.error("Please enter a valid full name (max 100 characters)");
          setLoading(false);
          return;
        }

        if (!school) {
          toast.error("Please choose your school");
          setLoading(false);
          return;
        }

        if (!campus || !CAMPUSES.includes(campus)) {
          toast.error("Please choose your campus");
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

        const detectedUniversity = school;

        // Server-side validation via Edge Function
        const { data: validationData, error: validationError } = await supabase.functions.invoke(
          'validate-signup',
          {
            body: {
              email: email.trim(),
              fullName: fullName.trim(),
            },
          }
        );

        if (validationError || !validationData?.valid) {
          const errors = validationData?.errors || ['Validation failed'];
          toast.error(errors[0]);
          setLoading(false);
          return;
        }

        // The user explicitly picks their campus at signup (see the form below).
        const detectedCampus = campus;

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirect("/profile"),
            data: {
              full_name: fullName.trim(),
              university: detectedUniversity.trim(),
              campus: detectedCampus,
            },
          },
        });

        if (error) {
          const errMsg = error instanceof Error ? error.message : String(error ?? 'An error occurred');
          if (errMsg.includes("already registered") || errMsg.includes("User already registered")) {
            toast.error("Unable to create account. Please try logging in.");
            setIsLogin(true);
          } else {
            toast.error("Unable to create account. Please verify your information.");
          }
          setLoading(false);
          return;
        }

        // After signup, always require email confirmation before letting the user in.
        // Three cases:
        //  (a) Supabase "Confirm email" is ON → no session returned, email_confirmed_at null
        //      → show "Check your inbox" UI (Supabase already sent the email)
        //  (b) Supabase "Confirm email" is ON but user already existed unconfirmed
        //      → same as (a)
        //  (c) Supabase "Confirm email" is OFF (misconfigured) → session returned + auto-confirmed
        //      → we still force them out so they can re-sign-in. We try to trigger a resend
        //         to mimic the intended flow.
        if (data.user && !data.user.email_confirmed_at) {
          // Cases (a) + (b): no session, just show check-inbox UI
          if (data.session) {
            // Shouldn't happen in this branch, but defense in depth
            await supabase.auth.signOut();
          }
          setPendingConfirmEmail(email.trim());
          toast.success("Account created — check your email to confirm.");
        } else if (data.user && data.session) {
          // Case (c): Supabase auto-confirmed (settings misconfigured).
          // Force sign out and tell the user.
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
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
              : "Join the verified student ticket marketplace"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingConfirmEmail ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold">Check your inbox</p>
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to <strong>{pendingConfirmEmail}</strong>.
                  Click it to activate your account, then come back to sign in.
                </p>
                <p className="text-xs text-muted-foreground">
                  Don't see it? Check your spam folder, or resend below.
                </p>
              </div>
              <Button onClick={handleResendConfirmation} variant="outline" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resend confirmation email
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
                  placeholder="firstname.lastname@edu.escp.eu"
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
                <div className="space-y-2">
                  <Label htmlFor="fullName">
                    <User className="w-4 h-4 inline mr-2" />
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    <Building2 className="w-4 h-4 inline mr-2" />
                    School
                  </Label>
                  <Select value={school} onValueChange={setSchool}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your school" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHOOLS.map((s) => (
                        <SelectItem key={s.value} value={s.value} disabled={!s.available}>
                          {s.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="__coming_soon" disabled>
                        More schools coming soon…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Campus
                  </Label>
                  <Select value={campus || undefined} onValueChange={setCampus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose your campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPUSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">
                <Mail className="w-4 h-4 inline mr-2" />
                {isLogin ? "Email" : "ESCP Student Email"}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={isLogin ? "firstname.lastname@edu.escp.eu" : "firstname.lastname@edu.escp.eu"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
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
                  minLength={12}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {!isLogin && password && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span className={`font-medium ${
                      passwordStrength.strength <= 2 ? 'text-red-500' :
                      passwordStrength.strength === 3 ? 'text-yellow-500' :
                      passwordStrength.strength === 4 ? 'text-green-500' :
                      'text-green-600'
                    }`}>
                      {passwordStrength.label}
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