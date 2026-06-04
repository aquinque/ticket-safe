-- Track post-event Stripe Transfers on the order so we know which orders
-- have been paid out to the organizer and don't double-transfer.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

ALTER TABLE public.event_orders
  ADD COLUMN IF NOT EXISTS paid_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_out_transfer_id TEXT;

CREATE INDEX IF NOT EXISTS event_orders_paid_out_idx
  ON public.event_orders(organizer_id) WHERE paid_out_at IS NULL AND status = 'paid';

DROP VIEW IF EXISTS public.organizer_earnings CASCADE;

CREATE VIEW public.organizer_earnings
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    o.id AS organizer_id,
    COALESCE(SUM(eo.total_cents - COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS net_earned_cents,
    COALESCE(SUM(eo.total_cents) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS gross_cents,
    COALESCE(SUM(COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS platform_fee_cents,
    COALESCE(COUNT(eo.id) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS paid_orders,
    COALESCE(SUM(eo.total_cents - COALESCE(eo.fee_cents, 0))
             FILTER (WHERE eo.status = 'paid'
                       AND eo.paid_out_at IS NULL
                       AND e.date < NOW()), 0)::INTEGER AS releasable_cents
  FROM public.organizer_profiles o
  LEFT JOIN public.events e ON e.organizer_id = o.id
  LEFT JOIN public.event_orders eo ON eo.event_id = e.id
  GROUP BY o.id
),
withdrawn AS (
  SELECT
    organizer_id,
    COALESCE(SUM(amount_cents), 0)::INTEGER AS claimed_cents
  FROM public.organizer_payouts
  WHERE status IN ('requested','processing','sent')
  GROUP BY organizer_id
)
SELECT
  r.organizer_id,
  r.net_earned_cents,
  r.gross_cents,
  r.platform_fee_cents,
  r.paid_orders,
  r.releasable_cents,
  COALESCE(w.claimed_cents, 0) AS claimed_cents,
  GREATEST(r.net_earned_cents - COALESCE(w.claimed_cents, 0), 0) AS available_cents
FROM revenue r
LEFT JOIN withdrawn w ON w.organizer_id = r.organizer_id;

GRANT SELECT ON public.organizer_earnings TO authenticated, service_role;
