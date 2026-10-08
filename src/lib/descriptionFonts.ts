/**
 * Fonts an organizer can pick for their event description in Ticket Studio.
 * Every family here is loaded from Google Fonts in index.html; "default"
 * means "inherit the site's body font" and stores NULL in the database.
 */
export const DESCRIPTION_FONTS = [
  { id: "default", label: "Default (Inter)", family: '"Inter", system-ui, sans-serif' },
  { id: "instrument", label: "Instrument Sans", family: '"Instrument Sans", "Inter", sans-serif' },
  { id: "grotesk", label: "Space Grotesk", family: '"Space Grotesk", "Inter", sans-serif' },
  { id: "poppins", label: "Poppins", family: '"Poppins", "Inter", sans-serif' },
  { id: "montserrat", label: "Montserrat", family: '"Montserrat", "Inter", sans-serif' },
  { id: "playfair", label: "Playfair Display", family: '"Playfair Display", Georgia, serif' },
  { id: "lora", label: "Lora", family: '"Lora", Georgia, serif' },
  { id: "mono", label: "JetBrains Mono", family: '"JetBrains Mono", ui-monospace, monospace' },
] as const;

export type DescriptionFontId = (typeof DESCRIPTION_FONTS)[number]["id"];

/** CSS font-family for a stored id; undefined for "default"/unknown so the element inherits. */
export function descriptionFontFamily(id: string | null | undefined): string | undefined {
  if (!id || id === "default") return undefined;
  return DESCRIPTION_FONTS.find((f) => f.id === id)?.family;
}
