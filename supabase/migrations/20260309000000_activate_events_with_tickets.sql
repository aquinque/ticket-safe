-- =====================================================================
-- Activate events that have available tickets but are missing base_price
--
-- Problems fixed:
--   1. Stub events created by create_stub_event have base_price = NULL
--      → excluded from useESCPEvents filter (base_price > 0)
--   2. Gala de l'ESCP migration may not have been applied to live DB
--
-- Fix:
--   a. Upsert Gala de l'ESCP 2026 with proper base_price + is_active
--   b. For all events with base_price IS NULL that have >= 1 available
--      ticket, set base_price = min(selling_price) of those tickets
--      and is_active = true so they appear in the catalogue
-- =====================================================================

-- ── 1. Ensure Gala de l'ESCP 2026 exists with correct values ─────────────────
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
  base_price  = EXCLUDED.base_price,
  is_active   = EXCLUDED.is_active;

-- ── 2. Ensure Turin Campus Gala 2026 exists ───────────────────────────────────
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
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Turin Campus Gala 2026',
  'The unmissable event of the year at ESCP Turin Campus. An exceptional evening gathering students, alumni and guests for a gala dinner followed by a dance night. Black tie required.',
  '2026-05-23T20:00:00+02:00',
  'Turin, Italy',
  'Galas',
  'ESCP Business School',
  'Turin',
  75.00,
  true,
  null
)
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  base_price  = EXCLUDED.base_price,
  is_active   = EXCLUDED.is_active;

-- ── 3. Ensure BDE Paris Spring Party exists ───────────────────────────────────
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
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'BDE Paris Spring Party',
  'The BDE Paris annual spring party. DJ, open bar, and a great atmosphere with students from all campuses.',
  '2026-04-18T22:00:00+02:00',
  'Paris, France',
  'Parties',
  'ESCP Business School',
  'Paris',
  30.00,
  true,
  null
)
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  base_price  = EXCLUDED.base_price,
  is_active   = EXCLUDED.is_active;

-- ── 4. Fix all stub events: set base_price from their cheapest available ticket
--       so they appear in the catalogue (useESCPEvents filters base_price > 0)
UPDATE public.events e
SET
  base_price = sub.min_price,
  is_active  = true
FROM (
  SELECT
    t.event_id,
    MIN(t.selling_price) AS min_price
  FROM public.tickets t
  WHERE t.status = 'available'
    AND t.selling_price IS NOT NULL
    AND t.selling_price > 0
  GROUP BY t.event_id
) sub
WHERE e.id = sub.event_id
  AND (e.base_price IS NULL OR e.base_price = 0);
