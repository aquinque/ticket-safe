import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter (A-Z)")
  .regex(/[a-z]/, "Must contain a lowercase letter (a-z)")
  .regex(/[0-9]/, "Must contain a number (0-9)")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character (!@#$...)");

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const navigate = useNavigate();

  // ── Validate session on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const resolve = (valid: boolean) => {
      if (cancelled) return;
      console.log("[reset-password] session valid:", valid);
      setIsValidToken(valid);
      if (!valid) {
        toast.error("This reset link has expired or is invalid. Please request a new one.");
        setTimeout(() => navigate("/auth"), 3000);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      resolve(!!data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        resolve(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // ── Auto-redirect after success ──────────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    if (redirectCountdown <= 0) {
      navigate("/profile", { replace: true });
      return;
    }
    const t = setTimeout(() => setRedirectCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [success, redirectCountdown, navigate]);

  const getPasswordStrength = (pw: string) => {
    let s = 0;
    if (pw.length >= 12) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    if (s <= 2) return { strength: s, label: "Weak", color: "bg-red-500" };
    if (s === 3) return { strength: s, label: "Medium", color: "bg-yellow-500" };
    if (s === 4) return { strength: s, label: "Strong", color: "bg-green-500" };
    return { strength: s, label: "Very Strong", color: "bg-green-600" };
  };
  const passwordStrength = getPasswordStrength(newPassword);

  const checks: [boolean, string][] = [
    [newPassword.length >= 12, "At least 12 characters"],
    [/[A-Z]/.test(newPassword), "Uppercase letter (A-Z)"],
    [/[a-z]/.test(newPassword), "Lowercase letter (a-z)"],
    [/[0-9]/.test(newPassword), "Number (0-9)"],
    [/[^A-Za-z0-9]/.test(newPassword), "Special character (!@#$...)"],
  ];

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    console.log("[reset-password] submit clicked");

    // Inline validation
    const validation = passwordSchema.safeParse(newPassword);
    if (!validation.success) {
      const msg = validation.error.errors[0].message;
      console.warn("[reset-password] password schema failed:", msg);
      setSubmitError(msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // Sanity check: confirm we still have a session before calling updateUser
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error("[reset-password] no active session at submit time");
        setSubmitError("Your reset session expired. Please request a new password-reset email.");
        setTimeout(() => navigate("/auth"), 3000);
        return;
      }

      console.log("[reset-password] calling updateUser with new password…");
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        console.error("[reset-password] updateUser error:", error);
        throw error;
      }
      console.log("[reset-password] updateUser ok, user:", data.user?.id);

      toast.success("Password updated successfully!");
      setSuccess(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to reset password. Please try again.";
      console.error("[reset-password] caught error:", msg);
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Verifying session ────────────────────────────────────────────────────
  if (isValidToken === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Verifying reset link…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Invalid / expired ────────────────────────────────────────────────────
  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-destructive">
              Invalid Reset Link
            </CardTitle>
            <CardDescription className="text-center">
              This reset link has expired or has already been used. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/auth")}>Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-center text-green-700">
              Password updated
            </CardTitle>
            <CardDescription className="text-center">
              Your new password is now active. Redirecting you to your profile in{" "}
              <span className="font-bold text-foreground">{redirectCountdown}</span>…
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button onClick={() => navigate("/profile", { replace: true })}>
              Go to my profile now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Reset form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <BackButton />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Reset Your Password</CardTitle>
          <CardDescription className="text-center">Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">
                <Lock className="w-4 h-4 inline mr-2" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setSubmitError(null);
                  }}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Password strength:</span>
                    <span
                      className={`font-medium ${
                        passwordStrength.strength <= 2
                          ? "text-red-500"
                          : passwordStrength.strength === 3
                          ? "text-yellow-500"
                          : "text-green-600"
                      }`}
                    >
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
                    {checks.map(([ok, label]) => (
                      <div
                        key={label}
                        className={`flex items-center gap-1.5 ${
                          ok ? "text-green-600" : "text-muted-foreground"
                        }`}
                      >
                        {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                <Lock className="w-4 h-4 inline mr-2" />
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setSubmitError(null);
                  }}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
              {confirmPassword && confirmPassword === newPassword && newPassword.length >= 12 && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>

            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Updating…" : "Reset Password"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="text-sm text-primary hover:underline"
              >
                Back to login
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
