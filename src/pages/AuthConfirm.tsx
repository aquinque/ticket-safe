import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThemeMode } from "@/hooks/useThemeMode";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";
import { authRedirect } from "@/lib/siteUrl";
import { authErrorMessage, isResendTooSoon, isValidEmail } from "@/lib/authRules";

/**
 * /auth/confirm
 *
 * Landing page for email-link verification (signup, recovery, magic link,
 * email change, invite, reauthentication). Reads `token_hash` + `type` from
 * the URL, calls supabase.auth.verifyOtp, then forwards to `next`.
 *
 * Works cross-browser/cross-device because verifyOtp does not require the
 * PKCE code_verifier — the token_hash alone authenticates the request.
 */

type OtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email"
  | "email_change";

function normalizeType(raw: string | null): OtpType | null {
  if (!raw) return null;
  switch (raw) {
    case "signup":
    case "invite":
    case "magiclink":
    case "recovery":
    case "email":
    case "email_change":
      return raw;
    case "email_change_current":
    case "email_change_new":
      return "email_change";
    default:
      return null;
  }
}

const safeNext = (raw: string | null): string => {
  if (!raw) return "/profile";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/profile";
  return raw;
};

const AuthConfirm = () => {
  useThemeMode("night");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ok" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [linkType, setLinkType] = useState<OtpType | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const token_hash = params.get("token_hash");
    const type = normalizeType(params.get("type"));
    const next = safeNext(params.get("next"));
    setLinkType(type);

    if (!token_hash || !type) {
      setStatus("error");
      setErrorMsg("Ce lien est incomplet. Ouvre-le directement depuis l'email, ou demande-en un nouveau.");
      return;
    }

    let cancelled = false;
    supabase.auth
      .verifyOtp({ token_hash, type })
      .then(async ({ error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[auth/confirm] verifyOtp failed:", error.message);
          // A link works once. If it was already used in this browser (double
          // tap, second tab), the person is signed in: carry on instead of
          // showing an error.
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          if (data.session) {
            setStatus("ok");
            navigate(next, { replace: true });
            return;
          }
          setStatus("error");
          setErrorMsg(
            type === "signup"
              ? "Ce lien a expiré ou a déjà été utilisé. Si ton compte est déjà activé, connecte-toi. Sinon, demande un nouveau lien."
              : "Ce lien a expiré ou a déjà été utilisé. Demande-en un nouveau ci-dessous.",
          );
          return;
        }
        setStatus("ok");
        navigate(next, { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[auth/confirm] unexpected:", err);
        setStatus("error");
        setErrorMsg("Un problème est survenu. Demande un nouveau lien ci-dessous.");
      });

    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  // Tick the cooldown label every second while it's counting down.
  useEffect(() => {
    if (resendCooldownUntil === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldownUntil]);

  const canResendByEmail = linkType === "signup" || linkType === "recovery";

  const handleResend = async () => {
    const email = resendEmail.trim();
    if (!isValidEmail(email)) {
      toast.error("Saisis une adresse email valide.");
      return;
    }
    if (resendCooldownUntil && Date.now() < resendCooldownUntil) return;
    setResending(true);
    try {
      if (linkType === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authRedirect("/reset-password"),
        });
        if (error) throw error;
      } else {
        // Same destination as the first confirmation email. The email link is
        // built from this path, so it must be the page to land on once signed in.
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: authRedirect("/profile") },
        });
        if (error) throw error;
      }
      setResendCooldownUntil(Date.now() + 60_000);
      toast.success("Nouveau lien envoyé. Regarde ta boîte mail et tes spams.");
    } catch (err) {
      console.error("[auth/confirm] resend failed:", err);
      if (isResendTooSoon(err)) setResendCooldownUntil(Date.now() + 60_000);
      toast.error(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="theme-night min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {status === "verifying" && (
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          </CardContent>
        )}

        {status === "ok" && (
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">C'est bon. Redirection…</p>
          </CardContent>
        )}

        {status === "error" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">
                Lien non valide
              </CardTitle>
              <CardDescription>{errorMsg}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pb-8">
              {canResendByEmail && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      type="email"
                      placeholder="toi@exemple.com"
                      aria-label="Adresse email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleResend()}
                    />
                  </div>
                  <Button
                    onClick={handleResend}
                    variant="outline"
                    className="w-full"
                    disabled={resending || (resendCooldownUntil !== null && Date.now() < resendCooldownUntil)}
                  >
                    {resending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {resendCooldownUntil !== null && Date.now() < resendCooldownUntil
                      ? `Renvoyer dans ${Math.max(1, Math.ceil((resendCooldownUntil - Date.now()) / 1000))}s`
                      : "Recevoir un nouveau lien"}
                  </Button>
                </div>
              )}
              <Button onClick={() => navigate("/auth")} variant={canResendByEmail ? "ghost" : "default"} className="w-full">
                Me connecter
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
};

export default AuthConfirm;
