-- Apply the 8% organizer fee at the moment the organizer requests a payout,
-- not at order time. The dashboard now shows the gross balance (only the 5%
-- buyer fee deducted upstream in event_orders.fee_cents) and the modal
-- subtracts the 8% live as the organizer types the amount.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

ALTER TABLE public.organizer_payouts
  ADD COLUMN IF NOT EXISTS gross_cents INTEGER,
  ADD COLUMN IF NOT EXISTS fee_cents INTEGER;

-- Earnings view: claimed_cents now sums the GROSS that left the balance,
-- not just the SEPA wire amount, so the math reconciles for both old and
-- new payouts. Old rows have gross_cents NULL → fall back to amount_cents.
DROP VIEW IF EXISTS public.organizer_earnings CASCADE;

CREATE VIEW public.organizer_earnings
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    o.id AS organizer_id,
    COALESCE(SUM(eo.total_cents - COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS net_earned_cents,
    COALESCE(SUM(eo.total_cents) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS gross_cents,
    COALESCE(SUM(COALESCE(eo.fee_cents, 0)) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS platform_fee_cents,
    COALESCE(COUNT(eo.id) FILTER (WHERE eo.status = 'paid'), 0)::INTEGER AS paid_orders
  FROM public.organizer_profiles o
  LEFT JOIN public.events e ON e.organizer_id = o.id
  LEFT JOIN public.event_orders eo ON eo.event_id = e.id
  GROUP BY o.id
),
withdrawn AS (
  SELECT
    organizer_id,
    COALESCE(SUM(COALESCE(gross_cents, amount_cents)), 0)::INTEGER AS claimed_cents
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
  COALESCE(w.claimed_cents, 0) AS claimed_cents,
  GREATEST(r.net_earned_cents - COALESCE(w.claimed_cents, 0), 0) AS available_cents
FROM revenue r
LEFT JOIN withdrawn w ON w.organizer_id = r.organizer_id;

GRANT SELECT ON public.organizer_earnings TO authenticated, service_role;
