import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
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
  AlertCircle
} from "lucide-react";

const PersonalInformation = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.user_metadata?.full_name || '');
      setProfileEmail(user.email || '');
    }
  }, [user]);

  const handleSaveProfile = async () => {
    // Validate password if provided
    if (newPassword) {
      if (newPassword.length < 6) {
        toast({
          title: "Password too short",
          description: "Password must be at least 6 characters long",
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
    }

    try {
      setLoading(true);

      // Update name if changed
      if (profileName !== user?.user_metadata?.full_name) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: { full_name: profileName }
        });
        if (metaError) throw metaError;
      }

      // Update email if changed
      if (profileEmail !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: profileEmail
        });
        if (emailError) throw emailError;
      }

      // Update password if provided
      if (newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (passwordError) throw passwordError;
        setNewPassword('');
        setConfirmPassword('');

        toast({
          title: "Password updated",
          description: "Your password has been changed successfully",
        });
      }

      toast({
        title: t('toast.profileUpdated'),
        description: t('toast.profileUpdateSuccess'),
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: error instanceof Error ? error.message : t('toast.profileUpdateFailed'),
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
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-6">
            <BackButton fallbackPath="/settings" />
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                <User className="w-5 h-5 text-purple-600" />
              </div>
              <h1 className="text-4xl font-bold">Personal Information</h1>
            </div>
            <p className="text-muted-foreground">
              Manage your account details and credentials
            </p>
          </div>

          {/* Settings Cards */}
          <div className="space-y-6">
            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="flex gap-2">
                    <Mail className="w-5 h-5 text-muted-foreground mt-2" />
                    <Input
                      id="email"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="your.email@escp.eu"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Changing your email will require verification
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
                    placeholder="Enter new password (min. 6 characters)"
                  />
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        {newPassword.length >= 6 ? (
                          <span className="text-green-600">✓ At least 6 characters</span>
                        ) : (
                          <span className="text-muted-foreground">○ At least 6 characters</span>
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

            {/* Save Button */}
            <div className="flex gap-3">
              <Button
                onClick={handleSaveProfile}
                className="w-full"
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
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
