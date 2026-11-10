import { describe, it, expect } from "vitest";
import {
  completeResaleCheckout,
  type BuyerRefundEmail,
  type CompleteResaleCheckoutDeps,
  type DbResult,
  type FilterBuilder,
} from "../../supabase/functions/_shared/resaleCheckoutCompletion";
import { REFUND_OUTCOMES, type ResaleCompletionOutcome } from "../../supabase/functions/_shared/resaleReservation";

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the supabase-js client, as far as
 * resaleCheckoutCompletion.ts uses it: from().select()/update(), eq filters,
 * maybeSingle(), awaiting a builder, and rpc() answered by `rpcAnswer`.
 */
function fakeSupabase(tables: Record<string, Row[]>, rpcAnswer: (fn: string, args: Row) => DbResult) {
  const rpcCalls: { fn: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const run = () => {
      const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (patch) for (const r of hit) Object.assign(r, patch);
      return hit.map((r) => ({ ...r }));
    };
    const builder: FilterBuilder = {
      eq: (col, v) => { filters.push((r) => r[col] === v); return builder; },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (ok, ko) => Promise.resolve<DbResult>({ data: run(), error: null }).then(ok, ko),
    };
    return {
      select: () => builder,
      update: (p: Row) => { patch = p; return builder; },
    };
  };
  const rpc = (fn: string, args: Row = {}) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcAnswer(fn, args));
  };
  return { client: { from, rpc }, rpcCalls };
}

const EVENT_DATE = "2026-11-20T21:00:00.000Z";

function setup(opts: {
  outcome?: ResaleCompletionOutcome;
  studio?: boolean;
  signed?: string | null;
  refundFails?: boolean;
  rpcError?: string;
  paymentIntentId?: string | null;
} = {}) {
  const tables: Record<string, Row[]> = {
    transactions: [{ id: "tx-1", ticket_id: "listing-1", buyer_id: "buyer-1", amount: 52.5, status: "pending" }],
    tickets: [{
      id: "listing-1",
      studio_ticket_id: opts.studio ? "et-old" : null,
      event_id: "event-1",
      events: { date: EVENT_DATE, title: "Halloween Gala" },
    }],
  };
  const outcome = opts.outcome ?? "completed";
  const { client, rpcCalls } = fakeSupabase(tables, (fn) => {
    if (fn !== "complete_resale_purchase") return { data: null, error: { message: "unexpected rpc " + fn } };
    if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
    // What the SQL function leaves behind for each outcome.
    if (outcome === "completed") tables.transactions[0].status = "completed";
    else if (REFUND_OUTCOMES.includes(outcome)) tables.transactions[0].status = "cancelled";
    return { data: [{ outcome, listing_id: "listing-1", buyer_id: "buyer-1", new_event_ticket_id: null }], error: null };
  });

  const refunds: { params: unknown; opts: unknown }[] = [];
  const completionEmails: string[] = [];
  const buyerEmails: BuyerRefundEmail[] = [];
  const alerts: { subject: string; text: string }[] = [];
  const signCalls: { ticket_id: string; event_id: string; exp_seconds: number }[] = [];
  let ids = 0;

  const deps: CompleteResaleCheckoutDeps = {
    supabase: client,
    stripe: {
      refunds: {
        create: async (params, o) => {
          refunds.push({ params, opts: o });
          if (opts.refundFails) throw new Error("card_declined");
          return { id: "re_1", status: "succeeded" };
        },
      },
    },
    signQr: async (p) => { signCalls.push(p); return opts.signed === undefined ? "signed.jwt.token" : opts.signed; },
    newId: () => `0000000${++ids}-aaaa-4bbb-8ccc-dddddddddddd`,
    nowMs: () => Date.parse("2026-11-08T12:00:00Z"),
    sendCompletionEmails: async (txId) => { completionEmails.push(txId); return { ok: true }; },
    sendBuyerRefundEmail: async (a) => { buyerEmails.push(a); },
    sendAdminAlert: async (subject, text) => { alerts.push({ subject, text }); },
  };
  const input = { transactionId: "tx-1", paymentIntentId: opts.paymentIntentId === undefined ? "pi_1" : opts.paymentIntentId };
  return { deps, input, tables, rpcCalls, refunds, completionEmails, buyerEmails, alerts, signCalls };
}

