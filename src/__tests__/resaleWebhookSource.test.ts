import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The source of one `case "<name>":` block of the webhook's switch. */
function caseBlock(source: string, name: string): string {
  const start = source.indexOf(`case "${name}"`);
  expect(start, name).toBeGreaterThan(-1);
  const next = source.indexOf("\n      case ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("stripe-connect-webhook resale branches", () => {
  const webhook = read("supabase/functions/stripe-connect-webhook/index.ts");

  it("completes a paid resale through completeResaleCheckout, never by updating listings itself", () => {
    const completed = caseBlock(webhook, "checkout.session.completed");
    const resale = completed.slice(completed.indexOf('"stripe_connect_resale"'));
    expect(resale).toMatch(/completeResaleCheckout\(/);
    expect(webhook).not.toContain('.in("status", ["available", "reserved"])');
    expect(resale).not.toMatch(/\.from\("tickets"\)/);
    expect(resale).not.toMatch(/\.from\("event_tickets"\)/);
  });

  it("forgets the event when a resale completion fails, so Stripe's retry runs", () => {
    expect(webhook).toMatch(/from\("stripe_webhook_events"\)\.delete\(\)\.eq\("event_id", eventId\)/);
    const completed = caseBlock(webhook, "checkout.session.completed");
    expect(completed).toMatch(/catch \(err\) \{\s*await allowRetry\(supabase, event\.id\);\s*throw err;/);
  });

  it("releases an expired resale session by transaction, not by listing", () => {
    const expired = caseBlock(webhook, "checkout.session.expired");
    expect(expired).toMatch(/rpc\("release_resale_reservation", \{ p_transaction_id: transactionId \}\)/);
    expect(expired).not.toMatch(/\.from\("tickets"\)/);
  });

  it("only logs a failed resale payment attempt", () => {
    const failed = caseBlock(webhook, "payment_intent.payment_failed");
    const resale = failed.slice(failed.indexOf('"stripe_connect_resale"'));
    expect(resale).not.toMatch(/\.from\("tickets"\)/);
    expect(resale).not.toMatch(/\.from\("transactions"\)/);
  });

  it("records resale refunds through record_resale_refund", () => {
    const refunded = caseBlock(webhook, "charge.refunded");
    expect(refunded).toMatch(/rpc\("record_resale_refund", \{ p_payment_intent_id: pi \}\)/);
    expect(refunded).not.toMatch(/\.from\("tickets"\)/);
    expect(refunded).toMatch(/refundNeedsAdminReview\(/);
  });

  it("keeps the Studio sale on finalizeStudioOrder", () => {
    expect(caseBlock(webhook, "checkout.session.completed")).toMatch(/finalizeStudioOrder\(\{/);
  });
});

describe("stripe-connect-resale-checkout", () => {
  const checkout = read("supabase/functions/stripe-connect-resale-checkout/index.ts");

  it("reserves through reserve_resale_listing, with no updated_at sweep", () => {
    expect(checkout).not.toContain('lt("updated_at"');
    expect(checkout).toContain('rpc("reserve_resale_listing"');
    expect(checkout).toContain('rpc("release_expired_resale_reservations")');
    expect(checkout).not.toMatch(/\.from\("transactions"\)\.insert/);
    expect(checkout).not.toMatch(/update\(\{ status: "(reserved|available)" \}\)/);
  });

  it("releases only its own hold when something fails", () => {
    expect(checkout).toMatch(/rpc\("release_resale_reservation", \{ p_transaction_id: reservedTransactionId \}\)/);
  });

  it("puts the metadata on the payment intent and sends a cancelled buyer back to the listing", () => {
    expect(checkout).toContain("payment_intent_data: { metadata }");
    expect(checkout).toContain("checkout?listing_id=${listingId}&checkout=cancelled");
    expect(checkout).toContain("expires_at: stripeSessionExpiresAt(Date.now())");
  });

  it("keeps the pricing", () => {
    expect(checkout).toContain("const BUYER_FEE_PERCENT = 5;");
    expect(checkout).toContain('rpc("get_resale_commission_cents", { p_price_cents: subtotalCents })');
    expect(checkout).toContain("Number(negotiatedPrice ?? listing.selling_price)");
    expect(checkout).toContain("const subtotalCents = unitCents * qty;");
  });
});

describe("revolut-resale-checkout", () => {
  const revolut = read("supabase/functions/revolut-resale-checkout/index.ts");

  it("is off unless REVOLUT_RESALE_ENABLED is true", () => {
    expect(revolut).toContain('Deno.env.get("REVOLUT_RESALE_ENABLED") !== "true"');
    expect(revolut.indexOf("REVOLUT_RESALE_ENABLED")).toBeLessThan(revolut.indexOf("createClient(supabaseUrl"));
  });

  it("no longer releases other buyers' reservations", () => {
    expect(revolut).not.toContain('lt("updated_at"');
    const beforeRead = revolut.slice(0, revolut.indexOf('.from("tickets").select('));
    expect(beforeRead).not.toMatch(/update\(\{ status: "available" \}\)/);
  });
});
