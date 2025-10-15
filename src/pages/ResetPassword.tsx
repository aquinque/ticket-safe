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
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has a valid session from the reset link
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        setIsValidToken(false);
        toast.error("This reset link has expired or is invalid. Please request a new one.");
        setTimeout(() => navigate("/auth"), 3000);
      } else {
        setIsValidToken(true);
      }
    };

    checkSession();
  }, [navigate]);

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

  const passwordStrength = getPasswordStrength(newPassword);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate password
      const passwordValidation = passwordSchema.safeParse(newPassword);
      if (!passwordValidation.success) {
        const errors = passwordValidation.error.errors.map(e => e.message);
        toast.error(errors[0]);
        setLoading(false);
        return;
      }

      // Check if passwords match
      if (newPassword !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success("Password updated successfully! Redirecting to login...");
      
      // Sign out to require fresh login with new password
      await supabase.auth.signOut();
      
      setTimeout(() => {
        navigate("/auth");
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center text-destructive">
              Invalid Reset Link
            </CardTitle>
            <CardDescription className="text-center">
              This reset link has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/auth")}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <BackButton />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Reset Your Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
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
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPassword && (
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
                    <div className={`flex items-center gap-1.5 ${newPassword.length >= 12 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {newPassword.length >= 12 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 12 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[A-Z]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[A-Z]/.test(newPassword) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Uppercase letter (A-Z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[a-z]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[a-z]/.test(newPassword) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Lowercase letter (a-z)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[0-9]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[0-9]/.test(newPassword) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Number (0-9)</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[^A-Za-z0-9]/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {/[^A-Za-z0-9]/.test(newPassword) ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>Special character (!@#$...)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
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
                  <CheckCircle2 className="w-3 h-3" />
                  Passwords match
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading || newPassword !== confirmPassword}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
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
