/**
 * The seller's and the admin's side of resale listings.
 *
 * The front never writes `public.tickets` and never reads its private columns (seller_id, notes): every
 * write and every own-row or admin read goes through a SECURITY DEFINER Postgres function, which checks
 * who is calling and raises an exception whose message is one of the codes below:
 *
 *   create_studio_listing(...)   list one of your Studio tickets (no admin review: the QR is ours)
 *   my_listings()                your own listings, notes included, newest first
 *   update_my_listing_price(...) change the price of one of your active listings
 *   cancel_my_listing(...)       remove one of your active listings
 *   admin_pending_listings()     the admin review queue (external listings waiting for a check)
 *
 * and parses seller_public_stats_for_listing() for the buyer's "Sold by" panel (first name only).
 *
 * Pure apart from the RpcCaller passed in, so tests can use a fake.
 */

import type { RpcCaller } from "@/lib/supabaseRpc";

// ── Error codes ──────────────────────────────────────────────────────────────

export const LISTING_ERROR_MESSAGES = {
  AUTH_REQUIRED: "Your session has expired. Please log in again.",
  TICKET_NOT_OWNED: "This ticket isn't in your account, so you can't list it.",
  TICKET_NOT_VALID: "This ticket can't be resold: it has been used, refunded or transferred, or its ticket type can't be resold.",
  EVENT_CLOSED: "This event is over or no longer open for resale.",
  ALREADY_LISTED: "This ticket is already listed for resale.",
  INVALID_PRICE: "Enter a price between €0.01 and €10,000.",
  PRICE_ABOVE_CAP: "This price is above the maximum resale price for this ticket.",
  INVALID_NOTES: "Notes must be 500 characters or fewer.",
  NOT_FOUND: "This listing isn't yours or no longer exists.",
  NOT_EDITABLE: "Only active listings can be changed. This one is reserved or already sold.",
  NOT_ADMIN: "Admin access required.",
} as const;

export type ListingErrorCode = keyof typeof LISTING_ERROR_MESSAGES;

/** Longest notes create_studio_listing accepts. */
export const STUDIO_LISTING_NOTES_MAX = 500;

/** The code in an RPC error message ("TICKET_NOT_OWNED", possibly with a prefix), or null. */
export function listingErrorCode(message: string | null | undefined): ListingErrorCode | null {
  if (!message) return null;
  for (const m of message.matchAll(/\b[A-Z][A-Z_]+[A-Z]\b/g)) {
    if (m[0] in LISTING_ERROR_MESSAGES) return m[0] as ListingErrorCode;
  }
  return null;
}

/** A clear English sentence for an RPC error; the fallback when the code is unknown. */
export function listingErrorMessage(message: string | null | undefined, fallback: string): string {
  const code = listingErrorCode(message);
  return code ? LISTING_ERROR_MESSAGES[code] : fallback;
}

/** Thrown by the wrappers below: `code` is the function's error code when it raised a known one. */
export class ListingRpcError extends Error {
  readonly code: ListingErrorCode | null;
  constructor(raw: string) {
    super(raw);
    this.name = "ListingRpcError";
    this.code = listingErrorCode(raw);
  }
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// ── Seller: my_listings() ────────────────────────────────────────────────────

export interface MyListingRow {
  id: string;
  eventId: string;
  sellingPrice: number | null;
  quantity: number;
  notes: string | null;
  status: string;
  verificationStatus: string | null;
  createdAt: string;
  boostedUntil: string | null;
  studioTicketId: string | null;
}

export function parseMyListings(data: unknown): MyListingRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row: unknown): MyListingRow[] => {
    if (!isRecord(row)) return [];
    const id = str(row.listing_id);
    const eventId = str(row.event_id);
    const createdAt = str(row.created_at);
    if (!id || !eventId || !createdAt) return [];
    return [{
      id,
      eventId,
      sellingPrice: num(row.selling_price),
      quantity: num(row.quantity) ?? 1,
      notes: typeof row.notes === "string" ? row.notes : null,
      status: str(row.status) ?? "available",
      verificationStatus: str(row.verification_status),
      createdAt,
      boostedUntil: str(row.boosted_until),
      studioTicketId: str(row.studio_ticket_id),
    }];
  });
}

