/**
 * generate-billing-document — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/generate-billing-document
 * Authorization: Bearer <organizer-or-admin JWT>
 * Body: { event_id: string, doc_type: "sales_statement" | "service_invoice" }
 *
 * Server-side only PDF generation — the client never builds these
 * documents, only ever receives a short-lived signed URL to the file
 * already stored in the private `billing-documents` bucket.
 *
 * Two distinct documents, never mixed:
 *  - sales_statement: the organizer's account of what TicketSafe collected,
 *    kept as its service fee, and owes them. Not an invoice. May be regenerated
 *    while the money hasn't all been paid out (status stays "provisoire"),
 *    frozen once "definitif".
 *  - service_invoice: a real tax invoice for TicketSafe's ticket service fee.
 *    Numbered exactly once via a gapless counter (migration 20261002120000),
 *    immutable from creation — a correction is a credit note (the schema and the
 *    PDF support it; nothing issues one yet).
 *
 * Nothing irreversible happens before every rule has passed: an invoice number is
 * allocated only for an event that is over, has paid tickets that carried a fee,
 * and whose organizer's identity is complete, and only once TicketSafe's own
 * details and VAT regime have been confirmed (see _shared/billingRules.ts).
 *
 * No buyer personal data (name/email) ever appears in either document —
 * only aggregates, per the RGPD requirement.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSalesStatementPdf, type SalesStatementData } from "../_shared/salesStatementPdf.ts";
import { generateServiceInvoicePdf, type ServiceInvoiceData } from "../_shared/serviceInvoicePdf.ts";
import {
  buildInvoiceAmounts,
  clientDetailsBlocker,
  eventEnd,
  invoiceBlocker,
  resolvePenaltyMention,
  sellerSettingsProblems,
  type InvoiceAmounts,
} from "../_shared/billingRules.ts";
import { parisDateKey } from "../_shared/pdfText.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — "short duration" per spec
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Every row of a query, not just the first thousand. A document built from a truncated
 * list would be wrong without any error, which is the one thing a financial document
 * must never be.
 */
