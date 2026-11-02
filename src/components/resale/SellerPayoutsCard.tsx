import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * My listings: what the seller gets for each resale paid through Stripe, and
 * where that money is. The buyer's payment waits on Ticket Safe's account and
 * is sent to the seller's bank after the event (stripe-connect-payout-cron),
 * minus the 5 % seller fee. Bank details are entered once, on Stripe's page
 * (stripe-connect-onboard-reseller), and only asked for once something sold.
 */

interface SaleRow {
  id: string;
  amount: number | string;
  fee_amount: number | string | null;
  commission_cents: number | null;
  payout_job_id: string | null;
  created_at: string;
  ticket: { event: { title: string | null; date: string | null; ends_at: string | null } | null } | null;
}

type BankState = "none" | "pending" | "ready";

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const payoutCents = (s: SaleRow) =>
  Math.round(Number(s.amount) * 100) - Math.round(Number(s.fee_amount ?? 0) * 100) - (s.commission_cents ?? 0);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const SellerPayoutsCard = ({ userId }: { userId: string }) => {
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [bank, setBank] = useState<BankState>("none");
  const [paidJobs, setPaidJobs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: account }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, amount, fee_amount, commission_cents, payout_job_id, created_at, ticket:tickets(event:events(title, date, ends_at))")
        .eq("seller_id", userId)
        .eq("status", "completed")
        .like("stripe_checkout_session_id", "cs_%")
        .order("created_at", { ascending: false }),
      supabase.from("stripe_connect_accounts").select("id, payouts_enabled").eq("user_id", userId).eq("owner_type", "reseller").maybeSingle(),
    ]);
    const list = (rows ?? []) as unknown as SaleRow[];
    setSales(list);
    setBank(!account ? "none" : account.payouts_enabled ? "ready" : "pending");
    const jobIds = [...new Set(list.map((s) => s.payout_job_id).filter(Boolean))] as string[];
    if (jobIds.length) {
      const { data: jobs } = await supabase.from("stripe_connect_payout_jobs").select("id, attempted_at").in("id", jobIds);
      setPaidJobs(Object.fromEntries((jobs ?? []).map((j) => [j.id, j.attempted_at ?? ""])));
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

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

  if (!sales || sales.length === 0) return null;

  const waiting = sales.filter((s) => !s.payout_job_id).reduce((sum, s) => sum + payoutCents(s), 0);

  return (
    <section className="mb-6 rounded-2xl border border-success/30 bg-success/10 p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <Banknote className="w-6 h-6 text-success" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-success/80">Your sales</div>
            <div className="text-3xl font-black tabular-nums leading-tight text-success">{euros(waiting)}</div>
            <div className="text-xs text-success/80">on its way to you after the event</div>
          </div>
        </div>
        {bank === "ready" ? (
          <Button variant="outline" onClick={() => openStripe("dashboard")} disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Bank details
          </Button>
        ) : (
          <Button onClick={() => openStripe("onboard")} disabled={busy} className="shrink-0 bg-success text-success-foreground hover:bg-success/90">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            {bank === "pending" ? "Finish bank details" : "Add my bank details"}
          </Button>
        )}
      </div>

      {bank !== "ready" && (
        <p className="mt-3 text-sm text-foreground">
          Add your bank details once (2 minutes, on Stripe's secure page) and we'll send your money automatically after each event.
        </p>
      )}

      <ul className="mt-4 pt-4 border-t border-success/20 space-y-2">
        {sales.map((s) => {
          const ev = s.ticket?.event;
          const end = ev?.ends_at ?? ev?.date ?? null;
          const paidAt = s.payout_job_id ? paidJobs[s.payout_job_id] : undefined;
          const status = s.payout_job_id
            ? { icon: CheckCircle2, text: paidAt ? `Paid out ${dayLabel(paidAt)}` : "Paid out" }
            : bank !== "ready"
              ? { icon: Clock, text: "Waiting for your bank details" }
              : { icon: Clock, text: end ? `Paid out after the event (${dayLabel(end)})` : "Paid out after the event" };
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-semibold truncate">{ev?.title ?? "Ticket"}</div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <status.icon className="w-3.5 h-3.5" /> {status.text}
                </div>
              </div>
              <div className="font-bold tabular-nums shrink-0">{euros(payoutCents(s))}</div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground mt-3">
        You receive the sale price minus the 5% Ticket Safe fee. Payouts usually reach your bank 2 to 3 working days after they're sent.
      </p>
    </section>
  );
};
