-- Add ends_at to events table (if not already present)
-- and backfill existing rows: ends_at = date + 8 hours
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Backfill: if ends_at is missing, set it to date + 8 h
UPDATE public.events
SET ends_at = date + INTERVAL '8 hours'
WHERE ends_at IS NULL AND date IS NOT NULL;
