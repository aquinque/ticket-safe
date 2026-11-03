import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { generatePayoutReceiptPDF } from "@/lib/payoutReceiptPdf";
import {
  formatEur,
  groupByMonth,
  ibanLast4,
  sellerNetCents,
  type HistoryItem,
  type PayoutStatus,
} from "@/components/wallet/walletModel";

/**
 * The top of My Wallet: what the seller can withdraw now, what is on its way,
 * where the money goes, and every movement.
 *
 * Two ways money reaches a seller:
 * - card resales (Stripe checkout, `cs_…`): held by Ticket Safe and sent to the
 *   seller's bank after the event by stripe-connect-payout-cron, once bank
 *   details are entered on Stripe's page (stripe-connect-onboard-reseller);
 * - older resales: credited to the wallet (seller_earnings) and withdrawn by
 *   IBAN (request-seller-payout, 5 % fee at withdrawal).
 */

export interface SellerEarnings {
  net_earned_cents: number;
  claimed_cents: number;
  available_cents: number;
  completed_sales: number;
}

interface SaleRow {
  id: string;
  amount: number | string;
  fee_amount: number | string | null;
  commission_cents: number | null;
  payout_job_id: string | null;
  status: "completed" | "refunded" | "disputed";
  stripe_checkout_session_id: string | null;
  created_at: string;
  ticket: { event: { title: string | null; date: string | null; ends_at: string | null } | null } | null;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  gross_cents: number | null;
  fee_cents: number | null;
  status: PayoutStatus;
  iban_used: string;
  iban_holder_used: string;
  requested_at: string;
  sent_at: string | null;
}

type BankState = "none" | "pending" | "ready";

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const eyebrow = "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200";
const chipBase = "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-semibold whitespace-nowrap";

const CHIP_TONE = {
  neutral: "border-border text-muted-foreground",
  accent: "border-brand-200/40 text-brand-200",
  good: "border-success/40 text-success",
  bad: "border-destructive/50 text-destructive",
} as const;

export const Chip = ({ tone = "neutral", children }: { tone?: keyof typeof CHIP_TONE; children: React.ReactNode }) => (
  <span className={`${chipBase} ${CHIP_TONE[tone]}`}>{children}</span>
);

