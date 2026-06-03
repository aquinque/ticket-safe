-- Studio P0 wave 2: nominative tickets + per-buyer limit + explicit ticket status
-- (Applied to production via MCP. This file is the on-disk twin for version control.)

-- 1. Nominative ticket holder fields on event_tickets
ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS holder_first_name TEXT
    CHECK (holder_first_name IS NULL OR length(holder_first_name) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS holder_last_name TEXT
    CHECK (holder_last_name IS NULL OR length(holder_last_name) BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS holder_email TEXT
    CHECK (holder_email IS NULL OR length(holder_email) BETWEEN 3 AND 254);

-- 2. Explicit ticket status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_ticket_status') THEN
    CREATE TYPE public.event_ticket_status AS ENUM ('valid', 'scanned', 'cancelled', 'refunded');
  END IF;
END$$;

ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS status public.event_ticket_status NOT NULL DEFAULT 'valid';

UPDATE public.event_tickets
SET status = 'scanned'
WHERE scanned_at IS NOT NULL AND status = 'valid';

CREATE INDEX IF NOT EXISTS event_tickets_status_idx ON public.event_tickets (status);

-- 3. Per-event buyer limit (NULL = unlimited)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS max_tickets_per_buyer INTEGER
    CHECK (max_tickets_per_buyer IS NULL OR max_tickets_per_buyer BETWEEN 1 AND 50);

-- 4. Count-already-committed RPC for the per-buyer enforcement check
CREATE OR REPLACE FUNCTION public.buyer_ticket_count_for_event(
  p_event_id UUID,
  p_buyer_id UUID
) RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(quantity), 0)::INTEGER
  FROM public.event_orders
  WHERE event_id = p_event_id
    AND buyer_id = p_buyer_id
    AND status IN ('paid', 'pending');
$$;

REVOKE ALL ON FUNCTION public.buyer_ticket_count_for_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_ticket_count_for_event TO service_role;
