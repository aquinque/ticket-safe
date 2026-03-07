-- =====================================================================
-- Fix ticket listing + add test events (Turin Campus Gala + Party)
--
-- Problems fixed:
--   1. original_price NOT NULL prevents insert from submit-listing
--   2. validate_ticket_price trigger blocks inserts (50-150% rule)
--   3. location column may still be NOT NULL (blocks stub events)
--
-- Events added:
--   - Turin Campus Gala 2026  (Galas,    base_price 75)
--   - BDE Paris Spring Party  (Parties,  base_price 30)
-- =====================================================================

-- ── 1. Make original_price nullable so submit-listing can insert ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'original_price'
  ) THEN
    ALTER TABLE public.tickets ALTER COLUMN original_price DROP NOT NULL;
    ALTER TABLE public.tickets ALTER COLUMN original_price SET DEFAULT NULL;
  END IF;
END $$;

-- ── 2. Drop the legacy price-validation trigger ────────────────────────────────
DROP TRIGGER IF EXISTS validate_ticket_price_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.validate_ticket_price();

-- ── 3. Make location nullable (needed by create_stub_event) ──────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'events'
      AND column_name  = 'location'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN location DROP NOT NULL;
  END IF;
END $$;

-- ── 4. Ensure all columns required by submit-listing exist ─────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS selling_price        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quantity             INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS qr_hash              TEXT,
  ADD COLUMN IF NOT EXISTS qr_verified          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_url             TEXT,
  ADD COLUMN IF NOT EXISTS expires_at           TIMESTAMPTZ;

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
        CHECK (verification_status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

-- Unique index on qr_hash (prevents duplicate listings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_hash
  ON public.tickets (qr_hash)
  WHERE qr_hash IS NOT NULL;

-- ── 5. Ensure ends_at exists on events ────────────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Backfill any rows where ends_at is NULL
UPDATE public.events
SET ends_at = date + INTERVAL '8 hours'
WHERE ends_at IS NULL AND date IS NOT NULL;

-- ── 6. Turin Campus Gala 2026 ─────────────────────────────────────────────────
INSERT INTO public.events (
  id,
  title,
  description,
  date,
  ends_at,
  location,
  category,
  university,
  campus,
  base_price,
  is_active,
  image_url
)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Turin Campus Gala 2026',
  'The unmissable event of the year at ESCP Turin Campus. An exceptional evening gathering students, alumni and guests for a gala dinner followed by a dance night. Black tie required.',
  '2026-05-23T20:00:00+02:00',
  '2026-05-24T03:00:00+02:00',
  'Turin, Italy',
  'Galas',
  'ESCP Business School',
  'Turin',
  75.00,
  true,
  null
)
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active,
  base_price  = EXCLUDED.base_price;

-- ── 7. BDE Paris Spring Party ─────────────────────────────────────────────────
INSERT INTO public.events (
  id,
  title,
  description,
  date,
  ends_at,
  location,
  category,
  university,
  campus,
  base_price,
  is_active,
  image_url
)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'BDE Paris Spring Party',
  'The BDE Paris annual spring party. DJ, open bar, and a great atmosphere with students from all campuses.',
  '2026-04-18T22:00:00+02:00',
  '2026-04-19T04:00:00+02:00',
  'Paris, France',
  'Parties',
  'ESCP Business School',
  'Paris',
  30.00,
  true,
  null
)
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active,
  base_price  = EXCLUDED.base_price;
