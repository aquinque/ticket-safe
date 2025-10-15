-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix search_path for validate_ticket_price function
CREATE OR REPLACE FUNCTION public.validate_ticket_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure selling price is reasonable (between 50% and 150% of original)
  IF NEW.selling_price < (NEW.original_price * 0.5) OR 
     NEW.selling_price > (NEW.original_price * 1.5) THEN
    RAISE EXCEPTION 'Selling price must be between 50%% and 150%% of original price to ensure fairness';
  END IF;
  RETURN NEW;
END;
$$;