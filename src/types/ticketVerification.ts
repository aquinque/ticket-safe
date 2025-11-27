/**
 * Ticket Verification System Types
 *
 * This file defines the types for the ticket verification and anti-fraud system.
 */

export interface TicketQRData {
  ticketId: string;
  eventId: string;
  originalPrice: number;
  issueDate: string;
  holderEmail?: string;
  qrHash: string; // Unique hash of the QR code
}

export interface TicketVerificationResult {
  isValid: boolean;
  ticketId: string;
  eventId: string;
  errors: TicketVerificationError[];
  warnings: string[];
  ticketData?: TicketQRData;
}

export enum TicketVerificationError {
  TICKET_NOT_FOUND = "Ticket not found in the system",
  WRONG_EVENT = "Ticket is not for this event",
  ALREADY_USED = "Ticket has already been scanned at the event",
  ALREADY_LISTED = "Ticket is already listed on the marketplace",
  ALREADY_SOLD = "Ticket has already been sold",
  INVALID_QR = "Invalid or corrupted QR code",
  FAKE_TICKET = "Ticket appears to be fake or forged",
  EXPIRED = "Ticket has expired",
}

export interface TicketStatus {
  ticketId: string;
  eventId: string;
  isUsed: boolean;
  isListed: boolean;
  isSold: boolean;
  listedBy?: string;
  soldTo?: string;
  usedAt?: string;
  listedAt?: string;
  soldAt?: string;
  verifiedAt: string;
}

export interface TicketOwnershipTransfer {
  ticketId: string;
  fromUserId: string;
  toUserId: string;
  transferDate: string;
  listingId: string;
}
