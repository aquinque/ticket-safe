import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, GraduationCap } from "lucide-react";

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

        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
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

        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
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
                minLength={6}
              />
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