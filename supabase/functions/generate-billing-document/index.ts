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
 *  - sales_statement: informal reddition de comptes for the organizer.
 *    May be regenerated while the event's revenue isn't fully paid out
 *    yet (status stays "provisoire"); frozen once "definitif" (see the
 *    FIFO payout-allocation note below — flagged for accountant review).
 *  - service_invoice: a real legal tax invoice for TicketSafe's per-ticket
 *    ticket service fee. Numbered exactly once via a gapless counter
 *    (see migration 20261002120000), immutable from creation — corrections
 *    would be a credit note (schema supports it; no UI trigger for it
 *    yet, see delivery report).
 *
 * No buyer personal data (name/email) ever appears in either document —
 * only aggregates, per the RGPD requirement.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSalesStatementPdf, type SalesStatementData } from "../_shared/salesStatementPdf.ts";
import { generateServiceInvoicePdf, type ServiceInvoiceData } from "../_shared/serviceInvoicePdf.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — "short duration" per spec

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    .select("id, title, date, location, organizer_id")
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

// ────────────────────────────────────────────────────────────────────────
// Sales statement
// ────────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleSalesStatement(supabase: any, event: any, organizer: any, settings: any) {
  const { data: orders } = await supabase
    .from("event_orders")
    .select("status, quantity, total_cents, fee_cents, unit_price_cents, tier_id, created_at")
    .eq("event_id", event.id);
  const rows: { status: string; quantity: number; total_cents: number; fee_cents: number; unit_price_cents: number; tier_id: string; created_at: string }[] = orders ?? [];

  const { data: tiers } = await supabase.from("event_tiers").select("id, name").eq("event_id", event.id);
  const tierNameById = new Map((tiers ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));

  const paid = rows.filter((r) => r.status === "paid");
  const refunded = rows.filter((r) => r.status === "refunded" || r.status === "cancelled");

  const grossCents = paid.reduce((a, r) => a + r.total_cents, 0);
  const ticketSafeFeeCents = paid.reduce((a, r) => a + (r.fee_cents ?? 0), 0);
  const netCents = grossCents - ticketSafeFeeCents;
  const refundCount = refunded.reduce((a, r) => a + r.quantity, 0);
  const refundCents = refunded.reduce((a, r) => a + r.total_cents, 0);

  const tierAgg = new Map<string, { soldQty: number; unitPriceCents: number; totalCents: number }>();
  for (const r of paid) {
    const cur = tierAgg.get(r.tier_id) ?? { soldQty: 0, unitPriceCents: r.unit_price_cents, totalCents: 0 };
    cur.soldQty += r.quantity;
    cur.totalCents += r.total_cents - (r.fee_cents ?? 0); // net of TicketSafe's fee, this is what the tier earned the organizer
    tierAgg.set(r.tier_id, cur);
  }
  const tierBreakdown = Array.from(tierAgg.entries()).map(([tierId, v]) => ({
    name: String(tierNameById.get(tierId) ?? "—"),
    soldQty: v.soldQty,
    unitPriceCents: v.unitPriceCents,
    totalCents: v.totalCents,
  }));

  // Resales (informational) — tickets resold on TicketSafe that originated
  // from this event's Studio tickets.
  const { data: eventTickets } = await supabase.from("event_tickets").select("id").eq("event_id", event.id);
  const eventTicketIds = (eventTickets ?? []).map((t: { id: string }) => t.id);
  let resaleCount = 0, resaleGrossCents = 0, resaleFeeCents = 0;
  if (eventTicketIds.length > 0) {
    const { data: resales } = await supabase
      .from("tickets")
      .select("selling_price, quantity")
      .in("studio_ticket_id", eventTicketIds)
      .eq("status", "sold");
    for (const r of resales ?? []) {
      const qty = r.quantity ?? 1;
      const grossEuro = (r.selling_price ?? 0) * qty;
      resaleCount += qty;
      resaleGrossCents += Math.round(grossEuro * 100);
      resaleFeeCents += Math.round(grossEuro * 100 * 0.06); // buyer-side fee estimate, informational only
    }
  }

  // FIFO payout-allocation check — see header note in generateFifoPayoutStatus.
  const payoutStatus = await computeFifoPayoutStatus(supabase, organizer.id, event.id);

  const periodStart = paid.length > 0 ? paid.map((r) => r.created_at).sort()[0] : event.date;
  const periodEnd = new Date().toISOString();

  const totals = {
    gross_cents: grossCents,
    ticketsafe_fee_cents: ticketSafeFeeCents,
    net_cents: netCents,
    refund_count: refundCount,
    refund_cents: refundCents,
    resale_count: resaleCount,
    resale_gross_cents: resaleGrossCents,
    resale_fee_cents: resaleFeeCents,
    tier_breakdown: tierBreakdown,
    payout_status: payoutStatus,
  };

  const { data: reserved, error: reserveErr } = await supabase.rpc("reserve_billing_document", {
    p_doc_type: "sales_statement",
    p_organizer_id: organizer.id,
    p_event_id: event.id,
    p_related_invoice_id: null,
    p_totals: totals,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_service_date: null,
    p_created_by: null,
  });
  if (reserveErr || !reserved) {
    return json({ error: reserveErr?.message ?? "Could not reserve the statement." }, 409);
  }

  const data: SalesStatementData = {
    documentNumber: reserved.document_number,
    status: payoutStatus,
    issuedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    ticketSafe: {
      legalName: settings.legal_name,
      addressLine1: settings.address_line1,
      postalCode: settings.postal_code,
      city: settings.city,
      country: settings.country,
      supportEmail: settings.support_email,
    },
    organizer: {
      name: organizer.name,
      siren: organizer.siren,
      rnaNumber: organizer.rna_number,
      addressLine1: organizer.billing_address_line1,
      postalCode: organizer.billing_postal_code,
      city: organizer.billing_city,
      country: organizer.billing_country,
    },
    event: { title: event.title, date: event.date, location: event.location },
    tierBreakdown,
    grossCents,
    ticketSafeFeeCents,
    netCents,
    refundCount,
    refundCents,
    resaleCount,
    resaleGrossCents,
    resaleFeeCents,
  };

  const pdfBytes = await generateSalesStatementPdf(data);
  const hash = await sha256Hex(pdfBytes);
  const storagePath = `${organizer.id}/sales_statement/${reserved.id}.pdf`;

  const { error: upErr } = await supabase.storage.from("billing-documents").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true, // provisoire statements may be regenerated in place
  });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  await supabase.rpc("finalize_billing_document", {
    p_document_id: reserved.id,
    p_storage_path: storagePath,
    p_file_hash: hash,
    p_status: payoutStatus,
  });

  return signAndRespond(supabase, storagePath, { document_number: reserved.document_number, status: payoutStatus });
}

