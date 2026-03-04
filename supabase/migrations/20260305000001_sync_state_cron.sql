-- =====================================================
-- Sync state table + stub event RPC + cron setup
-- =====================================================
-- 1. sync_state: persists ETag/Last-Modified between syncs
-- 2. ical_last_modified column on escp_events
-- 3. create_stub_event(): authenticated sellers can create a
--    placeholder event when theirs isn't listed yet
-- 4. pg_net + cron: instructions to schedule automatic sync
-- =====================================================

-- 1. sync_state table
CREATE TABLE IF NOT EXISTS sync_state (
  key           TEXT PRIMARY KEY,
  etag          TEXT,
  last_modified TEXT,
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Only the Edge Function (service role) may write; anon/authenticated may not read
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies → only service role bypasses RLS

-- 2. Track per-event iCal modification time so we can skip unchanged events
ALTER TABLE escp_events
  ADD COLUMN IF NOT EXISTS ical_last_modified TIMESTAMPTZ;

-- 3. create_stub_event
--    Called by authenticated sellers when their event is not in the catalog.
--    Creates a minimal events row with needs_review = true; an admin should
--    fill in base_price, campus, and other details before the listing goes live.
--
--    Returns the new events.id (UUID).
CREATE OR REPLACE FUNCTION create_stub_event(
  p_title     TEXT,
  p_starts_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Basic sanity checks
  IF length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'Event title must be at least 3 characters';
  END IF;

  IF p_starts_at < NOW() THEN
    RAISE EXCEPTION 'Event date must be in the future';
  END IF;

  INSERT INTO events (
    title,
    date,
    location,
    category,
    university,
    campus,
    base_price,
    image_url,
    is_active,
    needs_review
  )
  VALUES (
    trim(p_title),
    p_starts_at,
    NULL,          -- admin will fill in
    'Other',
    'ESCP Business School',
    NULL,          -- admin will fill in
    NULL,          -- no price cap until admin sets base_price
    NULL,
    TRUE,
    TRUE           -- flags for admin review queue
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Any logged-in user can create a stub
GRANT EXECUTE ON FUNCTION create_stub_event(TEXT, TIMESTAMPTZ) TO authenticated;

-- =====================================================
-- 4. Automatic sync via pg_cron + pg_net
--
-- Prerequisites (run once in the Supabase dashboard SQL editor):
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- Then schedule the sync every 6 hours by running the block below,
-- replacing the two placeholder values:
--   <SUPABASE_URL>         → your project URL, e.g. https://xyz.supabase.co
--   <SERVICE_ROLE_KEY>     → Settings → API → service_role key
--
-- SELECT cron.schedule(
--   'sync-escp-events-6h',
--   '0 */6 * * *',
--   $$
--     SELECT net.http_post(
--       url     := '<SUPABASE_URL>/functions/v1/sync-escp-events',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--         'Content-Type',  'application/json'
--       ),
--       body    := '{"source":"cron"}'::jsonb
--     );
--   $$
-- );
--
-- To verify it's running:
--   SELECT * FROM cron.job;
--
-- To remove it:
--   SELECT cron.unschedule('sync-escp-events-6h');
-- =====================================================