export async function fetchMyListings(rpc: RpcCaller): Promise<MyListingRow[]> {
  const { data, error } = await rpc("my_listings", {});
  if (error) throw new ListingRpcError(error.message);
  return parseMyListings(data);
}

export async function updateMyListingPrice(rpc: RpcCaller, listingId: string, sellingPrice: number): Promise<void> {
  const { error } = await rpc("update_my_listing_price", { p_listing_id: listingId, p_selling_price: sellingPrice });
  if (error) throw new ListingRpcError(error.message);
}

export async function cancelMyListing(rpc: RpcCaller, listingId: string): Promise<void> {
  const { error } = await rpc("cancel_my_listing", { p_listing_id: listingId });
  if (error) throw new ListingRpcError(error.message);
}

// ── Seller: create_studio_listing(...) ───────────────────────────────────────

export interface StudioListingInput {
  studioTicketId: string;
  sellingPrice: number;
  notes?: string | null;
  photoUrl?: string | null;
  videoUrl?: string | null;
}

/** Lists one Studio ticket (quantity 1, live at once). Returns the new listing id. */
export async function createStudioListing(rpc: RpcCaller, input: StudioListingInput): Promise<string> {
  const { data, error } = await rpc("create_studio_listing", {
    p_studio_ticket_id: input.studioTicketId,
    p_selling_price: input.sellingPrice,
    p_notes: input.notes?.trim() ? input.notes.trim() : null,
    p_photo_url: input.photoUrl ?? null,
    p_video_url: input.videoUrl ?? null,
  });
  if (error) throw new ListingRpcError(error.message);
  const id = str(data);
  if (!id) throw new ListingRpcError("Could not list your ticket.");
  return id;
}

// ── Admin: admin_pending_listings() ──────────────────────────────────────────

export interface PendingListing {
  id: string;
  status: string;
  verification_status: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  qr_verified: boolean;
  created_at: string;
  event: { id: string; title: string; date: string; location: string | null; campus: string | null } | null;
  seller: { full_name: string; email: string; campus: string | null } | null;
}

/** The function's flat rows, in the nested shape the review page renders. */
export function parsePendingListings(data: unknown): PendingListing[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row: unknown): PendingListing[] => {
    if (!isRecord(row)) return [];
    const id = str(row.id);
    const createdAt = str(row.created_at);
    if (!id || !createdAt) return [];
    const eventId = str(row.event_id);
    const fullName = str(row.seller_full_name);
    const email = str(row.seller_email);
    return [{
      id,
      status: str(row.status) ?? "available",
      verification_status: str(row.verification_status) ?? "pending",
      selling_price: num(row.selling_price) ?? 0,
      quantity: num(row.quantity) ?? 1,
      notes: typeof row.notes === "string" ? row.notes : null,
      qr_verified: row.qr_verified === true,
      created_at: createdAt,
      event: eventId
        ? {
            id: eventId,
            title: str(row.event_title) ?? "Unknown event",
            date: str(row.event_date) ?? "",
            location: str(row.event_location),
            campus: str(row.event_campus),
          }
        : null,
      seller: fullName || email
        ? { full_name: fullName ?? "Unknown seller", email: email ?? "", campus: str(row.seller_campus) }
        : null,
    }];
  });
}

export async function fetchPendingListings(rpc: RpcCaller): Promise<PendingListing[]> {
  const { data, error } = await rpc("admin_pending_listings", {});
  if (error) throw new ListingRpcError(error.message);
  return parsePendingListings(data);
}

// ── Buyer: seller_public_stats_for_listing(...) ──────────────────────────────

export interface SellerPublicStats {
  firstName: string | null;
  university: string | null;
  memberSince: string | null;
  completedSales: number;
}

/** The first row of seller_public_stats_for_listing(), field by field: only the seller's first name is shown. */
export function parseSellerStats(data: unknown): SellerPublicStats | null {
  const row: unknown = Array.isArray(data) ? data[0] : null;
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const sales = Number(r.completed_sales);
  return {
    // The function already returns only the first word of the name; keep only that word regardless.
    firstName: text(r.first_name)?.split(/\s+/)[0] ?? null,
    university: text(r.university),
    memberSince: text(r.member_since),
    completedSales: Number.isFinite(sales) && sales > 0 ? Math.floor(sales) : 0,
  };
}
