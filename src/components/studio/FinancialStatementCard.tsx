import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Download, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface StatementTotals {
  currency: string;
  tickets_sold: number;
  gross_cents: number;
  refunds_count: number;
  refunded_cents: number;
  ticketsafe_fee_cents: number;
  stripe_fee_cents: number;
  net_cents: number;
  payouts_paid_cents: number;
  payouts: { id: string; amount_cents: number; currency: string; status: string; date: string | null; bank_last4: string | null }[];
  period_start: string | null;
  period_end: string | null;
}

interface StatementStatus {
  event: { id: string; ends_at: string; available_from: string; ended: boolean; stripe: boolean };
  is_admin: boolean;
  statement: {
    id: string;
    version: number;
    generated_at: string;
    trigger: "cron" | "webhook" | "manual";
    totals: StatementTotals;
    discrepancy?: boolean;
    reconciliation?: { stripe_gross_cents: number; db_gross_cents: number; orders_without_charge: number; charges_without_order: number };
  } | null;
  can_regenerate_at: string | null;
  url?: string;
}

interface Props {
  eventId: string;
  eventDate: string;
  eventEndsAt: string | null;
  paymentProvider: string | null;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "narrowSymbol" }).format(cents / 100);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Calls the event-statement function as the signed-in user. Throws with the function's message on an error. */
async function callStatement<T>(eventId: string, action: string): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-statement`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event_id: eventId, action }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

/** Opens a URL the function will give us in a tab created inside the click, so the browser does not block it. */
async function openFromFunction(eventId: string, action: "download" | "dashboard_link") {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const { url } = await callStatement<{ url: string }>(eventId, action);
    if (tab) tab.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    tab?.close();
    toast.error(err instanceof Error ? err.message : "Something went wrong.");
  }
}

/**
 * "Financial statement" on the event page: the PDF built from the organizer's Stripe account once the event is
 * over (24 h after it ends, then again when a payout is paid), with its headline figures, the download, a
 * single-use link to the Stripe dashboard, and a regeneration at most every 10 minutes.
 */
export function FinancialStatementCard({ eventId, eventDate, eventEndsAt, paymentProvider }: Props) {
  const [status, setStatus] = useState<StatementStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"download" | "stripe" | "regenerate" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setStatus(await callStatement<StatementStatus>(eventId, "status"));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [eventId]);

  useEffect(() => {
    if (paymentProvider === "stripe") void load();
  }, [load, paymentProvider]);

  // The "regenerate in n min" hint counts down.
  useEffect(() => {
    if (!status?.can_regenerate_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [status?.can_regenerate_at]);

  if (paymentProvider !== "stripe") return null;

  const end = new Date(eventEndsAt ?? eventDate);
  const availableFrom = status ? new Date(status.event.available_from) : new Date(end.getTime() + 86_400_000);
  const ended = end.getTime() <= now;
  const available = availableFrom.getTime() <= now;
  const statement = status?.statement ?? null;
  const waitMs = status?.can_regenerate_at ? new Date(status.can_regenerate_at).getTime() - now : 0;
  const canRegenerate = ended && waitMs <= 0;

  const regenerate = async () => {
    setBusy("regenerate");
    try {
      const next = await callStatement<StatementStatus>(eventId, "regenerate");
      setStatus(next);
      setNow(Date.now());
      toast.success(`Statement regenerated (version ${next.statement?.version ?? "?"}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate the statement.");
    } finally {
      setBusy(null);
    }
  };

  const t = statement?.totals;

  return (
    <section className="bg-card border border-border p-4 md:p-5 mb-6" aria-labelledby="statement-heading">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="statement-heading" className="text-sm font-bold flex items-center gap-1.5">
          <FileText className="w-4 h-4" aria-hidden="true" />
          Financial statement
        </h2>
        {statement && (
          <span className="text-[11px] text-muted-foreground text-right">
            Generated {when(statement.generated_at)} · v{statement.version}
          </span>
        )}
      </div>

      {status?.is_admin && statement?.discrepancy && statement.reconciliation && (
        <p className="mb-3 flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 px-3 py-2" role="status">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Discrepancy detected</strong> (admins only): Stripe gross {money(statement.reconciliation.stripe_gross_cents, t?.currency ?? "eur")} vs
            orders {money(statement.reconciliation.db_gross_cents, t?.currency ?? "eur")}
            {statement.reconciliation.orders_without_charge > 0 && <>, {statement.reconciliation.orders_without_charge} order(s) without a Stripe charge</>}
            {statement.reconciliation.charges_without_order > 0 && <>, {statement.reconciliation.charges_without_order} charge(s) without an order</>}.
            The PDF carries Stripe's figures.
          </span>
        </p>
      )}

      {failed ? (
        <p className="text-sm text-muted-foreground">
          The statement could not be loaded.{" "}
          <button type="button" className="font-bold underline underline-offset-2" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : !ended ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
          Available 24 h after the event ends.
        </p>
      ) : !statement && !available ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
          Available from {when(availableFrom.toISOString())}, once the end-of-event payout has had time to appear on Stripe.
        </p>
      ) : !statement ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {status ? "Being prepared from your Stripe account; it is generated automatically within the hour." : "Loading…"}
          </p>
          {status && (
            <Button type="button" size="sm" variant="outline" onClick={() => void regenerate()} disabled={busy !== null || !canRegenerate}>
              <RefreshCw className={`w-4 h-4 ${busy === "regenerate" ? "animate-spin" : ""}`} aria-hidden="true" />
              Generate now
            </Button>
          )}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ["Gross sales", money(t!.gross_cents, t!.currency), `${t!.tickets_sold} ticket${t!.tickets_sold === 1 ? "" : "s"} sold`],
              ["TicketSafe fees", money(t!.ticketsafe_fee_cents, t!.currency), "paid by the buyers"],
              ["Net to you", money(t!.net_cents, t!.currency), t!.refunds_count > 0 ? `after ${t!.refunds_count} refund${t!.refunds_count === 1 ? "" : "s"} (${money(t!.refunded_cents, t!.currency)})` : "no refund"],
              ["Paid out", money(t!.payouts_paid_cents, t!.currency), t!.payouts.length > 0 ? `${t!.payouts.length} payout${t!.payouts.length === 1 ? "" : "s"}` : "no payout yet"],
            ].map(([label, value, sub]) => (
              <div key={label} className="border border-border px-3 py-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="text-lg font-bold leading-tight">{value}</dd>
                <dd className="text-[11px] text-muted-foreground">{sub}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="primary" onClick={() => { setBusy("download"); void openFromFunction(eventId, "download").finally(() => setBusy(null)); }} disabled={busy !== null}>
              <Download className="w-4 h-4" aria-hidden="true" />
              Download PDF
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setBusy("stripe"); void openFromFunction(eventId, "dashboard_link").finally(() => setBusy(null)); }} disabled={busy !== null}>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              View in Stripe
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void regenerate()} disabled={busy !== null || !canRegenerate} title={waitMs > 0 ? `Available again in ${Math.ceil(waitMs / 60_000)} min` : undefined}>
              <RefreshCw className={`w-4 h-4 ${busy === "regenerate" ? "animate-spin" : ""}`} aria-hidden="true" />
              {waitMs > 0 ? `Regenerate in ${Math.ceil(waitMs / 60_000)} min` : "Regenerate"}
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Figures from Stripe's records of your connected account; Stripe's processing fees ({money(t!.stripe_fee_cents, t!.currency)}) are paid by TicketSafe. Updated when a payout is paid. Not an invoice.
          </p>
        </>
      )}
    </section>
  );
}
