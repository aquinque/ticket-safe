import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, Download, CheckCircle2, Loader2, ArrowLeft, FileText, Clock, AlertTriangle, ExternalLink, Copy, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import Footer from "@/components/Footer";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES, formatMoney, toCurrency, type Currency } from "@/lib/money";
import { authPathHere } from "@/lib/returnTo";

interface PendingPayout {
  id: string;
  kind: "studio" | "resale";
  amount_cents: number;
  /** organizer_payouts / seller_payouts.currency (resale is always EUR). */
  currency: Currency;
  iban_used: string;
  iban_holder_used: string;
  who: string;
  requested_at: string;
}

/** payout_batches has no currency: batches are SEPA exports, so euros. */
interface Batch {
  id: string;
  created_at: string;
  status: string;
  total_cents: number;
  num_payouts: number;
  sent_at: string | null;
}

const AdminPayouts = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pending, setPending] = useState<PendingPayout[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  // Cancelled batches stay in the database; the list hides them unless asked.
  const [showCancelled, setShowCancelled] = useState(false);
  // Stays sticky once the function reports "not configured" so the admin
  // sees the exact setup steps without having to re-click and re-read
  // the small toast.
  const [sepaConfigError, setSepaConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate(authPathHere(), { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!role);
    })();
  }, [user]);

  const load = async () => {
    setLoading(true);
    let batchQuery = supabase
      .from("payout_batches")
      .select("id, created_at, status, total_cents, num_payouts, sent_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!showCancelled) batchQuery = batchQuery.neq("status", "cancelled");
    const [{ data: studio }, { data: resale }, { data: batchRows }] = await Promise.all([
      supabase
        .from("organizer_payouts")
        .select("id, amount_cents, currency, iban_used, iban_holder_used, requested_at, organizer:organizer_profiles(name)")
        .eq("status", "requested")
        .is("batch_id", null)
        .order("requested_at", { ascending: true }),
      supabase
        .from("seller_payouts")
        .select("id, amount_cents, currency, iban_used, iban_holder_used, requested_at, seller:profiles(full_name, email)")
        .eq("status", "requested")
        .is("batch_id", null)
        .order("requested_at", { ascending: true }),
      batchQuery,
    ]);

    const rows: PendingPayout[] = [];
    for (const p of (studio ?? []) as {
      id: string;
      amount_cents: number;
      currency: string | null;
      iban_used: string;
      iban_holder_used: string;
      requested_at: string;
      organizer: { name?: string } | { name?: string }[] | null;
    }[]) {
      const org = Array.isArray(p.organizer) ? p.organizer[0] : p.organizer;
      rows.push({
        id: p.id,
        kind: "studio",
        amount_cents: p.amount_cents,
        currency: toCurrency(p.currency),
        iban_used: p.iban_used,
        iban_holder_used: p.iban_holder_used,
        who: org?.name ?? "Unknown organizer",
        requested_at: p.requested_at,
      });
    }
    for (const p of (resale ?? []) as {
      id: string;
      amount_cents: number;
      currency: string | null;
      iban_used: string;
      iban_holder_used: string;
      requested_at: string;
      seller: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null;
    }[]) {
      const sel = Array.isArray(p.seller) ? p.seller[0] : p.seller;
      rows.push({
        id: p.id,
        kind: "resale",
        amount_cents: p.amount_cents,
        currency: toCurrency(p.currency),
        iban_used: p.iban_used,
        iban_holder_used: p.iban_holder_used,
        who: sel?.full_name ?? sel?.email ?? "Unknown seller",
        requested_at: p.requested_at,
      });
    }
    rows.sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime());
    setPending(rows);
    setBatches((batchRows as Batch[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, showCancelled]);

  // format "sheet" → clean human-readable .txt for manual bank entry (default);
  // format "xml" → pain.001 SEPA file for banks that support bulk upload.
  const exportBatch = async (format: "sheet" | "xml" = "sheet") => {
    if (pending.length === 0) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");

      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/export-payout-batch`, {
        method: "POST",
        // apikey is required by the Supabase gateway in addition to the
        // user JWT — without it the gateway 401s before the function runs,
        // which surfaces as a generic "Edge Function error" in the SDK.
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey,
        },
        body: JSON.stringify({ include_studio: true, include_resale: true, format }),
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        let msg: string;
        if (ct.includes("application/json")) {
          const err = await res.json().catch(() => ({}));
          msg = err.error ?? `HTTP ${res.status}`;
        } else {
          msg = (await res.text().catch(() => "")) || `HTTP ${res.status}`;
        }
        if (typeof msg === "string" && msg.toLowerCase().includes("not configured")) {
          setSepaConfigError(msg);
        }
        throw new Error(msg);
      }
      // Successful export means the secrets are set — clear any stale banner
      setSepaConfigError(null);
      const batchId = res.headers.get("X-Batch-Id") ?? "batch";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batchId}.${format === "xml" ? "xml" : "txt"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        format === "xml"
          ? `Batch ${batchId} XML exported · upload it to your bank`
          : `Transfer sheet ${batchId} downloaded · make the transfers in your bank, then click “Mark sent”`,
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const refresh = async () => {
    setPolling(true);
    try {
      await load();
      toast.success("Queue refreshed.");
    } finally {
      setPolling(false);
    }
  };

  // Recover a batch that got stuck in 'processing' and was NOT paid: send its
  // payouts back to the queue as 'requested' so they can be exported again,
  // and cancel the batch.
  const returnToQueue = async (batchId: string) => {
    if (!window.confirm(
      `Return batch ${batchId} to the queue?\n\nIts payouts go back to "requested" so you can export them again. Only do this if the batch was NOT actually paid.`,
    )) return;
    setMarking(batchId);
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("organizer_payouts").update({ status: "requested", batch_id: null }).eq("batch_id", batchId),
        supabase.from("seller_payouts").update({ status: "requested", batch_id: null }).eq("batch_id", batchId),
      ]);
      if (e1 || e2) throw new Error(e1?.message ?? e2?.message ?? "Update failed");
      await supabase.from("payout_batches").update({ status: "cancelled" }).eq("id", batchId);
      toast.success(`Batch ${batchId} returned to the queue.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not return batch to queue");
    } finally {
      setMarking(null);
    }
  };

  // Cancel a batch that was never paid and whose payouts must not be paid
  // either (tests, duplicates): the batch and its payouts become 'cancelled'
  // with a note, nothing is deleted. Cancelled payouts no longer count as
  // withdrawn, so the amount is available again in the seller's or
  // organizer's balance.
  const cancelBatch = async (batchId: string) => {
    const note = window.prompt(
      `Cancel batch ${batchId} and all its payouts?\n\nNothing is deleted and no transfer is sent. The amounts become available again in the sellers' and organizers' balances.\n\nNote for the records:`,
      "Cancelled, never sent",
    );
    if (note === null) return;
    const notes = note.trim() || "Cancelled, never sent";
    setMarking(batchId);
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("organizer_payouts").update({ status: "cancelled", admin_notes: notes }).eq("batch_id", batchId).is("sent_at", null),
        supabase.from("seller_payouts").update({ status: "cancelled", admin_notes: notes }).eq("batch_id", batchId).is("sent_at", null),
      ]);
      if (e1 || e2) throw new Error(e1?.message ?? e2?.message ?? "Update failed");
      const { error: e3 } = await supabase.from("payout_batches").update({ status: "cancelled", notes }).eq("id", batchId);
      if (e3) throw new Error(e3.message);
      toast.success(`Batch ${batchId} cancelled.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the batch");
    } finally {
      setMarking(null);
    }
  };

  const markSent = async (batchId: string) => {
    setMarking(batchId);
    try {
      const { data, error } = await supabase.functions.invoke("mark-payout-batch-sent", { body: { batch_id: batchId } });
      if (error || (data as { error?: string })?.error) throw new Error((data as { error?: string })?.error ?? error?.message ?? "Failed");
      toast.success(`Batch ${batchId} marked as sent`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setMarking(null);
    }
  };

  if (authLoading || isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header minimal />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-black mb-2">Admin only</h1>
            <p className="text-sm text-muted-foreground">You don't have access to this page.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // One total per currency: pounds are never added to euros.
  const totalsByCurrency = pending.reduce(
    (acc, p) => ({ ...acc, [p.currency]: (acc[p.currency] ?? 0) + p.amount_cents }),
    {} as Partial<Record<Currency, number>>,
  );
  const pendingCurrencies = CURRENCIES.filter((c) => totalsByCurrency[c] != null);
  const totalText = pendingCurrencies.length
    ? pendingCurrencies.map((c) => formatMoney(totalsByCurrency[c]!, c)).join(" · ")
    : formatMoney(0, "EUR");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header minimal />
      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-4">
            <BackButton />
          </div>

          <PageHeader
            icon={Banknote}
            title="SEPA payout queue"
            description="Batch resale and legacy payouts into one bank upload."
          />

          <p className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
            Studio events are paid out automatically through Stripe. This queue is only for resale and legacy payouts.
          </p>

          {/* SEPA debtor config banner — shown the moment export-payout-batch
              tells us the secrets aren't set on the Supabase project. */}
          {sepaConfigError && (
            <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 md:p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-amber-900 mb-1">SEPA debtor account not configured</h3>
                  <p className="text-sm text-amber-900/90 mb-4">
                    The XML can't be generated until three secrets are set on the Supabase project. Open
                    {" "}
                    <a
                      href="https://supabase.com/dashboard/project/lgmnatfvdzzjzyxlenry/settings/functions"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold underline"
                    >
                      Project Settings → Edge Functions → Secrets
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {" "}and add:
                  </p>
                  <div className="space-y-2 mb-4">
                    {[
                      { key: "SEPA_DEBTOR_NAME", hint: "Legal name of the Ticket Safe account (e.g. \"Ticket Safe SAS\")" },
                      { key: "SEPA_DEBTOR_IBAN", hint: "Source IBAN — your business bank account (FR76…, no spaces)" },
                      { key: "SEPA_DEBTOR_BIC",  hint: "SWIFT/BIC of that bank (e.g. BOUSFRPPXXX)" },
                    ].map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold font-mono text-amber-900">{s.key}</div>
                          <div className="text-[11px] text-amber-800/80 truncate">{s.hint}</div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(s.key).catch(() => undefined);
                            toast.success(`Copied ${s.key}`);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 hover:underline shrink-0"
                          title="Copy the secret key name"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-900/80">
                    Edge functions read these on the next invocation — no redeploy needed. Click "Export batch" again once they're saved.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSepaConfigError(null)}
                  className="text-amber-900/60 hover:text-amber-900 text-xs font-bold shrink-0"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Pending strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Card label="Pending payouts" value={String(pending.length)} icon={Clock} />
            <Card label="Total to wire" value={totalText} icon={Banknote} />
            <Card label="Studio / Resale" value={`${pending.filter(p => p.kind === "studio").length} / ${pending.filter(p => p.kind === "resale").length}`} icon={FileText} />
          </div>

          {/* Send / Export buttons */}
          <section className="mb-8 bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black">Pay out the queue</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <strong>Transfer sheet</strong> downloads a readable list (beneficiary · IBAN · amount · reference) to enter in your bank one by one. <strong>SEPA XML</strong> is the same batch as a pain.001 file, for banks that accept bulk uploads.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => exportBatch("sheet")}
                  disabled={exporting || pending.length === 0}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60 shrink-0"
                  title="Clean, readable list of beneficiary · IBAN · amount · reference to type into your bank"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Transfer sheet ({pending.length})
                </button>
                <button
                  onClick={() => exportBatch("xml")}
                  disabled={exporting || pending.length === 0}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg font-semibold text-sm bg-muted/60 hover:bg-muted border border-border disabled:opacity-60 shrink-0"
                  title="pain.001 SEPA XML — for banks that support bulk transfer upload"
                >
                  <Download className="w-4 h-4" />
                  SEPA XML
                </button>
                <button
                  onClick={refresh}
                  disabled={polling}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60 shrink-0"
                  title="Reload the queue and batches"
                >
                  {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh
                </button>
              </div>
            </div>
          </section>

          {/* Pending list */}
          <section className="mb-8 bg-card border border-border rounded-2xl p-5 md:p-6">
            <h2 className="text-lg font-black mb-4">Pending payouts</h2>
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending. The queue clears as sellers and organizers request withdrawals.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-2 py-2">Kind</th>
                      <th className="px-2 py-2">Beneficiary</th>
                      <th className="px-2 py-2">IBAN</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((p) => (
                      <tr key={`${p.kind}-${p.id}`} className="border-b border-border/60">
                        <td className="px-2 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${p.kind === "studio" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {p.kind}
                          </span>
                        </td>
                        <td className="px-2 py-3 font-semibold">{p.iban_holder_used}<div className="text-[11px] text-muted-foreground">{p.who}</div></td>
                        <td className="px-2 py-3 font-mono text-xs">{p.iban_used.slice(0, 4)} ··· {p.iban_used.slice(-4)}</td>
                        <td className="px-2 py-3 text-right font-bold">{formatMoney(p.amount_cents, p.currency)}</td>
                        <td className="px-2 py-3 text-xs text-muted-foreground">{new Date(p.requested_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Batches list */}
          <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-black">Batches</h2>
              <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Show cancelled
              </label>
            </div>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{showCancelled ? "No batches yet." : "No open or sent batches."}</p>
            ) : (
              <div className="space-y-3">
                {batches.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border">
                    <div className="min-w-0">
                      <div className="font-mono font-bold">{b.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.num_payouts} payouts · {formatMoney(b.total_cents, "EUR")} · created {new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        {b.sent_at ? ` · sent ${new Date(b.sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${b.status === "sent" ? "bg-emerald-100 text-emerald-700" : b.status === "processing" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                        {b.status}
                      </span>
                      {b.status === "processing" && (
                        <>
                          <button
                            onClick={() => returnToQueue(b.id)}
                            disabled={marking === b.id}
                            className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60"
                            title="Not paid: send these payouts back to the queue to export them again"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Return to queue
                          </button>
                          <button
                            onClick={() => cancelBatch(b.id)}
                            disabled={marking === b.id}
                            className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border text-destructive disabled:opacity-60"
                            title="Never paid and must not be paid (tests, duplicates): cancel the batch and its payouts, nothing is deleted"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel batch
                          </button>
                          <button
                            onClick={() => markSent(b.id)}
                            disabled={marking === b.id}
                            className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {marking === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Mark sent
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Card = ({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
    <div className="text-2xl font-black">{value}</div>
  </div>
);

export default AdminPayouts;
