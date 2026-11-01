/**
 * The TicketSafe icon (public/email-assets/icon-navy@2x.png, scaled to 144 x 133 and palette-compressed) as PNG
 * bytes, so a PDF rendered in an edge function carries the logo without fetching anything. Drawn 6.5 mm tall,
 * where this size is plenty.
 */
const ICON_PNG_BASE64 =
  "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";

export function brandIconPng(): Uint8Array {
  const binary = atob(ICON_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
