-- =====================================================================
-- Ensure all columns required by submit-listing exist on tickets.
-- Safe to run multiple times (IF NOT EXISTS / DROP NOT NULL is idempotent).
-- Run this in the Supabase SQL Editor if any previous migration was missed.
-- =====================================================================

-- selling_price (may have existed but ensure it's there)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS selling_price  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quantity       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS qr_hash        TEXT,
  ADD COLUMN IF NOT EXISTS qr_verified    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_url       TEXT,
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;

-- verification_status — add if missing, default 'pending'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'verification_status'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending','verified','rejected'));
  END IF;
END $$;

-- original_price — make nullable so inserts without it don't fail
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'original_price'
  ) THEN
    ALTER TABLE public.tickets
      ALTER COLUMN original_price DROP NOT NULL;
    ALTER TABLE public.tickets
      ALTER COLUMN original_price SET DEFAULT NULL;
  END IF;
END $$;

-- Drop legacy price-validation trigger if still present
DROP TRIGGER IF EXISTS validate_ticket_price_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.validate_ticket_price();

-- Unique index on qr_hash to prevent duplicate listings
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_hash
  ON public.tickets (qr_hash)
  WHERE qr_hash IS NOT NULL;
