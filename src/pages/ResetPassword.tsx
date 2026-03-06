import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[a-z]/, 'Must contain lowercase letter')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // null = checking, true = valid token/session, false = invalid/expired
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let resolved = false;

    const resolve = (valid: boolean) => {
      if (resolved) return;
      resolved = true;
      setIsValidToken(valid);
      if (!valid) {
        toast.error("This reset link has expired or is invalid. Please request a new one.");
        setTimeout(() => navigate("/auth"), 3000);
      }
    };

    // ── PKCE flow: Supabase sends ?code=xxxx in the redirect URL ─────────────
    // The GitHub Pages 404.html preserves query params, so the code is intact
    // after the SPA redirect restores the path in index.html.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error("[reset-password] exchangeCodeForSession:", error.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    }

    // ── Implicit / magic-link fallback: PASSWORD_RECOVERY auth event ─────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        resolve(true);
      }
    });

    // ── Timeout: if no valid path resolves within 5 s, reject ────────────────
    const timeout = setTimeout(() => resolve(false), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  const getPasswordStrength = (pw: string): { strength: number; label: string; color: string } => {
    let s = 0;
    if (pw.length >= 12)          s++;
    if (/[A-Z]/.test(pw))         s++;
    if (/[a-z]/.test(pw))         s++;
    if (/[0-9]/.test(pw))         s++;
    if (/[^A-Za-z0-9]/.test(pw))  s++;
    if (s <= 2) return { strength: s, label: 'Weak',        color: 'bg-red-500' };
    if (s === 3) return { strength: s, label: 'Medium',     color: 'bg-yellow-500' };
    if (s === 4) return { strength: s, label: 'Strong',     color: 'bg-green-500' };
    return            { strength: s, label: 'Very Strong',  color: 'bg-green-600' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validation = passwordSchema.safeParse(newPassword);
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully! Redirecting to login...");
      await supabase.auth.signOut();
      setTimeout(() => navigate("/auth"), 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isValidToken === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4"><BackButton /></div>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Verifying reset link…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Invalid / expired ─────────────────────────────────────────────────────
  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4"><BackButton /></div>
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

  // ── Reset form ────────────────────────────────────────────────────────────
  const checks: [boolean, string][] = [
    [newPassword.length >= 12,        "At least 12 characters"],
    [/[A-Z]/.test(newPassword),       "Uppercase letter (A-Z)"],
    [/[a-z]/.test(newPassword),       "Lowercase letter (a-z)"],
    [/[0-9]/.test(newPassword),       "Number (0-9)"],
    [/[^A-Za-z0-9]/.test(newPassword),"Special character (!@#$...)"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4"><BackButton /></div>
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
                <Lock className="w-4 h-4 inline mr-2" />New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={12} className="pr-10"
                />
                <button type="button" tabIndex={-1}
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
                    <span className={`font-medium ${
                      passwordStrength.strength <= 2 ? 'text-red-500' :
                      passwordStrength.strength === 3 ? 'text-yellow-500' : 'text-green-600'
                    }`}>{passwordStrength.label}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.strength / 5) * 100}%` }} />
                  </div>
                  <div className="space-y-1 text-xs">
                    {checks.map(([ok, label]) => (
                      <div key={label} className={`flex items-center gap-1.5 ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
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
                <Lock className="w-4 h-4 inline mr-2" />Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required minLength={12} className="pr-10"
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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

            <Button
              type="submit" className="w-full"
              disabled={loading || newPassword !== confirmPassword || !passwordSchema.safeParse(newPassword).success}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>

            <div className="text-center">
              <button type="button" onClick={() => navigate("/auth")}
                className="text-sm text-primary hover:underline">
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
