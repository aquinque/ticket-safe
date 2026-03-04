-- ============================================================
-- Gala de l'ESCP — Event seeding
-- ============================================================
-- Inserts the Gala de l'ESCP 2026 into:
--   1. events       → used by the marketplace / sell-listing flow
--   2. escp_events  → used by the events catalog & listing pages
--
-- Fixed UUIDs so the frontend page can reference them by ID.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0. Relax the events RLS so any authenticated user can browse all active
--    events (not just their own university's). A marketplace should be open.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view active events from their university"
  ON public.events;

CREATE POLICY "Authenticated users can view all active events"
  ON public.events
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND is_active = true
  );

-- Also allow anonymous browsing (event detail pages don't require login)
CREATE POLICY "Anonymous users can view all active events"
  ON public.events
  FOR SELECT
  USING (
    auth.role() = 'anon'
    AND is_active = true
  );

-- ---------------------------------------------------------------------------
-- 1. Insert into events (used by the tickets / marketplace system)
-- ---------------------------------------------------------------------------

INSERT INTO public.events (
  id,
  title,
  description,
  date,
  location,
  category,
  university,
  campus,
  base_price,
  is_active,
  image_url
)
VALUES (
  'c4f6a801-b2d9-4e7f-a315-8c9d2e0f4b67',
  'Gala de l''ESCP 2026',
  'Le Gala de l''ESCP est l''événement incontournable de l''année estudiantine. Une soirée d''exception dans l''un des plus beaux palais de Paris, réunissant étudiants, alumni et invités autour d''un dîner de gala, suivie d''une soirée dansante. Tenue de soirée de rigueur.',
  '2026-04-25T19:00:00+02:00',
  'Palais Cambon – Capucines, Paris 1er',
  'Galas',
  'ESCP Business School',
  'Paris',
  90.00,
  true,
  null
)
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- 2. Insert into escp_events (used by the events listing / catalog pages)
-- ---------------------------------------------------------------------------

INSERT INTO public.escp_events (
  id,
  ical_uid,
  title,
  description,
  location,
  organizer,
  category,
  start_date,
  end_date,
  is_active,
  metadata
)
VALUES (
  'd7e5b920-c3f8-4a61-b429-9d0e3f1a5c78',
  'gala-escp-2026@ticketsafe.escp.eu',
  'Gala de l''ESCP 2026',
  'Le Gala de l''ESCP est l''événement incontournable de l''année estudiantine. Une soirée d''exception dans l''un des plus beaux palais de Paris, réunissant étudiants, alumni et invités autour d''un dîner de gala, suivi d''une soirée dansante. Tenue de soirée de rigueur.',
  'Palais Cambon – Capucines, Paris 1er',
  'BDE ESCP Paris',
  'Galas',
  '2026-04-25T19:00:00+02:00',
  '2026-04-26T03:00:00+02:00',
  true,
  '{"price": 90, "dress_code": "Black Tie", "campus": "Paris", "featured": true}'::jsonb
)
ON CONFLICT (ical_uid) DO UPDATE SET
  title      = EXCLUDED.title,
  is_active  = EXCLUDED.is_active,
  metadata   = EXCLUDED.metadata;