describe("a paid resale checkout", () => {
  it("completes through complete_resale_purchase and sends the sale emails once, with no refund", async () => {
    const t = setup();
    const res = await completeResaleCheckout(t.deps, t.input);

    expect(res).toEqual({ outcome: "completed", refunded: false });
    expect(t.rpcCalls).toEqual([{
      fn: "complete_resale_purchase",
      args: { p_transaction_id: "tx-1", p_payment_intent_id: "pi_1", p_new_event_ticket_id: null, p_new_qr_token: null },
    }]);
    expect(t.completionEmails).toEqual(["tx-1"]);
    expect(t.refunds).toHaveLength(0);
    expect(t.buyerEmails).toHaveLength(0);
    expect(t.alerts).toHaveLength(0);
    expect(t.signCalls).toHaveLength(0);
  });

  it("signs a new QR for a Studio resale, valid until a day after the event, and passes it with the new ticket id", async () => {
    const t = setup({ studio: true });
    await completeResaleCheckout(t.deps, t.input);

    expect(t.signCalls).toEqual([{
      ticket_id: "00000001-aaaa-4bbb-8ccc-dddddddddddd",
      event_id: "event-1",
      exp_seconds: Math.floor(Date.parse(EVENT_DATE) / 1000) + 86_400,
    }]);
    expect(t.rpcCalls[0].args).toMatchObject({
      p_new_event_ticket_id: "00000001-aaaa-4bbb-8ccc-dddddddddddd",
      p_new_qr_token: "signed.jwt.token",
    });
  });

  it("falls back to a random hex token when no signing secret is set", async () => {
    const t = setup({ studio: true, signed: null });
    await completeResaleCheckout(t.deps, t.input);

    const token = t.rpcCalls[0].args.p_new_qr_token;
    expect(token).toBe("00000002aaaa4bbb8cccdddddddddddd");
    expect(String(token)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("does nothing more when the sale was already completed (a retried webhook)", async () => {
    const t = setup({ outcome: "already_completed" });
    const res = await completeResaleCheckout(t.deps, t.input);

    expect(res).toEqual({ outcome: "already_completed", refunded: false });
    expect(t.completionEmails).toHaveLength(0);
    expect(t.refunds).toHaveLength(0);
    expect(t.buyerEmails).toHaveLength(0);
    expect(t.alerts).toHaveLength(0);
  });

  it("throws when the SQL function fails, so the webhook can let Stripe retry", async () => {
    const t = setup({ rpcError: "QR_TOKEN_REQUIRED" });
    await expect(completeResaleCheckout(t.deps, t.input)).rejects.toThrow(/QR_TOKEN_REQUIRED/);
    expect(t.refunds).toHaveLength(0);
  });
});

describe("a paid resale checkout whose ticket went elsewhere", () => {
  for (const outcome of REFUND_OUTCOMES) {
    it(`${outcome}: refunds the buyer once, marks the sale refunded, emails the buyer and alerts the admin`, async () => {
      const t = setup({ outcome });
      const res = await completeResaleCheckout(t.deps, t.input);

      expect(res).toEqual({ outcome, refunded: true });
      expect(t.refunds).toEqual([{
        params: { payment_intent: "pi_1", metadata: { source: "resale_conflict", transaction_id: "tx-1" } },
        opts: { idempotencyKey: "resale_conflict_tx-1" },
      }]);
      expect(t.tables.transactions[0].status).toBe("refunded");
      expect(t.buyerEmails).toEqual([{ transactionId: "tx-1", buyerId: "buyer-1", amountCents: 5250, eventTitle: "Halloween Gala" }]);
      expect(t.alerts).toHaveLength(1);
      expect(t.alerts[0].subject).toContain("refunded automatically");
      expect(t.alerts[0].text).toContain(outcome);
      expect(t.completionEmails).toHaveLength(0);
    });
  }

  it("alerts the admin urgently and rejects when the refund fails", async () => {
    const t = setup({ outcome: "listing_sold", refundFails: true });
    await expect(completeResaleCheckout(t.deps, t.input)).rejects.toThrow("card_declined");

    expect(t.refunds).toHaveLength(1);
    expect(t.alerts).toHaveLength(1);
    expect(t.alerts[0].subject).toBe("[URGENT] resale conflict refund failed — refund manually");
    expect(t.buyerEmails).toHaveLength(0);
    expect(t.tables.transactions[0].status).toBe("cancelled");
  });

  it("alerts the admin when there is no payment intent to refund", async () => {
    const t = setup({ outcome: "listing_sold", paymentIntentId: null });
    const res = await completeResaleCheckout(t.deps, t.input);

    expect(res).toEqual({ outcome: "listing_sold", refunded: false });
    expect(t.refunds).toHaveLength(0);
    expect(t.alerts[0].subject).toMatch(/^\[URGENT\]/);
  });
});
