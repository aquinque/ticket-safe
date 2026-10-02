-- Fix: cleanup_stuck_orders() (20260609000001) expires stuck Studio orders
-- (event_orders.status: pending -> expired after 90min) but never released
-- the matching event_tiers.reserved_qty that reserve_tier() incremented at
-- checkout creation. released_tiers was always hard-coded to 0 — dead
-- output, not a real count.
--
-- Net effect in production: every Revolut Studio checkout a buyer opened
-- and never completed (closed the tab, payment declined with no webhook
-- fired) permanently "ate" seats from the tier's visible availability,
-- since availability = total_qty - sold_qty - reserved_qty and nothing
-- ever decremented that reserved_qty back down for an abandoned pending
-- order. Over time this can make a tier look sold out when real inventory
-- remains. (The resale side doesn't have this leak: tickets.status just
-- flips back to 'available', no separate reserved-quantity counter.)
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE OR REPLACE FUNCTION public.cleanup_stuck_orders()
RETURNS TABLE(expired_orders INTEGER, released_tickets INTEGER, released_tiers INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders   INTEGER := 0;
  v_tickets  INTEGER := 0;
  v_tiers    INTEGER := 0;
BEGIN
  -- 1. Expire stuck Studio orders, and release their tier reservation in
  --    the same pass (was the missing half of this function).
  WITH expired AS (
    UPDATE public.event_orders
    SET status = 'expired', cancelled_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '90 minutes'
    RETURNING id, tier_id, quantity
  ),
  released AS (
    UPDATE public.event_tiers t
    SET reserved_qty = GREATEST(reserved_qty - e.qty_sum, 0)
    FROM (
      SELECT tier_id, SUM(quantity) AS qty_sum
      FROM expired
      GROUP BY tier_id
    ) e
    WHERE t.id = e.tier_id
    RETURNING t.id
  )
  SELECT (SELECT COUNT(*) FROM expired), (SELECT COUNT(*) FROM released)
  INTO v_orders, v_tiers;

  -- 2. Release reserved resale listings
  WITH released_listings AS (
    UPDATE public.tickets
    SET status = 'available'
    WHERE status = 'reserved'
      AND updated_at < NOW() - INTERVAL '90 minutes'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_tickets FROM released_listings;

  -- 3. Cancel stuck resale transactions
  UPDATE public.transactions
  SET status = 'cancelled'
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '90 minutes';

  RETURN QUERY SELECT v_orders, v_tickets, v_tiers;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stuck_orders() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_orders() TO service_role;
