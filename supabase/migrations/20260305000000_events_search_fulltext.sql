-- =====================================================
-- Event full-text search + marketplace improvements
-- =====================================================
-- 1. Generated tsvector column for fast autocomplete
-- 2. events_with_active_tickets view (marketplace)
-- 3. search_events() RPC for autocomplete
-- =====================================================

-- 1. Generated search_vector column
--    Automatically updated on INSERT/UPDATE, no trigger needed.
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

-- 2. GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_events_search_vector
  ON events USING GIN(search_vector);

-- 3. Index for marketplace date sorting
CREATE INDEX IF NOT EXISTS idx_events_active_date
  ON events(date ASC)
  WHERE is_active = true;

-- 4. Index for fast ticket count by event
CREATE INDEX IF NOT EXISTS idx_tickets_event_available
  ON tickets(event_id)
  WHERE status = 'available';

-- 5. View: events that have at least one available ticket
--    Used by Buy page and admin dashboards.
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

-- 6. RPC function for event autocomplete
--    Combines full-text (ranked) + ILIKE fallback so short or
--    partial queries (e.g. "gal") still return results.
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
  -- Safely parse the full-text query; fall back to ILIKE only if parsing fails.
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
    -- Rank full-text matches first, then chronological
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

-- =====================================================
-- Optional: automatic sync via pg_cron
-- Uncomment and run manually in the Supabase SQL editor
-- after enabling pg_cron + pg_net extensions.
-- Replace <YOUR_SUPABASE_URL> and <YOUR_SERVICE_ROLE_KEY>.
-- =====================================================
-- SELECT cron.schedule(
--   'sync-escp-events-6h',
--   '0 */6 * * *',
--   $$
--     SELECT net.http_post(
--       url     := '<YOUR_SUPABASE_URL>/functions/v1/sync-escp-events',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>',
--         'Content-Type',  'application/json'
--       ),
--       body    := '{"source":"cron"}'::jsonb
--     );
--   $$
-- );
