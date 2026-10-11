import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CreditCard, CheckCircle2, AlertCircle, Clock, ExternalLink } from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Studio "Receive my payments" — Stripe Connect (Express) onboarding + status.
 *
 * Stripe hosts the identity, legal-representative and bank-account pages.
 * This page only starts (or resumes) that flow, shows where the account
 * stands, and links to the Stripe Express dashboard once it is set up.
 *
 * Flow: button -> stripe-connect-onboard-organizer { action: "onboard" } ->
 * redirect to Stripe -> back here with ?stripe=return (read the state back
 * from Stripe) or ?stripe=refresh (the link expired: get a fresh one).
 */

interface ConnectAccountRow {
  id: string;
  stripe_account_id: string;
  account_holder_name: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due: string[];
  requirements_past_due: string[];
}

type Action = "onboard" | "refresh" | "dashboard";

const StudioPayments = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [account, setAccount] = useState<ConnectAccountRow | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoadingAccount(true);
    const { data } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id, account_holder_name, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due, requirements_past_due")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    setAccount(data);
    setLoadingAccount(false);
  }, [organizer]);

  const callOnboarding = useCallback(async (action: Action): Promise<{ url?: string } | null> => {
    if (!organizer) return null;
    setError(null);
    setBusy(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-onboard-organizer", {
        body: { organizer_id: organizer.id, action },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnError || data?.error) throw new Error(data?.error ?? fnError?.message ?? "Something went wrong.");
      return data as { url?: string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
      return null;
    } finally {
      setBusy(null);
    }
  }, [organizer]);

  const goToStripe = useCallback(async (action: "onboard" | "dashboard") => {
    const result = await callOnboarding(action);
    if (result?.url) {
      window.location.href = result.url;
    }
  }, [callOnboarding]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio/payments");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || orgLoading) return;
    if (!organizer || organizer.status !== "approved") { navigate("/studio"); return; }

    const returned = params.get("stripe");
    if (returned === "refresh") {
      // The single-use onboarding link expired or was opened twice: send them straight back with a new one.
      setParams({}, { replace: true });
      goToStripe("onboard");
      return;
    }
    if (returned === "return") {
      setParams({}, { replace: true });
      callOnboarding("refresh").then(() => load());
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer, orgLoading, authLoading]);

  if (authLoading || orgLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const active = !!account?.charges_enabled && !!account?.payouts_enabled;
  const statusLabel = !account ? "Not set up" : active ? "Active" : account.details_submitted ? "Under review" : "Incomplete";
  const statusColor = !account ? "bg-muted text-muted-foreground" : active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
  const hasDue = (account?.requirements_currently_due.length ?? 0) > 0;

  return (
    <StudioLayout active="payments" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Payments — Ticket Studio" description="Set up and manage how you receive payments." />
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Receive my payments</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Powered by Stripe. Buyers pay by card, Apple Pay, or Google Pay. Buyers pay the ticket price plus a service fee; you receive the full ticket price on your account, and it is paid out to your bank after your event.
        </p>

        <div className="bg-card border border-border rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Payment account status</h2>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>
              {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {statusLabel}
            </span>
          </div>

          {loadingAccount ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : !account ? (
            <p className="text-sm text-muted-foreground">
              Setting up takes a few minutes. Stripe will ask for your organisation's details, a legal representative and the bank account for your payouts. You'll come back here when you're done.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              {account.account_holder_name && <p className="text-muted-foreground">{account.account_holder_name}</p>}
              {!account.charges_enabled && (
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                  {account.details_submitted
                    ? "Stripe is reviewing your details. You can't sell tickets until this is active; it usually takes a few minutes."
                    : "Your setup isn't finished. You can't sell tickets until it is."}
                </p>
              )}
              {hasDue && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-bold mb-1">Stripe still needs:</p>
                  <ul className="list-disc list-inside">
                    {account.requirements_currently_due.map((r) => <li key={r}>{r.replace(/[._]/g, " ")}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            {(!account || !active || hasDue) && (
              <button
                onClick={() => goToStripe("onboard")}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {busy === "onboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {!account ? "Set up payments" : account.details_submitted ? "Update my details" : "Continue setup"}
              </button>
            )}
            {account?.details_submitted && (
              <button
                onClick={() => goToStripe("dashboard")}
                disabled={busy !== null}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold border border-border hover:bg-muted disabled:opacity-60"
              >
                {busy === "dashboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Open my Stripe dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </StudioLayout>
  );
};

export default StudioPayments;
