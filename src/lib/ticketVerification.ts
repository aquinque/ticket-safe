/**
 * Ticket Verification Service
 *
 * This service handles QR code verification and anti-fraud checks for the resale marketplace.
 * It ensures that only authentic, unused tickets can be listed for resale.
 */

import { TicketQRData, TicketVerificationResult, TicketVerificationError, TicketStatus } from '@/types/ticketVerification';

// Mock database of tickets (in production, this would be a real database or API)
const ticketDatabase: Map<string, TicketStatus> = new Map();


/**
 * Parse QR code data from uploaded image/PDF
 * In production, this would use a real QR code scanner library
 */
export async function parseQRCode(_file: File): Promise<TicketQRData | null> {
  try {
    // Simulate QR code parsing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock QR data extraction
    // In production, use a library like 'jsqr' or 'html5-qrcode'
    const mockTicketId = `TICKET-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mockQRHash = `QR-EBS-SKI-2025-${String(Math.floor(Math.random() * 5) + 1).padStart(3, '0')}`;

    return {
      ticketId: mockTicketId,
      eventId: 'ebs-ski-trip-2025',
      originalPrice: 450,
      issueDate: new Date().toISOString(),
      qrHash: mockQRHash,
    };
  } catch (error) {
    console.error('Error parsing QR code:', error);
    return null;
  }
}

/**
 * Verify ticket authenticity and status
 * This performs all security checks before allowing a ticket to be listed
 */
export async function verifyTicket(
  qrData: TicketQRData,
  _eventId: string,
  userId: string
): Promise<TicketVerificationResult> {
  const errors: TicketVerificationError[] = [];
  const warnings: string[] = [];

  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // CHECK: ticket ID must be present
  if (!qrData.ticketId) {
    errors.push(TicketVerificationError.FAKE_TICKET);
  }

  // CHECK: duplicate / used / sold — based on in-session registry
  const ticketStatus = ticketDatabase.get(qrData.ticketId);

  if (ticketStatus) {
    if (ticketStatus.isUsed) {
      errors.push(TicketVerificationError.ALREADY_USED);
    }
    if (ticketStatus.isListed && ticketStatus.listedBy !== userId) {
      errors.push(TicketVerificationError.ALREADY_LISTED);
    }
    if (ticketStatus.isSold) {
      errors.push(TicketVerificationError.ALREADY_SOLD);
    }
  } else {
    // First time this ticket is seen — register it
    ticketDatabase.set(qrData.ticketId, {
      ticketId: qrData.ticketId,
      eventId: qrData.eventId,
      isUsed: false,
      isListed: false,
      isSold: false,
      verifiedAt: new Date().toISOString(),
    });
  }

  return {
    isValid: errors.length === 0,
    ticketId: qrData.ticketId,
    eventId: qrData.eventId,
    errors,
    warnings,
    ticketData: qrData,
  };
}

/**
 * Mark ticket as listed on the marketplace
 */
export function markTicketAsListed(ticketId: string, userId: string, _listingId: string): void {
  const status = ticketDatabase.get(ticketId);
  if (status) {
    status.isListed = true;
    status.listedBy = userId;
    status.listedAt = new Date().toISOString();
    ticketDatabase.set(ticketId, status);
  }
}

/**
 * Mark ticket as sold (transfer ownership)
 */
export function markTicketAsSold(ticketId: string, buyerId: string): void {
  const status = ticketDatabase.get(ticketId);
  if (status) {
    status.isSold = true;
    status.isListed = false;
    status.soldTo = buyerId;
    status.soldAt = new Date().toISOString();
    ticketDatabase.set(ticketId, status);
  }
}

/**
 * Mark ticket as used (scanned at event)
 */
export function markTicketAsUsed(ticketId: string): void {
  const status = ticketDatabase.get(ticketId);
  if (status) {
    status.isUsed = true;
    status.usedAt = new Date().toISOString();
    ticketDatabase.set(ticketId, status);
  }
}

/**
 * Unlist ticket (remove from marketplace)
 */
export function unlistTicket(ticketId: string): void {
  const status = ticketDatabase.get(ticketId);
  if (status) {
    status.isListed = false;
    status.listedBy = undefined;
    status.listedAt = undefined;
    ticketDatabase.set(ticketId, status);
  }
}

/**
 * Get ticket status
 */
export function getTicketStatus(ticketId: string): TicketStatus | null {
  return ticketDatabase.get(ticketId) || null;
}
