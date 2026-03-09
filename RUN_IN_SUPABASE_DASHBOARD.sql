-- =====================================================================
-- Ticket Safe — Consolidated DB setup
-- Run once in: Supabase Dashboard → SQL Editor → Run All
-- Safe to re-run (all statements are idempotent).
-- =====================================================================

-- ── 1. Ticket table columns ──────────────────────────────────────────
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS selling_price        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quantity             INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS qr_hash              TEXT,
  ADD COLUMN IF NOT EXISTS qr_verified          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_url             TEXT,
  ADD COLUMN IF NOT EXISTS expires_at           TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending','verified','rejected'));
  END IF;
END $$;

-- Make original_price nullable (submit-listing does not send it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'original_price'
  ) THEN
    ALTER TABLE public.tickets ALTER COLUMN original_price DROP NOT NULL;
    ALTER TABLE public.tickets ALTER COLUMN original_price SET DEFAULT NULL;
  END IF;
END $$;

-- Drop legacy price-validation trigger if present
DROP TRIGGER IF EXISTS validate_ticket_price_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.validate_ticket_price();

-- Unique index on qr_hash (prevents duplicate listings)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_hash
  ON public.tickets (qr_hash)
  WHERE qr_hash IS NOT NULL;

-- ── 2. Events table columns ──────────────────────────────────────────
-- Make location nullable (needed by create_stub_event)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events'
      AND column_name = 'location' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.events ALTER COLUMN location DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ends_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_source    TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id  TEXT,
  ADD COLUMN IF NOT EXISTS needs_review       BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill ends_at from date (default 8 hours after start)
UPDATE public.events
SET ends_at = date + INTERVAL '8 hours'
WHERE ends_at IS NULL AND date IS NOT NULL;

-- Full-text search vector
ALTER TABLE public.events
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
  ON public.events USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_events_active_date
  ON public.events(date ASC)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_unique
  ON public.events (external_source, external_event_id)
  WHERE external_source IS NOT NULL AND external_event_id IS NOT NULL;

-- ── 3. Stripe tables ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_account_id   text        NOT NULL,
  onboarding_status   text        NOT NULL DEFAULT 'pending'
                                  CHECK (onboarding_status IN ('pending','restricted','complete')),
  charges_enabled     boolean     NOT NULL DEFAULT false,
  payouts_enabled     boolean     NOT NULL DEFAULT false,
  details_submitted   boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (stripe_account_id)
);

ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stripe_accounts' AND policyname = 'stripe_accounts_select_own'
  ) THEN
    CREATE POLICY "stripe_accounts_select_own" ON public.stripe_accounts
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_accounts_user_id    ON public.stripe_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_account_id ON public.stripe_accounts (stripe_account_id);

-- Stripe columns on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS fee_amount                  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity                    integer       NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_session
  ON public.transactions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ── 4. search_events() RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_events(
  query       text,
  max_results int DEFAULT 10
)
RETURNS SETOF public.events
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
  FROM public.events e
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

GRANT EXECUTE ON FUNCTION public.search_events(text, int) TO anon, authenticated;

-- ── 5. create_stub_event() RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stub_event(
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

  INSERT INTO public.events (
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

GRANT EXECUTE ON FUNCTION public.create_stub_event(TEXT, TIMESTAMPTZ) TO authenticated;

-- ── 6. View: events with available tickets ───────────────────────────
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
  COUNT(t.id)::int     AS ticket_count,
  MIN(t.selling_price) AS min_price,
  MAX(t.selling_price) AS max_price
FROM public.events e
INNER JOIN public.tickets t ON t.event_id = e.id AND t.status = 'available'
WHERE e.is_active = true
GROUP BY e.id
ORDER BY e.date ASC;

GRANT SELECT ON events_with_active_tickets TO anon, authenticated;

-- ── 7. Test events (for dev/staging) ─────────────────────────────────
INSERT INTO public.events (id, title, description, date, ends_at, location, category, university, campus, base_price, is_active)
VALUES
  (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Turin Campus Gala 2026',
    'The unmissable event of the year at ESCP Turin Campus. Black tie required.',
    '2026-05-23T20:00:00+02:00',
    '2026-05-24T03:00:00+02:00',
    'Turin, Italy',
    'Galas',
    'ESCP Business School',
    'Turin',
    75.00,
    true
  ),
  (
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'BDE Paris Spring Party',
    'The BDE Paris annual spring party. DJ, open bar, students from all campuses.',
    '2026-04-18T22:00:00+02:00',
    '2026-04-19T04:00:00+02:00',
    'Paris, France',
    'Parties',
    'ESCP Business School',
    'Paris',
    30.00,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active   = EXCLUDED.is_active,
  base_price  = EXCLUDED.base_price,
  ends_at     = EXCLUDED.ends_at;
