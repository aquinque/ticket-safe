/**
 * Resale price cap — the check stripe-connect-resale-checkout runs on the
 * final price per ticket (the listing price, or the offer the seller accepted
 * in chat) before the buyer can pay.
 *
 * The cap itself is computed in the database (public.resale_price_cap, see
 * migration 20261103130000): organizer cap for the ticket type, else for the
 * event, else face value + billing_settings.resale_default_markup_bps, else
 * none. This file only reads that result and words the refusal.
 *
 * Plain TypeScript, no Deno imports: the vitest suite imports it directly.
 */

export type ResaleCapSource = "organizer_tier" | "organizer_event" | "face_value_markup" | "none";

export interface ResaleCap {
  /** Max price per ticket in euro cents, or null when no cap applies. */
  capCents: number | null;
  source: ResaleCapSource;
  faceValueCents: number | null;
}

export type ResalePriceCheck =
  | { ok: true }
  | { ok: false; error: string };

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/** Reads one row of resale_price_cap() (supabase-js returns an array for a set-returning function). */
export function parseResaleCap(row: unknown): ResaleCap {
  const r = (Array.isArray(row) ? row[0] : row) as
    | { cap_cents?: number | null; source?: string | null; face_value_cents?: number | null }
    | null
    | undefined;
  const cap = r?.cap_cents;
  const source = (["organizer_tier", "organizer_event", "face_value_markup"] as const).find((s) => s === r?.source) ?? "none";
  const capCents = typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? Math.round(cap) : null;
  const face = r?.face_value_cents;
  return {
    capCents,
    source: capCents == null ? "none" : source,
    faceValueCents: typeof face === "number" && face > 0 ? Math.round(face) : null,
  };
}

/** Whether a price per ticket may be paid, and the message shown to the buyer when it may not. */
export function checkResalePrice(unitCents: number, cap: ResaleCap, fromOffer: boolean): ResalePriceCheck {
  if (cap.capCents == null || unitCents <= cap.capCents) return { ok: true };
  const why = cap.source === "face_value_markup" && cap.faceValueCents != null
    ? `the resale cap for this ticket (${euros(cap.capCents)}, based on its ${euros(cap.faceValueCents)} face value)`
    : `the maximum resale price the organizer set for this ticket (${euros(cap.capCents)})`;
  const what = fromOffer ? "The price agreed in chat" : "This listing's price";
  const next = fromOffer
    ? `Ask the seller for a new offer of ${euros(cap.capCents)} or less.`
    : "The seller needs to lower the price before it can be bought.";
  return { ok: false, error: `${what} (${euros(unitCents)} per ticket) is above ${why}. ${next}` };
}
