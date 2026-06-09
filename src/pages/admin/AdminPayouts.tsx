import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, Download, CheckCircle2, Loader2, ArrowLeft, FileText, Clock, AlertTriangle, ExternalLink, Copy, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface PendingPayout {
  id: string;
  kind: "studio" | "resale";
  amount_cents: number;
  iban_used: string;
  iban_holder_used: string;
  who: string;
  requested_at: string;
}

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
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);
  // Stays sticky once the function reports "not configured" so the admin
  // sees the exact setup steps without having to re-click and re-read
  // the small toast.
  const [sepaConfigError, setSepaConfigError] = useState<string | null>(null);
  const [revolutConfigError, setRevolutConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
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
    const [{ data: studio }, { data: resale }, { data: batchRows }] = await Promise.all([
      supabase
        .from("organizer_payouts")
        .select("id, amount_cents, iban_used, iban_holder_used, requested_at, organizer:organizer_profiles(name)")
        .eq("status", "requested")
        .is("batch_id", null)
        .order("requested_at", { ascending: true }),
      supabase
        .from("seller_payouts")
        .select("id, amount_cents, iban_used, iban_holder_used, requested_at, seller:profiles(full_name, email)")
        .eq("status", "requested")
        .is("batch_id", null)
        .order("requested_at", { ascending: true }),
      supabase
        .from("payout_batches")
        .select("id, created_at, status, total_cents, num_payouts, sent_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const rows: PendingPayout[] = [];
    for (const p of (studio ?? []) as {
      id: string;
      amount_cents: number;
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
        iban_used: p.iban_used,
        iban_holder_used: p.iban_holder_used,
        who: org?.name ?? "Unknown organizer",
        requested_at: p.requested_at,
      });
    }
    for (const p of (resale ?? []) as {
      id: string;
      amount_cents: number;
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
  }, [isAdmin]);

  const exportBatch = async () => {
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
        body: JSON.stringify({ include_studio: true, include_resale: true }),
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
      a.download = `${batchId}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Batch ${batchId} exported · upload it in your bank now`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const sendViaRevolut = async () => {
    if (pending.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-payout-batch-revolut", {
        body: { include_studio: true, include_resale: true },
      });
      if (error) throw new Error(error.message);
      const payload = data as { ok?: boolean; error?: string; sent?: number; failed?: number; batch_id?: string };
      if (payload.error) {
        if (payload.error.toLowerCase().includes("not configured")) setRevolutConfigError(payload.error);
        throw new Error(payload.error);
      }
      setRevolutConfigError(null);
      const sentCount = payload.sent ?? 0;
      const failedCount = payload.failed ?? 0;
      if (failedCount > 0) {
        toast.warning(`${sentCount} sent, ${failedCount} failed. Approve the rest in your Revolut app and click Refresh.`);
      } else {
        toast.success(`${sentCount} transfer${sentCount === 1 ? "" : "s"} created. Open your Revolut app and approve the SCA.`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const pollRevolut = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-revolut-batch", { body: {} });
      if (error) throw new Error(error.message);
      const payload = data as { polled?: number; completed?: number; failed?: number; error?: string };
      if (payload.error) throw new Error(payload.error);
      const completed = payload.completed ?? 0;
      const failed = payload.failed ?? 0;
      if (completed === 0 && failed === 0) {
        toast.info(`Polled ${payload.polled ?? 0} transfer${payload.polled === 1 ? "" : "s"}. None completed yet — approve them in Revolut.`);
      } else {
        toast.success(`${completed} completed${failed > 0 ? `, ${failed} failed` : ""}.`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Poll failed");
    } finally {
      setPolling(false);
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

  const totalCents = pending.reduce((a, p) => a + p.amount_cents, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header minimal />
      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground mb-5">
            <ArrowLeft className="w-4 h-4" />
            Back home
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black leading-tight">SEPA payout queue</h1>
              <p className="text-sm text-muted-foreground">Batch every Studio + resale payout into one bank upload.</p>
            </div>
          </div>

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
            <Card label="Total to wire" value={`€${(totalCents / 100).toFixed(2)}`} icon={Banknote} />
            <Card label="Studio / Resale" value={`${pending.filter(p => p.kind === "studio").length} / ${pending.filter(p => p.kind === "resale").length}`} icon={FileText} />
          </div>

          {/* Revolut config-required banner — surfaces the moment
              send-payout-batch-revolut tells us secrets aren't set. */}
          {revolutConfigError && (
            <div className="mb-6 bg-violet-50 border-2 border-violet-300 rounded-2xl p-5 md:p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-violet-700 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-violet-900 mb-1">Revolut Business API not configured</h3>
                  <p className="text-sm text-violet-900/90 mb-3">
                    To send transfers automatically without uploading XML, set up Revolut Business API access:
                  </p>
                  <ol className="text-sm text-violet-900/90 list-decimal pl-5 space-y-1 mb-4">
                    <li>Go to <strong>Revolut Business → Settings → APIs → Add API client</strong></li>
                    <li>
                      Generate a key pair locally:{" "}
                      <code className="bg-white px-1.5 py-0.5 rounded text-xs">openssl genrsa -out revolut.pem 2048 && openssl rsa -in revolut.pem -pubout -out revolut-public.pem</code>
                    </li>
                    <li>Upload <code className="bg-white px-1.5 py-0.5 rounded text-xs">revolut-public.pem</code> to Revolut → copy the Client ID it returns</li>
                    <li>
                      Open{" "}
                      <a
                        href="https://supabase.com/dashboard/project/lgmnatfvdzzjzyxlenry/settings/functions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold underline"
                      >
                        Supabase secrets
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>{" "}
                      and add:
                    </li>
                  </ol>
                  <div className="space-y-2 mb-3">
                    {[
                      { key: "REVOLUT_CLIENT_ID", hint: "From Revolut → Settings → APIs" },
                      { key: "REVOLUT_PRIVATE_KEY", hint: "Whole contents of revolut.pem (with -----BEGIN PRIVATE KEY-----)" },
                    ].map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-2 bg-white border border-violet-200 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold font-mono text-violet-900">{s.key}</div>
                          <div className="text-[11px] text-violet-800/80 truncate">{s.hint}</div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(s.key).catch(() => undefined);
                            toast.success(`Copied ${s.key}`);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-900 hover:underline shrink-0"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-violet-900/80">
                    Once set, hit "Send via Revolut" again — transfers are created via API, you approve with one SCA in your phone.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRevolutConfigError(null)}
                  className="text-violet-900/60 hover:text-violet-900 text-xs font-bold shrink-0"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Send / Export buttons */}
          <section className="mb-8 bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black">Pay out the queue</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Two paths: the green button uses the Revolut Business API end-to-end (you only approve the SCA in your phone). The grey button generates a pain.001.001.03 XML you upload manually to any SEPA bank — fallback for non-Revolut accounts.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={sendViaRevolut}
                  disabled={sending || exporting || pending.length === 0}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Send via Revolut ({pending.length})
                </button>
                <button
                  onClick={exportBatch}
                  disabled={exporting || sending || pending.length === 0}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60 shrink-0"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export XML ({pending.length})
                </button>
                <button
                  onClick={pollRevolut}
                  disabled={polling}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60 shrink-0"
                  title="Pull status from Revolut for any batch still 'processing'"
                >
                  {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh status
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
                        <td className="px-2 py-3 text-right font-bold">€{(p.amount_cents / 100).toFixed(2)}</td>
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
            <h2 className="text-lg font-black mb-4">Batches</h2>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batches yet.</p>
            ) : (
              <div className="space-y-3">
                {batches.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border">
                    <div className="min-w-0">
                      <div className="font-mono font-bold">{b.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.num_payouts} payouts · €{(b.total_cents / 100).toFixed(2)} · created {new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                        {b.sent_at ? ` · sent ${new Date(b.sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${b.status === "sent" ? "bg-emerald-100 text-emerald-700" : b.status === "processing" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                        {b.status}
                      </span>
                      {b.status === "processing" && (
                        <button
                          onClick={() => markSent(b.id)}
                          disabled={marking === b.id}
                          className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {marking === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Mark sent
                        </button>
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
