import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, Clock, ExternalLink, User, Users, Building2, ArrowRight, RefreshCw } from "lucide-react";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Studio "Payments" — Stripe Connect (Express) onboarding + where the money is.
 *
 * The page is built around one object: the money track. Ticket money sits in
 * exactly three places (paid by buyers → the organizer's Stripe balance →
 * their bank), so the track shows those three places with the real amounts
 * and dates read from Stripe and from our orders. Before setup the same track
 * is empty, which is the invitation to set up.
 *
 * Stripe hosts the identity and bank-account pages. Before the first click
 * the organizer says who receives the money (individual by default: a student
 * needs no company); that choice and everything we already know about them go
 * to Stripe so the hosted form only asks for what is missing.
 *
 * Flow: button -> stripe-connect-onboard-organizer { action: "onboard" } ->
 * redirect to Stripe -> back here with ?stripe=return (read the state back
 * from Stripe) or ?stripe=refresh (the link expired: get a fresh one).
 */

type BusinessType = "individual" | "non_profit" | "company";
type Action = "onboard" | "refresh" | "dashboard" | "balance" | "reset";

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

interface Balance {
  available_cents: number;
  pending_cents: number;
  paid_out_cents: number;
  next_available_on: string | null;
  payout_delay_days: number;
}

interface Sales { tickets: number; revenue_cents: number }

interface PayoutJob {
  id: string;
  scheduled_for: string;
  status: "scheduled" | "sent" | "failed" | "blocked" | "cancelled";
  amount_cents: number | null;
  event_title: string;
}

interface NextEvent { title: string; ends: string }

// Only "individual" is activated by Stripe without a SIREN. The other two are
// for organizers who really have one; the page says so before Stripe does.
const BUSINESS_TYPES: { value: BusinessType; label: string; hint: string; needs: string; needsSiren: boolean; icon: typeof User }[] = [
  {
    value: "individual",
    label: "Me personally",
    hint: "Fastest. No SIREN, no paperwork. Paid to your own bank account.",
    needs: "Have ready: your date of birth, phone number and IBAN. Stripe may ask for a photo of your ID. Works for a BDE or club too: whoever signs up receives the money.",
    needsSiren: false,
    icon: User,
  },
  {
    value: "non_profit",
    label: "A registered association",
    hint: "Only if it has a SIREN number. Stripe will ask for it.",
    needs: "Have ready: the association's SIREN, its IBAN, your role in it, and your ID.",
    needsSiren: true,
    icon: Users,
  },
  {
    value: "company",
    label: "A company",
    hint: "Needs the company's SIREN. Paid to the company's bank account.",
    needs: "Have ready: the SIREN, the company IBAN, and the ID of a legal representative.",
    needsSiren: true,
    icon: Building2,
  },
];

const TYPE_LABEL: Record<BusinessType, string> = { individual: "Individual", non_profit: "Association", company: "Company" };

const eurFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const fmtEur = (cents: number) => eurFormat.format(cents / 100);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

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
    else if (/tax_id|registration_number/.test(c)) out.add("the SIREN number");
    else if (/relationship\.title/.test(c)) out.add("your role in the organisation");
    else if (/business_profile\.(url|product_description|mcc)/.test(c)) out.add("a short description of your activity");
    else if (/tos_acceptance/.test(c)) out.add("accepting Stripe's terms");
    else if (/^company\./.test(c)) out.add("details about the organisation");
    else if (/^(representative|owners|directors|executives|persons?)\b|^person_/.test(c)) out.add("details about the legal representative");
    else out.add(code.replace(/[._]/g, " "));
  }
  return [...out];
}

/** Animates a number from its previous value to the new one. Honours reduced motion. */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

interface Stage { label: string; cents: number | null; note: string; lit: boolean }

const StageAmount = ({ cents }: { cents: number }) => {
  const shown = useCountUp(cents);
  return <>{fmtEur(shown)}</>;
};

/**
 * The money track: three places money sits, joined by a rail that lights up
 * as far as the money has travelled. Horizontal on wide screens, vertical on
 * phones; same markup, the segments just change axis.
 */
