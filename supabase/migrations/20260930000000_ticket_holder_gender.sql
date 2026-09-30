-- Ticket holder gender, collected on the Studio primary-sale nominative form
-- (EventPublic.tsx) alongside the existing holder_first_name/last_name/email,
-- and surfaced to organizers in Studio attendee stats.

ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS holder_gender TEXT
    CHECK (holder_gender IS NULL OR holder_gender IN ('female', 'male', 'other'));
