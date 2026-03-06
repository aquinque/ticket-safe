-- =====================================================
-- Ensure all marketplace columns exist on tickets
-- + add external-ticket verification support
-- Safe, idempotent — every statement uses IF NOT EXISTS
-- =====================================================

-- 1. Guarantee every column the marketplace code uses.
--    IF NOT EXISTS means already-present columns are untouched.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS selling_price        NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS quantity             INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS qr_hash              TEXT,
  ADD COLUMN IF NOT EXISTS qr_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_review         BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_errors  JSONB;

-- 2. Unique index: one QR per listing; NULLs are excluded so
--    legacy rows without a hash are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_hash_unique
  ON public.tickets (qr_hash)
  WHERE qr_hash IS NOT NULL;

-- 3. Minimal public view — only columns added above + the PK/FK/status
--    columns that are present in every possible tickets schema.
DROP VIEW IF EXISTS available_tickets_public;

CREATE VIEW available_tickets_public AS
  SELECT
    id,
    event_id,
    seller_id,
    status,
    selling_price,
    quantity,
    notes,
    qr_verified,
    needs_review,
    verification_errors,
    created_at,
    updated_at
  FROM public.tickets
  WHERE status = 'available';

GRANT SELECT ON available_tickets_public TO authenticated, anon;

-- 4. create_stub_event: lets a seller create a draft event when their
--    event is not in the catalog yet.  Flagged needs_review=TRUE so an
--    admin can complete it before it goes fully public.
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
  v_id UUID;
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
    title, date, is_active, needs_review,
    university, category
  )
  VALUES (
    trim(p_title), p_starts_at, TRUE, TRUE,
    'ESCP Business School', 'Other'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  -- Row already exists — return the existing id
  SELECT id INTO v_id
  FROM public.events
  WHERE trim(title) = trim(p_title)
    AND date = p_starts_at
  LIMIT 1;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stub_event(TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON COLUMN public.tickets.qr_verified IS
  'TRUE if QR was HMAC/JWT verified against TICKET_SIGNING_SECRET; '
  'FALSE for unverified external tickets.';
COMMENT ON COLUMN public.tickets.needs_review IS
  'TRUE for external/unverified tickets pending admin review. '
  'Set to NOT qr_verified at listing time.';
COMMENT ON COLUMN public.tickets.verification_errors IS
  'Optional JSONB array of verification error details for admin review.';
