-- Stripe is the checkout. Revolut Business is the company's bank account, not a
-- payment provider in the product (decided 2026-10-13), yet every new event still
-- landed on Revolut: events.payment_provider defaulted to 'revolut' and the
-- create-event wizard never set it, so buyers were sent to a Revolut checkout.
--
-- 1. New events default to Stripe (the wizard now also sets it explicitly).
-- 2. Existing events move to Stripe unless they already took money through
--    Revolut: an event with paid Revolut orders keeps 'revolut' so its refunds,
--    cancellation and billing documents stay on the rail that holds the money.
-- 3. The "default to Stripe once the organizer is ready" trigger
--    (20261011120000, never applied in production) is retired: readiness is
--    enforced at checkout by stripe-connect-create-checkout, and the Studio
--    tells organizers to finish their Stripe setup before buyers can pay.

ALTER TABLE public.events ALTER COLUMN payment_provider SET DEFAULT 'stripe';

COMMENT ON COLUMN public.events.payment_provider IS
  'Which payment rail this event''s Studio checkout uses. Stripe for every event; revolut only remains on legacy events that already sold through Revolut.';

DROP TRIGGER IF EXISTS events_default_payment_provider ON public.events;
DROP FUNCTION IF EXISTS public.default_event_payment_provider();

UPDATE public.events e
SET payment_provider = 'stripe'
WHERE e.payment_provider = 'revolut'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_orders o
    WHERE o.event_id = e.id AND o.status = 'paid'
  );
