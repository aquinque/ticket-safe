-- ======================================================
-- Migration: External event source tracking
-- Date: 2026-02-20
-- Adds external_source, external_event_id, needs_review
-- to the events table so that events imported from
-- third-party platforms (CampusGroups / CampusLife, etc.)
-- can be tracked, deduplicated, and flagged for review.
-- ======================================================

-- 1. New columns
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS external_source    TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id  TEXT,
  ADD COLUMN IF NOT EXISTS needs_review       BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Unique constraint: one (source, external_id) pair per row.
--    Both columns must be non-NULL for the constraint to apply,
--    so legacy rows without a source are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_unique
  ON events (external_source, external_event_id)
  WHERE external_source IS NOT NULL
    AND external_event_id IS NOT NULL;

-- 3. Plain index for fast look-up by source
CREATE INDEX IF NOT EXISTS idx_events_external_source
  ON events (external_source)
  WHERE external_source IS NOT NULL;

-- 4. Sparse index — admin tool only needs events flagged for review
CREATE INDEX IF NOT EXISTS idx_events_needs_review
  ON events (needs_review)
  WHERE needs_review = TRUE;

COMMENT ON COLUMN events.external_source    IS 'Originating platform identifier, e.g. "campusgroups/campuslife.escp.eu"';
COMMENT ON COLUMN events.external_event_id  IS 'Platform-specific event ID (e.g. CampusGroups type_id)';
COMMENT ON COLUMN events.needs_review       IS 'TRUE when auto-imported with incomplete data; an admin should fill in the missing fields.';
