/**
 * The countries an organizer's Stripe account can belong to: where the person (or the
 * association) lives and banks, not where the event takes place. Stripe fixes an
 * account's country when it is created; its address, ID and bank must then be from
 * there. Shared by the onboarding function and the Studio payments page.
 */
export const PAYOUT_COUNTRIES = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "GB", name: "United Kingdom" },
] as const;

export type PayoutCountry = (typeof PAYOUT_COUNTRIES)[number]["code"];

// Other ways people write the same countries.
const ALIASES: Record<string, PayoutCountry> = {
  UK: "GB", "GREAT BRITAIN": "GB", BRITAIN: "GB", ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB", "NORTHERN IRELAND": "GB", "ROYAUME-UNI": "GB", "REINO UNIDO": "GB",
  ESPANA: "ES", "ESPAÑA": "ES", ESPAGNE: "ES", ALLEMAGNE: "DE", DEUTSCHLAND: "DE", ITALIE: "IT", ITALIA: "IT", BELGIQUE: "BE", "PAYS-BAS": "NL", SUISSE: "CH", IRLANDE: "IE",
};

/** "France", "fr", "United Kingdom", "UK", "España" → the ISO code, or null when it isn't a payout country. */
export function payoutCountryCode(input: string | null | undefined): PayoutCountry | null {
  const v = (input ?? "").trim().toUpperCase();
  if (!v) return null;
  const byCode = PAYOUT_COUNTRIES.find((c) => c.code === v);
  if (byCode) return byCode.code;
  const byName = PAYOUT_COUNTRIES.find((c) => c.name.toUpperCase() === v);
  if (byName) return byName.code;
  return ALIASES[v] ?? null;
}

export const payoutCountryName = (code: string) => PAYOUT_COUNTRIES.find((c) => c.code === code)?.name ?? code;