const MoneyTrack = ({ stages, loading }: { stages: Stage[]; loading: boolean }) => (
  <ol className="grid gap-7 md:grid-cols-3 md:gap-6 pl-7 md:pl-0" aria-label="Where your money is">
    {stages.map((s, i) => {
      const next = stages[i + 1];
      return (
        <li key={s.label} className="relative md:pt-7">
          <span
            aria-hidden
            className={`absolute -left-7 top-1 md:left-0 md:top-0 h-[11px] w-[11px] rounded-full border-2 transition-colors duration-500 ${
              s.lit ? "bg-primary border-primary" : "bg-card border-border"
            }`}
          />
          {next && (
            <>
              {/* vertical segment (phone) */}
              <span aria-hidden className="md:hidden absolute -left-[23px] top-4 -bottom-8 w-px bg-border" />
              <span
                aria-hidden
                className={`md:hidden absolute -left-[23px] top-4 -bottom-8 w-px bg-primary origin-top motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out ${
                  next.lit ? "scale-y-100" : "scale-y-0"
                }`}
                style={{ transitionDelay: `${150 + i * 200}ms` }}
              />
              {/* horizontal segment (desktop) */}
              <span aria-hidden className="hidden md:block absolute top-[5px] left-4 -right-6 h-px bg-border" />
              <span
                aria-hidden
                className={`hidden md:block absolute top-[5px] left-4 -right-6 h-px bg-primary origin-left motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out ${
                  next.lit ? "scale-x-100" : "scale-x-0"
                }`}
                style={{ transitionDelay: `${150 + i * 200}ms` }}
              />
            </>
          )}
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{s.label}</div>
          <div className={`font-display text-2xl md:text-[28px] leading-tight font-bold tabular-nums mt-1 ${s.lit ? "text-foreground" : "text-muted-foreground/60"}`}>
            {loading ? <span className="inline-block h-7 w-24 bg-muted animate-pulse align-middle" /> : s.cents === null ? "—" : <StageAmount cents={s.cents} />}
          </div>
          <div className="text-xs text-muted-foreground mt-1 min-h-[1rem]">{loading ? "" : s.note}</div>
        </li>
      );
    })}
  </ol>
);

const PAYOUT_STATUS: Record<PayoutJob["status"], string> = {
  scheduled: "Scheduled",
  sent: "Sent to your bank",
  failed: "Failed",
  blocked: "On hold",
  cancelled: "Cancelled",
};