const PAYOUT_CHIP: Record<PayoutStatus, { text: string; tone: keyof typeof CHIP_TONE }> = {
  requested: { text: "Requested", tone: "accent" },
  processing: { text: "Processing", tone: "accent" },
  sent: { text: "Sent", tone: "good" },
  failed: { text: "Failed", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};

export const WalletOverview = ({
  userId,
  earnings,
  reloadKey,
  onWithdraw,
  onSell,
}: {
  userId: string;
  earnings: SellerEarnings | null;
  reloadKey: number;
  onWithdraw: () => void;
  onSell: () => void;
}) => {
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [bank, setBank] = useState<BankState>("none");
  const [paidJobs, setPaidJobs] = useState<Record<string, string>>({});
  const [iban, setIban] = useState<{ last4: string; holder: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: account }, { data: hist }, { data: profile }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, amount, fee_amount, commission_cents, payout_job_id, status, stripe_checkout_session_id, created_at, ticket:tickets(event:events(title, date, ends_at))")
        .eq("seller_id", userId)
        .in("status", ["completed", "refunded", "disputed"])
        .order("created_at", { ascending: false }),
      supabase.from("stripe_connect_accounts").select("id, payouts_enabled").eq("user_id", userId).eq("owner_type", "reseller").maybeSingle(),
      supabase
        .from("seller_payouts")
        .select("id, amount_cents, gross_cents, fee_cents, status, iban_used, iban_holder_used, requested_at, sent_at")
        .eq("seller_id", userId)
        .order("requested_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("payout_iban, payout_iban_holder").eq("id", userId).maybeSingle(),
    ]);
    const list = (rows ?? []) as unknown as SaleRow[];
    setSales(list);
    setBank(!account ? "none" : account.payouts_enabled ? "ready" : "pending");
    setPayouts((hist ?? []) as PayoutRow[]);
    const saved = (profile as { payout_iban?: string | null; payout_iban_holder?: string | null } | null) ?? null;
    setIban(saved?.payout_iban ? { last4: ibanLast4(saved.payout_iban), holder: saved.payout_iban_holder ?? null } : null);
    const jobIds = [...new Set(list.map((s) => s.payout_job_id).filter(Boolean))] as string[];
    if (jobIds.length) {
      const { data: jobs } = await supabase.from("stripe_connect_payout_jobs").select("id, attempted_at").in("id", jobIds);
      setPaidJobs(Object.fromEntries((jobs ?? []).map((j) => [j.id, j.attempted_at ?? ""])));
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  // Back from Stripe's page: refresh the account so a finished setup shows at once
  // (and queues any payout that was waiting for it).
  useEffect(() => {
    if (bank !== "pending") return;
    void supabase.functions.invoke("stripe-connect-onboard-reseller", { body: { action: "refresh" } }).then(() => load());
  }, [bank, load]);

  const openStripe = async (action: "onboard" | "dashboard") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-onboard-reseller", { body: { action } });
    setBusy(false);
    if (error || !data?.url) { toast.error("Couldn't open Stripe. Please try again."); return; }
    window.location.href = data.url;
  };

  const downloadReceipt = async (p: PayoutRow) => {
    setDownloadingId(p.id);
    try {
      const grossCents = p.gross_cents ?? p.amount_cents;
      const feeCents = p.fee_cents ?? Math.max(grossCents - p.amount_cents, 0);
      await generatePayoutReceiptPDF({
        kind: "resale",
        payoutId: p.id,
        beneficiaryName: p.iban_holder_used,
        iban: p.iban_used,
        grossCents,
        feeCents,
        feePercent: 5,
        netCents: p.amount_cents,
        sentAt: p.sent_at,
        requestedAt: p.requested_at,
        status: p.status,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const cardSales = useMemo(() => (sales ?? []).filter((s) => s.stripe_checkout_session_id?.startsWith("cs_")), [sales]);
  const completedCardSales = cardSales.filter((s) => s.status === "completed");

  const available = earnings?.available_cents ?? 0;
  const onItsWay = completedCardSales.filter((s) => !s.payout_job_id).reduce((sum, s) => sum + sellerNetCents(s), 0);
  const withdrawing = payouts.filter((p) => p.status === "requested" || p.status === "processing").reduce((sum, p) => sum + p.amount_cents, 0);
  const pending = onItsWay + withdrawing;
  const earned = (earnings?.net_earned_cents ?? 0) + completedCardSales.reduce((sum, s) => sum + sellerNetCents(s), 0);
  const salesCount = (earnings?.completed_sales ?? 0) + completedCardSales.length;
  const paidOut = (earnings?.claimed_cents ?? 0) + completedCardSales.filter((s) => s.payout_job_id).reduce((sum, s) => sum + sellerNetCents(s), 0);

  const hasCardSales = completedCardSales.length > 0;
  const actionNeeded = bank === "pending" || (bank === "none" && hasCardSales);

  const history: HistoryItem[] = useMemo(() => {
    const items: HistoryItem[] = [];
    for (const s of sales ?? []) {
      const ev = s.ticket?.event;
      const title = ev?.title ?? "Ticket";
      const isCard = !!s.stripe_checkout_session_id?.startsWith("cs_");
      if (s.status === "refunded") {
        items.push({ id: `s-${s.id}`, at: s.created_at, label: `Refund · ${title}`, detail: "Sale refunded to the buyer", cents: sellerNetCents(s, isCard), sign: "none", chip: { text: "Refunded", tone: "neutral" } });
        continue;
      }
      if (s.status === "disputed") {
        items.push({ id: `s-${s.id}`, at: s.created_at, label: `Resale · ${title}`, detail: "The buyer disputed the payment with their bank. On hold until it is resolved.", cents: sellerNetCents(s, isCard), sign: "none", chip: { text: "On hold", tone: "neutral" } });
        continue;
      }
      if (!isCard) {
        items.push({ id: `s-${s.id}`, at: s.created_at, label: `Resale · ${title}`, detail: "Added to your balance", cents: sellerNetCents(s, false), sign: "plus", chip: { text: "In wallet", tone: "good" } });
        continue;
      }
      const end = ev?.ends_at ?? ev?.date ?? null;
      const paidAt = s.payout_job_id ? paidJobs[s.payout_job_id] : undefined;
      const state = s.payout_job_id
        ? { detail: paidAt ? `Paid out ${dayLabel(paidAt)}` : "Paid out", chip: { text: "Paid out", tone: "good" as const } }
        : bank !== "ready"
          ? { detail: "Waiting for your bank details", chip: { text: "Action needed", tone: "accent" as const } }
          : { detail: end ? `Paid out after the event (${dayLabel(end)})` : "Paid out after the event", chip: { text: "Pending", tone: "accent" as const } };
      items.push({ id: `s-${s.id}`, at: s.created_at, label: `Resale · ${title}`, cents: sellerNetCents(s), sign: "plus", ...state });
    }
    for (const p of payouts) {
      const gross = p.gross_cents ?? p.amount_cents;
      const fee = p.fee_cents ?? Math.max(gross - p.amount_cents, 0);
      items.push({
        id: `p-${p.id}`,
        at: p.requested_at,
        label: `Withdrawal · IBAN ··${ibanLast4(p.iban_used)}`,
        detail: fee > 0 ? `${formatEur(gross)} minus ${formatEur(fee)} fee` : undefined,
        cents: p.amount_cents,
        sign: "minus",
        chip: PAYOUT_CHIP[p.status] ?? { text: p.status, tone: "neutral" },
        receipt: p.status === "sent" ? () => downloadReceipt(p) : undefined,
        receiptBusy: downloadingId === p.id,
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, payouts, paidJobs, bank, downloadingId]);

  const months = groupByMonth(history);
  const loaded = sales !== null && earnings !== null;

  const withdrawHelp =
    available > 0
      ? "Sent by SEPA to your IBAN within 2–3 business days. Ticket Safe keeps 5% at withdrawal."
      : hasCardSales
        ? "Nothing to withdraw right now. Card resales go to your bank automatically after the event."
        : "Nothing to withdraw yet. Your earnings appear here when a ticket sells.";

  const bankChip =
    bank === "ready" ? <Chip tone="good">Connected</Chip>
      : actionNeeded ? <Chip tone="accent">Action needed</Chip>
        : <Chip>Not set up</Chip>;
  const bankText =
    bank === "ready" ? "Card resales are sent here automatically after each event."
      : bank === "pending" ? "Finish your bank details on Stripe's secure page to receive your card resales."
        : hasCardSales ? "Add your bank details once (2 minutes, on Stripe's secure page) and we'll send your money automatically after each event."
          : "You'll add your bank details on Stripe's secure page after your first card resale.";
  const bankAction =
    bank === "ready" ? { label: "Manage on Stripe", run: () => openStripe("dashboard") }
      : bank === "pending" ? { label: "Finish bank details", run: () => openStripe("onboard") }
        : hasCardSales ? { label: "Add my bank details", run: () => openStripe("onboard") }
          : null;

  return (
    <div className="space-y-10 md:space-y-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:items-start">
      {/* Balance */}
      <section aria-labelledby="wallet-balance" className="menu-rise" style={{ animationDelay: "0ms" }}>
        <div className={eyebrow}>Wallet</div>
        <h1 id="wallet-balance" className="mt-3 font-display font-bold tracking-[-0.02em] leading-none tabular-nums text-[52px] sm:text-[64px] md:text-[76px]">
          {loaded ? formatEur(available) : <span className="text-muted-foreground">—</span>}
          <span className="sr-only"> available to withdraw</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground" aria-hidden="true">Available to withdraw</p>
        <p className="mt-4 text-base">
          <span className="font-display font-bold tabular-nums">{formatEur(pending)}</span>{" "}
          <span className="text-muted-foreground">pending</span>
        </p>
        {pending > 0 && (
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground max-w-md">
            {[
              onItsWay > 0 && `${formatEur(onItsWay)} from card resales, sent to your bank after the event`,
              withdrawing > 0 && `${formatEur(withdrawing)} withdrawal on its way (2–3 business days)`,
            ].filter(Boolean).join(" · ")}
            .
          </p>
        )}

        <div className="mt-7 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="sm:w-[240px]">
            <Button
              variant="primary"
              size="lg"
              onClick={onWithdraw}
              disabled={available <= 0}
              aria-describedby="withdraw-help"
              className="w-full gap-2 font-semibold disabled:opacity-100 disabled:bg-foreground/[0.06] disabled:text-muted-foreground disabled:shadow-none"
            >
              Withdraw
              {available > 0 && <ArrowRight className="w-4 h-4" strokeWidth={1.5} />}
            </Button>
            <p id="withdraw-help" className="mt-2.5 text-[13px] leading-snug text-muted-foreground">{withdrawHelp}</p>
          </div>
          <Button variant="outline" size="lg" onClick={onSell} className="gap-2 mt-2 sm:mt-0">
            Sell a ticket
          </Button>
        </div>

        <dl className="mt-8 grid grid-cols-3 border-y border-brand-200/25">
          {[
            ["Earned", formatEur(earned)],
            ["Sales", String(salesCount)],
            ["Paid out", formatEur(paidOut)],
          ].map(([k, v], i) => (
            <div key={k} className={`py-4 ${i ? "pl-4 border-l border-brand-200/25" : ""}`}>
              <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
              <dd className="mt-1 font-display font-bold tabular-nums text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Payout account */}
      <section
        aria-labelledby="payout-account"
        className={`menu-rise relative overflow-hidden border border-brand-200/25 bg-background p-6 ${actionNeeded ? "bg-[radial-gradient(130%_100%_at_100%_0%,hsl(var(--brand-500)/0.28),transparent_62%)]" : ""}`}
        style={{ animationDelay: "60ms" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={eyebrow}>Payout account</div>
          {bankChip}
        </div>
        <h2 id="payout-account" className="mt-3 font-display text-[23px] font-bold tracking-[-0.02em] leading-tight">
          {bank === "ready" ? "Bank account connected" : "Your bank account"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-lg">{bankText}</p>
        {iban && (
          <p className="mt-4 text-sm">
            <span className="text-muted-foreground">Withdrawal IBAN</span>{" "}
            <span className="font-semibold tabular-nums">•••• {iban.last4}</span>
            {iban.holder && <span className="text-muted-foreground"> · {iban.holder}</span>}
          </p>
        )}
        {bankAction && (
          <button
            type="button"
            onClick={bankAction.run}
            disabled={busy}
            className="mt-5 inline-flex items-center gap-3 min-h-[44px] font-semibold text-foreground hover:text-brand-200 transition-colors active:scale-[0.98] active:opacity-90 disabled:opacity-60"
          >
            {bankAction.label}
            <span className="w-11 h-11 rounded-full border border-brand-200/40 inline-flex items-center justify-center shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-[18px] h-[18px]" strokeWidth={1.5} />}
            </span>
          </button>
        )}
      </section>

      </div>

      {/* History */}
      <section aria-labelledby="wallet-history" className="menu-rise" style={{ animationDelay: "120ms" }}>
        <div className={eyebrow}>History</div>
        <h2 id="wallet-history" className="mt-3 font-display text-[28px] font-bold tracking-[-0.02em] leading-tight">Transactions</h2>
        {!loaded ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : months.length === 0 ? (
          <div className="mt-5 border border-dashed border-border px-6 py-10 text-center">
            <p className="font-display text-lg font-bold">No transactions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Sales, payouts and refunds will show up here.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-7">
            {months.map((m) => (
              <div key={m.key}>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground pb-2 border-b border-brand-200/25">{m.label}</h3>
                <ul>
                  {m.items.map((it) => (
                    <li key={it.id} className="py-4 border-b border-border/60 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug truncate">{it.label}</div>
                        <div className="mt-0.5 text-[13px] text-muted-foreground">
                          {dayLabel(it.at)}{it.detail ? ` · ${it.detail}` : ""}
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Chip tone={it.chip.tone}>{it.chip.text}</Chip>
                          {it.receipt && (
                            <button
                              type="button"
                              onClick={it.receipt}
                              disabled={it.receiptBusy}
                              aria-label="Download payment receipt (PDF)"
                              className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                            >
                              {it.receiptBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                              Receipt
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 font-display font-bold tabular-nums text-right ${
                          it.sign === "plus" ? "text-brand-200" : it.sign === "minus" ? "text-foreground" : "text-muted-foreground line-through"
                        }`}
                      >
                        {it.sign === "plus" ? "+" : it.sign === "minus" ? "−" : ""}
                        {formatEur(it.cents)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[12px] text-muted-foreground">
              Amounts are what you receive: the sale price minus the 5% Ticket Safe fee. Payouts usually reach your bank 2 to 3 working days after they're sent.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