/**
 * FIFO payout-allocation: payouts are a pooled, organizer-level balance
 * (one SEPA transfer can cover several events), not tracked per event. To
 * still give a meaningful "has THIS event been paid out" answer, we treat
 * the organizer's net revenue as one running total ordered by event date,
 * and compare it against their cumulative SENT payouts: an event is
 * "definitif" once the cumulative revenue *up to and including it* is
 * covered by cumulative sent transfers.
 *
 * ⚠️ This is a reasonable approximation, not a true per-event ledger —
 * flagged in the delivery report for accountant sign-off. If the
 * organizer ever withdraws selectively or the payout system gains real
 * per-event allocation, this logic should be revisited.
 */
// deno-lint-ignore no-explicit-any
async function computeFifoPayoutStatus(supabase: any, organizerId: string, eventId: string): Promise<"provisoire" | "definitif"> {
  const { data: orgEvents } = await supabase.from("events").select("id, date").eq("organizer_id", organizerId).order("date", { ascending: true });
  const eventIds = (orgEvents ?? []).map((e: { id: string }) => e.id);
  if (eventIds.length === 0) return "provisoire";

  const { data: orders } = await supabase
    .from("event_orders")
    .select("event_id, total_cents, fee_cents")
    .in("event_id", eventIds)
    .eq("status", "paid");

  const netByEvent = new Map<string, number>();
  for (const o of orders ?? []) {
    netByEvent.set(o.event_id, (netByEvent.get(o.event_id) ?? 0) + o.total_cents - (o.fee_cents ?? 0));
  }

  let cumulative = 0;
  let cumulativeAtTarget = 0;
  for (const e of orgEvents ?? []) {
    cumulative += netByEvent.get(e.id) ?? 0;
    if (e.id === eventId) {
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
  // Already generated? Serve the existing file (definitif => always;
  // provisoire => a previous attempt crashed after reserving the number
  // but before uploading — resume with the SAME row/number below).
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

  let reserved = existing;
  let ticketCount = 0;
  let feeTotalCents = 0;

  if (!reserved) {
    const { data: orders } = await supabase.from("event_orders").select("quantity, fee_cents").eq("event_id", event.id).eq("status", "paid");
    for (const o of orders ?? []) {
      ticketCount += o.quantity;
      feeTotalCents += o.fee_cents ?? 0;
    }
    if (ticketCount === 0) return json({ error: "Nothing to invoice yet — no paid tickets for this event." }, 400);

    const vatExempt = !!settings.vat_exempt;
    const vatRateBps = settings.vat_rate_bps ?? 0;
    const totalTtcCents = feeTotalCents;
    const totalHtCents = vatExempt ? totalTtcCents : Math.round(totalTtcCents / (1 + vatRateBps / 10000));
    const vatCents = totalTtcCents - totalHtCents;

    const totals = { ticket_count: ticketCount, total_ht_cents: totalHtCents, vat_cents: vatCents, total_ttc_cents: totalTtcCents, vat_rate_bps: vatExempt ? 0 : vatRateBps };

    const { data: r, error: reserveErr } = await supabase.rpc("reserve_billing_document", {
      p_doc_type: "service_invoice",
      p_organizer_id: organizer.id,
      p_event_id: event.id,
      p_related_invoice_id: null,
      p_totals: totals,
      p_period_start: null,
      p_period_end: null,
      p_service_date: event.date,
      p_created_by: userId,
    });
    if (reserveErr || !r) return json({ error: reserveErr?.message ?? "Could not reserve the invoice number." }, 409);
    reserved = r;
  } else {
    // Resuming a crashed attempt — use the already-committed totals/number.
    ticketCount = reserved.totals?.ticket_count ?? 0;
    feeTotalCents = reserved.totals?.total_ttc_cents ?? 0;
  }

  const totals = reserved.totals as { ticket_count: number; total_ht_cents: number; vat_cents: number; total_ttc_cents: number; vat_rate_bps: number };
  const unitPriceHtCents = totals.ticket_count > 0 ? Math.round(totals.total_ht_cents / totals.ticket_count) : 0;

  const data: ServiceInvoiceData = {
    documentNumber: reserved.document_number,
    issuedAt: new Date().toISOString(),
    serviceDate: event.date,
    seller: {
      legalName: settings.legal_name,
      legalForm: settings.legal_form,
      shareCapitalCents: settings.share_capital_cents,
      siren: settings.siren,
      rcsCity: settings.rcs_city,
      addressLine1: settings.address_line1,
      postalCode: settings.postal_code,
      city: settings.city,
      country: settings.country,
      vatExempt: settings.vat_exempt,
      vatNumber: settings.vat_number,
      vatExemptMention: settings.vat_exempt_mention,
      latePaymentPenaltyMention: settings.late_payment_penalty_mention,
      supportEmail: settings.support_email,
    },
    client: {
      name: organizer.name,
      siren: organizer.siren,
      rnaNumber: organizer.rna_number,
      addressLine1: organizer.billing_address_line1,
      postalCode: organizer.billing_postal_code,
      city: organizer.billing_city,
      country: organizer.billing_country,
    },
    eventTitle: event.title,
    lines: [
      {
        description: `Frais de service billetterie – ${event.title}`,
        quantity: totals.ticket_count,
        unitPriceCents: unitPriceHtCents,
        vatRateBps: totals.vat_rate_bps,
        vatCents: totals.vat_cents,
        totalHtCents: totals.total_ht_cents,
        totalTtcCents: totals.total_ttc_cents,
      },
    ],
    totalHtCents: totals.total_ht_cents,
    totalVatCents: totals.vat_cents,
    totalTtcCents: totals.total_ttc_cents,
  };

  const pdfBytes = await generateServiceInvoicePdf(data);
  const hash = await sha256Hex(pdfBytes);
  const storagePath = `${organizer.id}/service_invoice/${reserved.id}.pdf`;

  const { error: upErr } = await supabase.storage.from("billing-documents").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false, // invoices are write-once
  });
  if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

  await supabase.rpc("finalize_billing_document", {
    p_document_id: reserved.id,
    p_storage_path: storagePath,
    p_file_hash: hash,
    p_status: "definitif",
  });

  // Structured line items — Factur-X-ready data (TODO: actual Factur-X
  // export is not implemented; this just stores the data normalized so a
  // future export doesn't need to re-derive it from the PDF).
  await supabase.from("billing_document_lines").insert(
    data.lines.map((l, i) => ({
      document_id: reserved.id,
      line_no: i + 1,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
      vat_rate_bps: l.vatRateBps,
      vat_cents: l.vatCents,
      total_ht_cents: l.totalHtCents,
      total_ttc_cents: l.totalTtcCents,
    })),
  );

  return signAndRespond(supabase, storagePath, { document_number: reserved.document_number, status: "definitif" });
}