const StudioPayments = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [account, setAccount] = useState<ConnectAccountRow | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceState, setBalanceState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [sales, setSales] = useState<Sales | null>(null);
  const [payouts, setPayouts] = useState<PayoutJob[]>([]);
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);

  // Default choice: individual, for everyone. It is the only type Stripe activates without a SIREN.
  const chosenType: BusinessType = businessType ?? account?.business_type ?? "individual";

  const callFn = useCallback(async <T,>(action: Action, extra?: Record<string, unknown>): Promise<T | null> => {
    if (!organizer) return null;
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error: fnError } = await supabase.functions.invoke("stripe-connect-onboard-organizer", {
      body: { organizer_id: organizer.id, action, ...(extra ?? {}) },
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
    if (fnError || data?.error) throw new Error(data?.error ?? fnError?.message ?? "Something went wrong.");
    return data as T;
  }, [organizer]);

  const loadAccount = useCallback(async () => {
    if (!organizer) return null;
    setLoadingAccount(true);
    const { data } = await supabase
      .from("stripe_connect_accounts")
      .select("id, stripe_account_id, account_holder_name, business_type, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due, requirements_past_due")
      .eq("organizer_id", organizer.id)
      .maybeSingle();
    const row = (data as ConnectAccountRow | null) ?? null;
    setAccount(row);
    setLoadingAccount(false);
    return row;
  }, [organizer]);

  const loadMoney = useCallback(async (row: ConnectAccountRow | null) => {
    if (!organizer) return;
    // Sales and next event come from our tables; the balance comes from Stripe.
    const [ordersRes, nextRes] = await Promise.all([
      supabase
        .from("event_orders")
        .select("quantity, unit_price_cents, discount_cents")
        .eq("organizer_id", organizer.id)
        .eq("status", "paid")
        .like("stripe_checkout_session_id", "cs_%"),
      supabase
        .from("events")
        .select("title, date, ends_at")
        .eq("organizer_id", organizer.id)
        .eq("payment_provider", "stripe")
        .eq("status", "published")
        .gte("date", new Date().toISOString())
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const orders = (ordersRes.data ?? []) as { quantity: number; unit_price_cents: number; discount_cents: number | null }[];
    setSales({
      tickets: orders.reduce((n, o) => n + o.quantity, 0),
      revenue_cents: orders.reduce((n, o) => n + o.quantity * o.unit_price_cents - (o.discount_cents ?? 0), 0),
    });
    const ev = nextRes.data as { title: string; date: string; ends_at: string | null } | null;
    setNextEvent(ev ? { title: ev.title, ends: ev.ends_at ?? ev.date } : null);

    if (!row) { setBalanceState("idle"); setPayouts([]); return; }

    // stripe_connect_payout_jobs is newer than the generated database types, so it is queried untyped.
    const untyped = supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown }> };
          };
        };
      };
    };
    const { data: jobs } = await untyped
      .from("stripe_connect_payout_jobs")
      .select("id, scheduled_for, status, amount_cents, event_id")
      .eq("stripe_connect_account_id", row.id)
      .order("scheduled_for", { ascending: false })
      .limit(8);
    const jobRows = ((jobs as unknown[] | null) ?? []) as { id: string; scheduled_for: string; status: PayoutJob["status"]; amount_cents: number | null; event_id: string | null }[];
    const eventIds = [...new Set(jobRows.map((j) => j.event_id).filter(Boolean))] as string[];
    const titles = new Map<string, string>();
    if (eventIds.length > 0) {
      const { data: evs } = await supabase.from("events").select("id, title").in("id", eventIds);
      for (const e of (evs ?? []) as { id: string; title: string }[]) titles.set(e.id, e.title);
    }
    setPayouts(jobRows.map((j) => ({ id: j.id, scheduled_for: j.scheduled_for, status: j.status, amount_cents: j.amount_cents, event_title: (j.event_id && titles.get(j.event_id)) || "Resale" })));

    if (!row.details_submitted) { setBalanceState("idle"); return; }
    setBalanceState("loading");
    try {
      const b = await callFn<Balance>("balance");
      if (b) { setBalance(b); setBalanceState("ready"); } else setBalanceState("unavailable");
    } catch {
      setBalanceState("unavailable");
    }
  }, [organizer, callFn]);

  const refreshAll = useCallback(async () => {
    const row = await loadAccount();
    await loadMoney(row);
  }, [loadAccount, loadMoney]);

  const goToStripe = useCallback(async (action: "onboard" | "dashboard", type?: BusinessType) => {
    setError(null);
    setBusy(action);
    try {
      const result = await callFn<{ url?: string }>(action, type ? { business_type: type } : undefined);
      if (result?.url) window.location.href = result.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [callFn]);

  // For an account Stripe created as association/company and now wants a SIREN
  // for: delete it and start again as an individual, in one click.
  const startOverAsIndividual = useCallback(async () => {
    setError(null);
    setBusy("reset");
    try {
      await callFn("reset");
      setBusinessType("individual");
      setAccount(null);
      await goToStripe("onboard", "individual");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }, [callFn, goToStripe]);

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
      callFn("refresh").catch(() => null).then(() => refreshAll());
      return;
    }
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer, orgLoading, authLoading]);

  const active = !!account?.charges_enabled && !!account?.payouts_enabled;
  const dueCodes = useMemo(() => account?.requirements_currently_due ?? [], [account]);
  const hasDue = dueCodes.length > 0;
  const dueList = useMemo(() => describeRequirements(dueCodes), [dueCodes]);
  const chosen = BUSINESS_TYPES.find((t) => t.value === chosenType) ?? BUSINESS_TYPES[0];
  // Picked association/company without a SIREN on file: Stripe will stop them at the SIREN question.
  const sirenWarning = chosen.needsSiren && !organizer?.siren;
  // Stripe already created the account as association/company and is now waiting for a SIREN.
  const stuckOnSiren = !!account && !active && !account.details_submitted && dueCodes.some((c) => /tax_id|registration_number/.test(c));
  const delayDays = balance?.payout_delay_days ?? 2;
  const nextPayoutDay = nextEvent ? fmtDay(addDays(nextEvent.ends, delayDays)) : null;

  const stages: Stage[] = useMemo(() => {
    const inBalance = balance ? balance.pending_cents + balance.available_cents : null;
    const paidOut = balance ? balance.paid_out_cents : null;
    const sold = sales?.revenue_cents ?? 0;
    const balanceNote = !account
      ? "Arrives here the moment a ticket sells"
      : balanceState === "unavailable"
        ? "Couldn't reach Stripe. Try refresh."
        : balance && balance.pending_cents > 0 && balance.next_available_on
          ? `${fmtEur(balance.pending_cents)} available on ${fmtDay(balance.next_available_on)}`
          : balance && balance.available_cents > 0
            ? "Available, sent after your event"
            : "Nothing waiting";
    const bankNote = !account
      ? `Sent ${delayDays} days after each event ends`
      : nextPayoutDay
        ? `Next payout ${nextPayoutDay}, for ${nextEvent?.title}`
        : paidOut && paidOut > 0
          ? "Sent after each event"
          : "After your first event";
    return [
      { label: "Paid by buyers", cents: sold, note: sales && sales.tickets > 0 ? `${sales.tickets} ticket${sales.tickets > 1 ? "s" : ""} sold` : "No sales yet", lit: sold > 0 },
      { label: "In your Stripe balance", cents: account ? inBalance : 0, note: balanceNote, lit: (inBalance ?? 0) > 0 || (paidOut ?? 0) > 0 },
      { label: "In your bank", cents: account ? paidOut : 0, note: bankNote, lit: (paidOut ?? 0) > 0 },
    ];
  }, [account, balance, balanceState, sales, delayDays, nextPayoutDay, nextEvent]);

  if (authLoading || orgLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const statusLabel = !account ? "Not set up" : active ? "Active" : hasDue ? "Action needed" : account.details_submitted ? "Under review" : "Incomplete";
  const statusColor = !account ? "bg-muted text-muted-foreground" : active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
  const subline = !account
    ? "Get paid for your tickets. About 3 minutes to set up, no company or SIREN needed."
    : active
      ? "Where your ticket money is, and when it reaches your bank."
      : hasDue
        ? "Stripe needs a few more details before you can sell tickets."
        : account.details_submitted
          ? "Stripe is checking your details. Usually a few minutes."
          : "Your setup isn't finished yet.";
  const buttonLabel = !account ? "Set up payments" : hasDue || !account.details_submitted ? "Continue setup" : "Update my details";
  const moneyLoading = loadingAccount || (!!account && balanceState === "loading") || sales === null;

  return (
    <StudioLayout active="payments" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Payments — Ticket Studio" description="Set up and manage how you receive payments." />
      <div className="max-w-3xl">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="text-2xl font-bold">Payments</h1>
          {!loadingAccount && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold motion-safe:animate-fade-in ${statusColor}`}>
              {active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {statusLabel}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">{subline}</p>

        {/* The money track */}
        <section className="bg-card border border-border p-5 md:p-6 mb-4" aria-labelledby="money-track-heading">
          <div className="flex items-center justify-between mb-5">
            <h2 id="money-track-heading" className="text-sm font-bold">Your money, right now</h2>
            {account?.details_submitted && (
              <button
                type="button"
                onClick={() => refreshAll()}
                disabled={moneyLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60 min-h-[32px] px-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${moneyLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>
          <MoneyTrack stages={stages} loading={moneyLoading} />
          {!account && !loadingAccount && (
            <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border">
              Your first sale will show up here. Buyers pay the ticket price plus a service fee; you receive the full ticket price.
            </p>
          )}
        </section>

        {/* Setup, or account + payouts */}
        {loadingAccount ? null : !account ? (
          <section className="bg-card border border-border p-5 md:p-6 space-y-5">
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
                      className={`text-left border p-3 min-h-[44px] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? "border-primary bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]" : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 transition-colors ${selected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-bold">{t.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div key={chosen.value} className="bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground space-y-1 motion-safe:animate-fade-in">
              <p>{chosen.needs}</p>
              <p>Your name and email are already filled in. You can stop and come back any time.</p>
            </div>
            {sirenWarning && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 text-amber-800 text-xs motion-safe:animate-fade-in">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Stripe will ask for a SIREN number and won't activate the account without it, and the choice can't be changed afterwards.
                  No SIREN? Choose <button type="button" className="font-bold underline underline-offset-2" onClick={() => setBusinessType("individual")}>Me personally</button> instead.
                  It works for a BDE or club too: whoever signs up receives the money.
                </p>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={() => goToStripe("onboard", chosenType)}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 transition-colors"
            >
              {busy === "onboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {buttonLabel}
              {busy === "onboard" ? null : <ArrowRight className="w-4 h-4" />}
            </button>
          </section>
        ) : (
          <div className="grid gap-4 md:grid-cols-5">
            <section className="bg-card border border-border p-5 md:col-span-2 space-y-3" aria-labelledby="account-heading">
              <h2 id="account-heading" className="text-sm font-bold">Account</h2>
              <div className="text-sm">
                <p className="font-medium">{account.account_holder_name ?? organizer?.name}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {account.business_type ? TYPE_LABEL[account.business_type] : "Type pending"}
                  {active ? " · Verified by Stripe" : ""}
                </p>
              </div>
              {stuckOnSiren && (
                <div className="bg-amber-50 text-amber-800 px-3 py-2.5 text-xs space-y-2">
                  <p>
                    This account was created as {account.business_type === "company" ? "a company" : "an association"}, so Stripe wants its SIREN number before activating it.
                    If you don't have one, start over as an individual: it takes 3 minutes and needs no SIREN.
                  </p>
                  <button
                    type="button"
                    onClick={startOverAsIndividual}
                    disabled={busy !== null}
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[36px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 transition-colors"
                  >
                    {busy === "reset" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Start over as an individual
                  </button>
                </div>
              )}
              {!active && !stuckOnSiren && (
                <p className="text-amber-700 bg-amber-50 px-3 py-2 text-xs">
                  {hasDue
                    ? "Stripe still needs a few details before you can sell tickets. It takes a minute to finish."
                    : account.details_submitted
                      ? "Stripe is reviewing your details. Selling opens as soon as it's done, usually within a few minutes."
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
              {error && (
                <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {(!active || hasDue) && (
                  <button
                    onClick={() => goToStripe("onboard", chosenType)}
                    disabled={busy !== null}
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 transition-colors"
                  >
                    {busy === "onboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {buttonLabel}
                  </button>
                )}
                {account.details_submitted && (
                  <button
                    onClick={() => goToStripe("dashboard")}
                    disabled={busy !== null}
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] font-bold border border-border hover:bg-muted disabled:opacity-60 transition-colors"
                  >
                    {busy === "dashboard" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    Open Stripe
                  </button>
                )}
              </div>
            </section>

            <section className="bg-card border border-border p-5 md:col-span-3" aria-labelledby="payouts-heading">
              <div className="flex items-baseline justify-between mb-3">
                <h2 id="payouts-heading" className="text-sm font-bold">Payouts</h2>
                <span className="text-xs text-muted-foreground">Sent {delayDays} days after each event ends</span>
              </div>
              {payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {nextEvent && nextPayoutDay
                    ? `Your first payout will be created on ${nextPayoutDay}, two days after ${nextEvent.title}. It reaches your bank 1 to 3 business days later.`
                    : "Nothing yet. A payout is created automatically after each of your events ends, and reaches your bank 1 to 3 business days later."}
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {payouts.map((p, i) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 motion-safe:animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.event_title}</p>
                        <p className="text-xs text-muted-foreground">{fmtDay(p.scheduled_for)} · {PAYOUT_STATUS[p.status] ?? p.status}</p>
                      </div>
                      <span className="font-display font-bold tabular-nums shrink-0">{p.amount_cents != null ? fmtEur(p.amount_cents) : "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          Payments and payouts are handled by Stripe. Buyers pay by card, Apple Pay or Google Pay, plus a service fee. You receive the full ticket price.
        </p>
      </div>
    </StudioLayout>
  );
};

export default StudioPayments;
