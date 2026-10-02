#!/usr/bin/env node
/**
 * Concurrency test for gapless invoice/credit-note numbering
 * (public.reserve_billing_document / billing_document_counters — see
 * supabase/migrations/20261002120000_billing_documents_core.sql).
 *
 * !!! DO NOT RUN THIS AGAINST THE PRODUCTION PROJECT (lgmnatfvdzzjzyxlenry) !!!
 * It burns real invoice/credit-note numbers and inserts real rows. Point
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at a staging project seeded
 * with a copy of the schema, plus one disposable test organizer + event.
 *
 * Needs the SERVICE ROLE key (not anon) — reserve_billing_document is
 * intentionally un-callable by anon/authenticated, only service_role.
 *
 * What it does:
 *
 *  Test 1 — raw concurrency, no per-event collision
 *    Fires CONCURRENCY concurrent reserve_billing_document(doc_type=
 *    'credit_note', ...) calls (credit notes aren't constrained to one-
 *    per-event, so none of these should conflict with each other).
 *    Asserts: every returned document_number is unique, and the set of
 *    numeric suffixes extracted from them is an exact, contiguous run —
 *    i.e. the counter advanced by exactly CONCURRENCY with no gaps and
 *    no duplicates, even though all calls raced.
 *
 *  Test 2 — same event, same doc_type, forced collision
 *    Fires CONCURRENCY concurrent reserve_billing_document(doc_type=
 *    'service_invoice', ...) calls for the SAME event_id (which the
 *    partial unique index only allows one of to ever stay committed).
 *    Asserts: exactly one invoice number was consumed net (the losing
 *    calls' number allocation rolled back with their failed insert —
 *    this is the whole point of using a locked counter table instead of
 *    a bare `CREATE SEQUENCE`, which would have leaked N-1 numbers here).
 *
 * Usage:
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
 *   TEST_ORGANIZER_ID=<uuid of a disposable test organizer> \
 *   TEST_EVENT_ID=<uuid of a disposable test event, owned by that organizer> \
 *   CONCURRENCY=20 \
 *   node scripts/load-test/concurrency-billing-numbering.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_ORGANIZER_ID = process.env.TEST_ORGANIZER_ID;
const TEST_EVENT_ID = process.env.TEST_EVENT_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);

if (!SUPABASE_URL || !SERVICE_KEY || !TEST_ORGANIZER_ID || !TEST_EVENT_ID) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TEST_ORGANIZER_ID / TEST_EVENT_ID env vars.");
  process.exit(1);
}
if (SUPABASE_URL.includes("lgmnatfvdzzjzyxlenry")) {
  console.error("Refusing to run: this points at the PRODUCTION project. Use a staging project.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function parseSeq(documentNumber) {
  // "TS-A-2026-000045" / "TS-F-2026-000012" -> 45 / 12
  const m = /-(\d+)$/.exec(documentNumber);
  if (!m) throw new Error(`Could not parse sequence from ${documentNumber}`);
  return Number(m[1]);
}

async function getCounter(docType) {
  const { data, error } = await supabase
    .from("billing_document_counters")
    .select("last_number")
    .eq("doc_type", docType)
    .single();
  if (error) throw error;
  return data.last_number;
}

async function testRawConcurrency() {
  console.log(`\n=== Test 1: ${CONCURRENCY} concurrent credit_note reservations (no collision) ===`);
  const before = await getCounter("credit_note");

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }).map(() =>
      supabase.rpc("reserve_billing_document", {
        p_doc_type: "credit_note",
        p_organizer_id: TEST_ORGANIZER_ID,
        p_event_id: TEST_EVENT_ID,
        p_related_invoice_id: null,
        p_totals: {},
        p_period_start: null,
        p_period_end: null,
        p_service_date: null,
        p_created_by: null,
      }),
    ),
  );

  const errors = results.filter((r) => r.error);
  const numbers = results.filter((r) => !r.error).map((r) => r.data.document_number);
  const seqs = numbers.map(parseSeq).sort((a, b) => a - b);
  const after = await getCounter("credit_note");

  const allSucceeded = errors.length === 0;
  const allUnique = new Set(numbers).size === numbers.length;
  const counterAdvancedExactly = after - before === CONCURRENCY;
  const contiguous = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
  const startsRight = seqs[0] === before + 1;

  console.log({ before, after, delta: after - before, errors: errors.length, seqs });
  console.log(`All calls succeeded: ${allSucceeded ? "PASS" : "FAIL"}`);
  console.log(`All numbers unique: ${allUnique ? "PASS" : "FAIL"}`);
  console.log(`Counter advanced by exactly CONCURRENCY: ${counterAdvancedExactly ? "PASS" : "FAIL"}`);
  console.log(`Sequence is contiguous (no gaps): ${contiguous ? "PASS" : "FAIL"}`);
  console.log(`Sequence starts right after prior value: ${startsRight ? "PASS" : "FAIL"}`);

  return allSucceeded && allUnique && counterAdvancedExactly && contiguous && startsRight;
}

async function testForcedCollision() {
  console.log(`\n=== Test 2: ${CONCURRENCY} concurrent service_invoice reservations, SAME event (forced collision) ===`);

  // Clean slate: make sure no invoice already exists for this test event.
  await supabase.from("billing_documents").delete().eq("event_id", TEST_EVENT_ID).eq("doc_type", "service_invoice");

  const before = await getCounter("service_invoice");

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }).map(() =>
      supabase.rpc("reserve_billing_document", {
        p_doc_type: "service_invoice",
        p_organizer_id: TEST_ORGANIZER_ID,
        p_event_id: TEST_EVENT_ID,
        p_related_invoice_id: null,
        p_totals: { ticket_count: 1, total_ht_cents: 140, vat_cents: 0, total_ttc_cents: 140, vat_rate_bps: 0 },
        p_period_start: null,
        p_period_end: null,
        p_service_date: "2026-01-01",
        p_created_by: null,
      }),
    ),
  );

  const after = await getCounter("service_invoice");
  const succeeded = results.filter((r) => !r.error);
  const numbers = new Set(succeeded.map((r) => r.data.document_number));

  const { data: rows } = await supabase
    .from("billing_documents")
    .select("id, document_number")
    .eq("event_id", TEST_EVENT_ID)
    .eq("doc_type", "service_invoice");

  const exactlyOneRow = rows.length === 1;
  const counterAdvancedByOne = after - before === 1;
  const allSucceededCallsAgreeOnNumber = numbers.size === 1;

  console.log({ before, after, delta: after - before, rowsForEvent: rows.length, distinctNumbersReturned: numbers.size });
  console.log(`Exactly one billing_documents row exists for the event: ${exactlyOneRow ? "PASS" : "FAIL"}`);
  console.log(`Counter advanced by exactly 1 (no numbers leaked by losers): ${counterAdvancedByOne ? "PASS" : "FAIL"}`);
  console.log(`All callers that got a number agree on the SAME number: ${allSucceededCallsAgreeOnNumber ? "PASS" : "FAIL"}`);

  // Cleanup so the test is re-runnable.
  await supabase.from("billing_documents").delete().eq("event_id", TEST_EVENT_ID).eq("doc_type", "service_invoice");

  return exactlyOneRow && counterAdvancedByOne && allSucceededCallsAgreeOnNumber;
}

async function main() {
  const pass1 = await testRawConcurrency();
  const pass2 = await testForcedCollision();
  const allPass = pass1 && pass2;
  console.log(`\n--- Overall: ${allPass ? "PASS" : "FAIL"} ---`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Test failed with an exception:", e);
  process.exit(1);
});
