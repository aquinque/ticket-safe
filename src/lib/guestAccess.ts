/**
 * Access for buyers without an account. Keep in step with supabase/functions/_shared/guestAccess.ts.
 */

/** 43 characters, base64url, as generated on the server. Rejected before any request. */
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const isWellFormedAccessToken = (value: string | null | undefined): value is string =>
  !!value && ACCESS_TOKEN_PATTERN.test(value);

/**
 * QR parameters. These must match the event-ticket-qr function, so the code
 * encodes the same content and scans the same way at the door.
 */
export const TICKET_QR_OPTIONS = {
  errorCorrectionLevel: "L" as const,
  margin: 4,
  width: 512,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** One ticket as returned by the ticket-access function. qr_token is null when the ticket is no longer valid. */
export interface GuestTicketView {
  status: string;
  holder_name: string | null;
  tier_name: string | null;
  event: { title: string | null; date: string | null; location: string | null };
  qr_token: string | null;
}

export const ticketAccessUrl = (): string => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ticket-access`;

export const ticketAccessHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
