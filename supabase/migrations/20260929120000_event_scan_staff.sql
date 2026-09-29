-- Event scan staff — lets a Studio organizer hand out door-scanning access
-- for one event to people (bouncers, volunteers) WITHOUT sharing the
-- organizer's own login. Each row is a named, revocable, unguessable link
-- scoped to exactly one event and to scanning only (no payouts, no event
-- editing, no attendee export).
--
-- Management (create/list/revoke) goes through normal RLS-protected
-- table access from the Studio frontend — only the event's organizer (or a
-- global admin) can see/manage their own event's staff rows.
--
-- Actual scan validation does NOT query this table directly from the
-- client: validate-event-ticket (service-role) looks the token up
-- server-side and grants scan-only access for that one event. See that
-- function for the auth logic.

CREATE TABLE public.event_scan_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES public.organizer_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  scan_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX event_scan_staff_event_idx ON public.event_scan_staff(event_id);
CREATE INDEX event_scan_staff_token_idx ON public.event_scan_staff(token) WHERE revoked_at IS NULL;

ALTER TABLE public.event_scan_staff ENABLE ROW LEVEL SECURITY;

-- Owner (via organizer_profiles.user_id) or global admin can fully manage
-- their own event's staff rows. No policy at all for anon/other users —
-- token lookup for actual scanning happens inside the service-role edge
-- function, never through a client-side RLS-gated read.
CREATE POLICY "organizer_manage_own_scan_staff" ON public.event_scan_staff
  FOR ALL
  TO authenticated
  USING (
    organizer_id IN (SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    organizer_id IN (SELECT id FROM public.organizer_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE public.event_scan_staff IS
  'Named, revocable door-scan links for Studio events. Management is RLS-gated to the owning organizer/admin; the scan-time token check happens in the validate-event-ticket edge function (service role), not via a client read of this table.';
