-- =====================================================================
-- Add file_url, expires_at, verification_status to tickets
-- Safe to run multiple times (all statements are idempotent).
-- =====================================================================

-- 1. file_url — public URL of the uploaded ticket file (PDF or image)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 2. expires_at — when the ticket is no longer valid (usually = event date).
--    Populated server-side from the event date at listing time.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. verification_status — granular QR/ticket verification state.
--    Separate from `status` (listing status) so both concerns are explicit.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN (
      'pending',   -- just submitted, not yet reviewed
      'verified',  -- QR confirmed valid by admin / automated check
      'rejected',  -- QR is invalid or already used
      'sold',      -- ticket has been transferred to buyer
      'used',      -- ticket was scanned at entry
      'expired'    -- event has passed
    ));

-- 4. Index: admin dashboard query — "show me all pending/rejected tickets"
CREATE INDEX IF NOT EXISTS idx_tickets_verification_status
  ON public.tickets (verification_status)
  WHERE verification_status IN ('pending', 'rejected');
