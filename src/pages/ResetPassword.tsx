import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThemeMode } from "@/hooks/useThemeMode";
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
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, authErrorMessage, passwordError } from "@/lib/authRules";

/**
 * An account created automatically by a purchase without an account has no
 * password its owner knows. The first time they choose one, this page is their
 * account activation, not a password reset.
 */
const isFirstActivation = (metadata: Record<string, unknown> | undefined): boolean =>
  metadata?.guest_shadow === true && !metadata?.account_activated_at;

const ResetPassword = () => {
  useThemeMode("night");
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [isActivation, setIsActivation] = useState(false);
  const navigate = useNavigate();

  // ── Validate session on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const resolve = (valid: boolean) => {
      if (cancelled) return;
      setIsValidToken(valid);
      if (!valid) {
        toast.error("Ce lien a expiré ou n'est plus valide. Demande-en un nouveau.");
        setTimeout(() => navigate("/auth"), 3000);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setIsActivation(isFirstActivation(data.session.user.user_metadata));
      resolve(!!data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (!cancelled && session) setIsActivation(isFirstActivation(session.user.user_metadata));
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

  const passwordLongEnough = newPassword.length >= PASSWORD_MIN_LENGTH;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Inline validation
    const problem = passwordError(newPassword);
    if (problem) {
      setSubmitError(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setLoading(true);
    try {
      // Sanity check: confirm we still have a session before calling updateUser
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        console.error("[reset-password] no active session at submit time");
        setSubmitError("Ta session a expiré. Demande un nouveau lien depuis « Mot de passe oublié ».");
        setTimeout(() => navigate("/auth"), 3000);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        // Marks the automatically created account as activated by its owner.
        ...(isActivation ? { data: { account_activated_at: new Date().toISOString() } } : {}),
      });
      if (error) {
        console.error("[reset-password] updateUser error:", error);
        throw error;
      }

      toast.success(isActivation ? "Compte activé !" : "Mot de passe mis à jour !");
      setSuccess(true);
    } catch (error) {
      console.error("[reset-password] caught error:", error);
      setSubmitError(authErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // ── Verifying session ────────────────────────────────────────────────────
  if (isValidToken === null) {
    return (
      <div className="theme-night min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Invalid / expired ────────────────────────────────────────────────────
  if (isValidToken === false) {
    return (
      <div className="theme-night min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute top-4 left-4">
          <BackButton />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-destructive">
              Lien non valide
            </CardTitle>
            <CardDescription className="text-center">
              Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau depuis « Mot de passe oublié ».
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/auth")}>Retour à la connexion</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="theme-night min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-center text-green-700">
              {isActivation ? "Compte activé" : "Mot de passe mis à jour"}
            </CardTitle>
            <CardDescription className="text-center">
              {isActivation ? "Ton compte est prêt, tes billets t'attendent." : "Ton nouveau mot de passe est actif."}{" "}
              Redirection vers ton profil dans{" "}
              <span className="font-bold text-foreground">{redirectCountdown}</span>…
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button onClick={() => navigate("/profile", { replace: true })}>
              Aller sur mon profil
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Reset form ───────────────────────────────────────────────────────────
  return (
    <div className="theme-night min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <BackButton />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {isActivation ? "Active ton compte" : "Nouveau mot de passe"}
          </CardTitle>
          <CardDescription className="text-center">
            {isActivation
              ? "Choisis ton mot de passe pour activer ton compte et retrouver tes billets."
              : "Choisis ton nouveau mot de passe."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">
                <Lock className="w-4 h-4 inline mr-2" />
                Mot de passe
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
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className={`flex items-center gap-1.5 text-xs ${passwordLongEnough ? "text-green-600" : "text-muted-foreground"}`}>
                {passwordLongEnough ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                <span>{PASSWORD_RULE_TEXT}</span>
              </p>
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                <Lock className="w-4 h-4 inline mr-2" />
                Confirme le mot de passe
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
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
                <p className="text-xs text-red-500">Les deux mots de passe ne sont pas identiques.</p>
              )}
              {confirmPassword && confirmPassword === newPassword && passwordLongEnough && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Identiques
                </p>
              )}
            </div>

            {submitError && (
              <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Enregistrement…" : isActivation ? "Activer mon compte" : "Enregistrer le mot de passe"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="text-sm text-primary hover:underline"
              >
                Retour à la connexion
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
