-- pg_cron cleanup: any event_order or resale ticket stuck in transient
-- state (pending / reserved) for more than 90 minutes is force-cancelled.
-- This is the belt-and-suspenders for Stripe's session.expired webhook,
-- which we've seen miss (one order sat pending for 4 days).
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

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
  -- 1. Expire stuck Studio orders
  WITH expired AS (
    UPDATE public.event_orders
    SET status = 'expired', cancelled_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '90 minutes'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_orders FROM expired;

  -- 2. Release reserved resale listings
  WITH released AS (
    UPDATE public.tickets
    SET status = 'available'
    WHERE status = 'reserved'
      AND updated_at < NOW() - INTERVAL '90 minutes'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_tickets FROM released;

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

-- Schedule: every 15 minutes
SELECT cron.schedule(
  'cleanup-stuck-orders',
  '*/15 * * * *',
  $$ SELECT public.cleanup_stuck_orders(); $$
);
