/**
 * generateEventStatement(): one event's financial statement from Stripe, as a PDF in the private "statements"
 * bucket and a row in event_statements, with the figures the Studio page shows without opening the file.
 *
 * Idempotent: the data that can change the figures is fingerprinted (statementFingerprint); when the latest
 * statement of the event was made from the same data, nothing new is generated and that statement is returned.
 * A manual regeneration (`force`) always produces a new version. Versions are kept: the storage path carries the
 * time of generation, and the row carries the version number; the Studio page shows the latest.
 *
 * Reconciliation: Stripe's gross is compared with our orders; a difference is logged and flagged on the row (for
 * the admins' banner) but the statement is produced with Stripe's figures regardless.
 */
import type Stripe from "npm:stripe@14.21.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { collectEventStatementData } from "./eventStatementData.ts";
import { aggregate, reconcile, statementFingerprint, formatMoney, STATEMENT_VAT_LINE } from "./eventStatementMath.ts";
import { generateEventStatementPdf } from "./eventStatementPdf.ts";
import { renderEmail, ctaButton, escapeHtml } from "./emailComponents.ts";
import { emailTokens, legalFooter } from "./emailTokens.ts";

export type { StatementRow, StatementTotals, StatementTrigger } from "./eventStatementRow.ts";
export { STATEMENTS_BUCKET, latestStatement } from "./eventStatementRow.ts";
import { STATEMENTS_BUCKET, type StatementRow, type StatementTotals, type StatementTrigger } from "./eventStatementRow.ts";

export type GenerateOutcome =
  | { outcome: "generated"; statement: StatementRow; first: boolean }
  | { outcome: "unchanged"; statement: StatementRow }
  | { outcome: "skipped"; reason: "event_not_found" | "organizer_not_found" | "no_connect_account" | "not_stripe" | "no_sales" };

export interface GenerateArgs {
  eventId: string;
  trigger: StatementTrigger;
  /** A new version even when the data has not changed (manual regeneration). */
  force?: boolean;
  /** Produce a statement for an event without any Stripe payment (manual regeneration does; the cron does not). */
  allowEmpty?: boolean;
}

const iso = (unix: number | null) => (unix === null ? null : new Date(unix * 1000).toISOString());

