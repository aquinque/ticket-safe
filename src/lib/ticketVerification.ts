/**
 * Ticket Verification Service
 *
 * This service handles QR code verification and anti-fraud checks for the resale marketplace.
 * It ensures that only authentic, unused tickets can be listed for resale.
 */

import { TicketQRData, TicketVerificationResult, TicketVerificationError, TicketStatus } from '@/types/ticketVerification';

// Mock database of tickets (in production, this would be a real database or API)
const ticketDatabase: Map<string, TicketStatus> = new Map();

// Mock database of valid ticket hashes from event organizers
const validTicketHashes: Set<string> = new Set([
  // These would come from the event organizer's system
  'QR-EBS-SKI-2025-001',
  'QR-EBS-SKI-2025-002',
  'QR-EBS-SKI-2025-003',
  'QR-EBS-SKI-2025-004',
  'QR-EBS-SKI-2025-005',
]);

/**
 * Parse QR code data from uploaded image/PDF
 * In production, this would use a real QR code scanner library
 */
export async function parseQRCode(file: File): Promise<TicketQRData | null> {
  try {
    // Simulate QR code parsing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock QR data extraction
    // In production, use a library like 'jsqr' or 'html5-qrcode'
    const mockTicketId = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
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
  eventId: string,
  userId: string
): Promise<TicketVerificationResult> {
  const errors: TicketVerificationError[] = [];
  const warnings: string[] = [];

  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // CHECK 1: Verify QR code is valid and from official source
  if (!validTicketHashes.has(qrData.qrHash)) {
    errors.push(TicketVerificationError.FAKE_TICKET);
  }

  // CHECK 2: Verify ticket is for the correct event
  if (qrData.eventId !== eventId) {
    errors.push(TicketVerificationError.WRONG_EVENT);
  }

  // CHECK 3: Check if ticket exists in our system
  const ticketStatus = ticketDatabase.get(qrData.ticketId);

  if (ticketStatus) {
    // CHECK 4: Verify ticket hasn't been used
    if (ticketStatus.isUsed) {
      errors.push(TicketVerificationError.ALREADY_USED);
    }

    // CHECK 5: Verify ticket isn't already listed
    if (ticketStatus.isListed && ticketStatus.listedBy !== userId) {
      errors.push(TicketVerificationError.ALREADY_LISTED);
    }

    // CHECK 6: Verify ticket hasn't been sold
    if (ticketStatus.isSold) {
      errors.push(TicketVerificationError.ALREADY_SOLD);
    }
  } else {
    // First time this ticket is being verified - create status entry
    ticketDatabase.set(qrData.ticketId, {
      ticketId: qrData.ticketId,
      eventId: qrData.eventId,
      isUsed: false,
      isListed: false,
      isSold: false,
      verifiedAt: new Date().toISOString(),
    });
  }

  // CHECK 7: Verify ticket hasn't expired (event date check)
  const eventDate = new Date('2025-12-13'); // EBS Ski Trip date
  const now = new Date();
  if (now > eventDate) {
    errors.push(TicketVerificationError.EXPIRED);
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
export function markTicketAsListed(ticketId: string, userId: string, listingId: string): void {
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
