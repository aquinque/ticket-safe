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

export type ConnectBusinessType = "individual" | "company" | "non_profit";

export function isConnectBusinessType(v: unknown): v is ConnectBusinessType {
  return v === "individual" || v === "company" || v === "non_profit";
}

/**
 * Stripe merchant category for ticket sellers ("Theatrical producers and
 * ticket agencies"). Pre-filling it, with a product description, lets the
 * hosted form skip its "tell us about your business" questions.
 */
export const TICKETING_MCC = "7922";
export const PRODUCT_DESCRIPTION = "Vente de billets pour des événements (soirées, galas, conférences) via Ticket Safe.";

export interface PrefillAddress {
  line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface CreateExpressAccountArgs {
  email: string | null;
  /** Shown to Stripe as the business name so the hosted form is pre-filled. */
  name?: string | null;
  /**
   * Who receives the money. "individual" is the fast path for a student with
   * no company: Stripe then only asks for identity, address and IBAN. Leave
   * unset to let Stripe ask.
   */
  businessType?: ConnectBusinessType;
  country?: string;
  /** Pre-filled on the hosted form for an individual, so they only confirm. */
  person?: { first_name?: string | null; last_name?: string | null; phone?: string | null };
  /** Pre-filled on the hosted form for a company or association. */
  company?: { tax_id?: string | null };
  address?: PrefillAddress;
  website?: string | null;
  /** Stored on the Stripe account to find it again from the Stripe dashboard. */
  metadata?: Record<string, string>;
}

function cleanAddress(a: PrefillAddress | undefined, country: string): Stripe.AddressParam | undefined {
  if (!a) return undefined;
  const out: Stripe.AddressParam = {};
  if (a.line1?.trim()) out.line1 = a.line1.trim();
  if (a.postal_code?.trim()) out.postal_code = a.postal_code.trim();
  if (a.city?.trim()) out.city = a.city.trim();
  out.country = (a.country?.trim() || country).toUpperCase().slice(0, 2);
  return out.line1 || out.postal_code || out.city ? out : undefined;
}

/** The fields Stripe accepts up front; everything else is collected on its hosted form. */
export function expressPrefillParams(args: CreateExpressAccountArgs): Stripe.AccountUpdateParams {
  const country = args.country ?? "FR";
  const address = cleanAddress(args.address, country);
  const website = args.website?.trim();
  const businessProfile: Stripe.AccountUpdateParams.BusinessProfile = {
    ...(args.name ? { name: args.name } : {}),
    mcc: TICKETING_MCC,
    product_description: PRODUCT_DESCRIPTION,
    ...(website && /^https?:\/\//i.test(website) ? { url: website } : {}),
  };
  const params: Stripe.AccountUpdateParams = { business_profile: businessProfile };
  if (args.businessType) params.business_type = args.businessType;

  if (args.businessType === "individual") {
    const p = args.person ?? {};
    const individual: Stripe.AccountUpdateParams.Individual = {};
    if (p.first_name?.trim()) individual.first_name = p.first_name.trim();
    if (p.last_name?.trim()) individual.last_name = p.last_name.trim();
    if (p.phone?.trim()) individual.phone = p.phone.trim();
    if (args.email) individual.email = args.email;
    if (address) individual.address = address;
    if (Object.keys(individual).length > 0) params.individual = individual;
  } else if (args.businessType === "company" || args.businessType === "non_profit") {
    const company: Stripe.AccountUpdateParams.Company = {};
    if (args.name) company.name = args.name;
    const taxId = args.company?.tax_id?.replace(/\s+/g, "");
    if (taxId && /^\d{9}$/.test(taxId)) company.tax_id = taxId; // SIREN
    if (address) company.address = address;
    if (Object.keys(company).length > 0) params.company = company;
  }
  return params;
}

export async function createExpressAccount(stripe: Stripe, args: CreateExpressAccountArgs): Promise<Stripe.Account> {
  const prefill = expressPrefillParams(args);
  return stripe.accounts.create({
    type: "express",
    country: args.country ?? "FR",
    ...(args.email ? { email: args.email } : {}),
    ...prefill,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    settings: { payouts: { schedule: { interval: "manual" } } },
    ...(args.metadata ? { metadata: args.metadata } : {}),
  });
}

/**
 * Best-effort prefill of an account that already exists (created before the
 * organizer chose a type, or abandoned on the first screen). Stripe refuses
 * some of these updates once verification has started; that is fine, the
 * hosted form still collects whatever is missing.
 */
export async function prefillExistingAccount(stripe: Stripe, accountId: string, args: CreateExpressAccountArgs): Promise<void> {
  const params = expressPrefillParams(args);
  try {
    await stripe.accounts.update(accountId, params);
  } catch (err) {
    // Retry without the type and identity fields, which Stripe locks after the
    // first submission; the business profile alone still removes questions.
    const { business_type: _t, individual: _i, company: _c, ...rest } = params;
    void _t; void _i; void _c;
    await stripe.accounts.update(accountId, rest).catch(() => {});
    console.warn("[stripeConnect] prefill of existing account partially refused:", err instanceof Error ? err.message : err);
  }
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
