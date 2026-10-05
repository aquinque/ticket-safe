/**
 * Shared Stripe Connect helpers — Custom accounts, no Stripe-hosted screens.
 * Every onboarding field is collected in TicketSafe's own UI and sent to
 * Stripe via the Accounts API (not Account Links / hosted onboarding).
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

export interface IndividualKyc {
  businessType: "individual";
  firstName: string;
  lastName: string;
  dob: { day: number; month: number; year: number };
  addressLine1: string;
  addressCity: string;
  addressPostalCode: string;
  addressCountry: string; // ISO 3166-1 alpha-2, e.g. "FR"
  email: string;
  iban: string;
}

export interface CompanyKyc {
  businessType: "company" | "non_profit";
  companyName: string;
  registrationNumber: string; // SIREN/RNA or foreign equivalent
  addressLine1: string;
  addressCity: string;
  addressPostalCode: string;
  addressCountry: string;
  repFirstName: string;
  repLastName: string;
  repDob: { day: number; month: number; year: number };
  repAddressLine1: string;
  repAddressCity: string;
  repAddressPostalCode: string;
  repAddressCountry: string;
  email: string;
  iban: string;
}

export type ConnectKyc = IndividualKyc | CompanyKyc;

/**
 * Creates (or, if accountId is given, updates) a Custom Connect account from
 * our own collected KYC fields. Manual payout schedule — nothing ever
 * leaves the connected account's balance except a payout WE trigger
 * (stripe-connect-payout-cron).
 */
export async function createOrUpdateConnectAccount(
  stripe: Stripe,
  kyc: ConnectKyc,
  tosIp: string,
  accountId?: string,
): Promise<Stripe.Account> {
  const common: Stripe.AccountCreateParams | Stripe.AccountUpdateParams = {
    business_type: kyc.businessType,
    email: kyc.email,
    settings: { payouts: { schedule: { interval: "manual" } } },
    tos_acceptance: accountId ? undefined : { date: Math.floor(Date.now() / 1000), ip: tosIp },
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
  };

  if (kyc.businessType === "individual") {
    const external_account = ibanExternalAccount(kyc.iban, kyc.addressCountry);
    const params: Stripe.AccountCreateParams = {
      ...common,
      country: kyc.addressCountry,
      individual: {
        first_name: kyc.firstName,
        last_name: kyc.lastName,
        dob: kyc.dob,
        email: kyc.email,
        address: {
          line1: kyc.addressLine1,
          city: kyc.addressCity,
          postal_code: kyc.addressPostalCode,
          country: kyc.addressCountry,
        },
      },
      ...(external_account ? { external_account } : {}),
    };
    return accountId
      ? await stripe.accounts.update(accountId, params as Stripe.AccountUpdateParams)
      : await stripe.accounts.create({ type: "custom", ...params });
  }

  const external_account = ibanExternalAccount(kyc.iban, kyc.addressCountry);
  const params: Stripe.AccountCreateParams = {
    ...common,
    country: kyc.addressCountry,
    company: {
      name: kyc.companyName,
      registration_number: kyc.registrationNumber,
      address: {
        line1: kyc.addressLine1,
        city: kyc.addressCity,
        postal_code: kyc.addressPostalCode,
        country: kyc.addressCountry,
      },
    },
    individual: undefined,
    ...(external_account ? { external_account } : {}),
  };
  const account = accountId
    ? await stripe.accounts.update(accountId, params as Stripe.AccountUpdateParams)
    : await stripe.accounts.create({ type: "custom", ...params });

  // Legal representative, added as a Person on the account (required for
  // company/non_profit business types).
  await stripe.accounts.createPerson(account.id, {
    first_name: kyc.repFirstName,
    last_name: kyc.repLastName,
    dob: kyc.repDob,
    email: kyc.email,
    address: {
      line1: kyc.repAddressLine1,
      city: kyc.repAddressCity,
      postal_code: kyc.repAddressPostalCode,
      country: kyc.repAddressCountry,
    },
    relationship: { representative: true, title: "Legal representative" },
  });

  return account;
}

/**
 * Stripe's external_account for a SEPA IBAN: a bank_account token shape,
 * NOT a card. account_holder_type is always 'individual' here because it
 * describes who holds the BANK ACCOUNT, which can differ from business_type
 * (an association's bank account is still held by a natural or legal
 * person depending on the bank — Stripe defaults this correctly from the
 * IBAN's own metadata in most cases, so we omit it and let Stripe infer).
 */
function ibanExternalAccount(iban: string, country: string): Stripe.AccountCreateParams.ExternalAccount | undefined {
  const cleaned = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return undefined;
  return {
    object: "bank_account",
    country,
    currency: "eur",
    account_number: cleaned,
  } as Stripe.AccountCreateParams.ExternalAccount;
}

export function deriveOnboardingStatus(account: Stripe.Account): "pending" | "restricted" | "complete" {
  if (account.charges_enabled && account.payouts_enabled) return "complete";
  if (account.details_submitted) return "restricted";
  return "pending";
}
