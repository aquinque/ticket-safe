-- For Ticket Safe Studio events (events that have event_tiers), the ONLY legit
-- resale is a Studio ticket the seller actually owns. Block any listing that
-- isn't backed by such a ticket — covers submit-listing's external path, the
-- direct Studio fast-path insert, and any direct API abuse.
CREATE OR REPLACE FUNCTION public.enforce_studio_resale_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Studio event + no linked Studio ticket → not allowed (no valid door QR).
  IF NEW.studio_ticket_id IS NULL
     AND EXISTS (SELECT 1 FROM public.event_tiers t WHERE t.event_id = NEW.event_id) THEN
    RAISE EXCEPTION 'STUDIO_TICKET_REQUIRED: this is a Ticket Safe Studio event — you can only resell a Studio ticket you own.';
  END IF;

  -- If a Studio ticket is linked, it must be one the seller owns for this event.
  IF NEW.studio_ticket_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.event_tickets et
       WHERE et.id = NEW.studio_ticket_id
         AND et.buyer_id = NEW.seller_id
         AND et.event_id = NEW.event_id
     ) THEN
    RAISE EXCEPTION 'STUDIO_TICKET_NOT_OWNED: studio_ticket_id must reference a ticket you own for this event.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_studio_resale_ownership ON public.tickets;
CREATE TRIGGER trg_enforce_studio_resale_ownership
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_studio_resale_ownership();
