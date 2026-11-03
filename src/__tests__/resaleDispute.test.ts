import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  holdResaleOnDispute,
  releaseResaleDispute,
  resaleDisputeAlert,
  sellerNetCents,
} from "../../supabase/functions/_shared/resaleDispute";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the supabase-js query builder, as far as
 * resaleDispute.ts uses it: from().select()/update(), eq/in/is filters,
 * maybeSingle(), and awaiting a builder.
 */
function fakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      const hit = rows();
      if (patch) for (const r of hit) Object.assign(r, patch);
      return hit.map((r) => ({ ...r }));
    };
    const builder = {
      select: () => builder,
      update: (p: Row) => { patch = p; return builder; },
      eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return builder; },
      in: (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return builder; },
      is: (col: string, v: unknown) => { filters.push((r) => (r[col] ?? null) === v); return builder; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (ok: (v: { data: Row[]; error: null }) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(ok, ko),
    };
    return builder;
  };
  return { from };
}

/** A €50 resale: buyer paid €52.50 (€2.50 fee), seller commission €2.50, so the seller is owed €47.50. */
function sale(over: Row = {}): Row {
  return {
    id: "tx-1",
    status: "completed",
    seller_id: "seller-1",
    amount: 52.5,
    fee_amount: 2.5,
    commission_cents: 250,
    payout_job_id: null,
    dispute_id: null,
    payment_intent_id: "pi_1",
    ...over,
  };
}

describe("a dispute on a resale", () => {
  it("holds the sale out of the seller's payout when it has not been paid yet", async () => {
    const tables = { transactions: [sale()], stripe_connect_payout_jobs: [] };
    const hold = await holdResaleOnDispute(fakeSupabase(tables), { paymentIntentId: "pi_1", disputeId: "dp_1" });

    expect(hold).toEqual({ kind: "held", transactionId: "tx-1", sellerId: "seller-1", sellerNetCents: 4750 });
    expect(tables.transactions[0]).toMatchObject({ status: "disputed", dispute_id: "dp_1", payout_job_id: null });
  });

  it("is no longer picked up by the payout cron, which only pays completed, unclaimed sales", () => {
    const cron = read("supabase/functions/stripe-connect-payout-cron/index.ts");
    expect(cron).toMatch(/\.eq\("status", "completed"\)\s*\.is\("payout_job_id", null\)/);
    // The cron claims sales before the transfer, still only while completed and unclaimed.
    const claimAt = cron.search(/update\(\{ payout_job_id: job\.id \}\)[\s\S]{0,120}\.eq\("status", "completed"\)\.is\("payout_job_id", null\)/);
    const transferAt = cron.indexOf("await stripe.transfers.create(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(transferAt);
  });

  it("marks the sale disputed and reports it when the seller was already paid", async () => {
    const tables = {
      transactions: [sale({ payout_job_id: "job-9" })],
      stripe_connect_payout_jobs: [{ id: "job-9", status: "sent", stripe_payout_id: "po_9" }],
    };
    const hold = await holdResaleOnDispute(fakeSupabase(tables), { paymentIntentId: "pi_1", disputeId: "dp_1" });

    expect(hold).toEqual({
      kind: "already_paid_out",
      transactionId: "tx-1",
      sellerId: "seller-1",
      sellerNetCents: 4750,
      payoutJobId: "job-9",
      payoutJobStatus: "sent",
      stripePayoutId: "po_9",
    });
    expect(tables.transactions[0].status).toBe("disputed");

    const alert = resaleDisputeAlert(hold);
    expect(alert?.urgent).toBe(true);
    expect(alert?.rows).toContainEqual(["Seller payout", "€47.50 ALREADY PAID OUT"]);
    expect(alert?.note).toMatch(/Recover the money from the seller/);
  });

  it("ignores a payment that is not a resale (a Studio order)", async () => {
    const tables = { transactions: [sale()], stripe_connect_payout_jobs: [] };
    const hold = await holdResaleOnDispute(fakeSupabase(tables), { paymentIntentId: "pi_other", disputeId: "dp_1" });
    expect(hold).toEqual({ kind: "not_resale" });
    expect(resaleDisputeAlert(hold)).toBeNull();
    expect(tables.transactions[0].status).toBe("completed");
  });

  it("leaves a refunded sale as it is", async () => {
    const tables = { transactions: [sale({ status: "refunded" })], stripe_connect_payout_jobs: [] };
    const hold = await holdResaleOnDispute(fakeSupabase(tables), { paymentIntentId: "pi_1", disputeId: "dp_1" });
    expect(hold).toEqual({ kind: "not_completed", transactionId: "tx-1", status: "refunded" });
    expect(tables.transactions[0].status).toBe("refunded");
  });

  it("does nothing more on a second delivery of the same dispute", async () => {
    const tables = { transactions: [sale()], stripe_connect_payout_jobs: [] };
    const sb = fakeSupabase(tables);
    await holdResaleOnDispute(sb, { paymentIntentId: "pi_1", disputeId: "dp_1" });
    expect(await holdResaleOnDispute(sb, { paymentIntentId: "pi_1", disputeId: "dp_1" })).toEqual({ kind: "already_disputed", transactionId: "tx-1" });
  });

  it("gives the sale back to the seller when the dispute is won, and keeps it held when lost", async () => {
    const won = { transactions: [sale({ status: "disputed", dispute_id: "dp_1" })] };
    expect(await releaseResaleDispute(fakeSupabase(won), { disputeId: "dp_1", disputeStatus: "won" })).toEqual({ kind: "released", transactionId: "tx-1" });
    expect(won.transactions[0].status).toBe("completed");

    const lost = { transactions: [sale({ status: "disputed", dispute_id: "dp_1" })] };
    expect(await releaseResaleDispute(fakeSupabase(lost), { disputeId: "dp_1", disputeStatus: "lost" })).toEqual({ kind: "kept", transactionId: "tx-1", disputeStatus: "lost" });
    expect(lost.transactions[0].status).toBe("disputed");
  });

  it("is wired into the webhook for resale charges, next to the Studio payout block", () => {
    const webhook = read("supabase/functions/stripe-connect-webhook/index.ts");
    const created = webhook.slice(webhook.indexOf('case "charge.dispute.created"'), webhook.indexOf('case "charge.dispute.closed"'));
    expect(created).toMatch(/stripe_connect_payout_jobs[\s\S]*status: "blocked"/);
    expect(created).toMatch(/holdResaleOnDispute\(supabase, \{ paymentIntentId: pi, disputeId: dispute\.id \}\)/);
    expect(webhook).toMatch(/case "charge\.dispute\.closed"[\s\S]*releaseResaleDispute/);
  });
});

describe("what a seller is owed on a resale", () => {
  it("is the buyer total minus the buyer fee and the seller commission", () => {
    expect(sellerNetCents({ amount: "52.50", fee_amount: "2.50", commission_cents: 250 })).toBe(4750);
    expect(sellerNetCents({ amount: 10, fee_amount: null, commission_cents: null })).toBe(1000);
  });
});
