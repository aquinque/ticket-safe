import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CreditCard, CheckCircle2, AlertCircle, Clock, ExternalLink, User, Users, Building2 } from "lucide-react";
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
 * Before the first click the organizer says who receives the money
 * (individual by default: a student needs no company). The type and
 * everything we already know about them is sent to Stripe so the hosted form
 * only asks for what is missing.
 *
 * Flow: button -> stripe-connect-onboard-organizer { action: "onboard" } ->
 * redirect to Stripe -> back here with ?stripe=return (read the state back
 * from Stripe) or ?stripe=refresh (the link expired: get a fresh one).
 */

interface ConnectAccountRow {
  id: string;
  stripe_account_id: string;
  account_holder_name: string | null;
  business_type: BusinessType | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due: string[];
  requirements_past_due: string[];
}

type Action = "onboard" | "refresh" | "dashboard";
type BusinessType = "individual" | "non_profit" | "company";

const BUSINESS_TYPES: { value: BusinessType; label: string; hint: string; needs: string; icon: typeof User }[] = [
  {
    value: "individual",
    label: "Me, as an individual",
    hint: "No company needed. The money goes to your own bank account.",
    needs: "Have ready: your date of birth, phone number and IBAN. Stripe may ask for a photo of your ID.",
    icon: User,
  },
  {
    value: "non_profit",
    label: "A student association",
    hint: "BDE, club or any non-profit with its own bank account.",
    needs: "Have ready: the association's SIREN or RNA number, the IBAN, and the ID of the person signing up.",
    icon: Users,
  },
  {
    value: "company",
    label: "A company",
    hint: "The money goes to the company's bank account.",
    needs: "Have ready: the SIREN, the company IBAN, and the ID of a legal representative.",
    icon: Building2,
  },
];

/** Turns Stripe's requirement codes ("individual.dob.day") into a short human list. */
function describeRequirements(codes: string[]): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    const c = code.toLowerCase();
    if (/\.dob\./.test(c)) out.add("your date of birth");
    else if (/first_name|last_name/.test(c)) out.add("your full name");
    else if (/\.phone$/.test(c)) out.add("your phone number");
    else if (/\.email$/.test(c)) out.add("your email address");
    else if (/\.address\./.test(c)) out.add("your postal address");
    else if (/id_number|verification\.document|verification\.additional_document/.test(c)) out.add("a photo of your ID");
    else if (/external_account/.test(c)) out.add("your bank account (IBAN)");
    else if (/tax_id|registration_number/.test(c)) out.add("the SIREN or registration number");
    else if (/business_profile\.(url|product_description|mcc)/.test(c)) out.add("a short description of your activity");
    else if (/tos_acceptance/.test(c)) out.add("accepting Stripe's terms");
    else if (/^company\./.test(c)) out.add("details about the organisation");
    else if (/^(representative|owners|directors|executives|persons?)\b|^person_/.test(c)) out.add("details about the legal representative");
    else out.add(code.replace(/[._]/g, " "));
  }
  return [...out];
}

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
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);

  // Default choice: a student society is an association, anyone else an individual.
  const defaultType: BusinessType = organizer?.org_type === "student-society" ? "non_profit" : "individual";
  const chosenType: BusinessType = businessType ?? account?.business_type ?? defaultType;

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoadingAccount(true);
    const { data } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id, account_holder_name, business_type, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due, requirements_past_due")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    setAccount(data as ConnectAccountRow | null);
    setLoadingAccount(false);
  }, [organizer]);

  const callOnboarding = useCallback(async (action: Action, type?: BusinessType): Promise<{ url?: string } | null> => {
    if (!organizer) return null;
    setError(null);
    setBusy(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-onboard-organizer", {
        body: { organizer_id: organizer.id, action, ...(type ? { business_type: type } : {}) },
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

  const goToStripe = useCallback(async (action: "onboard" | "dashboard", type?: BusinessType) => {
    const result = await callOnboarding(action, type);
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

  const active = !!account?.charges_enabled && !!account?.payouts_enabled;
  const dueCodes = account?.requirements_currently_due ?? [];
  const hasDue = dueCodes.length > 0;
  const dueList = useMemo(() => describeRequirements(dueCodes), [dueCodes]);
  const chosen = BUSINESS_TYPES.find((t) => t.value === chosenType) ?? BUSINESS_TYPES[0];

  if (authLoading || orgLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const statusLabel = !account ? "Not set up" : active ? "Active" : hasDue ? "Action needed" : account.details_submitted ? "Under review" : "Incomplete";
  const statusColor = !account ? "bg-muted text-muted-foreground" : active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
  const buttonLabel = !account ? "Set up payments" : hasDue || !account.details_submitted ? "Continue setup" : "Update my details";

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
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold mb-2">Who receives the money?</p>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Who receives the money">
                  {BUSINESS_TYPES.map((t) => {
                    const selected = t.value === chosenType;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setBusinessType(t.value)}
                        className={`text-left rounded-xl border p-3 min-h-[44px] transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="text-sm font-bold">{t.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>{chosen.needs}</p>
                <p>Your name and email are already filled in. It takes about 3 minutes, and you can come back to finish later.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {account.account_holder_name && <p className="text-muted-foreground">{account.account_holder_name}</p>}
              {!active && (
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                  {hasDue
                    ? "Stripe still needs a few details before you can sell tickets. It takes a minute to finish."
                    : account.details_submitted
                      ? "Stripe is reviewing your details. You can't sell tickets until this is active; it usually takes a few minutes."
                      : "Your setup isn't finished. You can't sell tickets until it is."}
                </p>
              )}
              {hasDue && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-bold mb-1">Still missing:</p>
                  <ul className="list-disc list-inside">
                    {dueList.map((r) => <li key={r}>{r}</li>)}
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
                onClick={() => goToStripe("onboard", chosenType)}
                disabled={busy !== null || loadingAccount}
                className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {busy === "onboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {buttonLabel}
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
