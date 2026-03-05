-- =====================================================
-- Consolidated setup migration
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Safely idempotent (all statements use IF NOT EXISTS
-- or CREATE OR REPLACE).
-- =====================================================

-- ── 1. events table: external source tracking ───────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS external_source    TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id  TEXT,
  ADD COLUMN IF NOT EXISTS needs_review       BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_unique
  ON events (external_source, external_event_id)
  WHERE external_source IS NOT NULL
    AND external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_external_source
  ON events (external_source)
  WHERE external_source IS NOT NULL;

-- ── 2. events table: full-text search vector ────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple',
        coalesce(title,       '') || ' ' ||
        coalesce(location,    '') || ' ' ||
        coalesce(category,    '') || ' ' ||
        coalesce(university,  '') || ' ' ||
        coalesce(campus,      '') || ' ' ||
        coalesce(description, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_events_search_vector
  ON events USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_events_active_date
  ON events(date ASC)
  WHERE is_active = true;

-- ── 3. tickets: index for fast event availability lookup ────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_event_available
  ON tickets(event_id)
  WHERE status = 'available';

-- ── 4. sync_state table (for iCal ETag caching) ─────────────────────────────
CREATE TABLE IF NOT EXISTS sync_state (
  key           TEXT PRIMARY KEY,
  etag          TEXT,
  last_modified TEXT,
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
-- No policies → only service role (edge functions) can access

-- ── 5. escp_events table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escp_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ical_uid           TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  location           TEXT,
  start_date         TIMESTAMPTZ NOT NULL,
  end_date           TIMESTAMPTZ,
  organizer          TEXT,
  category           TEXT DEFAULT 'Other',
  url                TEXT,
  is_active          BOOLEAN DEFAULT TRUE,
  last_synced_at     TIMESTAMPTZ,
  ical_last_modified TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read escp_events" ON escp_events
  FOR SELECT USING (true);

-- ── 6. View: events with available tickets ───────────────────────────────────
DROP VIEW IF EXISTS events_with_active_tickets;
CREATE VIEW events_with_active_tickets AS
SELECT
  e.id,
  e.title,
  e.date,
  e.location,
  e.category,
  e.university,
  e.campus,
  e.image_url,
  e.base_price,
  e.external_source,
  e.external_event_id,
  e.needs_review,
  COUNT(t.id)::int       AS ticket_count,
  MIN(t.selling_price)   AS min_price,
  MAX(t.selling_price)   AS max_price
FROM events e
INNER JOIN tickets t
  ON t.event_id = e.id
  AND t.status = 'available'
WHERE e.is_active = true
GROUP BY e.id
ORDER BY e.date ASC;

GRANT SELECT ON events_with_active_tickets TO anon, authenticated;

-- ── 7. search_events() RPC for autocomplete ──────────────────────────────────
CREATE OR REPLACE FUNCTION search_events(
  query       text,
  max_results int DEFAULT 10
)
RETURNS SETOF events
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  BEGIN
    ts_query := websearch_to_tsquery('simple', query);
  EXCEPTION WHEN OTHERS THEN
    ts_query := NULL;
  END;

  RETURN QUERY
  SELECT e.*
  FROM events e
  WHERE
    e.is_active = true
    AND e.date::timestamptz > NOW()
    AND (
      (ts_query IS NOT NULL AND e.search_vector @@ ts_query)
      OR e.title      ILIKE '%' || query || '%'
      OR e.location   ILIKE '%' || query || '%'
      OR e.university ILIKE '%' || query || '%'
      OR e.category   ILIKE '%' || query || '%'
    )
  ORDER BY
    CASE
      WHEN ts_query IS NOT NULL
      THEN ts_rank(e.search_vector, ts_query)
      ELSE 0::float4
    END DESC,
    e.date ASC
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION search_events(text, int) TO anon, authenticated;

-- ── 8. create_stub_event() RPC ───────────────────────────────────────────────
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'Event title must be at least 3 characters';
  END IF;

  IF p_starts_at < NOW() THEN
    RAISE EXCEPTION 'Event date must be in the future';
  END IF;

  INSERT INTO events (
    title, date, location, category, university,
    campus, base_price, image_url, is_active, needs_review
  )
  VALUES (
    trim(p_title), p_starts_at, NULL, 'Other',
    'ESCP Business School', NULL, NULL, NULL, TRUE, TRUE
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_stub_event(TEXT, TIMESTAMPTZ) TO authenticated;

-- ── 9. Account lockout RPCs (auth security) ──────────────────────────────────
CREATE OR REPLACE FUNCTION check_account_lockout(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT
    failed_login_attempts >= 5
    AND locked_until IS NOT NULL
    AND locked_until > NOW()
  INTO v_locked
  FROM profiles
  WHERE email = user_email;

  RETURN COALESCE(v_locked, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION check_account_lockout(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION increment_failed_login(user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET
    failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
    locked_until = CASE
      WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5
      THEN NOW() + INTERVAL '15 minutes'
      ELSE locked_until
    END
  WHERE email = user_email;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_failed_login(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION reset_failed_login(user_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET failed_login_attempts = 0, locked_until = NULL
  WHERE email = user_email;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_failed_login(TEXT) TO anon, authenticated;

-- ── 10. Cron + pg_net setup (run manually, see instructions below) ───────────
-- To enable automatic 6-hour sync of the ESCP iCal feed:
--
-- Step 1: Enable extensions (run once):
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- Step 2: Schedule the sync (replace YOUR_SERVICE_ROLE_KEY):
--   SELECT cron.schedule(
--     'sync-escp-events-6h',
--     '0 */6 * * *',
--     $$
--       SELECT net.http_post(
--         url     := 'https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/sync-escp-events',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
--           'Content-Type',  'application/json'
--         ),
--         body    := '{"source":"cron"}'::jsonb
--       );
--     $$
--   );
--
-- Step 3: Verify it is running:
--   SELECT * FROM cron.job;
