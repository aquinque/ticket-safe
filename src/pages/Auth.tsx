import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, GraduationCap, CheckCircle2, XCircle } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[a-z]/, 'Must contain lowercase letter')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [university, setUniversity] = useState("");
  const navigate = useNavigate();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isUniversityEmail = (email: string) => {
    // Check for common university email patterns
    return email.includes('.edu') || email.includes('.ac.') || email.includes('student');
  };

  const getUniversityFromEmail = (email: string): string => {
    if (email.includes('escp.eu')) return 'ESCP';
    // Add more university mappings as needed
    const domain = email.split('@')[1];
    return domain.split('.')[0].toUpperCase();
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

        const passwordValidation = passwordSchema.safeParse(password);
        if (!passwordValidation.success) {
          const errors = passwordValidation.error.errors.map(e => e.message);
          toast.error(errors[0]);
          setLoading(false);
          return;
        }

        // Check if account is locked
        const { data: isLocked } = await supabase.rpc('check_account_lockout', {
          user_email: email.trim()
        });

        if (isLocked) {
          toast.error("Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          // Increment failed login attempts
          await supabase.rpc('increment_failed_login', {
            user_email: email.trim()
          });
          throw error;
        }

        // Reset failed login attempts on success
        await supabase.rpc('reset_failed_login', {
          user_email: email.trim()
        });
        
        toast.success("Welcome back!");
        navigate("/");
      } else {
        // Client-side validation for signup
        if (!validateEmail(email)) {
          toast.error("Please enter a valid email address");
          setLoading(false);
          return;
        }

        if (!fullName.trim() || fullName.length > 100) {
          toast.error("Please enter a valid full name (max 100 characters)");
          setLoading(false);
          return;
        }

        if (university && university.length > 200) {
          toast.error("University name must be less than 200 characters");
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

        const detectedUniversity = university || getUniversityFromEmail(email);

        // Server-side validation via Edge Function
        const { data: validationData, error: validationError } = await supabase.functions.invoke(
          'validate-signup',
          {
            body: {
              email: email.trim(),
              fullName: fullName.trim(),
              university: detectedUniversity.trim(),
            },
          }
        );

        if (validationError || !validationData?.valid) {
          const errors = validationData?.errors || ['Validation failed'];
          toast.error(errors[0]);
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName.trim(),
              university: detectedUniversity.trim(),
            },
          },
        });

        if (error) throw error;
        toast.success("Account created successfully! Redirecting...");
        navigate("/");
      }
    } catch (error: any) {
      if (error.message.includes("already registered")) {
        toast.error("This email is already registered. Please login instead.");
      } else if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
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
                  <Label htmlFor="university">
                    <GraduationCap className="w-4 h-4 inline mr-2" />
                    University (Optional)
                  </Label>
                  <Input
                    id="university"
                    type="text"
                    placeholder="Auto-detected from email"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">
                <Mail className="w-4 h-4 inline mr-2" />
                University Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@university.edu"
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
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
              />
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

          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin 
                ? "Don't have an account? Sign up" 
                : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;