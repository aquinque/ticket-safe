import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/SEOHead";
import {
  User,
  Mail,
  Lock,
  Save,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

const PersonalInformation = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  // Name + email are read-only by design (anti-fraud). We display whatever
  // Supabase has on file and only let the user change their password here.
  // To change name or email, users must contact support — the manual review
  // step is the friction that prevents account-takeover impersonation.
  const profileName = user?.user_metadata?.full_name || "";
  const profileEmail = user?.email || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSavePassword = async () => {
    if (!newPassword) {
      toast({
        title: "Nothing to save",
        description: "Enter a new password to update it.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 12) {
      toast({
        title: "Password too short",
        description: "Password must be at least 12 characters long",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "New password and confirmation do not match",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (passwordError) throw passwordError;
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully",
      });
    } catch (error) {
      toast({
        title: t("toast.error"),
        description:
          error instanceof Error ? error.message : t("toast.profileUpdateFailed"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-6 md:py-10 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-5">
            <BackButton fallbackPath="/settings" />
          </div>

          <PageHeader
            icon={User}
            title="Personal information"
            description="Manage your account details and credentials."
            iconClass="bg-purple-50 dark:bg-purple-950/30 text-purple-600"
          />

          {/* Settings Cards */}
          <div className="space-y-6">
            {/* Profile Information — read-only for anti-fraud */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Your verified identity on Ticket Safe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Full Name
                  </Label>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {profileName || "—"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Email Address
                  </Label>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {profileEmail || "—"}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">
                      Locked for your security.
                    </span>{" "}
                    Your name and email are used to verify ticket buyers and
                    sellers. To change them, contact{" "}
                    <a
                      href="mailto:support@ticket-safe.eu"
                      className="text-primary font-medium hover:underline"
                    >
                      support@ticket-safe.eu
                    </a>
                    .
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Password Change */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  Change Password
                </CardTitle>
                <CardDescription>
                  Update your account password
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 12 characters)"
                  />
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        {newPassword.length >= 12 ? (
                          <span className="text-green-600">✓ At least 12 characters</span>
                        ) : (
                          <span className="text-muted-foreground">○ At least 12 characters</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    Passwords do not match
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Leave blank if you don't want to change your password
                </p>
              </CardContent>
            </Card>

            {/* Save Button — password only */}
            <div className="flex gap-3">
              <Button
                onClick={handleSavePassword}
                className="w-full"
                disabled={loading || !newPassword}
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? "Saving..." : "Update Password"}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PersonalInformation;
