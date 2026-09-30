#!/usr/bin/env node
/**
 * Concurrency test for the stock-reservation path (reserve_tier RPC).
 *
 * !!! DO NOT RUN THIS AGAINST THE PRODUCTION PROJECT (lgmnatfvdzzjzyxlenry) !!!
 * It creates real reservations against a real tier. Point SUPABASE_URL /
 * SUPABASE_ANON_KEY at a staging project (or a disposable second Supabase
 * project seeded with a copy of the schema) before running.
 *
 * What it does:
 *  1. Reads the target tier's current total_qty/sold_qty/reserved_qty.
 *  2. Fires N concurrent calls to the `reserve_tier` RPC, each requesting
 *     QTY_PER_CALL seats (default 1), simulating N buyers hitting "Pay" on
 *     the same tier at the same instant.
 *  3. Re-reads the tier and asserts:
 *       - accepted reservations * qty_per_call === reserved_qty delta
 *       - sold_qty + reserved_qty <= total_qty (never oversold)
 *       - accepted count <= available capacity at test start
 *  4. Releases whatever it reserved (best-effort cleanup) via
 *     release_tier_reservation, so the tier is left as it was found.
 *
 * Usage:
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<staging-anon-key> \
 *   TIER_ID=<uuid of a low-capacity test tier> \
 *   CONCURRENCY=50 \
 *   node scripts/load-test/concurrency-stock.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TIER_ID = process.env.TIER_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const QTY_PER_CALL = Number(process.env.QTY_PER_CALL ?? 1);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TIER_ID) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / TIER_ID env vars.");
  process.exit(1);
}
if (SUPABASE_URL.includes("lgmnatfvdzzjzyxlenry")) {
  console.error("Refusing to run: this points at the PRODUCTION project. Use a staging project.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getTier() {
  const { data, error } = await supabase
    .from("event_tiers")
    .select("id, total_qty, sold_qty, reserved_qty, is_active")
    .eq("id", TIER_ID)
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const before = await getTier();
  const availableBefore = before.total_qty - before.sold_qty - before.reserved_qty;
  console.log("Tier before:", before, "| available:", availableBefore);
  console.log(`Firing ${CONCURRENCY} concurrent reserve_tier(${TIER_ID}, ${QTY_PER_CALL}) calls...`);

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }).map(() =>
      supabase.rpc("reserve_tier", { p_tier_id: TIER_ID, p_qty: QTY_PER_CALL })
    )
  );

  const accepted = results.filter((r) => r.data === true).length;
  const rejected = results.filter((r) => r.data === false).length;
  const errored = results.filter((r) => r.error).length;
  console.log({ accepted, rejected, errored });

  const after = await getTier();
  console.log("Tier after:", after);

  const expectedReservedDelta = accepted * QTY_PER_CALL;
  const actualReservedDelta = after.reserved_qty - before.reserved_qty;
  const noOversell = after.sold_qty + after.reserved_qty <= after.total_qty;
  const withinCapacity = accepted * QTY_PER_CALL <= availableBefore;

  console.log("\n--- Assertions ---");
  console.log(
    `reserved_qty delta matches accepted count: ${actualReservedDelta === expectedReservedDelta ? "PASS" : "FAIL"} ` +
      `(expected ${expectedReservedDelta}, got ${actualReservedDelta})`
  );
  console.log(`sold_qty + reserved_qty <= total_qty (no oversell): ${noOversell ? "PASS" : "FAIL"}`);
  console.log(`accepted <= capacity available at start: ${withinCapacity ? "PASS" : "FAIL"}`);

  // Best-effort cleanup: release everything this run reserved.
  if (accepted > 0) {
    console.log(`\nReleasing ${expectedReservedDelta} reserved seats (cleanup)...`);
    await supabase.rpc("release_tier_reservation", { p_tier_id: TIER_ID, p_qty: expectedReservedDelta });
    const restored = await getTier();
    console.log("Tier after cleanup:", restored);
  }

  const allPass = actualReservedDelta === expectedReservedDelta && noOversell && withinCapacity;
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Test failed with an exception:", e);
  process.exit(1);
});