// deno-lint-ignore no-explicit-any
async function fetchAll<T>(page: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read the data this document is built from: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

interface OrderRow {
  status: string;
  quantity: number;
  total_cents: number;
  fee_cents: number | null;
  unit_price_cents: number;
  discount_cents: number | null;
  tier_id: string;
  created_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfigured." }, 500);
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing authorization header" }, 401);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { event_id?: string; doc_type?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const eventId = body.event_id;
  const docType = body.doc_type;
  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Invalid event_id" }, 400);
  if (docType !== "sales_statement" && docType !== "service_invoice") {
    return json({ error: "doc_type must be 'sales_statement' or 'service_invoice'" }, 400);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, date, ends_at, status, location, organizer_id, payment_provider")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return json({ error: "Event not found" }, 404);

  const { data: organizer } = await supabase
    .from("organizer_profiles")
    .select("id, user_id, name, siren, rna_number, billing_address_line1, billing_postal_code, billing_city, billing_country")
    .eq("id", event.organizer_id)
    .maybeSingle();
  if (!organizer) return json({ error: "Organizer not found" }, 404);

  if (organizer.user_id !== user.id) {
    const { data: isAdmin } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) return json({ error: "Forbidden — not your event" }, 403);
  }

  const { data: settings } = await supabase.from("billing_settings").select("*").eq("id", true).single();
  if (!settings) return json({ error: "Billing settings missing" }, 500);

  try {
    if (docType === "sales_statement") {
      return await handleSalesStatement(supabase, event, organizer, settings);
    }
    return await handleServiceInvoice(supabase, event, organizer, settings, user.id);
  } catch (err) {
    console.error("[generate-billing-document] error:", err);
    return json({ error: err instanceof Error ? err.message : "Could not generate the document." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function signAndRespond(supabase: any, storagePath: string, extra: Record<string, unknown>) {
  const { data: signed, error } = await supabase.storage
    .from("billing-documents")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) {
    console.error("[generate-billing-document] signed url failed:", error);
    return json({ error: "Could not create a download link." }, 500);
  }
  return json({ ok: true, url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS, ...extra });
}

/** TicketSafe's side of both documents, as the PDFs take it. */
// deno-lint-ignore no-explicit-any
function sellerFrom(settings: any) {
  return {
    legalName: settings.legal_name,
    legalForm: settings.legal_form,
    shareCapitalCents: settings.share_capital_cents,
    siren: settings.siren,
    rcsCity: settings.rcs_city,
    rcsLabel: settings.rcs_full_label ?? null,
    addressLine1: settings.address_line1,
    postalCode: settings.postal_code,
    city: settings.city,
    country: settings.country,
    supportEmail: settings.support_email,
  };
}

// deno-lint-ignore no-explicit-any
function organizerFrom(organizer: any) {
  return {
    name: organizer.name,
    siren: organizer.siren,
    rnaNumber: organizer.rna_number,
    addressLine1: organizer.billing_address_line1,
    postalCode: organizer.billing_postal_code,
    city: organizer.billing_city,
    country: organizer.billing_country,
  };
}

function notReady(problems: string[]) {
  console.error("[generate-billing-document] TicketSafe's billing settings are not ready:", problems.join(", "));
  return json(
    {
      error: "Invoicing isn't open yet: TicketSafe is finishing its billing set-up. Please try again soon.",
      code: "invoicing_not_ready",
    },
    503,
  );
}

// ────────────────────────────────────────────────────────────────────────
// Sales statement
// ────────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleSalesStatement(supabase: any, event: any, organizer: any, settings: any) {
  // A frozen statement is served as it was issued, never rebuilt.
  const { data: existing } = await supabase
    .from("billing_documents")
    .select("status, storage_path, document_number")
    .eq("event_id", event.id)
    .eq("doc_type", "sales_statement")
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.status === "definitif" && existing.storage_path) {
    return signAndRespond(supabase, existing.storage_path, { document_number: existing.document_number, status: "definitif" });
  }

  // The statement doesn't depend on the VAT regime, only on who TicketSafe is.
  const problems = sellerSettingsProblems(settings).filter((p) => !p.startsWith("VAT"));
  if (problems.length > 0) return notReady(problems);

  const rows = await fetchAll<OrderRow>((from, to) =>
    supabase
      .from("event_orders")
      .select("status, quantity, total_cents, fee_cents, unit_price_cents, discount_cents, tier_id, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const paid = rows.filter((r) => r.status === "paid");
  // Only a paid order that was given back. Orders marked "cancelled" are checkouts that were
  // abandoned or timed out: nobody paid, so there is nothing to list.
  const refunded = rows.filter((r) => r.status === "refunded");
  if (paid.length === 0 && refunded.length === 0) {
    return json({ error: "Nothing to report yet: this event has no paid orders.", code: "no_sales" }, 409);
  }

  const { data: tiers } = await supabase.from("event_tiers").select("id, name").eq("event_id", event.id);
  const tierNameById = new Map((tiers ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));

  const paidByBuyersCents = paid.reduce((a, r) => a + r.total_cents, 0);
  const serviceFeeCents = paid.reduce((a, r) => a + (r.fee_cents ?? 0), 0);
  const netCents = paidByBuyersCents - serviceFeeCents;
  const discountCents = paid.reduce((a, r) => a + (r.discount_cents ?? 0), 0);
  const refundedTickets = refunded.reduce((a, r) => a + r.quantity, 0);
  const refundedCents = refunded.reduce((a, r) => a + r.total_cents, 0);

  // One row per tier and ticket price (a price changed in the middle of the sale gives two rows).
  const tierAgg = new Map<string, { tierId: string; unitPriceCents: number; quantity: number; discountCents: number; netCents: number }>();
  for (const r of paid) {
    const key = `${r.tier_id}|${r.unit_price_cents}`;
    const cur = tierAgg.get(key) ?? { tierId: r.tier_id, unitPriceCents: r.unit_price_cents, quantity: 0, discountCents: 0, netCents: 0 };
    cur.quantity += r.quantity;
    cur.discountCents += r.discount_cents ?? 0;
    cur.netCents += r.total_cents - (r.fee_cents ?? 0);
    tierAgg.set(key, cur);
  }
  const tierBreakdown = [...tierAgg.values()]
    .map((v) => ({
      name: String(tierNameById.get(v.tierId) ?? "—"),
      unitPriceCents: v.unitPriceCents,
      quantity: v.quantity,
      discountCents: v.discountCents,
      netCents: v.netCents,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.unitPriceCents - b.unitPriceCents);

  const { resaleCount, resaleVolumeCents } = await resaleSummary(supabase, event.id);
  const payoutStatus = await computePayoutStatus(supabase, organizer.id, event, paid.length > 0);

  const periodStart = paid.length > 0 ? paid[0].created_at : event.date;
  const issuedAt = new Date().toISOString();

  const totals = {
    paid_by_buyers_cents: paidByBuyersCents,
    service_fee_cents: serviceFeeCents,
    net_cents: netCents,
    discount_cents: discountCents,
    refunded_tickets: refundedTickets,
    refunded_cents: refundedCents,
    resale_count: resaleCount,
    resale_volume_cents: resaleVolumeCents,
    tiers: tierBreakdown,
    payout_status: payoutStatus,
  };

  const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_billing_document", {
    p_doc_type: "sales_statement",
    p_organizer_id: organizer.id,
    p_event_id: event.id,
    p_related_invoice_id: null,
    p_totals: totals,
    p_period_start: periodStart,
    p_period_end: issuedAt,
    p_service_date: null,
    p_created_by: null,
  });
  if (reserveErr || !reserved) {
    return json({ error: reserveErr?.message ?? "Could not reserve the statement." }, 409);
  }

  const data: SalesStatementData = {
    documentNumber: reserved.document_number,
    status: payoutStatus,
    issuedAt,
    periodStart,
    periodEnd: issuedAt,
    ticketSafe: sellerFrom(settings),
    organizer: organizerFrom(organizer),
    event: { title: event.title, date: event.date, location: event.location },
    tiers: tierBreakdown,
    paidByBuyersCents,
    serviceFeeCents,
    netCents,
    discountCents,
    refundedTickets,
    refundedCents,
    resaleCount,
    resaleVolumeCents,
  };

  const pdfBytes = await generateSalesStatementPdf(data);
  const hash = await sha256Hex(pdfBytes);
  const storagePath = `${organizer.id}/sales_statement/${reserved.id}.pdf`;

  const { error: upErr } = await supabase.storage.from("billing-documents").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true, // provisoire statements may be regenerated in place
  });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  const { error: finErr } = await supabase.rpc("finalize_billing_document", {
    p_document_id: reserved.id,
    p_storage_path: storagePath,
    p_file_hash: hash,
    p_status: payoutStatus,
  });
  if (finErr) return json({ error: `Could not save the statement: ${finErr.message}` }, 500);

  return signAndRespond(supabase, storagePath, { document_number: reserved.document_number, status: payoutStatus });
}

/**
 * Tickets of this event resold between individuals on TicketSafe, for information.
 * Never part of the statement's amounts, so a failure here only leaves the paragraph out.
 */
// deno-lint-ignore no-explicit-any
async function resaleSummary(supabase: any, eventId: string): Promise<{ resaleCount: number; resaleVolumeCents: number }> {
  try {
    const tickets = await fetchAll<{ id: string }>((from, to) =>
      supabase.from("event_tickets").select("id").eq("event_id", eventId).order("id", { ascending: true }).range(from, to),
    );
    let resaleCount = 0;
    let resaleVolumeCents = 0;
    for (let i = 0; i < tickets.length; i += 100) {
      const { data, error } = await supabase
        .from("tickets")
        .select("selling_price, quantity")
        .in("studio_ticket_id", tickets.slice(i, i + 100).map((t) => t.id))
        .eq("status", "sold");
      if (error) throw error;
      for (const r of data ?? []) {
        const qty = r.quantity ?? 1;
        resaleCount += qty;
        resaleVolumeCents += Math.round((r.selling_price ?? 0) * qty * 100);
      }
    }
    return { resaleCount, resaleVolumeCents };
  } catch (err) {
    console.error("[generate-billing-document] resale summary skipped:", err);
    return { resaleCount: 0, resaleVolumeCents: 0 };
  }
}

/**
 * Has everything owed to the organizer for this event been paid out?
 *
 * Stripe events: exactly, from the event's own payout job. Older (Revolut) events:
 * payouts are a pooled, organizer-level balance (one SEPA transfer can cover several
 * events), not tracked per event. To still answer "has THIS event been paid out", the
 * organizer's net revenue is treated as one running total ordered by event date and
 * compared with their cumulative SENT payouts: an event is "definitif" once the
 * cumulative revenue up to and including it is covered by the transfers sent.
 *
 * ⚠️ For the Revolut events that is a reasonable approximation, not a per-event
 * ledger — flagged for accountant sign-off.
 */
// deno-lint-ignore no-explicit-any
async function computePayoutStatus(supabase: any, organizerId: string, event: any, hasPaidOrders: boolean): Promise<"provisoire" | "definitif"> {
  if (!hasPaidOrders) return "provisoire";

  if (event.payment_provider === "stripe") {
    const { data: job } = await supabase
      .from("stripe_connect_payout_jobs")
      .select("id")
      .eq("event_id", event.id)
      .eq("kind", "organizer_event_payout")
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    return job ? "definitif" : "provisoire";
  }

  const { data: orgEvents } = await supabase.from("events").select("id, date").eq("organizer_id", organizerId).order("date", { ascending: true });
  if ((orgEvents ?? []).length === 0) return "provisoire";

  const orders = await fetchAll<{ event_id: string; total_cents: number; fee_cents: number | null }>((from, to) =>
    supabase
      .from("event_orders")
      .select("event_id, total_cents, fee_cents")
      .eq("organizer_id", organizerId)
      .eq("status", "paid")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  const netByEvent = new Map<string, number>();
  for (const o of orders) {
    netByEvent.set(o.event_id, (netByEvent.get(o.event_id) ?? 0) + o.total_cents - (o.fee_cents ?? 0));
  }

  let cumulative = 0;
  let cumulativeAtTarget = 0;
  for (const e of orgEvents ?? []) {
    cumulative += netByEvent.get(e.id) ?? 0;
    if (e.id === event.id) {
      cumulativeAtTarget = cumulative;
      break;
    }
  }

  const { data: sentPayouts } = await supabase.from("organizer_payouts").select("amount_cents").eq("organizer_id", organizerId).eq("status", "sent");
  const totalSent = (sentPayouts ?? []).reduce((a: number, p: { amount_cents: number }) => a + p.amount_cents, 0);

  return cumulativeAtTarget > 0 && cumulativeAtTarget <= totalSent ? "definitif" : "provisoire";
}

// ────────────────────────────────────────────────────────────────────────
// Service invoice
// ────────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleServiceInvoice(supabase: any, event: any, organizer: any, settings: any, userId: string) {
  // Already issued? Serve the file as it was issued. A provisoire row means an earlier
  // attempt crashed after allocating the number but before finishing: it is resumed below
  // with the SAME row and number, so no number is ever lost.
  const { data: existing } = await supabase
    .from("billing_documents")
    .select("*")
    .eq("event_id", event.id)
    .eq("doc_type", "service_invoice")
    .is("deleted_at", null)
    .maybeSingle();

  if (existing && existing.status === "definitif") {
    return signAndRespond(supabase, existing.storage_path, { document_number: existing.document_number, status: "definitif" });
  }

  const problems = sellerSettingsProblems(settings);

  let reserved = existing;
  if (!reserved) {
    const orders = await fetchAll<{ quantity: number; fee_cents: number | null; unit_price_cents: number | null }>((from, to) =>
      supabase
        .from("event_orders")
        .select("quantity, fee_cents, unit_price_cents")
        .eq("event_id", event.id)
        .eq("status", "paid")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    const blocker = invoiceBlocker({
      event,
      paidTickets: orders.reduce((a, o) => a + o.quantity, 0),
      feeCents: orders.reduce((a, o) => a + (o.fee_cents ?? 0), 0),
      client: { ...organizer },
    });
    // What can't be fixed on the organizer's side comes first; their own details come after
    // TicketSafe's, since completing them wouldn't help while invoicing isn't open.
    if (blocker && blocker.code !== "client_details_missing") return json({ error: blocker.message, code: blocker.code }, 409);
    if (problems.length > 0) return notReady(problems);
    if (blocker) return json({ error: blocker.message, code: blocker.code, missing: blocker.missing }, 422);

    const amounts = buildInvoiceAmounts(orders, { exempt: !!settings.vat_exempt, rateBps: settings.vat_rate_bps ?? 0 });
    const { data: r, error: reserveErr } = await supabase.rpc("reserve_billing_document", {
      p_doc_type: "service_invoice",
      p_organizer_id: organizer.id,
      p_event_id: event.id,
      p_related_invoice_id: null,
      p_totals: amounts,
      p_period_start: null,
      p_period_end: null,
      p_service_date: parisDateKey(eventEnd(event)),
      p_created_by: userId,
    });
    if (reserveErr || !r) return json({ error: reserveErr?.message ?? "Could not reserve the invoice number." }, 409);
    reserved = r;
  } else {
    // The number is already spent, so the invoice still has to end up complete before it is issued.
    if (problems.length > 0) return notReady(problems);
    const blocker = clientDetailsBlocker(organizer);
    if (blocker) return json({ error: blocker.message, code: blocker.code, missing: blocker.missing }, 422);
  }

  const amounts = reserved.totals as InvoiceAmounts;
  if (!Array.isArray(amounts?.lines) || amounts.lines.length === 0) {
    throw new Error(`Invoice ${reserved.document_number} has no line items stored; it cannot be completed automatically.`);
  }

  const data: ServiceInvoiceData = {
    documentNumber: reserved.document_number,
    issuedAt: reserved.issued_at,
    serviceDate: (eventEnd(event) ?? new Date(reserved.issued_at)).toISOString(),
    seller: {
      ...sellerFrom(settings),
      vatExempt: !!settings.vat_exempt,
      vatNumber: settings.vat_number,
      vatOnDebits: !!settings.vat_on_debits,
      vatExemptMention: settings.vat_exempt_mention,
      latePaymentMention: resolvePenaltyMention(settings.late_payment_penalty_mention),
    },
    client: organizerFrom(organizer),
    eventTitle: event.title,
    eventDate: event.date,
    lines: amounts.lines,
    vatRateBps: amounts.vatRateBps,
    totalHtCents: amounts.totalHtCents,
    totalVatCents: amounts.totalVatCents,
    totalTtcCents: amounts.totalTtcCents,
  };

  const pdfBytes = await generateServiceInvoicePdf(data);
  const hash = await sha256Hex(pdfBytes);
  const storagePath = `${organizer.id}/service_invoice/${reserved.id}.pdf`;

  // A concurrent request may have completed this invoice while this one was drawing it.
  const { data: current } = await supabase.from("billing_documents").select("status, storage_path").eq("id", reserved.id).single();
  if (current?.status === "definitif") {
    return signAndRespond(supabase, current.storage_path, { document_number: reserved.document_number, status: "definitif" });
  }

  // The file is deterministic, so writing it twice leaves the same bytes and the same hash.
  const { error: upErr } = await supabase.storage.from("billing-documents").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  // Structured line items — Factur-X-ready data (TODO: actual Factur-X export is not
  // implemented; this just stores the data normalized so a future export doesn't need to
  // re-derive it from the PDF). Written before the invoice is finalized, and only once.
  const { count: storedLines } = await supabase
    .from("billing_document_lines")
    .select("id", { count: "exact", head: true })
    .eq("document_id", reserved.id);
  if (!storedLines) {
    const { error: linesErr } = await supabase.from("billing_document_lines").insert(
      data.lines.map((l, i) => ({
        document_id: reserved.id,
        line_no: i + 1,
        description: [l.description, event.title, l.detail].filter(Boolean).join(" – "),
        quantity: l.quantity,
        unit_price_cents: l.unitPriceHtCents,
        vat_rate_bps: l.vatRateBps,
        vat_cents: l.vatCents,
        total_ht_cents: l.totalHtCents,
        total_ttc_cents: l.totalTtcCents,
      })),
    );
    if (linesErr) return json({ error: `Could not save the invoice lines: ${linesErr.message}` }, 500);
  }

  const { error: finErr } = await supabase.rpc("finalize_billing_document", {
    p_document_id: reserved.id,
    p_storage_path: storagePath,
    p_file_hash: hash,
    p_status: "definitif",
  });
  if (finErr) return json({ error: `Could not save the invoice: ${finErr.message}` }, 500);

  return signAndRespond(supabase, storagePath, { document_number: reserved.document_number, status: "definitif" });
}
