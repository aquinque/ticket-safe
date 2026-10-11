/**
 * Shared Stripe Connect helpers — Express accounts.
 *
 * Organizers and resellers are onboarded through Stripe-hosted pages
 * (Account Links); Stripe collects and verifies the identity, legal
 * representative, address and bank account, and owns that compliance
 * surface. TicketSafe only creates the account, sends the person to the
 * link, and mirrors the result into stripe_connect_accounts.
 *
 * Payouts stay on a manual schedule: nothing leaves the connected account's
 * balance except a payout WE trigger (stripe-connect-payout-cron), so the
 * money is held until after the event and refunds can still reverse the
 * transfer.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

export function getStripeClient(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  // Non-negotiable test-mode guard for phases 0-4: refuse to run against a
  // live key under any circumstance until Phase 5 is explicitly authorized.
  // Remove this check only as part of the Phase 5 go-live change, never
  // silently.
  const allowLive = Deno.env.get("STRIPE_ALLOW_LIVE_MODE") === "true";
  if (key.startsWith("sk_live_") && !allowLive) {
    throw new Error("Refusing to use a live Stripe key — STRIPE_ALLOW_LIVE_MODE is not set to true. This build is test-mode only (Phases 0-4).");
  }
  return new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
}

export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ticket-safe.eu";

export interface CreateExpressAccountArgs {
  email: string | null;
  /** Shown to Stripe as the business name so the hosted form is pre-filled. */
  name?: string | null;
  /** Leave unset to let Stripe ask (association / company / individual). */
  businessType?: "individual" | "company" | "non_profit";
  country?: string;
  /** Stored on the Stripe account to find it again from the Stripe dashboard. */
  metadata?: Record<string, string>;
}

export async function createExpressAccount(stripe: Stripe, args: CreateExpressAccountArgs): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: "express",
    country: args.country ?? "FR",
    ...(args.email ? { email: args.email } : {}),
    ...(args.businessType ? { business_type: args.businessType } : {}),
    ...(args.name ? { business_profile: { name: args.name } } : {}),
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: "manual" } } },
    ...(args.metadata ? { metadata: args.metadata } : {}),
  });
}

/**
 * Stripe-hosted onboarding link. Single use and short lived: generate a fresh
 * one every time the person clicks "Set up payments" or lands on the refresh
 * URL. Return/refresh URLs are fixed to our own site, never taken from the
 * request.
 */
export async function createOnboardingLink(stripe: Stripe, accountId: string, returnPath: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: `${SITE_URL}${returnPath}?stripe=return`,
    refresh_url: `${SITE_URL}${returnPath}?stripe=refresh`,
  });
  return link.url;
}

/** Single-use login link to the Express dashboard (balance, payouts, bank account). */
export async function createDashboardLink(stripe: Stripe, accountId: string): Promise<string> {
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

export function deriveOnboardingStatus(account: Stripe.Account): "pending" | "restricted" | "complete" {
  if (account.charges_enabled && account.payouts_enabled) return "complete";
  if (account.details_submitted) return "restricted";
  return "pending";
}

/** Columns of stripe_connect_accounts that mirror the Stripe account's state. */
export function accountStateColumns(account: Stripe.Account) {
  const bt = account.business_type;
  return {
    charges_enabled: account.charges_enabled ?? false,
    payouts_enabled: account.payouts_enabled ?? false,
    details_submitted: account.details_submitted ?? false,
    requirements_currently_due: account.requirements?.currently_due ?? [],
    requirements_past_due: account.requirements?.past_due ?? [],
    ...(bt === "individual" || bt === "company" || bt === "non_profit" ? { business_type: bt } : {}),
    updated_at: new Date().toISOString(),
  };
}

/** Best display name Stripe knows for the account holder, falling back to ours. */
export function accountHolderName(account: Stripe.Account, fallback: string | null): string | null {
  const person = account.individual ? [account.individual.first_name, account.individual.last_name].filter(Boolean).join(" ") : "";
  return account.company?.name || account.business_profile?.name || person || fallback;
}
