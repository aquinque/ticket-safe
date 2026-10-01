-- CRITICAL FIX (launch audit): "Public can read active events" only checked
-- is_active=true, never status='published'. Draft/unpublished/cancelled
-- events default to is_active=true (StudioEventNew inserts them that way,
-- and unpublish()/cancel-event never flip is_active back to false), so any
-- such event was readable by anon/authenticated via a direct `events` query
-- -- which is exactly what src/hooks/useESCPEvents.tsx (Marketplace.tsx,
-- EventsCatalog.tsx) does, with no status filter of its own. Close the gap
-- at the RLS layer too, not just in that one hook.

DROP POLICY IF EXISTS "Public can read active events" ON public.events;

CREATE POLICY "Public can read active events"
  ON public.events FOR SELECT
  USING (is_active = true AND status = 'published');
