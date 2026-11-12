/**
 * When each legal text last changed in substance, written by hand on purpose: a "last updated" that follows the
 * visitor's clock says nothing about what changed. Change a text's date in the same commit that edits the text.
 */
export const LEGAL_UPDATED = {
  privacy: "2026-11-01",
  terms: "2026-11-12",
  cookies: "2026-11-12",
  refunds: "2026-11-01",
  legalNotice: "2026-11-12",
} as const;

/** "22 October 2026" or "22 octobre 2026", the same for every visitor whatever their time zone. */
export function formatLegalDate(iso: string, locale: "en-GB" | "fr-FR" = "en-GB"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
