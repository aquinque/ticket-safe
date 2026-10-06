import { useCallback, useEffect, useState } from "react";
import { Banknote, Clock, TrendingUp, ArrowRight, Loader2, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { generatePayoutReceiptPDF } from "@/lib/payoutReceiptPdf";

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
    const [{ data: earn }, { data: org }, { data: hist }] = await Promise.all([
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
    ]);
    setEarnings((earn as Earnings) ?? null);
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
    toast.success("Payout requested. We'll send the SEPA transfer within 2-3 business days.");
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
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Payouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your earnings, withdrawals, and payout history — SEPA transfer, no KYC, no Stripe account.
          </p>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Balance summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-emerald-700 mb-1.5">
                  <Banknote className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Available</span>
                </div>
                <div className="text-3xl font-black tabular-nums text-emerald-900">€{(available / 100).toFixed(2)}</div>
                <div className="text-xs text-emerald-800/80 mt-0.5">ready to withdraw</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">In progress</span>
                </div>
                <div className="text-3xl font-black tabular-nums">€{((earnings?.claimed_cents ?? 0) / 100).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">being wired</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Total earned</span>
                </div>
                <div className="text-3xl font-black tabular-nums">€{((earnings?.net_earned_cents ?? 0) / 100).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{earnings?.paid_orders ?? 0} paid orders</div>
              </div>
            </div>

            {/* Request payout */}
            <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
              <h2 className="text-lg font-bold mb-1">Request a payout</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Buyers pay a <strong className="text-foreground">service fee</strong> per ticket at checkout (4% + €0.80, between €0.70 and €3.50).
                Ticket Safe takes <strong className="text-foreground">0%</strong> from you — the full ticket price is wired to your IBAN within 2-3 business days.
              </p>

              {available <= 0 ? (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Nothing to withdraw yet. Funds become available as your events sell tickets.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">IBAN holder name</label>
                    <input
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      placeholder="BDE ESCP Paris · Asso loi 1901"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">Amount to withdraw (EUR)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        step="0.01"
                        min="1"
                        max={(available / 100).toFixed(2)}
                        className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setAmount(((available || 0) / 100).toFixed(2))}
                        className="px-3 py-2.5 rounded-lg border border-border text-xs font-bold hover:bg-muted"
                      >
                        Max
                      </button>
                    </div>
                    {!amountValid && (
                      <p className="text-xs text-amber-700 mt-1">Amount must be between €1.00 and €{(available / 100).toFixed(2)}.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-muted-foreground mb-1 block">IBAN</label>
                    <input
                      value={iban}
                      onChange={(e) => setIban(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono"
                      placeholder="FR76 3000 4000 0312 3456 7890 143"
                      maxLength={40}
                    />
                    {iban && !ibanValid && (
                      <p className="text-xs text-amber-700 mt-1">IBAN format looks off — double-check the digits.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <button
                      onClick={submit}
                      disabled={!canSubmit}
                      className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Request €{((cents || 0) / 100).toFixed(2)}
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      No Stripe account, no SIREN, no KYC. Net wired to your IBAN within 2-3 business days.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* History */}
            <section className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold">Payout history</h2>
                <span className="text-xs text-muted-foreground">{history.length} payout{history.length === 1 ? "" : "s"}</span>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No payouts requested yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-left">
                        <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Requested</th>
                        <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">IBAN</th>
                        <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Amount</th>
                        <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((p) => (
                        <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            {new Date(p.requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                            {p.iban_used.slice(0, 4)} ··· {p.iban_used.slice(-4)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold tabular-nums">€{(p.amount_cents / 100).toFixed(2)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[p.status] ?? "bg-muted text-muted-foreground"}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {p.status === "sent" ? (
                              <button
                                type="button"
                                onClick={() => downloadReceipt(p)}
                                disabled={downloadingId === p.id}
                                title="Download payment receipt (PDF)"
                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50"
                              >
                                {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {earnings && earnings.claimed_cents > 0 && available === 0 && (
              <div className="mt-4 rounded-lg border border-border bg-card px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  €{(earnings.claimed_cents / 100).toFixed(2)} is currently being wired — allow 2-3 business days.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </StudioLayout>
  );
};

export default StudioPayouts;
