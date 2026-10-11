-- A new event is sold through Stripe as soon as its organizer has a Stripe
-- account that can accept charges; otherwise it stays on Revolut, exactly as
-- before. Existing events are never touched, so no live sale changes provider.
--
-- The organizer can still be moved by hand (UPDATE events SET payment_provider)
-- and the checkout functions refuse an event that is not on their own provider,
-- so a mismatch can never charge through the wrong one.
CREATE OR REPLACE FUNCTION public.default_event_payment_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_provider = 'revolut'
     AND EXISTS (
       SELECT 1 FROM public.stripe_connect_accounts a
       WHERE a.organizer_id = NEW.organizer_id AND a.charges_enabled
     ) THEN
    NEW.payment_provider := 'stripe';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.default_event_payment_provider() FROM public;

DROP TRIGGER IF EXISTS events_default_payment_provider ON public.events;
CREATE TRIGGER events_default_payment_provider
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.default_event_payment_provider();
