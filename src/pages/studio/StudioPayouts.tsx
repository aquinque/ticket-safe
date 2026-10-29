import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Download, CheckCircle2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { StatFigure } from "@/components/studio/StatFigure";
import { eur, fmtDate, plural } from "@/lib/studioFormat";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { generatePayoutReceiptPDF } from "@/lib/payoutReceiptPdf";
import { STUDIO_FEE_RULE } from "@/lib/studioFee";

interface Earnings {
  net_earned_cents: number;
  gross_cents: number;
  platform_fee_cents: number;
  paid_orders: number;
  claimed_cents: number;
  available_cents: number;
  releasable_cents: number;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  gross_cents: number | null;
  fee_cents: number | null;
  status: "requested" | "processing" | "sent" | "failed" | "cancelled";
  iban_used: string;
  iban_holder_used: string;
  requested_at: string;
  sent_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  requested: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

const StudioPayouts = () => {
  useThemeMode("studio");
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [stripeActive, setStripeActive] = useState<boolean | null>(null);
  const [history, setHistory] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoading(true);
    const [{ data: earn }, { data: org }, { data: hist }, { data: stripeAcct }] = await Promise.all([
      supabase
        .from("organizer_earnings")
        .select("net_earned_cents, gross_cents, platform_fee_cents, paid_orders, claimed_cents, available_cents, releasable_cents")
        .eq("organizer_id", organizer.id)
        .maybeSingle(),
      supabase.from("organizer_profiles").select("payout_iban, payout_iban_holder").eq("id", organizer.id).maybeSingle(),
      supabase
        .from("organizer_payouts")
        .select("id, amount_cents, gross_cents, fee_cents, status, iban_used, iban_holder_used, requested_at, sent_at")
        .eq("organizer_id", organizer.id)
        .order("requested_at", { ascending: false })
        .limit(50),
      supabase.from("stripe_connect_accounts").select("charges_enabled, payouts_enabled").eq("organizer_id", organizer.id).maybeSingle(),
    ]);
    setEarnings((earn as unknown as Earnings | null) ?? null);
    setStripeActive(stripeAcct ? !!stripeAcct.charges_enabled && !!stripeAcct.payouts_enabled : false);
    if (org?.payout_iban) setIban((org.payout_iban as string).replace(/\s+/g, "").toUpperCase());
    if (org?.payout_iban_holder) setHolder(org.payout_iban_holder as string);
    setHistory((hist as PayoutRow[]) ?? []);
    setLoading(false);
  }, [organizer]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (earnings) setAmount(((earnings.available_cents || 0) / 100).toFixed(2));
  }, [earnings]);

  const available = earnings?.available_cents ?? 0;
  const cleanedIban = iban.replace(/\s+/g, "").toUpperCase();
  const ibanValid = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleanedIban);
  const cents = Math.round(parseFloat(amount.replace(",", ".") || "0") * 100);
  const amountValid = Number.isFinite(cents) && cents >= 100 && cents <= available;
  const canSubmit = ibanValid && holder.trim().length >= 2 && amountValid && !submitting;

  const submit = async () => {
    if (!canSubmit || !organizer) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("request-payout", {
      body: { organizer_id: organizer.id, amount_cents: cents, iban: cleanedIban, iban_holder: holder.trim() },
    });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not request the payout.");
      return;
    }
    toast.success("Payout requested. The transfer usually arrives within 2 to 3 business days.");
    load();
  };

  const downloadReceipt = async (p: PayoutRow) => {
    if (!organizer) return;
    setDownloadingId(p.id);
    try {
      const grossCents = p.gross_cents ?? p.amount_cents;
      const feeCents = p.fee_cents ?? Math.max(grossCents - p.amount_cents, 0);
      const feePercent = grossCents > 0 ? Math.round((feeCents / grossCents) * 100) : 0;
      await generatePayoutReceiptPDF({
        kind: "studio",
        payoutId: p.id,
        organizationName: organizer.name,
        beneficiaryName: p.iban_holder_used,
        iban: p.iban_used,
        grossCents,
        feeCents,
        feePercent,
        netCents: p.amount_cents,
        sentAt: p.sent_at,
        requestedAt: p.requested_at,
        status: p.status,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!user || orgLoading) {
    return (
      <StudioLayout active="payouts" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout active="payouts" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Payouts · Studio" description="Your earnings, withdrawals, and payout history." />
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Payouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Events sold through Stripe pay out on their own as soon as the event ends, and you can cash out any time from the Payments page. This page is for balances from earlier events, sent by bank transfer.
          </p>
        </div>

        {stripeActive != null && (
          <Link
            to="/studio/payments"
            className="group flex items-center gap-3 bg-card border border-border px-4 py-3 mb-4 hover:border-primary/40 transition-colors"
          >
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm flex-1 min-w-0">
              {stripeActive
                ? "Your Stripe account is active. Balance, cash out and payout history are on the Payments page."
                : "Set up payments with Stripe so new events pay out automatically."}
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>
        )}

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse" />)}</div>
        ) : (
          <>
            <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-label="Balance">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <StatFigure label="Ready to withdraw" value={available} money decimals={2} size="lg" tone={available > 0 ? "good" : "muted"} hint={available > 0 ? "from earlier events" : "nothing waiting"} />
                <StatFigure label="On its way" value={earnings?.claimed_cents ?? 0} money decimals={2} hint="transfer sent, 2 to 3 business days" />
                <StatFigure label="Earned, all time" value={earnings?.net_earned_cents ?? 0} money decimals={2} hint={plural(earnings?.paid_orders ?? 0, "paid order")} />
              </div>
            </section>

            {available > 0 && (
              <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-labelledby="request-heading">
                <h2 id="request-heading" className="text-sm font-bold mb-1">Withdraw to your bank</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  You receive the full ticket price; the buyer pays the service fee ({STUDIO_FEE_RULE}) at checkout. The transfer usually arrives within 2 to 3 business days.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">Account holder</label>
                    <input
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      className="w-full h-11 px-3 border border-border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Name on the bank account"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">Amount (EUR)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        step="0.01"
                        min="1"
                        max={(available / 100).toFixed(2)}
                        className="flex-1 h-11 px-3 border border-border bg-background text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setAmount(((available || 0) / 100).toFixed(2))}
                        className="h-11 px-3 border border-border text-xs font-bold hover:bg-muted"
                      >
                        All
                      </button>
                    </div>
                    {!amountValid && (
                      <p className="text-xs text-amber-700 mt-1">Between €1.00 and {eur(available, 2)}.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">IBAN</label>
                    <input
                      value={iban}
                      onChange={(e) => setIban(e.target.value.toUpperCase())}
                      className="w-full h-11 px-3 border border-border bg-background text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="FR76 3000 4000 0312 3456 7890 143"
                      maxLength={40}
                    />
                    {iban && !ibanValid && (
                      <p className="text-xs text-amber-700 mt-1">That doesn't look like an IBAN. Check the digits.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <button
                      onClick={submit}
                      disabled={!canSubmit}
                      className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Withdraw {eur(cents || 0, 2)}</>}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {earnings && earnings.claimed_cents > 0 && available === 0 && (
              <div className="mb-4 bg-card border border-border px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  {eur(earnings.claimed_cents, 2)} is on its way to your bank. Allow 2 to 3 business days.
                </div>
              </div>
            )}

            {/* History */}
            <section className="bg-card border border-border" aria-labelledby="history-heading">
              <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-border">
                <h2 id="history-heading" className="text-sm font-bold">History</h2>
                <span className="text-[11px] text-muted-foreground">{plural(history.length, "payout")}</span>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No bank transfers yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold tabular-nums">{eur(p.amount_cents, 2)} <span className="font-normal text-muted-foreground">to {p.iban_used.slice(0, 4)} ··· {p.iban_used.slice(-4)}</span></div>
                        <div className="text-[11px] text-muted-foreground">
                          Requested {fmtDate(p.requested_at)}{p.sent_at ? ` · sent ${fmtDate(p.sent_at)}` : ""}
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[p.status] ?? "bg-muted text-muted-foreground"}`}>
                        {p.status}
                      </span>
                      {p.status === "sent" && (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p)}
                          disabled={downloadingId === p.id}
                          title="Download the receipt (PDF)"
                          aria-label="Download the receipt"
                          className="w-9 h-9 border border-border text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center disabled:opacity-50"
                        >
                          {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </StudioLayout>
  );
};

export default StudioPayouts;
