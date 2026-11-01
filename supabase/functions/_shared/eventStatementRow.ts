/**
 * The event_statements row and the small helpers the light functions need (the ones that never generate a
 * statement themselves): kept apart from eventStatement.ts so they do not carry the PDF and Stripe modules.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type StatementTrigger = "cron" | "webhook" | "manual";

/** What the row stores for the Studio page: the primary currency's figures, every currency, payouts and balance. */
export interface StatementTotals {
  currency: string;
  tickets_sold: number;
  gross_cents: number;
  refunds_count: number;
  refunded_cents: number;
  ticketsafe_fee_cents: number;
  stripe_fee_cents: number;
  net_cents: number;
  net_source: "connected_account" | "platform";
  payouts_paid_cents: number;
  payouts: { id: string; amount_cents: number; currency: string; status: string; date: string | null; bank_last4: string | null }[];
  balance: { available: { currency: string; amount_cents: number }[]; pending: { currency: string; amount_cents: number }[] };
  period_start: string | null;
  period_end: string | null;
  by_currency: unknown[];
  reconciliation: { stripe_gross_cents: number; db_gross_cents: number; orders_without_charge: number; charges_without_order: number };
}

export interface StatementRow {
  id: string;
  event_id: string;
  organizer_id: string;
  stripe_account_id: string;
  version: number;
  storage_path: string;
  generated_at: string;
  trigger: StatementTrigger;
  totals: StatementTotals;
  discrepancy: boolean;
  data_hash: string;
  transactions_count: number;
}

export const STATEMENTS_BUCKET = "statements";

/** The latest statement of an event, or null. */
export async function latestStatement(supabase: SupabaseClient, eventId: string): Promise<StatementRow | null> {
  const { data } = await supabase.from("event_statements").select("*").eq("event_id", eventId).order("version", { ascending: false }).limit(1).maybeSingle();
  return (data ?? null) as StatementRow | null;
}

/** The internal generator (the event-statements function), called from the light functions with the cron secret. */
export async function callStatementGenerator(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("SUPABASE_URL not configured");
  const res = await fetch(`${base}/functions/v1/event-statements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": Deno.env.get("STRIPE_PAYOUT_CRON_SECRET") ?? "",
      // The gateway wants a JWT when verify_jwt is on; the function itself checks the secret above.
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: json };
}
