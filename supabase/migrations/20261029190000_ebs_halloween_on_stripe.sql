-- "EBS HALLOWEEN × AYALA 120" (organiser "ESCP Bachelor Society") was created
-- before Stripe became the default and was still selling through the legacy
-- Revolut checkout on 2026-10-29. It already has a paid Revolut order, so the
-- general migration (20261029180000) deliberately left it alone. Achille
-- confirmed the organiser's Stripe account is connected and asked for the
-- switch; the ticket already sold stays refundable through Revolut, because
-- cancel-event and admin-refund-order pick the rail per order.
--
-- The switch refuses to happen unless the organiser's Stripe account can take
-- charges: moving the event otherwise would make every purchase fail.
DO $$
DECLARE
  v_event_id constant uuid := '56eb0895-d36c-40a0-b874-b3249b843e12';
  v_org_id uuid;
BEGIN
  SELECT organizer_id INTO v_org_id FROM public.events WHERE id = v_event_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'event % not found', v_event_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_connect_accounts a
    WHERE a.organizer_id = v_org_id AND a.charges_enabled
  ) THEN
    RAISE EXCEPTION 'organiser % has no Stripe account that can take charges; event left on its current provider', v_org_id;
  END IF;
  UPDATE public.events SET payment_provider = 'stripe' WHERE id = v_event_id;
END $$;
