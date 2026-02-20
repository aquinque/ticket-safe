/**
 * Shared types for the QR-verified marketplace listing feature.
 *
 * These codes are returned by the submit-listing edge function and
 * used by the frontend to display human-readable feedback.
 */

// ---------------------------------------------------------------------------
// QR Validation codes (mirrors the edge function enum)
// ---------------------------------------------------------------------------

export type QRValidationCode =
  | "VALID"           // QR is valid; listing was created
  | "INVALID_FORMAT"  // QR empty, malformed, or signature invalid
  | "UNKNOWN_TICKET"  // JWT signed by us but ticket not found in DB
  | "ALREADY_LISTED"  // Same qr_hash already present in tickets table
  | "ALREADY_USED"    // Ticket already scanned / used at the event
  | "CANCELLED"       // Ticket was cancelled / revoked
  | "REFUNDED"        // Ticket was refunded
  | "EXPIRED"         // Event is past or token expired
  | "INTERNAL_ERROR"; // Server-side unexpected error

// ---------------------------------------------------------------------------
// Human-readable messages (shown in Sell form errors)
// ---------------------------------------------------------------------------

export const QR_ERROR_MESSAGES: Record<Exclude<QRValidationCode, "VALID">, string> = {
  INVALID_FORMAT:
    "Invalid QR code — make sure you copied the full text from your ticket.",
  UNKNOWN_TICKET:
    "This ticket could not be verified. It may have been issued outside the platform.",
  ALREADY_LISTED:
    "This ticket is already listed on the marketplace.",
  ALREADY_USED:
    "This ticket has already been scanned at the event and cannot be resold.",
  CANCELLED:
    "This ticket has been cancelled or revoked.",
  REFUNDED:
    "This ticket was refunded and is no longer valid.",
  EXPIRED:
    "This ticket has expired — the event has already taken place.",
  INTERNAL_ERROR:
    "A server error occurred. Please try again in a few moments.",
};

// ---------------------------------------------------------------------------
// API payload shapes
// ---------------------------------------------------------------------------

export interface CreateListingPayload {
  eventId: string;
  sellingPrice: number;
  quantity: number;
  notes?: string;
  qrText: string;
}

export interface CreateListingSuccess {
  code: "VALID";
  listing: MarketplaceListing;
}

export interface CreateListingError {
  code: Exclude<QRValidationCode, "VALID">;
  message: string;
}

export type CreateListingResponse = CreateListingSuccess | CreateListingError;

// ---------------------------------------------------------------------------
// Marketplace listing (DB shape returned from submit-listing / direct query)
// ---------------------------------------------------------------------------

export interface MarketplaceListing {
  id: string;
  event_id: string;
  seller_id: string;
  original_price: number;
  selling_price: number;
  quantity: number;
  notes: string | null;
  status: "available" | "sold" | "reserved";
  qr_verified: boolean;
  created_at: string;
  updated_at: string;
  event: {
    id: string;
    title: string;
    date: string;
    location: string;
    category: string;
    university: string;
    campus: string | null;
    base_price?: number | null;
  };
  seller?: {
    full_name: string;
  } | null;
}
