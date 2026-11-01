-- Organisers get their money as soon as their event ends, and can cash out
-- themselves from the Studio.
--
-- 1. Payout delay 0: the automatic payout fires at the event's end instead of
--    two days later. stripe-connect-payout-cron now keeps paying out until the
--    sales that were still settling at Stripe have arrived, instead of paying
--    once and leaving late sales in the balance until some later event.
-- 2. A manual "Cash out" from the Studio (stripe-connect-onboard-organizer,
--    action "payout") is recorded in the same jobs table under its own kind.

UPDATE public.billing_settings SET stripe_payout_delay_days = 0 WHERE id = true;
ALTER TABLE public.billing_settings ALTER COLUMN stripe_payout_delay_days SET DEFAULT 0;
COMMENT ON COLUMN public.billing_settings.stripe_payout_delay_days IS
  'Days after an event''s end before its organizer''s first automatic Stripe payout fires (0 = the moment the event ends). The job then keeps paying out as the remaining sales settle. Admin-editable via SQL.';

ALTER TABLE public.stripe_connect_payout_jobs
  DROP CONSTRAINT IF EXISTS stripe_connect_payout_jobs_kind_check;
ALTER TABLE public.stripe_connect_payout_jobs
  ADD CONSTRAINT stripe_connect_payout_jobs_kind_check
  CHECK (kind IN ('organizer_event_payout', 'organizer_manual_payout', 'reseller_payout'));
