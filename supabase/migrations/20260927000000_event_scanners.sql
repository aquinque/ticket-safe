-- Door-scan sub-accounts: an organizer can grant a specific person
-- scan-only access to a specific event, without sharing their own Studio
-- login. Revocable at any time, scoped to one event.

CREATE TABLE IF NOT EXISTS public.event_scanners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organizer_id   UUID NOT NULL REFERENCES public.organizer_profiles(id) ON DELETE CASCADE,
  scanner_email  TEXT NOT NULL,
  invited_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ,
  UNIQUE (event_id, scanner_email)
);

CREATE INDEX IF NOT EXISTS event_scanners_event_idx ON public.event_scanners(event_id);
CREATE INDEX IF NOT EXISTS event_scanners_email_idx ON public.event_scanners(lower(scanner_email));

ALTER TABLE public.event_scanners ENABLE ROW LEVEL SECURITY;

-- Organizers manage the scanner list for events they own.
DROP POLICY IF EXISTS "Organizers manage their event scanners" ON public.event_scanners;
CREATE POLICY "Organizers manage their event scanners"
  ON public.event_scanners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organizer_profiles op
      WHERE op.id = event_scanners.organizer_id
        AND op.user_id = auth.uid()
        AND op.status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizer_profiles op
      WHERE op.id = event_scanners.organizer_id
        AND op.user_id = auth.uid()
        AND op.status = 'approved'
    )
  );

-- A scanner can see their own active grants (so the Studio scan page can
-- list events they've been given access to).
DROP POLICY IF EXISTS "Scanners can read their own grants" ON public.event_scanners;
CREATE POLICY "Scanners can read their own grants"
  ON public.event_scanners FOR SELECT
  USING (
    revoked_at IS NULL
    AND lower(scanner_email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_scanners TO authenticated;
