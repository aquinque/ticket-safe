-- =====================================================================
-- Fix: tickets table allows inserts without original_price
--
-- The original migration created original_price as NOT NULL, but the
-- Stripe-based listing flow does not use it.  Every insert was failing
-- with "null value in column 'original_price' violates not-null
-- constraint", which was swallowed into a generic INTERNAL_ERROR.
--
-- We also drop the validate_ticket_price trigger which enforced a
-- selling_price ± 50% of original_price rule — incompatible with the
-- Stripe Connect flow that caps at base_price + €1 in the edge function.
-- =====================================================================

-- 1. Drop the obsolete price-validation trigger (and function)
DROP TRIGGER IF EXISTS validate_ticket_price_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.validate_ticket_price();

-- 2. Make original_price nullable + default NULL
--    Safe whether or not the column exists; ALTER COLUMN is a no-op if
--    the column is already nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'original_price'
  ) THEN
    ALTER TABLE public.tickets
      ALTER COLUMN original_price DROP NOT NULL;

    ALTER TABLE public.tickets
      ALTER COLUMN original_price SET DEFAULT NULL;
  END IF;
END $$;