export async function generateEventStatement(
  deps: { supabase: SupabaseClient; stripe: Stripe; resendKey?: string | null; siteUrl?: string },
  args: GenerateArgs,
): Promise<GenerateOutcome> {
  const { supabase, stripe } = deps;
  const siteUrl = deps.siteUrl ?? emailTokens.siteUrl;
  const startedAt = Date.now();
  const tag = `[event-statement] event=${args.eventId} trigger=${args.trigger}`;

  const { data: event } = await supabase
    .from("events")
    .select("id, title, date, ends_at, location, organizer_id, status, payment_provider")
    .eq("id", args.eventId)
    .maybeSingle();
  if (!event) return { outcome: "skipped", reason: "event_not_found" };
  if (event.payment_provider !== "stripe") return { outcome: "skipped", reason: "not_stripe" };

  const { data: organizer } = await supabase
    .from("organizer_profiles")
    .select("id, name, contact_email, user_id")
    .eq("id", event.organizer_id)
    .maybeSingle();
  if (!organizer) return { outcome: "skipped", reason: "organizer_not_found" };

  const { data: account } = await supabase
    .from("stripe_connect_accounts")
    .select("stripe_account_id")
    .eq("organizer_id", organizer.id)
    .maybeSingle();
  if (!account?.stripe_account_id) return { outcome: "skipped", reason: "no_connect_account" };

  const data = await collectEventStatementData(stripe, supabase, event.id, account.stripe_account_id);
  if (data.charges.length === 0 && data.dbOrders.length === 0 && !args.allowEmpty) {
    console.log(`${tag} skipped: no Stripe payment (${data.stripeCalls} Stripe calls)`);
    return { outcome: "skipped", reason: "no_sales" };
  }

  const { totals, rows } = aggregate({ charges: data.charges, connected: data.connected, orderQuantities: data.orderQuantities });
  const reconciliation = reconcile(data.charges, data.dbOrders);
  const fingerprint = statementFingerprint({ charges: data.charges, connected: data.connected, payouts: data.payouts });

  const { data: latest } = await supabase
    .from("event_statements")
    .select("*")
    .eq("event_id", event.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previous = (latest ?? null) as StatementRow | null;
  if (previous && !args.force && previous.data_hash === fingerprint) {
    console.log(`${tag} unchanged: same data as v${previous.version} (${data.stripeCalls} Stripe calls, ${Date.now() - startedAt} ms)`);
    return { outcome: "unchanged", statement: previous };
  }

  const primary = totals[0] ?? null;
  const currency = primary?.currency ?? "eur";
  const generatedAt = new Date();
  const version = (previous?.version ?? 0) + 1;
  const statementTotals: StatementTotals = {
    currency,
    tickets_sold: primary?.ticketsSold ?? 0,
    gross_cents: primary?.grossCents ?? 0,
    refunds_count: primary?.refundsCount ?? 0,
    refunded_cents: primary?.refundedCents ?? 0,
    ticketsafe_fee_cents: primary?.ticketSafeFeeCents ?? 0,
    stripe_fee_cents: primary?.stripeFeeCents ?? 0,
    net_cents: primary?.netToOrganizerCents ?? 0,
    net_source: primary?.netSource ?? "platform",
    payouts_paid_cents: data.payouts.filter((p) => p.status === "paid" && p.currency === currency).reduce((s, p) => s + p.amount, 0),
    payouts: data.payouts.map((p) => ({ id: p.id, amount_cents: p.amount, currency: p.currency, status: p.status, date: iso(p.arrivalDate ?? p.created), bank_last4: p.bankLast4 })),
    balance: {
      available: data.balance.available.map((l) => ({ currency: l.currency, amount_cents: l.amountCents })),
      pending: data.balance.pending.map((l) => ({ currency: l.currency, amount_cents: l.amountCents })),
    },
    period_start: iso(data.period.start),
    period_end: iso(data.period.end),
    by_currency: totals,
    reconciliation: {
      stripe_gross_cents: reconciliation.stripeGrossCents,
      db_gross_cents: reconciliation.dbGrossCents,
      orders_without_charge: reconciliation.ordersWithoutCharge.length,
      charges_without_order: reconciliation.chargesWithoutOrder.length,
    },
  };

  if (reconciliation.discrepancy) {
    console.warn(
      `${tag} DISCREPANCY: Stripe gross ${reconciliation.stripeGrossCents} vs orders ${reconciliation.dbGrossCents}; ` +
        `orders without charge: ${reconciliation.ordersWithoutCharge.join(",") || "none"}; charges without order: ${reconciliation.chargesWithoutOrder.join(",") || "none"}`,
    );
  }

  const pdf = await generateEventStatementPdf({
    event: { title: event.title ?? "Event", date: event.date, endsAt: event.ends_at, location: event.location },
    organizer: { name: organizer.name },
    stripeAccountId: account.stripe_account_id,
    period: data.period,
    generatedAt: generatedAt.toISOString(),
    version,
    totals,
    rows,
    payouts: data.payouts,
    balance: data.balance,
    studioEventUrl: `${siteUrl}/studio/events/${event.id}`,
    footer: `${legalFooter.companyLine} · ${legalFooter.supportEmail} · Figures sourced from Stripe; this statement is not an invoice.`,
    vatLine: STATEMENT_VAT_LINE,
  });

  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const storagePath = `organizers/${organizer.id}/events/${event.id}/statement-${stamp}.pdf`;
  const { error: upErr } = await supabase.storage.from(STATEMENTS_BUCKET).upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Statement upload failed: ${upErr.message}`);

  const { data: inserted, error: insErr } = await supabase
    .from("event_statements")
    .insert({
      event_id: event.id,
      organizer_id: organizer.id,
      stripe_account_id: account.stripe_account_id,
      version,
      storage_path: storagePath,
      generated_at: generatedAt.toISOString(),
      trigger: args.trigger,
      totals: statementTotals,
      discrepancy: reconciliation.discrepancy,
      data_hash: fingerprint,
      transactions_count: rows.length,
    })
    .select("*")
    .single();
  if (insErr || !inserted) throw new Error(`Statement row insert failed: ${insErr?.message ?? "no row"}`);

  console.log(
    `${tag} generated v${version}: ${rows.length} transactions, gross ${formatMoney(statementTotals.gross_cents, currency)}, ` +
      `refunded ${formatMoney(statementTotals.refunded_cents, currency)}, net ${formatMoney(statementTotals.net_cents, currency)}, ` +
      `${data.payouts.length} payout(s), discrepancy=${reconciliation.discrepancy}, ${data.stripeCalls} Stripe calls, ${Date.now() - startedAt} ms, ${pdf.byteLength} bytes`,
  );

  const first = version === 1;
  if (first && deps.resendKey && organizer.contact_email) {
    await sendStatementReadyEmail(deps.resendKey, organizer.contact_email, event.title ?? "your event", `${siteUrl}/studio/events/${event.id}`).catch((err) =>
      console.warn(`${tag} email failed:`, err instanceof Error ? err.message : err),
    );
  }

  return { outcome: "generated", statement: inserted as StatementRow, first };
}

async function sendStatementReadyEmail(resendKey: string, to: string, eventTitle: string, studioUrl: string): Promise<void> {
  const title = "Your financial statement is ready";
  const bodyHtml =
    `<p style="margin:0 0 4px">The financial statement of <strong>${escapeHtml(eventTitle)}</strong> is ready in Ticket Studio: tickets sold, refunds, fees, the net amount and the payouts to your bank, all from Stripe's records.</p>` +
    ctaButton("Open the event in Ticket Studio", studioUrl) +
    `<p style="margin:16px 0 0;font-size:13px;color:${emailTokens.textMuted}">Download the PDF from the "Financial statement" card. It is updated when a payout is paid.</p>`;
  const text = `The financial statement of ${eventTitle} is ready in Ticket Studio: ${studioUrl}`;
  const { html } = renderEmail({ eyebrow: "Ticket Studio", title, bodyHtml, preheader: `Statement ready for ${eventTitle}`, text });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject: `${title} — ${eventTitle}`, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}
