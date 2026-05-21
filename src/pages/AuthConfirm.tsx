import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

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
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ok" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const token_hash = params.get("token_hash");
    const type = normalizeType(params.get("type"));
    const next = safeNext(params.get("next"));

    if (!token_hash || !type) {
      setStatus("error");
      setErrorMsg("Missing or invalid confirmation link.");
      return;
    }

    let cancelled = false;
    supabase.auth
      .verifyOtp({ token_hash, type })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[auth/confirm] verifyOtp failed:", error.message);
          setStatus("error");
          setErrorMsg(
            error.message.includes("expired")
              ? "This link has expired. Please request a new one."
              : "This link is invalid or has already been used.",
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
        setErrorMsg("Something went wrong. Please request a new link.");
      });

    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {status === "verifying" && (
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Verifying your link…</p>
          </CardContent>
        )}

        {status === "ok" && (
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">Verified. Redirecting…</p>
          </CardContent>
        )}

        {status === "error" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">
                Link not valid
              </CardTitle>
              <CardDescription>{errorMsg}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-8">
              <Button onClick={() => navigate("/auth")}>Back to sign in</Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
};

export default AuthConfirm;
