-- Extend organizer_profiles with the application-time fields that the
-- /organizers/apply form collects (first planned event + expected attendees).
-- These help the admin make an informed approval decision.

ALTER TABLE public.organizer_profiles
  ADD COLUMN IF NOT EXISTS first_event_name TEXT
    CHECK (first_event_name IS NULL OR length(first_event_name) <= 200),
  ADD COLUMN IF NOT EXISTS first_event_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_attendees INTEGER
    CHECK (expected_attendees IS NULL OR (expected_attendees > 0 AND expected_attendees <= 100000));
