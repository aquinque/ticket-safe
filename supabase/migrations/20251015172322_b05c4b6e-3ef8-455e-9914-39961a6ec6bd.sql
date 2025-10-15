-- Add base_price column to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS base_price numeric;

-- Update the ticket price validation trigger to enforce max resale = base_price + 1
CREATE OR REPLACE FUNCTION public.validate_ticket_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  event_base_price numeric;
BEGIN
  -- Get the event's base price
  SELECT base_price INTO event_base_price
  FROM public.events
  WHERE id = NEW.event_id;
  
  -- If event has a base price, enforce max resale = base_price + 1
  IF event_base_price IS NOT NULL THEN
    IF NEW.selling_price > (event_base_price + 1) THEN
      RAISE EXCEPTION 'Selling price cannot exceed base price + €1 (max: €%)', (event_base_price + 1);
    END IF;
    
    IF NEW.selling_price < event_base_price THEN
      RAISE EXCEPTION 'Selling price cannot be less than the event base price (€%)', event_base_price;
    END IF;
  ELSE
    -- Fallback to old validation if no base price is set
    IF NEW.selling_price < (NEW.original_price * 0.5) OR 
       NEW.selling_price > (NEW.original_price * 1.5) THEN
      RAISE EXCEPTION 'Selling price must be between 50%% and 150%% of original price';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;