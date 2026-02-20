-- ======================================================
-- Migration: QR-verified ticket listings
-- Date: 2026-02-20
-- Adds qr_hash + qr_verified to tickets table so that
-- every marketplace listing is backed by a scanned/pasted
-- QR code, with deduplication enforced at DB level.
-- ======================================================

-- 1. Add qr_hash (SHA-256 of the raw QR payload)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS qr_hash TEXT,
  ADD COLUMN IF NOT EXISTS qr_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Unique index: one QR can only be listed once across the whole marketplace.
--    NULL values are excluded so legacy rows without a hash are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_hash_unique
  ON tickets (qr_hash)
  WHERE qr_hash IS NOT NULL;

-- 3. Composite index for fast marketplace page queries:
--    "give me all available tickets for event X, newest first"
CREATE INDEX IF NOT EXISTS idx_tickets_marketplace
  ON tickets (status, event_id, created_at DESC)
  WHERE status = 'available';

-- 4. Recreate the public view to expose qr_verified
--    (so the buyer page can show the "Verified" badge from DB data)
DROP VIEW IF EXISTS available_tickets_public;

CREATE VIEW available_tickets_public AS
  SELECT
    id,
    event_id,
    seller_id,
    original_price,
    selling_price,
    quantity,
    notes,
    status,
    qr_verified,
    created_at,
    updated_at
  FROM tickets
  WHERE status = 'available';

-- Restore grants lost by DROP VIEW
GRANT SELECT ON available_tickets_public TO authenticated, anon;

COMMENT ON COLUMN tickets.qr_hash IS
  'SHA-256 hex digest of the raw QR payload. NULL for legacy listings. UNIQUE to prevent duplicate listings.';
COMMENT ON COLUMN tickets.qr_verified IS
  'TRUE if the QR was verified by HMAC/JWT signature against TICKET_SIGNING_SECRET; FALSE for unverified external tickets.';
