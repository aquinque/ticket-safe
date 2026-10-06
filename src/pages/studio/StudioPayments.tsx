import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Building2,
  Calendar,
  MapPin,
  Landmark,
} from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Studio "Receive my payments" — Stripe Connect onboarding + status.
 *
 * New, separate page rather than folding into StudioProfile: the Connect
 * account is a distinct, higher-stakes concern (real KYC + IBAN) from the
 * organization profile fields, and keeping them apart means a bug in one
 * form can never touch the other's save path.
 *
 * No Stripe-hosted screens — every field is collected here and sent to
 * stripe-connect-onboard-organizer, which creates/updates the Connect
 * Custom account via the API.
 */

type BusinessType = "individual" | "company" | "non_profit";

interface ConnectAccountRow {
  id: string;
  stripe_account_id: string;
  business_type: BusinessType | null;
  account_holder_name: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due: string[];
  requirements_past_due: string[];
}

const Field = ({ label, icon: Icon, children }: { label: string; icon?: typeof User; children: React.ReactNode }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-1.5">
      {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
      {label}
    </label>
    {children}
  </div>
);

const StudioPayments = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [account, setAccount] = useState<ConnectAccountRow | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessType, setBusinessType] = useState<BusinessType>("non_profit");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [repFirstName, setRepFirstName] = useState("");
  const [repLastName, setRepLastName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("FR");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoadingAccount(true);
    const { data } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id, business_type, account_holder_name, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due, requirements_past_due")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    setAccount(data as ConnectAccountRow | null);
    setLoadingAccount(false);
  }, [organizer]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/studio/payments");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && !orgLoading) {
      if (!organizer || organizer.status !== "approved") { navigate("/studio"); return; }
      setEmail(organizer.contact_email ?? "");
      load();
    }
  }, [organizer, orgLoading, authLoading, navigate, load]);

  const validate = (): string | null => {
    if (!tosAccepted) return "You must accept the Stripe Connected Account Agreement.";
    if (!email || !/\S+@\S+\.\S+/.test(email)) return "A valid email is required.";
    if (!addressLine1 || !addressCity || !addressPostalCode) return "Full address is required.";
    const cleanedIban = iban.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleanedIban)) return "Invalid IBAN format.";
    if (businessType === "individual") {
      if (!firstName || !lastName) return "First and last name are required.";
      if (!dobDay || !dobMonth || !dobYear) return "Date of birth is required.";
    } else {
      if (!companyName) return "Organization name is required.";
      if (!registrationNumber) return "SIREN or RNA number is required.";
      if (!repFirstName || !repLastName) return "Legal representative's name is required.";
      if (!dobDay || !dobMonth || !dobYear) return "Legal representative's date of birth is required.";
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    if (!organizer) return;
    setSaving(true);
    try {
      const dob = { day: parseInt(dobDay, 10), month: parseInt(dobMonth, 10), year: parseInt(dobYear, 10) };
      const kyc = businessType === "individual"
        ? { businessType: "individual" as const, firstName, lastName, dob, addressLine1, addressCity, addressPostalCode, addressCountry, email, iban }
        : {
            businessType,
            companyName,
            registrationNumber,
            addressLine1, addressCity, addressPostalCode, addressCountry,
            repFirstName, repLastName, repDob: dob,
            repAddressLine1: addressLine1, repAddressCity: addressCity, repAddressPostalCode: addressPostalCode, repAddressCountry: addressCountry,
            email, iban,
          };

      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-onboard-organizer", {
        body: { organizer_id: organizer.id, kyc, tos_accepted: true },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (fnError || data?.error) throw new Error(data?.error ?? fnError?.message ?? "Could not submit.");
      toast.success("Payment details submitted.");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || orgLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const statusLabel = !account ? "Not set up" : account.charges_enabled && account.payouts_enabled ? "Active" : account.details_submitted ? "Under review" : "Pending";
  const statusColor = !account ? "bg-muted text-muted-foreground" : account.charges_enabled && account.payouts_enabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";

  return (
    <StudioLayout>
      <SEOHead title="Payments — Ticket Studio" description="Set up and manage how you receive payments." />
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Receive my payments</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Powered by Stripe. Buyers pay by card, Apple Pay, or Google Pay. Buyers pay the ticket price plus a service fee; you receive the full ticket price on your account, and it is paid out to your bank on the schedule below.
        </p>

        <div className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Payment account status</h2>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>
              {account?.charges_enabled && account?.payouts_enabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {statusLabel}
            </span>
          </div>

          {loadingAccount ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : account ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{account.account_holder_name}</p>
              {!account.charges_enabled && (
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                  You can't publish or sell tickets until this is active. This usually takes a few minutes.
                </p>
              )}
              {account.requirements_currently_due.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-bold mb-1">Stripe needs a bit more information:</p>
                  <ul className="list-disc list-inside">
                    {account.requirements_currently_due.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Fill in the form below to start accepting payments.</p>
          )}
        </div>

        {(!account || !account.charges_enabled) && (
          <div className="bg-card border border-border rounded-2xl p-5 md:p-6 space-y-4">
            <h2 className="text-lg font-bold mb-1">Your details</h2>

            <Field label="Account type" icon={Building2}>
              <select value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)} className="ts-edit">
                <option value="non_profit">Association / BDE</option>
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
            </Field>

            {businessType === "individual" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="First name" icon={User}><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="ts-edit" /></Field>
                <Field label="Last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="ts-edit" /></Field>
              </div>
            ) : (
              <>
                <Field label={businessType === "non_profit" ? "Association name" : "Company name"} icon={Building2}>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="ts-edit" />
                </Field>
                <Field label={businessType === "non_profit" ? "RNA number (or SIREN)" : "SIREN"}>
                  <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className="ts-edit" placeholder="W123456789 or 123456789" />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Legal representative — first name" icon={User}><input value={repFirstName} onChange={(e) => setRepFirstName(e.target.value)} className="ts-edit" /></Field>
                  <Field label="Legal representative — last name"><input value={repLastName} onChange={(e) => setRepLastName(e.target.value)} className="ts-edit" /></Field>
                </div>
              </>
            )}

            <Field label={businessType === "individual" ? "Date of birth" : "Legal representative's date of birth"} icon={Calendar}>
              <div className="grid grid-cols-3 gap-2">
                <input value={dobDay} onChange={(e) => setDobDay(e.target.value)} placeholder="DD" maxLength={2} className="ts-edit" />
                <input value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} placeholder="MM" maxLength={2} className="ts-edit" />
                <input value={dobYear} onChange={(e) => setDobYear(e.target.value)} placeholder="YYYY" maxLength={4} className="ts-edit" />
              </div>
            </Field>

            <Field label="Address" icon={MapPin}>
              <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className="ts-edit mb-2" placeholder="Street address" />
              <div className="grid grid-cols-2 gap-2">
                <input value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} className="ts-edit" placeholder="Postal code" />
                <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} className="ts-edit" placeholder="City" />
              </div>
            </Field>

            <Field label="Contact email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ts-edit" /></Field>

            <Field label="IBAN — where your money is paid out" icon={Landmark}>
              <input value={iban} onChange={(e) => setIban(e.target.value)} className="ts-edit font-mono" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
            </Field>

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} className="mt-0.5" />
              <span>
                I accept the{" "}
                <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noreferrer" className="text-primary underline">Stripe Connected Account Agreement</a>.
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {account ? "Update details" : "Start receiving payments"}
            </button>

            <style>{`
              .ts-edit { width: 100%; padding: 12px 14px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--background)); font-size: 16px; line-height: 1.4; color: hsl(var(--foreground)); transition: border-color .15s, box-shadow .15s; }
              .ts-edit:focus { outline: none; border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }
            `}</style>
          </div>
        )}
      </div>
    </StudioLayout>
  );
};

export default StudioPayments;
