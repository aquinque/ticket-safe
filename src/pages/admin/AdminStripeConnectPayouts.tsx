import { useEffect, useState, useCallback } from "react";
import { Loader2, Banknote, Lock, Unlock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import Footer from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin — Stripe Connect payout queue. Separate page from the existing
 * AdminPayouts.tsx (Revolut-era manual SEPA queue) rather than folding in:
 * the two providers' payout mechanics are unrelated (one is "mark this
 * manual wire as sent", the other is "block/unblock an automated Stripe
 * payout job"), and keeping them apart means this new, untested page can
 * never regress the live Revolut admin flow.
 */

interface PayoutJobRow {
  id: string;
  event_id: string | null;
  kind: "organizer_event_payout" | "reseller_payout";
  scheduled_for: string;
  status: "scheduled" | "sent" | "failed" | "blocked" | "cancelled";
  blocked_reason: string | null;
  amount_cents: number | null;
  stripe_connect_account_id: string;
  account_holder_name?: string | null;
  event_title?: string | null;
}

const AdminStripeConnectPayouts = () => {
  const [jobs, setJobs] = useState<PayoutJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: jobRows } = await supabase
      .from("stripe_connect_payout_jobs")
      .select("id, event_id, kind, scheduled_for, status, blocked_reason, amount_cents, stripe_connect_account_id")
      .order("scheduled_for", { ascending: false })
      .limit(200);
    const rows = (jobRows ?? []) as PayoutJobRow[];

    const accountIds = Array.from(new Set(rows.map((r) => r.stripe_connect_account_id)));
    const eventIds = Array.from(new Set(rows.map((r) => r.event_id).filter((v): v is string => !!v)));
    const [{ data: accounts }, { data: events }] = await Promise.all([
      accountIds.length ? supabase.from("stripe_connect_accounts").select("id, account_holder_name").in("id", accountIds) : Promise.resolve({ data: [] as { id: string; account_holder_name: string | null }[] }),
      eventIds.length ? supabase.from("events").select("id, title").in("id", eventIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.account_holder_name]));
    const eventMap = new Map((events ?? []).map((e) => [e.id, e.title]));

    setJobs(rows.map((r) => ({ ...r, account_holder_name: accountMap.get(r.stripe_connect_account_id) ?? "—", event_title: r.event_id ? eventMap.get(r.event_id) ?? "—" : "Resale" })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleBlock = async (job: PayoutJobRow) => {
    setBusyId(job.id);
    try {
      const nextStatus = job.status === "blocked" ? "scheduled" : "blocked";
      const { error } = await supabase
        .from("stripe_connect_payout_jobs")
        .update({ status: nextStatus, blocked_reason: nextStatus === "blocked" ? "Blocked manually by admin" : null })
        .eq("id", job.id);
      if (error) throw error;
      toast.success(nextStatus === "blocked" ? "Payout blocked" : "Payout unblocked");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update payout");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status: PayoutJobRow["status"]) => {
    const map: Record<PayoutJobRow["status"], string> = {
      scheduled: "bg-blue-100 text-blue-700",
      sent: "bg-emerald-100 text-emerald-700",
      failed: "bg-destructive/10 text-destructive",
      blocked: "bg-amber-100 text-amber-700",
      cancelled: "bg-muted text-muted-foreground",
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${map[status]}`}>{status}</span>;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
        <BackButton to="/admin/payouts" label="Back to payouts" />
        <PageHeader
          icon={Banknote}
          title="Stripe Connect payouts"
          description="Automated organizer and reseller payouts via Stripe Connect. Block a payout to hold funds (e.g. an open dispute or a suspicious order) before it's sent."
        />

        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mt-6" />
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-6">No Stripe Connect payout jobs yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-bold text-muted-foreground uppercase border-b border-border">
                  <th className="py-2 pr-4">Scheduled for</th>
                  <th className="py-2 pr-4">Kind</th>
                  <th className="py-2 pr-4">Event / Account</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Note</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(job.scheduled_for).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="py-2 pr-4">{job.kind === "organizer_event_payout" ? "Organizer" : "Reseller"}</td>
                    <td className="py-2 pr-4">{job.kind === "organizer_event_payout" ? job.event_title : job.account_holder_name}</td>
                    <td className="py-2 pr-4 font-semibold">{job.amount_cents != null ? `€${(job.amount_cents / 100).toFixed(2)}` : "—"}</td>
                    <td className="py-2 pr-4">{statusBadge(job.status)}</td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground max-w-xs truncate">
                      {job.blocked_reason && <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{job.blocked_reason}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {(job.status === "scheduled" || job.status === "blocked") && (
                        <button
                          onClick={() => toggleBlock(job)}
                          disabled={busyId === job.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-border hover:bg-muted disabled:opacity-60"
                        >
                          {busyId === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : job.status === "blocked" ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {job.status === "blocked" ? "Unblock" : "Block"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default AdminStripeConnectPayouts;
